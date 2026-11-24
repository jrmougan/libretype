/**
 * Fluidez: tandas cortas de lo más frecuente del idioma del curso.
 *
 * Las lecciones enseñan dónde está cada tecla; la soltura llega cuando las
 * palabras más usadas salen sin pensar letra a letra. Estas tandas repiten lo
 * que más se escribe —«que», «de», «la», «en»— y los pares de letras que más se
 * encadenan, para que se automaticen como un solo gesto.
 *
 * Reglas que no son parámetros que tocar a ojo:
 *
 * - **La meta es tu propio ritmo anterior**, nunca una cifra fija ni la de
 *   nadie. Con la mediana de tus últimas tandas limpias, no con la última.
 * - **Nunca a costa de la precisión.** Una tanda con muchos fallos no cuenta
 *   para el ritmo de referencia, y la valoración pide primero escribir bien.
 * - **Solo con teclas ya enseñadas**: el banco se filtra por el alfabeto del
 *   curso hasta la lección abierta.
 *
 * El banco es dato de cada curso (`frecuentes` y `bigramas`): un curso que no lo
 * traiga usa su vocabulario acumulado, sin trenes de bigramas.
 */
import { PCT_MINIMO_PARA_RECORD, type Sesion } from '../storage/progreso';
import { catalogo as catalogoApp, type Catalogo } from './catalogo';
import { ID_FLUIDEZ } from './ids';

/** Con menos palabras que esto no hay tanda que no sea un bucle. */
const MIN_BANCO = 4;

/** Palabras frecuentes del curso escribibles con lo enseñado hasta esa lección. */
export function palabrasDisponibles(hasta: string, catalogo: Catalogo = catalogoApp): string[] {
  const permitidas = catalogo.alfabetoHasta(hasta);
  const frecuentes = catalogo.cursoDe(hasta)?.frecuentes ?? [];
  const validas = frecuentes.filter((p) => [...p].every((c) => permitidas.has(c)));
  // Al principio del curso casi nada del banco se puede escribir: se tira del
  // vocabulario de las lecciones abiertas para que nunca salga vacía.
  return validas.length >= MIN_BANCO ? validas : catalogo.vocabularioHasta(hasta);
}

/** Los bigramas practicables con al menos tres palabras disponibles. */
export function bigramasDisponibles(hasta: string, catalogo: Catalogo = catalogoApp): Map<string, string[]> {
  const palabras = palabrasDisponibles(hasta, catalogo);
  const m = new Map<string, string[]>();
  for (const b of catalogo.cursoDe(hasta)?.bigramas ?? []) {
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
export function generarTanda(
  hasta: string,
  cantidad: number,
  azar: () => number = Math.random,
  catalogo: Catalogo = catalogoApp,
): string {
  const banco = palabrasDisponibles(hasta, catalogo);
  if (banco.length === 0) return '';
  const trenes = [...bigramasDisponibles(hasta, catalogo).values()];
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
    return 'En esta tanda se han escapado bastantes teclas. Para la soltura cuenta antes escribir bien: ' +
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
