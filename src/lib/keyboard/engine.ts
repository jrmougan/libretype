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
  #lastCommitted = '';
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
    const now = performance.now();
    for (const code of this.#held) {
      this.#on.physical?.({ code, down: false, repeat: false, at: now });
    }
    this.#held.clear();
    this.#el.value = '';
    this.#last = '';
    this.#lastCommitted = '';
    this.#stamps = [];
    this.#composing = false;
    this.#compBase = null;
    this.#emitText(now);
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
   *
   * Además, si había una composición de tecla muerta a medias, se cancela para
   * evitar que el motor quede congelado para siempre al perder el foco.
   */
  #onBlur = (): void => {
    for (const code of this.#held) {
      this.#on.physical?.({ code, down: false, repeat: false, at: performance.now() });
    }
    this.#held.clear();

    if (this.#composing) {
      this.#composing = false;
      this.#compBase = null;
      this.#sync(performance.now(), true);
    }
  };

  // --- Canal B: caracteres --------------------------------------------------

  #onPaste = (ev: ClipboardEvent): void => {
    ev.preventDefault();
  };

  #onBeforeInput = (ev: Event): void => {
    if ((ev as InputEvent).inputType === 'insertFromPaste') {
      ev.preventDefault();
    }
  };

  #ensureCursorAtEnd = (): void => {
    const len = this.#el.value.length;
    if (this.#el.selectionStart !== len || this.#el.selectionEnd !== len) {
      try {
        this.#el.setSelectionRange(len, len);
      } catch {
        // Silencioso si el elemento no soporta rangos de selección
      }
    }
  };

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
    if (committed !== this.#lastCommitted) {
      let start = 0;
      const minLen = Math.min(this.#lastCommitted.length, committed.length);
      while (start < minLen && this.#lastCommitted[start] === committed[start]) {
        start++;
      }
      let oldEnd = this.#lastCommitted.length - 1;
      let newEnd = committed.length - 1;
      while (oldEnd >= start && newEnd >= start && this.#lastCommitted[oldEnd] === committed[newEnd]) {
        oldEnd--;
        newEnd--;
      }
      const deleteCount = Math.max(0, oldEnd - start + 1);
      const insertCount = Math.max(0, newEnd - start + 1);
      const newStamps = Array(insertCount).fill(at);
      this.#stamps.splice(start, deleteCount, ...newStamps);
      this.#lastCommitted = committed;
    }

    if (this.#stamps.length !== committed.length) {
      if (this.#stamps.length > committed.length) {
        this.#stamps.length = committed.length;
      } else {
        while (this.#stamps.length < committed.length) this.#stamps.push(at);
      }
    }

    this.#ensureCursorAtEnd();
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
      ['paste', this.#onPaste as EventListener],
      ['beforeinput', this.#onBeforeInput as EventListener],
      ['select', this.#ensureCursorAtEnd as EventListener],
      ['click', this.#ensureCursorAtEnd as EventListener],
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

/**
 * Umbral en milisegundos a partir del cual una pausa entre pulsaciones se
 * considera inactividad y se descuenta del tiempo transcurrido, para no hundir
 * artificialmente las ppm si el usuario se ausenta.
 */
export const UMBRAL_PAUSA_MS = 2000;

export interface Stats {
  /** Palabras por minuto, con la convención de 5 caracteres = 1 palabra. */
  wpm: number;
  /** Porcentaje de caracteres correctos sobre los escritos. */
  accuracy: number;
  correct: number;
  typed: number;
  elapsedMs: number;
  /** Pulsaciones erróneas corregidas con retroceso u omisión. */
  errores?: number;
}

export function computeStats(
  typed: string,
  target: string,
  stamps: readonly number[],
  errores = 0,
): Stats {
  let correct = 0;
  for (let i = 0; i < typed.length; i++) {
    if (typed[i] === target[i]) correct++;
  }

  // Desde el primer carácter, no desde que aparece la lección: si no, quien se
  // toma su tiempo para colocar los dedos sale penalizado antes de empezar.
  // Descontamos pausas largas de inactividad entre caracteres consecutivos.
  let elapsedMs = 0;
  if (stamps.length >= 2) {
    if (stamps.length < typed.length) {
      // Marcas agregadas (ej. inicio y fin en tests o llamadas simplificadas)
      elapsedMs = stamps[stamps.length - 1] - stamps[0];
    } else {
      for (let i = 1; i < stamps.length; i++) {
        const delta = stamps[i] - stamps[i - 1];
        elapsedMs += Math.min(Math.max(0, delta), UMBRAL_PAUSA_MS);
      }
    }
  }

  const minutes = elapsedMs / 60000;
  const wpm = minutes > 0 ? correct / 5 / minutes : 0;
  const totalTyped = typed.length + errores;

  return {
    wpm: Number.isFinite(wpm) ? Math.round(wpm) : 0,
    accuracy: totalTyped ? Math.round((correct / totalTyped) * 100) : 100,
    correct,
    typed: totalTyped,
    elapsedMs,
    errores,
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
