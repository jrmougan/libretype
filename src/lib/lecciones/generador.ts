/**
 * Un texto nuevo en cada intento de una lección del temario.
 *
 * Con un texto fijo, al tercer intento el alumno lo recita de memoria y el
 * objetivo de precisión pasa a medir memoria, no destreza. El primer contacto
 * con una lección sigue siendo su texto revisado a mano, que es el mejor que
 * hay; a partir del segundo se genera uno distinto con lo que ya se puede
 * escribir.
 *
 * De dónde salen las piezas, siempre preguntando al catálogo:
 *
 * - **Mientras se estrena el alfabeto** (hasta `finAlfabeto` del curso), palabras
 *   reales: `catalogo.vocabularioHasta()`, que ya filtra por lo enseñado.
 * - **Después**, las `frases` de la propia lección, si las trae. Ahí las palabras
 *   sueltas perderían la mayúscula y la puntuación que se están practicando.
 * - Una lección sin frases y fuera del alfabeto (los textos seguidos de
 *   consolidación) **no se genera**: conserva su texto.
 *
 * Tres cosas que se mantienen aunque el texto cambie, y que vigilan los tests
 * generando cientos de semillas para cada lección de cada curso:
 *
 * - **Nunca usa una tecla que no se haya enseñado.**
 * - **Practica las teclas que estrena la lección**, y les da más peso.
 * - **Es determinista con la semilla.** Misma semilla, mismo texto: se puede
 *   probar, y un fallo se puede reproducir.
 *
 * El identificador de la lección no cambia por esto: récords, repaso y
 * equivalencias van por `id`, no por el texto.
 */
import { catalogo as catalogoApp, type Catalogo } from './catalogo';

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

/** Con menos piezas distintas no hay variedad que ofrecer: mejor el texto revisado. */
const MIN_PIEZAS = 6;
/** Por debajo no caben siempre todas las teclas que se estrenan. */
const LARGO_MINIMO = 50;

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
 * Las piezas con las que se puede componer un intento de esa lección, o `null`
 * si esa lección no admite texto generado (no es del catálogo, es un texto
 * seguido sin frases, o no hay variedad suficiente).
 */
export function piezasDe(id: string, catalogo: Catalogo = catalogoApp): string[] | null {
  const leccion = catalogo.leccion(id);
  const curso = catalogo.cursoDe(id);
  if (!leccion || !curso) return null;

  let piezas: string[];
  if (leccion.frases && leccion.frases.length > 0) {
    piezas = [...leccion.frases];
  } else {
    const fin = curso.finAlfabeto === undefined
      ? curso.lecciones.length - 1
      : curso.lecciones.findIndex((l) => l.id === curso.finAlfabeto);
    if (catalogo.indiceEnCurso(id) > fin) return null;
    piezas = catalogo.vocabularioHasta(id);
  }
  const unicas = [...new Set(piezas)];
  return unicas.length >= MIN_PIEZAS ? unicas : null;
}

/**
 * Texto generado para un intento, más o menos igual de largo que el revisado a
 * mano para que la dificultad no cambie. `escala` aplica la preferencia de
 * longitud (1 = la del texto revisado). `null` si la lección no se genera.
 */
export function generarTextoLeccion(
  id: string,
  semilla: number,
  escala = 1,
  catalogo: Catalogo = catalogoApp,
): string | null {
  const leccion = catalogo.leccion(id);
  const piezas = piezasDe(id, catalogo);
  if (!leccion || !piezas) return null;
  return construirTexto(piezas, semilla, {
    largo: Math.max(LARGO_MINIMO, Math.round(leccion.text.length * escala)),
    nuevas: leccion.nuevas,
  });
}

/**
 * Texto de la lección para un intento concreto: el revisado a mano la primera
 * vez; a partir de ahí, uno nuevo cada vez, donde se pueda generar.
 */
export function textoDeIntento(
  id: string,
  yaPracticada: boolean,
  semilla: number,
  escala = 1,
  catalogo: Catalogo = catalogoApp,
): string {
  const leccion = catalogo.leccion(id) ?? catalogo.primera;
  if (!yaPracticada) return leccion.text;
  return generarTextoLeccion(leccion.id, semilla, escala, catalogo) ?? leccion.text;
}
