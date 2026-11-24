/**
 * Informe para el docente, sin servidor.
 *
 * El docente recoge las copias de seguridad de cada alumno (un USB, una
 * carpeta compartida del aula) y las abre aquí. Nada sale de los equipos: las
 * copias son ficheros que el centro ya controla.
 *
 * Lo que se enseña y lo que no, a propósito:
 *
 * - **Evolución de cada uno contra sí mismo**: lecciones superadas, teclas que
 *   ya escribe sin mirar, constancia y precisión semana a semana.
 * - **Sin clasificaciones**: la tabla de la clase va por orden alfabético y no
 *   se puede ordenar por velocidad, ni lleva velocidad. Comparar alumnos por
 *   rapidez es la meta de rendimiento que el resto de la app evita.
 * - **El umbral no va como número suelto**: lo explica `OBJETIVO_PANEL`.
 * - **Las lecciones propias no cuentan como temario**: no están entre las
 *   superadas ni entran en las medias de precisión y velocidad, igual que en el
 *   panel de progreso; tampoco los textos libres ni las tandas de fluidez. Sí
 *   cuentan como práctica: días, ejercicios y tiempo.
 */
import { DOMINADA, mapaDeDominio, type EstadoTecla } from '../keyboard/dominio';
import { catalogo as catalogoApp, type Catalogo } from '../lecciones/catalogo';
import { cuentaParaMarcaGlobal } from '../lecciones/ids';
import { charDeCodigo } from '../refuerzo';
import { combinarTeclas, mismoAlias, parsearCopiaSeguridad, sesionesQueFaltan } from './almacen';
import { leccionesSuperadas } from './objetivos';
import { lunesDe, type Sesion } from './progreso';

export interface SemanaInforme {
  /** Lunes de la semana, AAAA-MM-DD. */
  semana: string;
  diasPracticados: number;
  sesiones: number;
  msTotales: number;
  /** Ejercicios que entran en las medias: sin textos a medida. */
  comparables: number;
  /** Cero si esa semana no hubo ninguno comparable. */
  pctMedio: number;
  ppmMedia: number;
}

export interface LeccionInforme {
  titulo: string;
  superada: boolean;
}

export interface CursoInforme {
  titulo: string;
  lecciones: LeccionInforme[];
}

export interface InformeAlumno {
  alias: string;
  sesiones: number;
  diasPracticados: number;
  msTotales: number;
  primeraPractica: string | null;
  ultimaPractica: string | null;
  /** El temario, curso a curso y en su orden, con lo superado. */
  cursos: CursoInforme[];
  superadas: number;
  totalLecciones: number;
  /** Caracteres de las teclas que ya escribe sin mirar. */
  teclasSinMirar: string[];
  semanas: SemanaInforme[];
}

export function resumirAlumno(
  alias: string,
  sesiones: readonly Sesion[],
  teclas: ReadonlyMap<string, EstadoTecla>,
  catalogo: Catalogo = catalogoApp,
): InformeAlumno {
  const ordenadas = [...sesiones].sort((a, b) => (a.terminadaEn < b.terminadaEn ? -1 : a.terminadaEn > b.terminadaEn ? 1 : 0));
  const dias = new Set(ordenadas.map((s) => s.terminadaEn.slice(0, 10)));

  const porSemana = new Map<string, {
    dias: Set<string>; sesiones: number; ms: number; comparables: number; pct: number; ppm: number;
  }>();
  for (const s of ordenadas) {
    const clave = lunesDe(s.terminadaEn.slice(0, 10));
    const sem = porSemana.get(clave) ?? { dias: new Set(), sesiones: 0, ms: 0, comparables: 0, pct: 0, ppm: 0 };
    sem.dias.add(s.terminadaEn.slice(0, 10));
    sem.sesiones++;
    sem.ms += s.ms;
    if (cuentaParaMarcaGlobal(s.leccion)) {
      sem.comparables++;
      sem.pct += s.pctAcierto;
      sem.ppm += s.ppm;
    }
    porSemana.set(clave, sem);
  }

  // Solo el catálogo: una lección propia con cien por cien no supera nada.
  const superadas = leccionesSuperadas(ordenadas, catalogo);
  const dominio = mapaDeDominio(teclas);

  return {
    alias,
    sesiones: ordenadas.length,
    diasPracticados: dias.size,
    msTotales: ordenadas.reduce((t, s) => t + s.ms, 0),
    primeraPractica: ordenadas[0]?.terminadaEn ?? null,
    ultimaPractica: ordenadas.at(-1)?.terminadaEn ?? null,
    cursos: catalogo.cursos.map((c) => ({
      titulo: c.titulo,
      lecciones: c.lecciones.map((l) => ({ titulo: l.title, superada: superadas.has(l.id) })),
    })),
    superadas: catalogo.lecciones.filter((l) => superadas.has(l.id)).length,
    totalLecciones: catalogo.lecciones.length,
    teclasSinMirar: [...dominio]
      .filter(([, d]) => d >= DOMINADA)
      .map(([code]) => charDeCodigo(code))
      .sort((a, b) => a.localeCompare(b, 'es')),
    semanas: [...porSemana].sort(([a], [b]) => (a < b ? -1 : 1)).map(([semana, s]) => ({
      semana,
      diasPracticados: s.dias.size,
      sesiones: s.sesiones,
      msTotales: s.ms,
      comparables: s.comparables,
      pctMedio: s.comparables > 0 ? Math.round(s.pct / s.comparables) : 0,
      ppmMedia: s.comparables > 0 ? Math.round(s.ppm / s.comparables) : 0,
    })),
  };
}

/** Un fichero ya leído: lo que da `<input type="file">`. */
export interface ArchivoLeido {
  nombre: string;
  contenido: string;
}

/** Una clase con holgura. Cada copia se valida entera; sin tope, abrir una carpeta por error cuelga el panel. */
export const MAX_COPIAS = 200;

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
 * (sin duplicar sesiones ni sumar teclas). Las copias sin alias (anteriores a
 * los perfiles) usan el nombre del fichero.
 */
export function juntarCopias(
  archivos: readonly ArchivoLeido[],
  catalogo: Catalogo = catalogoApp,
): ResultadoClase {
  const errores: ResultadoClase['errores'] = [];
  const grupos: { alias: string; sesiones: Sesion[]; teclas: Map<string, EstadoTecla>; archivos: string[] }[] = [];

  archivos.forEach((a, i) => {
    if (i >= MAX_COPIAS) {
      errores.push({ nombre: a.nombre, motivo: `Solo se abren ${MAX_COPIAS} copias de una vez.` });
      return;
    }
    try {
      const copia = parsearCopiaSeguridad(a.contenido);
      const alias = copia.alias ?? (a.nombre.replace(/\.json$/i, '').trim() || 'Sin nombre');
      const grupo = grupos.find((g) => mismoAlias(g.alias, alias));
      if (grupo) {
        grupo.sesiones.push(...sesionesQueFaltan(grupo.sesiones, copia.sesiones));
        grupo.teclas = combinarTeclas(grupo.teclas, copia.teclas);
        grupo.archivos.push(a.nombre);
      } else {
        grupos.push({
          alias, sesiones: sesionesQueFaltan([], copia.sesiones), teclas: copia.teclas, archivos: [a.nombre],
        });
      }
    } catch (err) {
      errores.push({ nombre: a.nombre, motivo: err instanceof Error ? err.message : 'No se pudo leer.' });
    }
  });

  return {
    alumnos: grupos
      .map((g) => ({ ...resumirAlumno(g.alias, g.sesiones, g.teclas, catalogo), archivos: g.archivos }))
      .sort((a, b) => a.alias.localeCompare(b.alias, 'es', { sensitivity: 'base' })),
    errores,
  };
}

/** El alias como trozo de nombre de fichero, o vacío si no queda nada aprovechable. */
export function aliasParaFichero(alias: string): string {
  return alias.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 30).replace(/-+$/, '');
}
