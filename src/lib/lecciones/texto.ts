/**
 * Qué texto se le puede pedir a alguien que teclee.
 *
 * Lo comparten el temario, las lecciones personalizadas y el texto libre, para
 * que lo que se pega desde un procesador de textos se trate igual en los tres.
 */
import { buildIndex, type Layout } from '../keyboard/layouts';

/** Se quitan sin avisar: no se ven y nadie los puede teclear. */
const INVISIBLES = /[­​-‍⁠﻿]/g;

/**
 * Lo que un procesador de textos pone en lugar de lo que hay en el teclado. No
 * es un error de quien lo pega, así que se traduce en vez de rechazarlo.
 */
const TIPOGRAFICOS: Readonly<Record<string, string>> = {
  '“': '"', '”': '"', '„': '"', '«': '"', '»': '"',
  '‘': "'", '’': "'", '‚': "'",
  '–': '-', '—': '-', '−': '-', '‐': '-', '‑': '-',
  '…': '...',
};

const RE_TIPOGRAFICOS = new RegExp(`[${Object.keys(TIPOGRAFICOS).join('')}]`, 'g');

/**
 * NFC antes que nada: macOS y algunos PDF dan la `á` como `a` + acento
 * combinante, que tiene otro aspecto para el código y es la misma letra.
 */
function limpiarCaracteres(texto: string): string {
  return texto.normalize('NFC').replace(INVISIBLES, '');
}

/** El texto tal como se va a teclear: sin saltos de línea ni espacios de más. */
export function normalizarTexto(texto: string): string {
  return limpiarCaracteres(texto)
    .replace(RE_TIPOGRAFICOS, (c) => TIPOGRAFICOS[c])
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Las teclas de acento sueltas (`´`, `¨`…) están en la distribución pero no se
 * pueden pedir como carácter: `´`+espacio da `´` en macOS y `'` en GTK. Una
 * lección que las incluya daría fallos falsos en alguna plataforma.
 */
export function esAcentoSuelto(caracter: string, layout: Layout): boolean {
  const pasos = buildIndex(layout).get(caracter);
  return pasos?.length === 1 && pasos[0].dead;
}

/** Lo que se le puede pedir al alumno con esta distribución, espacio incluido. */
export function caracteresEscribibles(layout: Layout): Set<string> {
  const permitidos = new Set<string>();
  for (const [ch, pasos] of buildIndex(layout)) {
    if (!(pasos.length === 1 && pasos[0].dead)) permitidos.add(ch);
  }
  permitidos.add(' ');
  return permitidos;
}

/** Limpia texto libre para practicarlo, descartando lo que no se puede teclear. */
export function normalizarTextoLibre(texto: string, permitidos?: Set<string>): string {
  const limpio = normalizarTexto(texto);
  if (!permitidos) return limpio;
  // Otra vez después de filtrar: «hola 😀 mundo» se quedaría con dos espacios, que
  // darían un fallo falso, y «😀 😀» con uno solo, que no es nada que practicar.
  return [...limpio]
    .filter((c) => c === ' ' || permitidos.has(c))
    .join('')
    .replace(/ +/g, ' ')
    .trim();
}

export interface CaracterNoEscribible {
  caracter: string;
  /** Lo que se puede enseñar de él: el propio carácter o su código si no se ve. */
  visible: string;
  acentoSuelto: boolean;
  /** Primera aparición, contada en el texto tal como se escribió. Desde 1. */
  linea: number;
  columna: number;
  /** La palabra donde está, para encontrarlo en un texto largo. */
  palabra: string;
  veces: number;
}

/**
 * Cuánto de «la palabra» se copia a cada lado: un texto sin espacios la haría tan
 * larga como el fichero, y cada aviso la repetiría entera.
 */
const CONTEXTO_MAX = 20;

function visibleDe(ch: string): string {
  return /\p{C}|\p{M}/u.test(ch)
    ? `U+${ch.codePointAt(0)!.toString(16).toUpperCase().padStart(4, '0')}`
    : ch;
}

/**
 * Los caracteres que impiden teclear este texto y dónde está la primera vez cada
 * uno. Trabaja sobre el texto original y no sobre el normalizado, para que la
 * línea y la posición sean las que la persona ve en su editor.
 */
export function buscarNoEscribibles(texto: string, layout: Layout): CaracterNoEscribible[] {
  const permitidos = caracteresEscribibles(layout);
  const encontrados = new Map<string, CaracterNoEscribible>();
  const lineas = limpiarCaracteres(texto).split(/\r\n|\r|\n/);

  lineas.forEach((linea, l) => {
    const chars = [...linea];
    chars.forEach((ch, c) => {
      if (/\s/.test(ch) || ch in TIPOGRAFICOS || permitidos.has(ch)) return;
      const previo = encontrados.get(ch);
      if (previo) { previo.veces++; return; }
      let ini = c;
      let fin = c;
      while (ini > 0 && c - ini < CONTEXTO_MAX && !/\s/.test(chars[ini - 1])) ini--;
      while (fin < chars.length - 1 && fin - c < CONTEXTO_MAX && !/\s/.test(chars[fin + 1])) fin++;
      const antes = ini > 0 && !/\s/.test(chars[ini - 1]) ? '…' : '';
      const despues = fin < chars.length - 1 && !/\s/.test(chars[fin + 1]) ? '…' : '';
      encontrados.set(ch, {
        caracter: ch,
        visible: visibleDe(ch),
        acentoSuelto: esAcentoSuelto(ch, layout),
        linea: l + 1,
        columna: c + 1,
        palabra: antes + chars.slice(ini, fin + 1).join('') + despues,
        veces: 1,
      });
    });
  });

  return [...encontrados.values()];
}
