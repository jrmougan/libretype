/**
 * Los cursos que trae la aplicación, en el orden en que se ofrecen.
 *
 * Añadir un curso es escribir su fichero de datos y ponerlo en esta lista: el
 * selector, el panel de progreso, los desbloqueos y las garantías de
 * `garantias.ts` lo recogen sin tocar nada más. El primero es el principal, el
 * que ve quien abre la aplicación por primera vez.
 */
import type { Curso } from '../tipos';
import { CURSO_ESPANOL } from './espanol';

export const CURSOS: readonly Curso[] = [CURSO_ESPANOL];
