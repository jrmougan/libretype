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
  /** Cuando ha ido bien de precisión. */
  animoAlto: string;
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
  terminada: '¡Lección superada!',
  record: '¡Nunca habías ido tan rápido en esta lección!',
  animoAlto: '¡Casi sin fallos! Vas muy bien.',
  animoBajo: 'Tranquilo, esto se coge con la práctica. ¿Otra vez?',
  repetir: 'Otra vez',
  siguiente: '¡Siguiente!',
  progreso: 'Lo que llevas conseguido',
  repaso: '¡A repasar! Hay teclas ganadas que piden otra vuelta.',
};

const SOBRIO: Voz = {
  terminada: 'Lección terminada.',
  record: 'Tu mejor marca en esta lección.',
  animoAlto: 'Precisión alta.',
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
