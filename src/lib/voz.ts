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
  /**
   * Encabeza las teclas que más costaron en el intento («…: la P y la tilde»).
   * El sujeto son las teclas, no la persona, por la misma razón que en `repaso`.
   */
  costaron: string;
  /** Cierra esa lista sin reprender: lo que costó se asienta practicando. */
  costaronAnimo: string;
  /** Invita a practicar las teclas flojas desde el diálogo de resultado. */
  refuerzo: string;
  /**
   * Horizonte realista. Aprender a escribir sin mirar lleva semanas y hay un
   * tramo en que parece que no se avanza, que es cuando más se abandona.
   * Decirlo antes lo convierte en algo esperado. Sin cifra de días ni cuenta
   * atrás: una cifra sería una meta que se puede incumplir.
   */
  horizonte: string;
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
  costaron: 'Las que más se han resistido:',
  costaronAnimo: '¡Con un poco de práctica saldrán solas!',
  refuerzo: '¡Dales un repaso a las que más cuestan!',
  horizonte:
    '¡Escribir sin mirar se consigue en unas semanas, con un ratito cada día! ' +
    'Si algún día parece que no avanzas, no pasa nada: le pasa a todo el mundo, y luego se nota el salto.',
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
  costaron: 'Las teclas que más costaron esta vez:',
  costaronAnimo: 'Es normal; se asientan practicando.',
  refuerzo: 'Puedes practicar ahora las teclas que más cuestan.',
  horizonte:
    'Aprender a escribir sin mirar lleva unas semanas, un rato cada día. ' +
    'Es normal que haya un tramo en el que parece que no se avanza: forma parte del aprendizaje.',
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

/**
 * Qué son las «ppm», igual en los dos tonos porque es información, no ánimo.
 * El motor cuenta cada cinco caracteres acertados como una palabra.
 */
export const QUE_ES_PPM =
  'ppm son palabras por minuto: cuántas palabras escribirías en un minuto a este ritmo. ' +
  'Cada cinco letras acertadas cuentan como una palabra.';
