/**
 * El curso principal, por índice.
 *
 * Solo lo usan los tests del temario, que hablan de «la lección 5» de ese curso
 * concreto. El código de la aplicación pregunta a `lecciones/catalogo.ts` y los
 * datos están en `lecciones/cursos/`; hay un test que impide importar esto desde
 * fuera de los tests.
 */
import { catalogo } from './lecciones/catalogo';
import type { Lesson } from './lecciones/tipos';

export type { Lesson };
export { normalizarTextoLibre } from './lecciones/texto';

export const LESSONS: readonly Lesson[] = catalogo.principal.lecciones;

export const alfabetoHasta = (indice: number): Set<string> =>
  catalogo.alfabetoHasta(LESSONS[indice].id);

export const vocabularioHasta = (indice: number): string[] =>
  catalogo.vocabularioHasta(LESSONS[indice].id);

export const generarTextoPractica = (indice: number, palabras = 20): string =>
  catalogo.textoPractica(LESSONS[indice].id, palabras);

export const nivelDesbloqueado = (superadas: Iterable<string>): number =>
  catalogo.nivelDesbloqueado(superadas);
