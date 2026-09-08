/**
 * Dificultad observada de cada lección: cuántos intentos costó superarla.
 *
 * Sale de la issue #53, que pregunta si el 90% de `PCT_OBJETIVO` es un umbral
 * igual de razonable para todas las lecciones o si alguna es desproporcionada
 * para quien llega a ella. La candidata es Tildes: estrena la composición de
 * dos pulsaciones, un concepto motor nuevo además de una tecla nueva.
 *
 * **El umbral sigue siendo plano y aquí no se toca.** Es una hipótesis, no una
 * certeza, y un umbral único es simple y predecible, que tiene valor propio.
 * Relajarlo sin datos bajaría el listón de un ejercicio que quizá funciona
 * bien, justo el efecto contrario al que busca la app. Lo que faltaba era la
 * señal indirecta que la propia issue pide: los reintentos por lección que ya
 * están en el histórico local. No hay telemetría ni la va a haber —la
 * comprobación de actualizaciones es la única petición de red de la aplicación—
 * así que la señal tiene que salir de lo que cada persona ya tiene guardado.
 *
 * `intentos` (en `progreso.ts`) no sirve para esto: cuenta también las
 * repeticiones voluntarias de quien ya superó la lección y sigue practicándola,
 * de modo que una lección muy usada y una lección muy difícil dan el mismo
 * número. La cifra comparable es cuántos intentos hicieron falta **hasta** el
 * primero que alcanzó el objetivo.
 *
 * Un histórico por sí solo no confirma nada: dice que a esa persona le costó,
 * no que la lección sea difícil. `leccionesAtipicas()` existe para que mirar
 * esa cifra sea una regla escrita y probada en vez de una impresión, y para que
 * el criterio sea el mismo cuando se repita en varios históricos, que es el
 * momento de replantearse el umbral y no antes.
 *
 * La agregación vive en TypeScript y no en SQL por lo mismo que el resto: se
 * puede probar sin base de datos.
 */
import { LESSONS } from '../lessons';
import { idCanonico } from './equivalencias';
import { PCT_OBJETIVO } from './objetivos';
import type { Sesion } from './progreso';

export interface DificultadLeccion {
  /** Identificador canónico, pasado por `idCanonico()`. */
  leccion: string;
  /**
   * Intentos válidos hasta el primero que alcanzó `PCT_OBJETIVO`, incluido ese.
   * Si la lección sigue sin superarse son los que hay hasta ahora: un suelo, no
   * el valor definitivo, y por eso va acompañado de `superada`.
   */
  intentosHastaSuperar: number;
  superada: boolean;
}

/**
 * Cuántas veces la mediana del resto tiene que costar una lección para
 * señalarla.
 *
 * Conservador a propósito: un falso positivo invita a relajar un umbral que
 * funciona y un falso negativo solo cuesta esperar a tener más histórico, así
 * que los dos errores no valen lo mismo. Con cuatro se señala lo que de verdad
 * destaca —si lo normal es superar en dos intentos, hacen falta ocho— y no lo
 * que entra en el ruido de aprender: que una lección cueste el doble o el
 * triple que otra es esperable cuando estrena teclas.
 */
export const FACTOR_ATIPICO = 4;

/**
 * Suelo absoluto de intentos para poder señalar una lección.
 *
 * El factor solo no basta cuando el histórico es corto y todo se superó a la
 * primera: con mediana 1, cuatro veces es cuatro intentos, y cuatro intentos
 * para llegar al 90% no es una lección difícil, es un alumno empezando. Por
 * debajo de este suelo no se señala nada por mucho que destaque la proporción.
 */
export const MIN_INTENTOS_ATIPICA = 6;

/**
 * Cuántas lecciones superadas hacen falta antes de comparar ninguna.
 *
 * La mediana de dos o tres valores es ruido: cambia del todo con un intento más
 * y se puede convertir en atípica una lección normal. Cuatro es además el punto
 * exacto en el que la comparación empieza a interesar: Tildes es la quinta
 * lección del temario, así que quien llega a ella ya ha superado cuatro y tiene
 * base contra la que medirla.
 */
export const MIN_LECCIONES_BASE = 4;

/**
 * Un intento de verdad: algo escrito y un porcentaje legible. Las filas vacías
 * o corruptas de una copia importada no cuentan, igual que no cuentan en
 * `leccionesSuperadas()`; si no, un histórico estropeado inflaría la dificultad
 * de una lección sin que nadie la haya practicado.
 */
function esIntento(s: Sesion): boolean {
  return s.escritos > 0 && Number.isFinite(s.pctAcierto)
    && s.pctAcierto >= 0 && s.pctAcierto <= 100;
}

function medianaDe(valores: readonly number[]): number {
  const ordenados = [...valores].sort((a, b) => a - b);
  // Con la base mínima que exige `leccionesAtipicas()` nunca llega vacía; el
  // cero está para que la función sea total y no devuelva NaN si se reutiliza.
  if (ordenados.length === 0) return 0;
  const mitad = Math.floor(ordenados.length / 2);
  return ordenados.length % 2 === 0
    ? (ordenados[mitad - 1] + ordenados[mitad]) / 2
    : ordenados[mitad];
}

/**
 * Intentos que costó superar cada lección del temario, por identificador
 * canónico.
 *
 * Solo entran las lecciones de `LESSONS`. Se quedan fuera la práctica libre
 * (`practica-continua`, `texto-propio`, `refuerzo`), que no tiene objetivo que
 * superar y cuyo texto cambia en cada sesión, y las lecciones retiradas, que se
 * jugaban con otra regla: en la v0.1.0 terminar ya desbloqueaba la siguiente,
 * así que contarles intentos hasta el 90% mezclaría dos temarios y daría una
 * cifra que no significa nada.
 *
 * Una reserva sobre la fuente: el respaldo del navegador recorta a las últimas
 * 500 sesiones y, aunque `conservarLogros()` reserva el intento que acredita
 * cada logro, los intentos anteriores a ese pueden haber caído. En un histórico
 * recortado la cifra es un suelo, no el recuento completo.
 */
export function resumirDificultad(sesiones: readonly Sesion[]): Map<string, DificultadLeccion> {
  const delTemario = new Set(LESSONS.map((l) => l.id));

  // "El primero que alcanzó el objetivo" solo significa algo con la historia en
  // orden, y el orden de llegada no es fiable: una copia importada puede traer
  // sesiones antiguas detrás de recientes. El orden estable respeta la llegada
  // cuando dos sesiones comparten fecha.
  const enOrden = [...sesiones]
    .filter(esIntento)
    .sort((a, b) => (a.terminadaEn < b.terminadaEn ? -1 : a.terminadaEn > b.terminadaEn ? 1 : 0));

  const porLeccion = new Map<string, DificultadLeccion>();

  for (const s of enOrden) {
    const leccion = idCanonico(s.leccion);
    if (!delTemario.has(leccion)) continue;

    const previo = porLeccion.get(leccion);
    // Lo practicado después de superarla ya no es "hasta superar": es repaso
    // voluntario, que es justo lo que esta métrica viene a descontar.
    if (previo?.superada) continue;

    if (!previo) {
      porLeccion.set(leccion, {
        leccion,
        intentosHastaSuperar: 1,
        superada: s.pctAcierto >= PCT_OBJETIVO,
      });
      continue;
    }

    previo.intentosHastaSuperar++;
    if (s.pctAcierto >= PCT_OBJETIVO) previo.superada = true;
  }

  return porLeccion;
}

/**
 * Lecciones del temario que costaron muy por encima de las demás: la señal de
 * que el umbral plano puede estar desproporcionado ahí.
 *
 * El criterio, deliberadamente estrecho: al menos `MIN_LECCIONES_BASE` lecciones
 * superadas contra las que comparar, y que la candidata cueste a la vez
 * `MIN_INTENTOS_ATIPICA` intentos y `FACTOR_ATIPICO` veces la mediana del resto.
 *
 * Dos detalles que importan:
 *
 * - La mediana se calcula **sin** la candidata. Con muestras tan pequeñas,
 *   incluirla subiría la mediana y taparía justo lo que se busca.
 * - La base son solo las lecciones superadas. Una sin superar tiene un recuento
 *   censurado —lo que va hasta ahora, no lo que acabará costando—, así que no
 *   puede servir para medir lo normal; pero sí puede ser señalada, porque
 *   llevar muchos intentos sin llegar al objetivo es la señal más fuerte de
 *   todas.
 */
export function leccionesAtipicas(sesiones: readonly Sesion[]): Set<string> {
  const dificultad = [...resumirDificultad(sesiones).values()];
  const base = dificultad.filter((d) => d.superada);
  const atipicas = new Set<string>();

  if (base.length < MIN_LECCIONES_BASE) return atipicas;

  for (const d of dificultad) {
    const resto = base
      .filter((b) => b.leccion !== d.leccion)
      .map((b) => b.intentosHastaSuperar);
    if (
      d.intentosHastaSuperar >= MIN_INTENTOS_ATIPICA
      && d.intentosHastaSuperar >= medianaDe(resto) * FACTOR_ATIPICO
    ) {
      atipicas.add(d.leccion);
    }
  }

  return atipicas;
}
