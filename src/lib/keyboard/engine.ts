/**
 * Motor de captura de tecleo.
 *
 * DISEÑO: dos canales independientes. No es una separación por limpieza, es
 * una consecuencia medida. En los spikes de `spike-deadkeys/` comprobamos que
 * el orden de los eventos difiere según el motor:
 *
 *   macOS / WKWebView   composición ANTES del keydown  (WebKit #165004)
 *   Linux / WebKitGTK   keydown ANTES de la composición
 *
 * Es decir: en macOS el carácter `á` llega confirmado antes de que el DOM nos
 * diga que se pulsó la `a`. Cualquier código que empareje "carácter escrito"
 * con "tecla que lo produjo" asumiendo un orden concreto funcionará en un
 * sistema y fallará en otro. Con Tauri son tres motores.
 *
 *   Canal A (físico)     keydown/keyup -> `code` -> resaltar tecla y dedo.
 *                        Nunca espera a la composición.
 *   Canal B (caracteres) el valor real del campo -> qué se ha escrito.
 *                        Nunca se reconstruye a partir de `key`.
 *
 * El canal B lee el valor del campo en vez de acumular eventos. Es lo único
 * que da igual el motor, el orden y el método de entrada: si hay un IME, un
 * acento muerto a medias o un pegado, el valor del campo siempre es la verdad.
 */

export interface PhysicalKey {
  /** Posición física. Independiente de la distribución. */
  code: string;
  down: boolean;
  /** Repetición por tecla mantenida. Se ignora para estadísticas. */
  repeat: boolean;
  at: number;
}

export interface TextState {
  /** Todo lo que hay en el campo, incluido el acento a medias. */
  text: string;
  /**
   * Solo lo confirmado. Mientras se compone un acento, el campo ya muestra
   * el `´` pero ese carácter todavía puede convertirse en `á`: no cuenta como
   * escrito y no debe mover la posición de la lección.
   */
  committed: string;
  /**
   * Hay un acento muerto a medias: el usuario pulsó `´` y aún no ha elegido
   * la vocal. El texto ya muestra el acento, pero puede cambiar.
   */
  composing: boolean;
  at: number;
}

export interface EngineEvents {
  physical?: (e: PhysicalKey) => void;
  text?: (s: TextState) => void;
}

export class TypingEngine {
  #el: HTMLTextAreaElement | HTMLInputElement;
  #on: EngineEvents;
  #held = new Set<string>();
  #composing = false;
  #last = '';
  /**
   * Longitud del texto confirmado cuando arrancó la composición actual, o
   * null si no hay ninguna en curso. Todo lo que se añada por encima de esta
   * marca es provisional hasta el `compositionend`.
   */
  #compBase: number | null = null;
  /** Marca de tiempo de cada carácter confirmado, para velocidad y ritmo. */
  #stamps: number[] = [];
  #detach: Array<() => void> = [];

  constructor(el: HTMLTextAreaElement | HTMLInputElement, on: EngineEvents = {}) {
    this.#el = el;
    this.#on = on;
    this.#attach();
  }

  get heldCodes(): ReadonlySet<string> { return this.#held; }
  get text(): string { return this.#last; }
  /** Texto confirmado: excluye la composición en curso. */
  get committed(): string {
    return this.#compBase === null ? this.#last : this.#last.slice(0, this.#compBase);
  }
  get composing(): boolean { return this.#composing; }
  get stamps(): readonly number[] { return this.#stamps; }

  reset(): void {
    this.#el.value = '';
    this.#last = '';
    this.#stamps = [];
    this.#composing = false;
    this.#compBase = null;
    this.#held.clear();
    this.#emitText(performance.now());
  }

  focus(): void { this.#el.focus(); }

  destroy(): void {
    for (const off of this.#detach) off();
    this.#detach = [];
  }

  // --- Canal A: teclas físicas ---------------------------------------------

  #onKeyDown = (ev: KeyboardEvent): void => {
    // `code` puede venir vacío con métodos de entrada exóticos; entonces esta
    // pulsación no sirve para el resaltado, pero el canal B la recogerá igual.
    if (!ev.code) return;
    this.#held.add(ev.code);
    this.#on.physical?.({ code: ev.code, down: true, repeat: ev.repeat, at: ev.timeStamp });
  };

  #onKeyUp = (ev: KeyboardEvent): void => {
    if (!ev.code) return;
    this.#held.delete(ev.code);
    this.#on.physical?.({ code: ev.code, down: false, repeat: false, at: ev.timeStamp });
  };

  /**
   * Si la ventana pierde el foco con teclas pulsadas, el `keyup` no llega
   * nunca y la tecla se queda encendida para siempre. Pasa constantemente al
   * cambiar de aplicación a media palabra.
   */
  #onBlur = (): void => {
    for (const code of this.#held) {
      this.#on.physical?.({ code, down: false, repeat: false, at: performance.now() });
    }
    this.#held.clear();
  };

  // --- Canal B: caracteres --------------------------------------------------

  #onCompositionStart = (): void => {
    // Pone al día `#last` antes de fijar la frontera. La frontera se toma del
    // campo y lo confirmado se corta sobre `#last`: si los dos se desincronizan
    // (un cambio de valor que no pasó por un `input`, por ejemplo al restaurar
    // una lección) lo confirmado saldría mal.
    this.#sync(performance.now());
    this.#composing = true;
    // `compositionstart` llega antes de que el acento entre en el campo, así
    // que la longitud de ahora es justo lo confirmado. Se verificó en los dos
    // spikes: en macOS y en Linux el orden interno difiere, pero en ambos
    // `compositionstart` precede al `input` que inserta el acento.
    this.#compBase = this.#el.value.length;
    this.#emitText(performance.now());
  };

  #onCompositionEnd = (): void => {
    this.#composing = false;
    this.#compBase = null;
    // Se fuerza el recálculo: al confirmar una composición el valor del campo
    // suele ser el mismo que ya teníamos (el `input` con el texto final llega
    // antes del `compositionend`), pero la frontera de lo confirmado se acaba
    // de mover. Sin `force` el cambio pasaría desapercibido y la lección se
    // quedaría clavada en la letra acentuada.
    this.#sync(performance.now(), true);
  };

  #onInput = (ev: Event): void => {
    this.#sync((ev as InputEvent).timeStamp ?? performance.now());
  };

  #sync(at: number, force = false): void {
    const value = this.#el.value;
    if (value === this.#last && !force) return;

    // Un carácter puede tardar dos pulsaciones (´ + a) o llegar de golpe.
    // Sellamos por carácter añadido, no por pulsación, porque es lo que se
    // puede medir igual en los tres motores.
    this.#last = value;

    // Los sellos de tiempo se llevan sobre el texto confirmado: un acento a
    // medias no es todavía un carácter escrito y contarlo falsearía la
    // velocidad.
    const committed = this.committed;
    if (committed.length > this.#stamps.length) {
      while (this.#stamps.length < committed.length) this.#stamps.push(at);
    } else {
      this.#stamps.length = committed.length;
    }

    this.#emitText(at);
  }

  #emitText(at: number): void {
    this.#on.text?.({
      text: this.#last,
      committed: this.committed,
      composing: this.#composing,
      at,
    });
  }

  #attach(): void {
    const el = this.#el;
    const pairs: Array<[string, EventListener]> = [
      ['keydown', this.#onKeyDown as EventListener],
      ['keyup', this.#onKeyUp as EventListener],
      ['blur', this.#onBlur],
      ['compositionstart', this.#onCompositionStart],
      ['compositionend', this.#onCompositionEnd],
      ['input', this.#onInput],
    ];
    for (const [type, fn] of pairs) {
      el.addEventListener(type, fn);
      this.#detach.push(() => el.removeEventListener(type, fn));
    }
  }
}

// --- Métricas ---------------------------------------------------------------

export interface Stats {
  /** Palabras por minuto, con la convención de 5 caracteres = 1 palabra. */
  wpm: number;
  /** Porcentaje de caracteres correctos sobre los escritos. */
  accuracy: number;
  correct: number;
  typed: number;
  elapsedMs: number;
}

export function computeStats(
  typed: string,
  target: string,
  stamps: readonly number[],
): Stats {
  let correct = 0;
  for (let i = 0; i < typed.length; i++) {
    if (typed[i] === target[i]) correct++;
  }

  // Desde el primer carácter, no desde que aparece la lección: si no, quien se
  // toma su tiempo para colocar los dedos sale penalizado antes de empezar.
  const elapsedMs =
    stamps.length >= 2 ? stamps[stamps.length - 1] - stamps[0] : 0;
  const minutes = elapsedMs / 60000;
  const wpm = minutes > 0 ? correct / 5 / minutes : 0;

  return {
    wpm: Number.isFinite(wpm) ? Math.round(wpm) : 0,
    accuracy: typed.length ? Math.round((correct / typed.length) * 100) : 100,
    correct,
    typed: typed.length,
    elapsedMs,
  };
}

/**
 * Compara lo escrito con el objetivo y dice en qué estado está cada carácter.
 * No predice qué debería producir una pulsación: compara resultados. En los
 * spikes vimos que `´`+espacio da `´` en macOS y `'` en GTK, así que una tabla
 * propia de "esta pulsación produce este carácter" daría errores falsos en
 * Linux. La única fuente de verdad es lo que el sistema entrega.
 */
export type CharState = 'pending' | 'correct' | 'wrong' | 'current';

export function diffAgainstTarget(typed: string, target: string): CharState[] {
  return [...target].map((ch, i) => {
    if (i >= typed.length) return i === typed.length ? 'current' : 'pending';
    return typed[i] === ch ? 'correct' : 'wrong';
  });
}
