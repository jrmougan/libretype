/**
 * Prueba de colocación: para quien ya escribe algo.
 *
 * Empezar por la fila de reposo cuando ya sabes escribir con varios dedos
 * aburre y hace abandonar. La prueba recorre el curso en tramos cortos, uno por
 * lección, y cada tramo escrito con la precisión del objetivo abre su lección.
 * Se para en el primero que cueste.
 *
 * Se ofrece a quien la elija desde el selector, **nunca por edad**: no hay
 * pregunta sobre quién eres, solo una opción para quien crea que ya sabe.
 *
 * **No cambia el esquema ni inventa un mecanismo de desbloqueo.** Cada tramo se
 * guarda como una sesión normal de esa lección, y es el catálogo de siempre
 * (`leccionesSuperadas` y `catalogo.estaDesbloqueada`) quien abre las
 * lecciones. Es honesto: el tramo es texto de esa misma lección, escrito de
 * verdad con la precisión que se le pide a cualquiera. El coste asumido es que
 * la marca de esa lección puede salir de un tramo de seis palabras.
 */
import { leccionesSuperadas } from '../storage/objetivos';
import type { Sesion } from '../storage/progreso';
import { catalogo as catalogoApp, type Catalogo } from './catalogo';
import type { Lesson } from './tipos';

/** Palabras por tramo: lo bastante para medir, lo bastante corto para no cansar. */
export const PALABRAS_POR_TRAMO = 6;

/**
 * El tramo de una lección: unas pocas palabras seguidas de su propio texto. De
 * todas las ventanas posibles, la que más teclas nuevas de la lección toca (la
 * primera, si empatan): un tramo sin nada de lo que la lección estrena la abriría
 * sin demostrar nada, y en los textos seguidos los signos nuevos no están al
 * principio.
 */
export function tramoDe(leccion: Lesson, palabras = PALABRAS_POR_TRAMO): string {
  const todas = leccion.text.split(' ');
  const nuevas = new Set(leccion.nuevas);
  let mejor = 0;
  let mejorPuntos = -1;
  for (let i = 0; i + palabras <= Math.max(todas.length, palabras); i++) {
    const ventana = todas.slice(i, i + palabras).join(' ');
    const puntos = new Set([...ventana].filter((c) => nuevas.has(c))).size;
    if (puntos > mejorPuntos) { mejor = i; mejorPuntos = puntos; }
  }
  return todas.slice(mejor, mejor + palabras).join(' ');
}

/**
 * ¿Abre su lección este tramo? Se le pregunta a la misma función que decide
 * los desbloqueos, para que la prueba no pueda tener un criterio propio.
 */
export function abreLeccion(sesion: Sesion, catalogo: Catalogo = catalogoApp): boolean {
  return leccionesSuperadas([sesion], catalogo).has(sesion.leccion);
}

/**
 * Por dónde empieza la prueba en un curso: la primera lección que aún no está
 * superada. `null` si no queda ninguna: no hay nada que colocar.
 */
export function inicioDeColocacion(
  superadas: ReadonlySet<string>,
  cursoId?: string,
  catalogo: Catalogo = catalogoApp,
): string | null {
  const curso = catalogo.cursos.find((c) => c.id === cursoId) ?? catalogo.principal;
  return curso.lecciones.find((l) => !superadas.has(l.id))?.id ?? null;
}

export interface Colocacion {
  fase: 'antes' | 'tramo' | 'fin';
  /** Lección por la que empezó la prueba. */
  inicio: string;
  /** Lección del tramo en curso. */
  actual: string;
  /** Tramos superados en esta prueba. */
  abiertas: number;
}

/** El estado tras terminar un tramo: al siguiente si lo abre y lo hay; si no, se acaba. */
export function trasTramo(c: Colocacion, sesion: Sesion, catalogo: Catalogo = catalogoApp): Colocacion {
  if (!abreLeccion(sesion, catalogo)) return { ...c, fase: 'fin' };
  const siguiente = catalogo.siguiente(c.actual);
  return siguiente
    ? { ...c, actual: siguiente.id, abiertas: c.abiertas + 1 }
    : { ...c, fase: 'fin', abiertas: c.abiertas + 1 };
}
