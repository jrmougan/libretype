/**
 * Fase de fluidez: tandas cortas de lo más frecuente del español.
 *
 * Las lecciones enseñan dónde está cada tecla; la soltura llega cuando las
 * palabras más usadas salen sin pensar letra a letra. Estas tandas repiten lo
 * que más se escribe —«que», «de», «la», «en»— y los pares de letras que más se
 * encadenan, para que se automaticen como un solo gesto.
 *
 * Reglas que vienen del roadmap (2.5):
 *
 * - **La meta es tu propio ritmo anterior**, nunca una cifra fija ni la de
 *   nadie. Con la mediana de tus últimas tandas limpias, no con la última.
 * - **Nunca a costa de la precisión.** Una tanda con muchos fallos no cuenta
 *   para el ritmo de referencia, y la valoración pide primero escribir bien.
 * - Solo con teclas ya enseñadas: el banco se filtra por el alfabeto abierto.
 *
 * Banco propio a propósito: no toca `lessons.ts`, cuyo vocabulario está
 * ordenado por lección y vigilado por `lessons.test.ts`.
 */
import { alfabetoHasta, LESSONS } from './lessons';
import { PCT_MINIMO_PARA_RECORD, type Sesion } from './storage/progreso';

/** Identificador con el que se guardan las tandas en el historial. */
export const ID_FLUIDEZ = 'fluidez';

/**
 * Las palabras más frecuentes del español escrito, de más a menos. Las
 * primeras cien cubren cerca de la mitad de lo que se escribe; aquí van las
 * que sostienen las frases (artículos, preposiciones, verbos auxiliares).
 */
export const PALABRAS_FRECUENTES: readonly string[] = [
  'de', 'la', 'que', 'el', 'en', 'y', 'a', 'los', 'se', 'del',
  'las', 'un', 'por', 'con', 'no', 'una', 'su', 'para', 'es', 'al',
  'lo', 'como', 'más', 'o', 'pero', 'sus', 'le', 'ha', 'me', 'si',
  'sin', 'sobre', 'este', 'ya', 'entre', 'cuando', 'todo', 'esta', 'ser', 'son',
  'dos', 'también', 'fue', 'había', 'era', 'muy', 'años', 'hasta', 'desde', 'está',
  'mi', 'porque', 'qué', 'solo', 'han', 'yo', 'hay', 'vez', 'puede', 'todos',
  'así', 'nos', 'ni', 'parte', 'tiene', 'él', 'uno', 'donde', 'bien', 'tiempo',
  'mismo', 'ese', 'ahora', 'cada', 'e', 'vida', 'otro', 'después', 'te', 'otros',
  'aunque', 'esa', 'eso', 'hace', 'otra', 'gobierno', 'tan', 'durante', 'siempre', 'día',
  'tanto', 'ella', 'tres', 'sí', 'dijo', 'sido', 'gran', 'país', 'según', 'menos',
];

/**
 * Pares de letras que más se encadenan en español. Cada uno se practica con
 * palabras reales que lo contienen, no con sílabas sueltas.
 */
export const BIGRAMAS_FRECUENTES: readonly string[] = [
  'de', 'es', 'en', 'el', 'la', 'os', 'ue', 'ar', 'er', 'ra',
  're', 'qu', 'an', 'as', 'on', 'co', 'ta', 'do', 'se', 'te',
  'al', 'or', 'nt', 'st', 'ad', 'ci', 'to', 'ca', 'ie', 'io',
];

/** Palabras del banco escribibles con lo enseñado hasta la lección `nivel`. */
export function palabrasDisponibles(nivel: number): string[] {
  const permitidas = alfabetoHasta(Math.min(Math.max(nivel, 0), LESSONS.length - 1));
  return PALABRAS_FRECUENTES.filter((p) => [...p].every((c) => permitidas.has(c)));
}

/** Los bigramas practicables con al menos tres palabras disponibles. */
export function bigramasDisponibles(nivel: number): Map<string, string[]> {
  const palabras = palabrasDisponibles(nivel);
  const m = new Map<string, string[]>();
  for (const b of BIGRAMAS_FRECUENTES) {
    const con = palabras.filter((p) => p.includes(b));
    if (con.length >= 3) m.set(b, con);
  }
  return m;
}

/**
 * Una tanda de `cantidad` palabras. Se alternan dos ejercicios:
 *
 * - palabras sueltas elegidas con peso según su frecuencia (la primera del
 *   banco sale mucho más que la última), sin repetir la anterior;
 * - cada cinco palabras, un «tren» de tres palabras que comparten un bigrama
 *   frecuente, para encadenar ese gesto varias veces seguidas.
 *
 * `azar` existe para poder probarlo sin aleatoriedad.
 */
export function generarTanda(nivel: number, cantidad: number, azar: () => number = Math.random): string {
  const palabras = palabrasDisponibles(nivel);
  // Hasta la segunda lección el banco casi no tiene nada: se tira de las
  // palabras que sí se pueden escribir para que nunca salga vacía.
  const banco = palabras.length >= 4 ? palabras : ['la', 'las', 'sal', 'ala', 'asa', 'da'];
  const trenes = [...bigramasDisponibles(nivel).values()];
  // Peso de Zipf: la palabra de rango r pesa 1/r.
  const pesos = banco.map((_, i) => 1 / (i + 1));
  const total = pesos.reduce((a, b) => a + b, 0);

  function porFrecuencia(evitar: string): string {
    for (let intento = 0; intento < 5; intento++) {
      let r = azar() * total;
      let i = 0;
      while (i < banco.length - 1 && r >= pesos[i]) { r -= pesos[i]; i++; }
      if (banco[i] !== evitar) return banco[i];
    }
    return banco.find((p) => p !== evitar) ?? banco[0];
  }

  const salida: string[] = [];
  while (salida.length < cantidad) {
    const tocaTren = trenes.length > 0 && salida.length > 0 && salida.length % 5 === 0
      && cantidad - salida.length >= 3;
    if (tocaTren) {
      const tren = trenes[Math.floor(azar() * trenes.length)];
      const inicio = Math.floor(azar() * (tren.length - 2));
      salida.push(...tren.slice(inicio, inicio + 3));
    } else {
      salida.push(porFrecuencia(salida.at(-1) ?? ''));
    }
  }
  return salida.slice(0, cantidad).join(' ');
}

/** Tandas que se miran para el ritmo de referencia. */
export const TANDAS_REFERENCIA = 5;

/**
 * Tu ritmo habitual en las tandas: la mediana de palabras por minuto de las
 * últimas tandas limpias. La mediana y no la media para que una tanda rara no
 * mueva la meta, y nunca la última sola. `null` si aún no hay ninguna limpia.
 */
export function ritmoReferencia(sesiones: readonly Sesion[]): number | null {
  const limpias = sesiones
    .filter((s) => s.leccion === ID_FLUIDEZ && s.escritos > 0 && s.pctAcierto >= PCT_MINIMO_PARA_RECORD)
    .sort((a, b) => (a.terminadaEn < b.terminadaEn ? -1 : 1))
    .slice(-TANDAS_REFERENCIA)
    .map((s) => s.ppm)
    .sort((a, b) => a - b);
  if (limpias.length === 0) return null;
  const mitad = Math.floor(limpias.length / 2);
  return limpias.length % 2 ? limpias[mitad] : Math.round((limpias[mitad - 1] + limpias[mitad]) / 2);
}

/** Qué se dice antes de empezar una tanda. */
export function explicacionFluidez(referencia: number | null): string {
  const base = 'Palabras muy frecuentes, para que salgan sin pensar letra a letra. Primero, escribir bien.';
  return referencia === null
    ? `${base} Tu primera tanda limpia será tu ritmo de referencia: aquí solo te comparas contigo.`
    : `${base} Tu ritmo habitual en estas tandas es de unas ${referencia} palabras por minuto; ` +
      'si te sale natural, intenta igualarlo sin perder precisión.';
}

/**
 * La valoración de una tanda terminada, contra tu ritmo de antes de ella.
 * Ninguna rama reprende: como mucho, propone ir algo más despacio.
 */
export function valorarTanda(ppm: number, precision: number, referencia: number | null): string {
  if (precision < PCT_MINIMO_PARA_RECORD) {
    return 'Esta tanda ha tenido bastantes fallos. Para la soltura cuenta antes escribir bien: ' +
      'prueba la siguiente un poco más despacio.';
  }
  if (referencia === null) {
    return 'Primera tanda limpia. Desde aquí, cada tanda se compara con tu propio ritmo.';
  }
  if (ppm >= referencia) {
    return `Por encima de tu ritmo habitual (${referencia} palabras por minuto) y sin perder precisión.`;
  }
  return `Tu ritmo habitual aquí es de ${referencia} palabras por minuto; hoy, ${ppm}. ` +
    'Sin prisa: la soltura llega con la práctica.';
}
