/**
 * Cómo habla la aplicación según el tono elegido.
 *
 * El mismo hecho —has terminado la lección— se cuenta distinto a un niño de
 * ocho años y a un adulto de setenta. Lo que a uno le motiva, al otro le suena
 * condescendiente, y esa sensación de «esto no es para mí» es la razón número
 * uno por la que las personas mayores abandonan una aplicación.
 *
 * Lo que cambia es el tono, no la información: los dos textos dicen lo mismo.
 */
import type { Tono } from './preferencias';
import { PCT_OBJETIVO } from './storage/objetivos';

export interface Voz {
  /** Lección del temario terminada sin llegar al objetivo: nada que celebrar ni que reprochar. */
  terminada: string;
  /** Lección del temario terminada con el objetivo cumplido en este intento. */
  superada: string;
  /** Práctica continua, texto propio o refuerzo: no hay lección que superar. */
  practicaTerminada: string;
  record: string;
  /** Marca en un modo de práctica, que no es una lección. */
  recordPractica: string;
  /** Cuando ha ido muy bien de precisión. */
  animoAlto: string;
  /** Objetivo cumplido pero sin llegar a la precisión alta: anima a afinar. */
  animoMedio: string;
  /** Cuando ha fallado bastante: nunca reprende, propone repetir. */
  animoBajo: string;
  repetir: string;
  siguiente: string;
  /** Encabeza el panel de progreso. */
  progreso: string;
  /**
   * Invitación a repasar teclas que se superaron hace tiempo. El sujeto son las
   * teclas y no la persona: decir «llevas dos semanas sin practicar» sería
   * reprender, y eso está prohibido en los dos tonos.
   */
  repaso: string;
}

const JUEGO: Voz = {
  terminada: '¡Lección terminada!',
  superada: '¡Lección superada!',
  practicaTerminada: '¡Texto completado!',
  record: '¡Nunca habías ido tan rápido en esta lección!',
  recordPractica: '¡Tu práctica más rápida hasta ahora!',
  animoAlto: '¡Casi sin fallos! Vas muy bien.',
  animoMedio: '¡Muy bien! Cada vuelta te sale más limpia.',
  animoBajo: 'Tranquilo, esto se coge con la práctica. ¿Otra vez?',
  repetir: 'Otra vez',
  siguiente: '¡Siguiente!',
  progreso: 'Lo que llevas conseguido',
  repaso: '¡A repasar! Hay teclas ganadas que piden otra vuelta.',
};

const SOBRIO: Voz = {
  terminada: 'Lección terminada.',
  superada: 'Lección superada.',
  practicaTerminada: 'Texto completado.',
  record: 'Tu mejor marca en esta lección.',
  recordPractica: 'Tu mejor marca en este modo de práctica.',
  animoAlto: 'Precisión alta.',
  animoMedio: 'Buena precisión. Con la práctica se afina más.',
  animoBajo: 'Con un par de repeticiones más la precisión sube.',
  repetir: 'Repetir',
  siguiente: 'Siguiente lección',
  progreso: 'Tu progreso',
  repaso: 'Hay teclas ya superadas que llevan un tiempo sin salir.',
};

export const VOCES: Record<Tono, Voz> = { juego: JUEGO, sobrio: SOBRIO };

/** El tono sobrio es el que se usa mientras no haya elegido: nunca infantiliza por defecto. */
export function vozDe(tono: Tono | null): Voz {
  return VOCES[tono ?? 'sobrio'];
}

/** Umbral de precisión a partir del cual el ánimo es de enhorabuena. */
export const PRECISION_ALTA = 95;

/**
 * Titular y ánimo del diálogo de resultado.
 *
 * El titular cuenta lo que ha pasado en *este* intento: decir «superada» sin
 * haber llegado al objetivo deja a un niño sin entender por qué no se abre la
 * siguiente lección. En práctica continua, texto propio o refuerzo no hay
 * lección que superar, así que el titular no habla de lecciones.
 *
 * El criterio de «superada» es el mismo que el de `leccionesSuperadas()`.
 */
export function textosResultado(
  voz: Voz,
  { modo, precision, record }: { modo: 'leccion' | 'practica'; precision: number; record: boolean },
): { titulo: string; animo: string } {
  const cumple = precision >= PCT_OBJETIVO;
  const titulo = modo === 'leccion'
    ? (record ? voz.record : cumple ? voz.superada : voz.terminada)
    : (record ? voz.recordPractica : voz.practicaTerminada);
  const animo = !cumple ? voz.animoBajo : precision >= PRECISION_ALTA ? voz.animoAlto : voz.animoMedio;
  return { titulo, animo };
}
