/**
 * Un texto nuevo en cada intento.
 *
 * Con un texto fijo de doce palabras, al tercer intento el alumno lo recita de
 * memoria y el 90% de precisión pasa a medir memoria, no destreza. Aquí se
 * genera uno distinto cada vez con lo que ya se puede escribir: el vocabulario
 * de la lección y las anteriores, más las frases cortas de `lessons.ts`.
 *
 * Tres cosas que se mantienen aunque el texto cambie, y que vigilan los tests
 * generando cientos de semillas:
 *
 * - **Nunca usa una tecla que no se haya enseñado.** Todo pasa por
 *   `alfabetoHasta`, también las mayúsculas y el punto que se añaden a las
 *   frases.
 * - **Practica las teclas que estrena la lección**, y les da más peso: una
 *   palabra con una tecla nueva sale bastante más que una que no la tiene.
 * - **Es determinista con la semilla.** Misma semilla, mismo texto: se puede
 *   probar, y un fallo se puede reproducir.
 *
 * El identificador de la lección no cambia nunca por esto: récords, repaso y
 * equivalencias van por `id`, no por el texto.
 */
import { alfabetoHasta, LESSONS, vocabularioHasta } from './lessons';

/** Generador pseudoaleatorio pequeño y determinista (mulberry32). */
export function azar(semilla: number): () => number {
  let a = semilla >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Una semilla cualquiera, para cuando no hace falta reproducir el texto. */
export function semillaNueva(): number {
  return Math.floor(Math.random() * 2 ** 32);
}

/** Índice de la primera lección de frases con mayúscula: a partir de ahí no hay palabras sueltas. */
const I_MAYUSCULAS = LESSONS.findIndex((l) => l.id === 'mayusculas');

const FIN_DE_FRASE = /[.?!:;)"%€]$/;

/**
 * Da forma a una frase según lo que ya se ha enseñado. Las frases se escriben
 * en minúscula y sin puntuación para poder usarlas pronto; en cuanto la
 * mayúscula o el punto están dados, la práctica los mantiene.
 */
export function formatearFrase(frase: string, alfabeto: ReadonlySet<string>): string {
  let f = frase;
  const primera = f[0];
  if (primera && primera !== primera.toUpperCase() && alfabeto.has(primera.toUpperCase())) {
    f = primera.toUpperCase() + f.slice(1);
  }
  if (alfabeto.has('.') && !FIN_DE_FRASE.test(f)) f += '.';
  return f;
}

const escribible = (texto: string, alfabeto: ReadonlySet<string>) =>
  [...texto].every((ch) => ch === ' ' || alfabeto.has(ch));

/**
 * Las piezas con las que se construye el texto de un nivel: palabras sueltas y
 * frases hasta la lección de mayúsculas; a partir de ahí, solo frases, para que
 * la mayúscula y la puntuación aprendidas no desaparezcan.
 */
export function piezasHasta(indice: number): string[] {
  const i = Math.min(Math.max(0, indice), LESSONS.length - 1);
  const alfabeto = alfabetoHasta(i);
  const frases = LESSONS.slice(0, i + 1)
    .flatMap((l) => l.frases ?? [])
    .map((f) => formatearFrase(f, alfabeto))
    .filter((f) => escribible(f, alfabeto));
  const piezas = I_MAYUSCULAS >= 0 && i >= I_MAYUSCULAS
    ? frases
    : [...vocabularioHasta(i), ...frases];
  const unicas = [...new Set(piezas)];
  return unicas.length > 0 ? unicas : vocabularioHasta(i);
}

interface Pieza { texto: string; peso: number }

function elegir(piezas: readonly Pieza[], r: () => number): Pieza {
  const total = piezas.reduce((s, p) => s + p.peso, 0);
  let x = r() * total;
  for (const p of piezas) {
    x -= p.peso;
    if (x < 0) return p;
  }
  return piezas[piezas.length - 1];
}

/** Mezcla en el sitio (Fisher-Yates) con el generador dado. */
function barajar<T>(lista: T[], r: () => number): T[] {
  for (let i = lista.length - 1; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    [lista[i], lista[j]] = [lista[j], lista[i]];
  }
  return lista;
}

/** Cuántas teclas nuevas distintas lleva una pieza. */
function cuantasNuevas(texto: string, nuevas: ReadonlySet<string>): number {
  let n = 0;
  for (const ch of new Set(texto)) if (nuevas.has(ch)) n++;
  return n;
}

export interface OpcionesGenerar {
  /** Largo aproximado en caracteres; se para en la primera pieza que lo pasa. */
  largo: number;
  /** Teclas a las que dar más peso y asegurar que salgan. */
  nuevas?: string;
  /**
   * Como mucho, cuántas piezas se eligen solo para cubrir teclas nuevas. Con
   * cinco teclas nuevas salen todas; con las 33 mayúsculas, no tendría sentido.
   */
  maxCobertura?: number;
}

/** Construye un texto con piezas, de forma determinista para una semilla. */
export function construirTexto(
  piezasTexto: readonly string[],
  semilla: number,
  { largo, nuevas = '', maxCobertura = 6 }: OpcionesGenerar,
): string {
  const r = azar(semilla);
  const setNuevas = new Set(nuevas);
  const piezas: Pieza[] = piezasTexto.map((texto) => ({
    texto,
    // Cada tecla nueva distinta en la pieza la hace salir bastante más.
    peso: 1 + 3 * cuantasNuevas(texto, setNuevas),
  }));
  if (piezas.length === 0) return '';

  const elegidas: string[] = [];
  const usadas = new Map<string, number>();
  const anotar = (t: string) => {
    elegidas.push(t);
    usadas.set(t, (usadas.get(t) ?? 0) + 1);
  };
  let longitud = -1;
  const sumar = (t: string) => { longitud += t.length + 1; };

  // 1. Cobertura: una pieza para cada tecla nueva que aún no haya salido.
  for (const ch of barajar([...setNuevas], r)) {
    if (elegidas.length >= maxCobertura) break;
    if (elegidas.some((t) => t.includes(ch))) continue;
    const candidatas = piezas.filter((p) => p.texto.includes(ch) && !usadas.has(p.texto));
    if (candidatas.length === 0) continue;
    const p = elegir(candidatas, r);
    anotar(p.texto);
    sumar(p.texto);
  }

  // 2. Relleno por peso. Lo ya usado se rechaza casi siempre, para que el
  //    texto varíe dentro de sí mismo y no solo de un intento a otro.
  let vueltas = 0;
  while (longitud < largo && vueltas < 10_000) {
    vueltas++;
    const p = elegir(piezas, r);
    const veces = usadas.get(p.texto) ?? 0;
    if (veces > 0 && r() < 0.85) continue;
    anotar(p.texto);
    sumar(p.texto);
  }

  // 3. Orden al azar, sin la misma palabra dos veces seguidas si se puede
  //    evitar (también en la juntura de una frase con la palabra de al lado).
  barajar(elegidas, r);
  const pegadas = (a: string, b: string) => a.split(' ').at(-1) === b.split(' ')[0];
  for (let pasada = 0; pasada < 3; pasada++) {
    for (let i = 1; i < elegidas.length; i++) {
      if (!pegadas(elegidas[i - 1], elegidas[i])) continue;
      const j = elegidas.findIndex((t, k) => k !== i && k !== i - 1
        && !pegadas(elegidas[i - 1], t)
        && (k + 1 >= elegidas.length || k + 1 === i || !pegadas(elegidas[i], elegidas[k + 1]))
        && (k === 0 || k - 1 === i || !pegadas(elegidas[k - 1], elegidas[i])));
      if (j >= 0) [elegidas[i], elegidas[j]] = [elegidas[j], elegidas[i]];
    }
  }
  return elegidas.join(' ');
}

/**
 * Texto de un intento de la lección `indice`. Más o menos igual de largo que
 * el texto revisado a mano de esa lección, para que la dificultad no cambie.
 */
export function generarTextoLeccion(indice: number, semilla: number): string {
  const i = Math.min(Math.max(0, indice), LESSONS.length - 1);
  const leccion = LESSONS[i];
  return construirTexto(piezasHasta(i), semilla, {
    largo: Math.max(50, leccion.text.length),
    nuevas: leccion.nuevas,
  });
}

/**
 * Texto de la lección para un intento concreto. El primer contacto con una
 * lección usa el texto revisado a mano, que es el mejor que hay; a partir de
 * ahí, uno nuevo cada vez.
 */
export function textoDeIntento(indice: number, yaPracticada: boolean, semilla: number): string {
  const leccion = LESSONS[Math.min(Math.max(0, indice), LESSONS.length - 1)];
  return yaPracticada ? generarTextoLeccion(indice, semilla) : leccion.text;
}

/**
 * Práctica continua: todo el vocabulario desbloqueado, sin dar más peso a
 * ninguna lección. Desde la de mayúsculas son frases con su mayúscula y su
 * puntuación, que no se pierden por haber terminado esas lecciones.
 */
export function generarTextoPractica(indice: number, semilla = semillaNueva(), largo = 120): string {
  return construirTexto(piezasHasta(indice), semilla, { largo });
}
