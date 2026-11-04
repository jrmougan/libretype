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

export interface Voz {
  terminada: string;
  record: string;
  /** Cuando ha ido muy bien de precisión (`PRECISION_ALTA` o más). */
  animoAlto: string;
  /** Ha llegado al objetivo, pero con algún fallo: «casi sin fallos» sería falso. */
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
  // No dice «superada»: se llega aquí también por debajo del objetivo.
  terminada: '¡Has llegado al final!',
  record: '¡Nunca habías ido tan rápido en esta lección!',
  animoAlto: '¡Casi sin fallos! Vas muy bien.',
  animoMedio: '¡Bien hecho! Un poco más y te sale redondo.',
  animoBajo: '¡No pasa nada! Esto se aprende practicando. ¿Otra vez?',
  repetir: 'Otra vez',
  siguiente: '¡Siguiente!',
  progreso: 'Lo que llevas conseguido',
  repaso: '¡Hora de repasar! Algunas teclas piden otra vuelta.',
};

const SOBRIO: Voz = {
  terminada: 'Lección terminada.',
  record: 'Tu mejor marca en esta lección.',
  animoAlto: 'Precisión alta.',
  animoMedio: 'Buena precisión.',
  animoBajo: 'Con un poco más de práctica, la precisión sube.',
  repetir: 'Repetir',
  siguiente: 'Siguiente lección',
  progreso: 'Tu progreso',
  repaso: 'Algunas teclas que ya conoces llevan tiempo sin salir.',
};

export const VOCES: Record<Tono, Voz> = { juego: JUEGO, sobrio: SOBRIO };

/** El tono sobrio es el que se usa mientras no haya elegido: nunca infantiliza por defecto. */
export function vozDe(tono: Tono | null): Voz {
  return VOCES[tono ?? 'sobrio'];
}

/** Umbral de precisión a partir del cual el ánimo es de enhorabuena. */
export const PRECISION_ALTA = 95;
