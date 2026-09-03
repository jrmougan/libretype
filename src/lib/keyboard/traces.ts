/**
 * Trazas de eventos de teclado reales, por plataforma.
 *
 * Esto no es documentación: son los datos con los que se prueba el motor. Cada
 * traza es la secuencia exacta de eventos del DOM al escribir una tilde, con el
 * valor del campo después de cada evento.
 *
 * Importan porque **el orden difiere entre motores** y no se puede reproducir
 * tecleando en una sola máquina. En macOS la composición precede al `keydown`
 * (WebKit #165004); en Linux es al revés. Un cambio en `engine.ts` que funcione
 * en tu Mac puede romper Linux sin que nada lo avise.
 *
 * El campo `origin` dice de dónde sale cada una y hay que respetarlo:
 *
 *   'captured'      copiada literalmente de la salida de spike-deadkeys/Driver.swift
 *                   ejecutándose contra WKWebView con layout Spanish - ISO.
 *   'reconstructed' construida a partir de una propiedad verificada (el orden
 *                   relativo de los eventos), no copiada. El arnés de Linux
 *                   inyecta eventos sintéticos sin `hardware_keycode` real, así
 *                   que su traza literal contiene artefactos (`Unidentified`,
 *                   un `compositionend` de más) que no ocurren con un teclado de
 *                   verdad. Meterlos aquí sería fijar el artefacto en los tests.
 *
 * Para capturar trazas nuevas, ver spike-deadkeys/README y linux/README.md.
 */

export type TraceOrigin = 'captured' | 'reconstructed';

export type DomEventType =
  | 'keydown' | 'keyup'
  | 'compositionstart' | 'compositionupdate' | 'compositionend'
  | 'beforeinput' | 'input';

export interface TraceStep {
  type: DomEventType;
  key?: string;
  code?: string;
  data?: string | null;
  /** Valor del campo **después** de este evento, tal como lo vio el listener. */
  value: string;
}

export interface Trace {
  id: string;
  platform: string;
  origin: TraceOrigin;
  description: string;
  steps: TraceStep[];
  /** Texto confirmado al terminar la secuencia. */
  committed: string;
}

const k = (type: 'keydown' | 'keyup', key: string, code: string, value: string): TraceStep =>
  ({ type, key, code, value });

/**
 * macOS / WKWebView — `´` + `a` = `á`.
 *
 * Fíjate en el orden: los eventos de composición van **antes** del `keydown`
 * de la tecla del acento, y el `á` está confirmado (`compositionend`) antes de
 * que llegue el `keydown` de la `a`. El carácter llega antes que la tecla que
 * lo produjo.
 *
 * El valor pasa por `´` → `` → `á`: WebKit borra la composición y la reinserta.
 */
export const MACOS_ACUTE_A: Trace = {
  id: 'macos-acute-a',
  platform: 'macOS / WKWebView',
  origin: 'captured',
  description: '´ + a = á',
  committed: 'á',
  steps: [
    { type: 'compositionstart', data: '', value: '' },
    { type: 'compositionupdate', data: '´', value: '' },
    { type: 'beforeinput', data: '´', value: '' },
    { type: 'input', data: '´', value: '´' },
    k('keydown', 'Dead', 'Quote', '´'),
    k('keyup', 'Dead', 'Quote', '´'),
    { type: 'beforeinput', data: null, value: '´' },
    { type: 'input', data: null, value: '' },
    { type: 'beforeinput', data: 'á', value: '' },
    { type: 'input', data: 'á', value: 'á' },
    { type: 'compositionend', data: 'á', value: 'á' },
    k('keydown', 'a', 'KeyA', 'á'),
    k('keyup', 'a', 'KeyA', 'á'),
  ],
};

/**
 * macOS / WKWebView — `´` + `t`: no componen, así que salen los dos caracteres.
 *
 * Este es el caso que decidió el stack: se sospechaba que WebKit duplicaba el
 * acento y se comía la `t`. No ocurre. Ver spike-deadkeys/RESULTADOS.md.
 */
export const MACOS_ACUTE_CANCELLED: Trace = {
  id: 'macos-acute-cancelled',
  platform: 'macOS / WKWebView',
  origin: 'captured',
  description: '´ + t = ´t (acento cancelado)',
  committed: '´t',
  steps: [
    { type: 'compositionstart', data: '', value: '' },
    { type: 'compositionupdate', data: '´', value: '' },
    { type: 'beforeinput', data: '´', value: '' },
    { type: 'input', data: '´', value: '´' },
    k('keydown', 'Dead', 'Quote', '´'),
    k('keyup', 'Dead', 'Quote', '´'),
    { type: 'beforeinput', data: null, value: '´' },
    { type: 'input', data: null, value: '' },
    { type: 'beforeinput', data: '´', value: '' },
    { type: 'input', data: '´', value: '´' },
    { type: 'compositionend', data: '´', value: '´' },
    k('keydown', 't', 'KeyT', '´'),
    { type: 'beforeinput', data: 't', value: '´' },
    { type: 'input', data: 't', value: '´t' },
    k('keyup', 't', 'KeyT', '´t'),
  ],
};

/** macOS / WKWebView — `Mayús+´` + `u` = `ü`. Mismo patrón que la tilde. */
export const MACOS_DIAERESIS_U: Trace = {
  id: 'macos-diaeresis-u',
  platform: 'macOS / WKWebView',
  origin: 'captured',
  description: 'Mayús+´ + u = ü',
  committed: 'ü',
  steps: [
    { type: 'compositionstart', data: '', value: '' },
    { type: 'compositionupdate', data: '¨', value: '' },
    { type: 'beforeinput', data: '¨', value: '' },
    { type: 'input', data: '¨', value: '¨' },
    k('keydown', 'Dead', 'Quote', '¨'),
    k('keyup', 'Dead', 'Quote', '¨'),
    { type: 'beforeinput', data: null, value: '¨' },
    { type: 'input', data: null, value: '' },
    { type: 'beforeinput', data: 'ü', value: '' },
    { type: 'input', data: 'ü', value: 'ü' },
    { type: 'compositionend', data: 'ü', value: 'ü' },
    k('keydown', 'u', 'KeyU', 'ü'),
    k('keyup', 'u', 'KeyU', 'ü'),
  ],
};

/**
 * Linux/GTK y Chromium — `´` + `a` = `á`, con el **orden inverso** al de macOS:
 * el `keydown` llega antes que la composición, que es lo que dice la
 * especificación.
 *
 * RECONSTRUIDA. El orden relativo está verificado en
 * spike-deadkeys/linux/RESULTADOS-LINUX.md; los valores intermedios y los
 * `code` siguen el patrón de la traza de macOS. Sirve para lo que tiene que
 * servir: comprobar que el motor no depende del orden.
 */
export const LINUX_ACUTE_A: Trace = {
  id: 'linux-acute-a',
  platform: 'Linux / WebKitGTK (y Chromium)',
  origin: 'reconstructed',
  description: '´ + a = á, keydown antes de la composición',
  committed: 'á',
  steps: [
    k('keydown', 'Dead', 'Quote', ''),
    { type: 'compositionstart', data: '', value: '' },
    { type: 'compositionupdate', data: '´', value: '' },
    { type: 'beforeinput', data: '´', value: '' },
    { type: 'input', data: '´', value: '´' },
    k('keyup', 'Dead', 'Quote', '´'),
    k('keydown', 'a', 'KeyA', '´'),
    { type: 'beforeinput', data: 'á', value: '´' },
    { type: 'input', data: 'á', value: 'á' },
    { type: 'compositionend', data: 'á', value: 'á' },
    k('keyup', 'a', 'KeyA', 'á'),
  ],
};

/** Escritura normal sin composición: la línea base. */
export const PLAIN_TYPING: Trace = {
  id: 'plain-typing',
  platform: 'cualquiera',
  origin: 'reconstructed',
  description: 'a, s (sin composición)',
  committed: 'as',
  steps: [
    k('keydown', 'a', 'KeyA', ''),
    { type: 'beforeinput', data: 'a', value: '' },
    { type: 'input', data: 'a', value: 'a' },
    k('keyup', 'a', 'KeyA', 'a'),
    k('keydown', 's', 'KeyS', 'a'),
    { type: 'beforeinput', data: 's', value: 'a' },
    { type: 'input', data: 's', value: 'as' },
    k('keyup', 's', 'KeyS', 'as'),
  ],
};

export const ALL_TRACES: Trace[] = [
  MACOS_ACUTE_A,
  MACOS_ACUTE_CANCELLED,
  MACOS_DIAERESIS_U,
  LINUX_ACUTE_A,
  PLAIN_TYPING,
];

/**
 * Reproduce una traza sobre un campo real, imitando lo que hace el navegador:
 * el valor del campo ya está actualizado cuando se dispara cada evento.
 * `offset` antepone texto ya escrito, para probar composiciones a mitad de
 * palabra (que es donde aparecen de verdad: "pap" + "á").
 */
export function replay(
  el: HTMLTextAreaElement,
  trace: Trace,
  onStep?: (step: TraceStep) => void,
  offset = '',
): void {
  for (const step of trace.steps) {
    el.value = offset + step.value;

    let ev: Event;
    if (step.type === 'keydown' || step.type === 'keyup') {
      ev = new KeyboardEvent(step.type, {
        key: step.key, code: step.code, bubbles: true,
      });
    } else if (step.type.startsWith('composition')) {
      ev = new CompositionEvent(step.type, { data: step.data ?? '', bubbles: true });
    } else {
      ev = new InputEvent(step.type, { data: step.data, bubbles: true });
    }

    el.dispatchEvent(ev);
    onStep?.(step);
  }
}
