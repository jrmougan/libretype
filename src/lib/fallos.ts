/**
 * Qué teclas costaron en este intento, para decírselo al terminar.
 *
 * «Precisión: 86%» no le dice a nadie qué hacer a continuación; «las que más
 * costaron: la tilde y la P» sí. Va aparte del dominio (`keyboard/dominio.ts`)
 * porque aquel es una media que dura semanas y esto es solo el intento que
 * acaba de terminar.
 *
 * Los fallos se atribuyen a la tecla del carácter **objetivo**, igual que el
 * dominio: los spikes demostraron que no se puede saber qué tecla produjo un
 * carácter confirmado. En una vocal con tilde cuentan el acento y la vocal.
 */
import { ES_ISO, type Layout } from './keyboard/layouts';
import { charDeCodigo } from './refuerzo';

export type MapaFallos = ReadonlyMap<string, number>;

/** Apunta un intento; solo los fallos ocupan sitio. Devuelve un mapa nuevo. */
export function anotarFallo(mapa: MapaFallos, code: string, acierto: boolean): Map<string, number> {
  const m = new Map(mapa);
  if (!acierto) m.set(code, (m.get(code) ?? 0) + 1);
  return m;
}

const NOMBRES: Record<string, string> = {
  ' ': 'el espacio',
  '´': 'la tilde (´)',
  '¨': 'la diéresis (¨)',
  ',': 'la coma',
  '.': 'el punto',
  '-': 'el guion',
  "'": 'el apóstrofo',
  '¡': 'la ¡',
  '<': 'la tecla <',
};

/** Cómo se le llama a una tecla en una frase, para que se lea bien en voz alta. */
export function nombreTecla(code: string, layout: Layout = ES_ISO): string {
  const ch = charDeCodigo(code, layout);
  if (NOMBRES[ch]) return NOMBRES[ch];
  if (ch.length === 1 && ch !== ch.toUpperCase()) return `la ${ch.toUpperCase()}`;
  if (/^\d$/.test(ch)) return `el ${ch}`;
  return ch.length === 1 ? `la tecla ${ch}` : ch;
}

export interface TeclaConFallos {
  code: string;
  nombre: string;
  fallos: number;
}

/**
 * Las `n` teclas con más fallos del intento, de más a menos. Solo las que han
 * fallado alguna vez: un intento limpio devuelve una lista vacía y el diálogo
 * no dice nada, que es lo correcto.
 */
export function teclasConMasFallos(
  fallos: MapaFallos,
  n = 3,
  layout: Layout = ES_ISO,
): TeclaConFallos[] {
  return [...fallos]
    .filter(([, f]) => f > 0)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, n)
    .map(([code, f]) => ({ code, nombre: nombreTecla(code, layout), fallos: f }));
}

/** «la P», «la P y la tilde (´)», «la P, la A y el espacio». */
export function enumerar(nombres: readonly string[]): string {
  if (nombres.length <= 1) return nombres.join('');
  return `${nombres.slice(0, -1).join(', ')} y ${nombres[nombres.length - 1]}`;
}
