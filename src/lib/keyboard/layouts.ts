/**
 * Tablas de distribución de teclado.
 *
 * El `code` es la posición física (`KeyboardEvent.code`) y es lo único
 * independiente de la distribución: la tecla que en QWERTY-ES da `ñ` está
 * siempre en `Semicolon`, se llame como se llame. Por eso el resaltado del
 * teclado en pantalla se guía por `code` y nunca por `key`.
 *
 * No detectamos la distribución del sistema: `navigator.keyboard.getLayoutMap()`
 * solo existe en Chromium y no llegará a ser estándar, así que en macOS y Linux
 * no la tendríamos. El usuario la elige en el onboarding, que además es lo que
 * un tutor de mecanografía necesita de todas formas.
 */

export type Finger =
  | 'l-pinky' | 'l-ring' | 'l-middle' | 'l-index'
  | 'r-index' | 'r-middle' | 'r-ring' | 'r-pinky'
  | 'thumb';

export const FINGER_NAMES: Record<Finger, string> = {
  'l-pinky': 'meñique izquierdo',
  'l-ring': 'anular izquierdo',
  'l-middle': 'corazón izquierdo',
  'l-index': 'índice izquierdo',
  'r-index': 'índice derecho',
  'r-middle': 'corazón derecho',
  'r-ring': 'anular derecho',
  'r-pinky': 'meñique derecho',
  thumb: 'pulgar',
};

export interface KeyDef {
  code: string;
  /** Carácter sin modificadores. Ausente en teclas de control. */
  base?: string;
  shift?: string;
  altgr?: string;
  /** Etiqueta para teclas sin carácter (Tab, Mayús...). */
  label?: string;
  /** Anchura en unidades de tecla. 1 = tecla normal. */
  width?: number;
  finger: Finger;
  /** Tecla de la fila de reposo, donde descansan los dedos. */
  home?: boolean;
  /** Produce un acento muerto: no imprime nada hasta la tecla siguiente. */
  dead?: boolean;
}

export interface Layout {
  id: string;
  name: string;
  /** Filas de la parte alfanumérica, de arriba abajo. */
  rows: KeyDef[][];
  /**
   * Secuencias para caracteres que no salen de una sola pulsación.
   * Las tildes españolas son dos pulsaciones: `´` y luego la vocal.
   */
  compose: Record<string, string>;
}

const K = (
  code: string,
  base: string | undefined,
  finger: Finger,
  extra: Partial<KeyDef> = {},
): KeyDef => ({ code, base, finger, ...extra });

/** QWERTY español, teclado físico ISO (el de 105 teclas con Ñ y Ç). */
export const ES_ISO: Layout = {
  id: 'es-iso',
  name: 'Español (QWERTY, teclado ISO)',
  rows: [
    [
      K('Backquote', 'º', 'l-pinky', { shift: 'ª', altgr: '\\' }),
      K('Digit1', '1', 'l-pinky', { shift: '!', altgr: '|' }),
      K('Digit2', '2', 'l-ring', { shift: '"', altgr: '@' }),
      K('Digit3', '3', 'l-middle', { shift: '·', altgr: '#' }),
      K('Digit4', '4', 'l-index', { shift: '$', altgr: '~' }),
      K('Digit5', '5', 'l-index', { shift: '%', altgr: '€' }),
      K('Digit6', '6', 'r-index', { shift: '&', altgr: '¬' }),
      K('Digit7', '7', 'r-index', { shift: '/' }),
      K('Digit8', '8', 'r-middle', { shift: '(' }),
      K('Digit9', '9', 'r-ring', { shift: ')' }),
      K('Digit0', '0', 'r-pinky', { shift: '=' }),
      K('Minus', "'", 'r-pinky', { shift: '?', altgr: '\\' }),
      K('Equal', '¡', 'r-pinky', { shift: '¿' }),
      K('Backspace', undefined, 'r-pinky', { label: 'Retroceso', width: 2 }),
    ],
    [
      K('Tab', undefined, 'l-pinky', { label: 'Tab', width: 1.5 }),
      K('KeyQ', 'q', 'l-pinky'),
      K('KeyW', 'w', 'l-ring'),
      K('KeyE', 'e', 'l-middle', { altgr: '€' }),
      K('KeyR', 'r', 'l-index'),
      K('KeyT', 't', 'l-index'),
      K('KeyY', 'y', 'r-index'),
      K('KeyU', 'u', 'r-index'),
      K('KeyI', 'i', 'r-middle'),
      K('KeyO', 'o', 'r-ring'),
      K('KeyP', 'p', 'r-pinky'),
      K('BracketLeft', '`', 'r-pinky', { shift: '^', altgr: '[', dead: true }),
      K('BracketRight', '+', 'r-pinky', { shift: '*', altgr: ']' }),
    ],
    [
      K('CapsLock', undefined, 'l-pinky', { label: 'Bloq Mayús', width: 1.75 }),
      K('KeyA', 'a', 'l-pinky', { home: true }),
      K('KeyS', 's', 'l-ring', { home: true }),
      K('KeyD', 'd', 'l-middle', { home: true }),
      K('KeyF', 'f', 'l-index', { home: true }),
      K('KeyG', 'g', 'l-index'),
      K('KeyH', 'h', 'r-index'),
      K('KeyJ', 'j', 'r-index', { home: true }),
      K('KeyK', 'k', 'r-middle', { home: true }),
      K('KeyL', 'l', 'r-ring', { home: true }),
      K('Semicolon', 'ñ', 'r-pinky', { shift: 'Ñ', home: true }),
      // La tecla de las tildes. Es la pieza central de escribir en español.
      K('Quote', '´', 'r-pinky', { shift: '¨', altgr: '{', dead: true }),
      K('Backslash', 'ç', 'r-pinky', { shift: 'Ç', altgr: '}' }),
      K('Enter', undefined, 'r-pinky', { label: 'Intro', width: 1.25 }),
    ],
    [
      K('ShiftLeft', undefined, 'l-pinky', { label: 'Mayús', width: 1.25 }),
      // Tecla exclusiva de los teclados ISO: no existe en los ANSI de EE. UU.
      K('IntlBackslash', '<', 'l-pinky', { shift: '>' }),
      K('KeyZ', 'z', 'l-pinky'),
      K('KeyX', 'x', 'l-ring'),
      K('KeyC', 'c', 'l-middle'),
      K('KeyV', 'v', 'l-index'),
      K('KeyB', 'b', 'l-index'),
      K('KeyN', 'n', 'r-index'),
      K('KeyM', 'm', 'r-index'),
      K('Comma', ',', 'r-middle', { shift: ';' }),
      K('Period', '.', 'r-ring', { shift: ':' }),
      K('Slash', '-', 'r-pinky', { shift: '_' }),
      K('ShiftRight', undefined, 'r-pinky', { label: 'Mayús', width: 2.75 }),
    ],
    [
      K('ControlLeft', undefined, 'l-pinky', { label: 'Ctrl', width: 1.5 }),
      K('MetaLeft', undefined, 'l-pinky', { label: 'Cmd', width: 1.25 }),
      K('AltLeft', undefined, 'thumb', { label: 'Alt', width: 1.25 }),
      K('Space', ' ', 'thumb', { label: 'Espacio', width: 6.5 }),
      K('AltRight', undefined, 'thumb', { label: 'AltGr', width: 1.25 }),
      K('MetaRight', undefined, 'r-pinky', { label: 'Cmd', width: 1.25 }),
      K('ControlRight', undefined, 'r-pinky', { label: 'Ctrl', width: 1.5 }),
    ],
  ],

  /**
   * Acento muerto + letra. La clave está en el orden: primero el acento,
   * luego la vocal. Es lo que hace que enseñar a escribir en español no sea
   * lo mismo que enseñar a escribir en inglés.
   */
  compose: {
    á: '´a', é: '´e', í: '´i', ó: '´o', ú: '´u',
    Á: '´A', É: '´E', Í: '´I', Ó: '´O', Ú: '´U',
    ü: '¨u', Ü: '¨U', ï: '¨i',
    à: '`a', è: '`e', ì: '`i', ò: '`o', ù: '`u',
    â: '^a', ê: '^e', î: '^i', ô: '^o', û: '^u',
  },
};

export const LAYOUTS: Layout[] = [ES_ISO];

/** Índice carácter -> tecla y modificador, para saber qué hay que pulsar. */
export interface KeyStep {
  code: string;
  shift: boolean;
  altgr: boolean;
  finger: Finger;
  /** Carácter que imprime este paso, o el acento si es una tecla muerta. */
  char: string;
  dead: boolean;
}

export function buildIndex(layout: Layout): Map<string, KeyStep[]> {
  const single = new Map<string, KeyStep>();

  for (const row of layout.rows) {
    for (const k of row) {
      const add = (ch: string | undefined, shift: boolean, altgr: boolean) => {
        if (!ch || single.has(ch)) return;
        single.set(ch, {
          code: k.code, shift, altgr, finger: k.finger,
          char: ch, dead: k.dead === true && !shift && !altgr,
        });
      };
      add(k.base, false, false);
      add(k.shift, true, false);
      add(k.altgr, false, true);
      // Las mayúsculas de las letras salen con Mayús aunque la tabla solo
      // liste la minúscula.
      if (k.base && k.base.length === 1 && k.base !== k.base.toUpperCase()) {
        add(k.base.toUpperCase(), true, false);
      }
    }
  }

  // Marcar como muertas las teclas de acento aunque se alcancen con Mayús.
  const deadChars = new Set(['´', '¨', '`', '^']);
  for (const [ch, step] of single) {
    if (deadChars.has(ch)) single.set(ch, { ...step, dead: true });
  }

  const index = new Map<string, KeyStep[]>();
  for (const [ch, step] of single) index.set(ch, [step]);

  // Caracteres compuestos: dos pasos, acento y luego letra.
  for (const [ch, seq] of Object.entries(layout.compose)) {
    const steps: KeyStep[] = [];
    let ok = true;
    for (const part of [...seq]) {
      const s = single.get(part);
      if (!s) { ok = false; break; }
      steps.push(s);
    }
    if (ok) index.set(ch, steps);
  }

  return index;
}
