/**
 * Prueba de colocación (2.9): para quien ya escribe algo.
 *
 * Empezar por la fila de reposo cuando ya sabes escribir con varios dedos
 * aburre y hace abandonar. La prueba recorre el temario en tramos cortos, uno
 * por lección, y cada tramo escrito con la precisión del objetivo abre su
 * lección. Se para en el primero que cueste.
 *
 * Se ofrece a quien la elija desde el temario, **nunca por edad**: no hay
 * pregunta sobre quién eres, solo un botón para quien crea que ya sabe.
 *
 * **No cambia el esquema ni inventa un mecanismo de desbloqueo.** Cada tramo
 * superado se guarda como una sesión normal de esa lección, y es la API de
 * siempre (`leccionesSuperadas`/`nivelDisponible` en `objetivos.ts`) la que
 * abre las lecciones. Es honesto: el tramo es texto de esa misma lección,
 * escrito de verdad con la precisión que se le pide a cualquiera.
 */
import type { Stats } from './keyboard/engine';
import type { Lesson } from './lessons';
import { leccionesSuperadas } from './storage/objetivos';
import type { Sesion } from './storage/progreso';

/** Palabras por tramo: lo bastante para medir, lo bastante corto para no cansar. */
export const PALABRAS_POR_TRAMO = 6;

/** El tramo de una lección: sus primeras palabras, del propio texto. */
export function tramoDe(leccion: Lesson, palabras = PALABRAS_POR_TRAMO): string {
  return leccion.text.split(' ').slice(0, palabras).join(' ');
}

/** La sesión que deja un tramo, idéntica a la de terminar la lección. */
export function sesionDeTramo(leccion: string, stats: Stats, terminadaEn: string): Sesion {
  return {
    leccion,
    ppm: stats.wpm,
    pctAcierto: stats.accuracy,
    aciertos: stats.correct,
    escritos: stats.typed,
    ms: Math.round(stats.elapsedMs),
    terminadaEn,
  };
}

/**
 * ¿Abre su lección este tramo? Se le pregunta a la misma función que decide
 * los desbloqueos, para que la prueba no pueda tener un criterio propio.
 */
export function abreLeccion(sesion: Sesion): boolean {
  return leccionesSuperadas([sesion]).has(sesion.leccion);
}
