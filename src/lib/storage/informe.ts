/**
 * Informe para el docente, sin servidor.
 *
 * El docente recoge las copias de seguridad de cada alumno (un USB, una
 * carpeta compartida del aula) y las abre aquí. Nada sale de los equipos: las
 * copias son ficheros que el centro ya controla.
 *
 * Lo que se enseña y lo que no, a propósito (ROADMAP, «Lo que no se hace»):
 *
 * - **Evolución de cada uno contra sí mismo**: lecciones superadas, teclas que
 *   ya escribe sin mirar, constancia y precisión semana a semana.
 * - **Sin clasificaciones**: la tabla de la clase va por orden alfabético y no
 *   se puede ordenar por velocidad, ni lleva velocidad. Comparar alumnos por
 *   rapidez es la meta de rendimiento que el resto de la app evita.
 * - **El umbral no va como número suelto**: lo explica `OBJETIVO_PANEL`.
 */
import { LESSONS, type Lesson } from '../lessons';
import { DOMINADA, mapaDeDominio, type EstadoTecla } from '../keyboard/dominio';
import { charDeCodigo } from '../refuerzo';
import { leccionesSuperadas } from './objetivos';
import type { Sesion } from './progreso';
import {
  combinarTeclas, mismoAlias, parsearCopiaSeguridad, sesionesNuevas,
} from './almacen';
import type { ArchivoLeido } from './copia';

export interface SemanaInforme {
  /** Lunes de la semana, AAAA-MM-DD. */
  semana: string;
  diasPracticados: number;
  sesiones: number;
  msTotales: number;
  pctMedio: number;
  ppmMedia: number;
}

export interface InformeAlumno {
  alias: string;
  sesiones: number;
  diasPracticados: number;
  msTotales: number;
  primeraPractica: string | null;
  ultimaPractica: string | null;
  /** Lecciones del temario actual superadas, en el orden del temario. */
  superadas: Lesson[];
  totalLecciones: number;
  /** Caracteres de las teclas que ya escribe sin mirar. */
  teclasSinMirar: string[];
  semanas: SemanaInforme[];
}

/** El lunes de la semana de una fecha ISO, en UTC (como el resto del progreso). */
export function lunesDe(iso: string): string {
  const d = new Date(`${iso.slice(0, 10)}T00:00:00Z`);
  const desdeLunes = (d.getUTCDay() + 6) % 7;
  d.setUTCDate(d.getUTCDate() - desdeLunes);
  return d.toISOString().slice(0, 10);
}

export function resumirAlumno(
  alias: string,
  sesiones: readonly Sesion[],
  teclas: ReadonlyMap<string, EstadoTecla>,
  lecciones: readonly Lesson[] = LESSONS,
): InformeAlumno {
  const ordenadas = [...sesiones].sort((a, b) => (a.terminadaEn < b.terminadaEn ? -1 : 1));
  const dias = new Set(ordenadas.map((s) => s.terminadaEn.slice(0, 10)));

  const porSemana = new Map<string, { dias: Set<string>; sesiones: number; ms: number; pct: number; ppm: number }>();
  for (const s of ordenadas) {
    const clave = lunesDe(s.terminadaEn);
    const sem = porSemana.get(clave) ?? { dias: new Set(), sesiones: 0, ms: 0, pct: 0, ppm: 0 };
    sem.dias.add(s.terminadaEn.slice(0, 10));
    sem.sesiones++;
    sem.ms += s.ms;
    sem.pct += s.pctAcierto;
    sem.ppm += s.ppm;
    porSemana.set(clave, sem);
  }

  const superadas = leccionesSuperadas(ordenadas);
  const dominio = mapaDeDominio(teclas);

  return {
    alias,
    sesiones: ordenadas.length,
    diasPracticados: dias.size,
    msTotales: ordenadas.reduce((t, s) => t + s.ms, 0),
    primeraPractica: ordenadas[0]?.terminadaEn ?? null,
    ultimaPractica: ordenadas.at(-1)?.terminadaEn ?? null,
    superadas: lecciones.filter((l) => superadas.has(l.id)),
    totalLecciones: lecciones.length,
    teclasSinMirar: [...dominio]
      .filter(([, d]) => d >= DOMINADA)
      .map(([code]) => charDeCodigo(code))
      .sort((a, b) => a.localeCompare(b, 'es')),
    semanas: [...porSemana].map(([semana, s]) => ({
      semana,
      diasPracticados: s.dias.size,
      sesiones: s.sesiones,
      msTotales: s.ms,
      pctMedio: Math.round(s.pct / s.sesiones),
      ppmMedia: Math.round(s.ppm / s.sesiones),
    })),
  };
}

export interface ResultadoClase {
  /** Por orden alfabético del alias. Nunca por velocidad. */
  alumnos: (InformeAlumno & { archivos: string[] })[];
  /** Ficheros que no se pudieron leer, con el motivo. */
  errores: { nombre: string; motivo: string }[];
}

/**
 * Junta varias copias en una tabla de clase.
 *
 * Dos copias con el mismo alias se juntan en una fila: es el mismo alumno
 * que practicó en dos equipos del aula. Se combinan igual que al importar
 * (sin duplicar sesiones ni sumar teclas). Las copias sin alias (versión 1)
 * usan el nombre del fichero.
 */
export function juntarCopias(archivos: readonly ArchivoLeido[]): ResultadoClase {
  const errores: ResultadoClase['errores'] = [];
  const grupos: { alias: string; sesiones: Sesion[]; teclas: Map<string, EstadoTecla>; archivos: string[] }[] = [];

  for (const a of archivos) {
    try {
      const copia = parsearCopiaSeguridad(a.contenido);
      const alias = copia.alias ?? a.nombre.replace(/\.json$/i, '');
      const grupo = grupos.find((g) => mismoAlias(g.alias, alias));
      if (grupo) {
        grupo.sesiones.push(...sesionesNuevas(grupo.sesiones, copia.sesiones));
        grupo.teclas = combinarTeclas(grupo.teclas, copia.teclas);
        grupo.archivos.push(a.nombre);
      } else {
        grupos.push({ alias, sesiones: [...copia.sesiones], teclas: copia.teclas, archivos: [a.nombre] });
      }
    } catch (err) {
      errores.push({ nombre: a.nombre, motivo: err instanceof Error ? err.message : 'No se pudo leer.' });
    }
  }

  return {
    alumnos: grupos
      .map((g) => ({ ...resumirAlumno(g.alias, g.sesiones, g.teclas), archivos: g.archivos }))
      .sort((a, b) => a.alias.localeCompare(b.alias, 'es', { sensitivity: 'base' })),
    errores,
  };
}
