/**
 * Punto único de consulta del temario: qué lecciones hay, cuál sigue a cuál, qué
 * está desbloqueado y qué alfabeto se ha visto.
 *
 * Los datos están en `cursos/`. Ningún módulo debería recorrer un array de
 * lecciones concreto: al añadir un curso, el array deja de ser «el temario», y
 * cada sitio que lo dé por hecho se queda mirando solo una parte.
 *
 * Las lecciones que escribe el alumno no están aquí a propósito: son datos suyos
 * que se cargan del almacén (`personalizadas.ts`). Que no pasen por el catálogo es
 * lo que garantiza que no desbloqueen nada ni entren en objetivos, repaso o
 * dificultad, porque todo eso solo sabe preguntar al catálogo.
 */
import { CURSOS } from './cursos';
import { IDS_RESERVADOS, PREFIJO_PROPIA } from './ids';
import type { Curso, Lesson } from './tipos';

export interface Catalogo {
  readonly cursos: readonly Curso[];
  /** El curso que se ofrece primero. */
  readonly principal: Curso;
  /** Todas las lecciones de todos los cursos, en orden. */
  readonly lecciones: readonly Lesson[];
  readonly primera: Lesson;
  leccion(id: string): Lesson | undefined;
  tiene(id: string): boolean;
  cursoDe(id: string): Curso | undefined;
  /** Posición dentro de su curso, o -1 si no es del catálogo. */
  indiceEnCurso(id: string): number;
  /** La que le sigue dentro de su curso; undefined al final o si no existe. */
  siguiente(id: string): Lesson | undefined;
  /** Índice de la última lección abierta de un curso, según lo ya superado. */
  nivelDesbloqueado(superadas: Iterable<string>, cursoId?: string): number;
  estaDesbloqueada(id: string, superadas: Iterable<string>): boolean;
  /** La lección más avanzada abierta de un curso: donde está el alumno. */
  ultimaDisponible(superadas: Iterable<string>, cursoId?: string): Lesson;
  /** Teclas vistas en su curso hasta esta lección, incluidas las suyas. */
  alfabetoHasta(id: string): Set<string>;
  /** Palabras reales escribibles con ese alfabeto. */
  vocabularioHasta(id: string): string[];
  textoPractica(id: string, palabras?: number, azar?: () => number): string;
}

export function crearCatalogo(cursos: readonly Curso[]): Catalogo {
  if (cursos.length === 0 || cursos.some((c) => c.lecciones.length === 0)) {
    throw new Error('Un catálogo necesita al menos un curso y cada curso al menos una lección.');
  }

  const porId = new Map<string, { leccion: Lesson; curso: Curso; indice: number }>();
  const cursoIds = new Set<string>();
  for (const curso of cursos) {
    if (cursoIds.has(curso.id)) throw new Error(`Curso repetido: ${curso.id}`);
    cursoIds.add(curso.id);
    curso.lecciones.forEach((leccion, indice) => {
      // El identificador es lo que guarda cada fila del histórico. Si dos cursos
      // lo comparten, los intentos de uno cuentan como logros del otro.
      if (porId.has(leccion.id)) throw new Error(`Lección repetida: ${leccion.id}`);
      if (IDS_RESERVADOS.has(leccion.id) || leccion.id.startsWith(PREFIJO_PROPIA)) {
        throw new Error(`Identificador reservado: ${leccion.id}`);
      }
      porId.set(leccion.id, { leccion, curso, indice });
    });
  }

  const principal = cursos[0];
  const cursoPorId = (id?: string): Curso => cursos.find((c) => c.id === id) ?? principal;

  function nivelDesbloqueado(superadas: Iterable<string>, cursoId?: string): number {
    const hechas = new Set(superadas);
    const { lecciones } = cursoPorId(cursoId);
    let max = 0;
    for (let i = 0; i < lecciones.length; i++) {
      if (!hechas.has(lecciones[i].id)) break;
      max = Math.min(lecciones.length - 1, i + 1);
    }
    return max;
  }

  function alfabetoHasta(id: string): Set<string> {
    const s = new Set<string>();
    const entrada = porId.get(id);
    if (!entrada) return s;
    for (let i = 0; i <= entrada.indice; i++) {
      for (const ch of entrada.curso.lecciones[i].nuevas) s.add(ch);
    }
    return s;
  }

  function vocabularioHasta(id: string): string[] {
    const entrada = porId.get(id);
    if (!entrada) return [];
    const permitidas = alfabetoHasta(id);
    const deLecciones = entrada.curso.lecciones.slice(0, entrada.indice + 1)
      .flatMap((l) => l.text.split(' '))
      .map((w) => w.replace(/[.,:;¿?¡!"()]/g, ''))
      .filter((w) => w.length >= 2);
    const todas = [...new Set([...deLecciones, ...(entrada.curso.vocabulario ?? [])])];
    const validas = todas.filter((w) => [...w].every((ch) => permitidas.has(ch)));
    return validas.length > 0 ? validas : entrada.leccion.text.split(' ');
  }

  return {
    cursos,
    principal,
    lecciones: cursos.flatMap((c) => c.lecciones),
    primera: principal.lecciones[0],
    leccion: (id) => porId.get(id)?.leccion,
    tiene: (id) => porId.has(id),
    cursoDe: (id) => porId.get(id)?.curso,
    indiceEnCurso: (id) => porId.get(id)?.indice ?? -1,
    siguiente(id) {
      const entrada = porId.get(id);
      return entrada?.curso.lecciones[entrada.indice + 1];
    },
    nivelDesbloqueado,
    estaDesbloqueada(id, superadas) {
      const entrada = porId.get(id);
      return entrada !== undefined
        && entrada.indice <= nivelDesbloqueado(superadas, entrada.curso.id);
    },
    ultimaDisponible(superadas, cursoId) {
      return cursoPorId(cursoId).lecciones[nivelDesbloqueado(superadas, cursoId)];
    },
    alfabetoHasta,
    vocabularioHasta,
    textoPractica(id, cantidad = 20, azar = Math.random) {
      const palabras = vocabularioHasta(id);
      const elegidas: string[] = [];
      let anterior = '';
      for (let i = 0; i < cantidad; i++) {
        const opciones = palabras.filter((p) => p !== anterior);
        const palabra = opciones[Math.floor(azar() * opciones.length)] ?? palabras[0];
        elegidas.push(palabra);
        anterior = palabra;
      }
      return elegidas.join(' ');
    },
  };
}

/** El catálogo de la aplicación. */
export const catalogo: Catalogo = crearCatalogo(CURSOS);
