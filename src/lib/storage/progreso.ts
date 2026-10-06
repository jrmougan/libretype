/**
 * Progreso del alumno: tipos y agregación.
 *
 * La agregación se hace aquí y no en SQL a propósito. Los volúmenes son
 * minúsculos (una persona practicando), y a cambio la lógica que decide qué es
 * un récord y qué media se enseña se puede probar sin base de datos.
 *
 * Todo lo que agrupa por lección pasa antes por `idCanonico()`: es el único
 * sitio por el que entra el histórico, así que traducir aquí los identificadores
 * de versiones anteriores los arregla para los dos backends de golpe, y sin
 * tocar lo que hay escrito en disco.
 */
import { idCanonico } from './equivalencias';

export interface Sesion {
  leccion: string;
  ppm: number;
  /** Porcentaje de aciertos, 0–100. */
  pctAcierto: number;
  aciertos: number;
  escritos: number;
  ms: number;
  /** ISO 8601. */
  terminadaEn: string;
}

export interface ResumenLeccion {
  leccion: string;
  intentos: number;
  mejorPpm: number;
  mejorPct: number;
  ultimaPpm: number;
  ultimaPct: number;
  ultimaEn: string;
}

export interface ResumenGlobal {
  sesiones: number;
  leccionesTocadas: number;
  msTotales: number;
  mejorPpm: number;
}

export interface ResumenDia {
  /** Fecha en formato AAAA-MM-DD. */
  fecha: string;
  sesiones: number;
  mejorPpm: number;
  msTotales: number;
  ppmMedia: number;
  pctMedio: number;
}

/**
 * Constancia contada en positivo.
 *
 * Aquí había una racha que volvía a 0 tras un día sin practicar. Es la
 * mecánica de aversión a la pérdida de las apps de idiomas, y en este público
 * reprende con un número: quien se pierde un día por ir al médico encuentra un
 * cero esperándole. Se cambió por dos cifras que no castigan:
 *
 * - `diasPracticados`: el total de días con alguna sesión. Nunca baja.
 * - `diasEstaSemana`: días practicados en la semana en curso, de lunes a
 *   domingo. Empieza cada lunes en blanco para todo el mundo, no por haber
 *   fallado un día.
 */
export interface EvolucionTemporal {
  dias: ResumenDia[];
  diasPracticados: number;
  diasEstaSemana: number;
}

/**
 * Un intento con muchos fallos puede dar palabras por minuto altísimas: se
 * teclea rápido y mal. Contarlo como récord enseñaría lo contrario de lo que
 * queremos, así que por debajo de este acierto no cuenta para la marca.
 */
export const PCT_MINIMO_PARA_RECORD = 90;

export function resumirLecciones(sesiones: readonly Sesion[]): Map<string, ResumenLeccion> {
  const porLeccion = new Map<string, ResumenLeccion>();

  for (const s of sesiones) {
    const leccion = idCanonico(s.leccion);
    const previo = porLeccion.get(leccion);
    const cuenta = s.pctAcierto >= PCT_MINIMO_PARA_RECORD;

    if (!previo) {
      porLeccion.set(leccion, {
        leccion,
        intentos: 1,
        mejorPpm: cuenta ? s.ppm : 0,
        mejorPct: s.pctAcierto,
        ultimaPpm: s.ppm,
        ultimaPct: s.pctAcierto,
        ultimaEn: s.terminadaEn,
      });
      continue;
    }

    previo.intentos++;
    if (cuenta && s.ppm > previo.mejorPpm) previo.mejorPpm = s.ppm;
    if (s.pctAcierto > previo.mejorPct) previo.mejorPct = s.pctAcierto;
    if (s.terminadaEn >= previo.ultimaEn) {
      previo.ultimaPpm = s.ppm;
      previo.ultimaPct = s.pctAcierto;
      previo.ultimaEn = s.terminadaEn;
    }
  }

  return porLeccion;
}

export function resumirGlobal(sesiones: readonly Sesion[]): ResumenGlobal {
  let msTotales = 0;
  let mejorPpm = 0;
  const lecciones = new Set<string>();

  for (const s of sesiones) {
    msTotales += s.ms;
    lecciones.add(idCanonico(s.leccion));
    if (s.pctAcierto >= PCT_MINIMO_PARA_RECORD && s.ppm > mejorPpm) mejorPpm = s.ppm;
  }

  return {
    sesiones: sesiones.length,
    leccionesTocadas: lecciones.size,
    msTotales,
    mejorPpm,
  };
}

/** ¿Este resultado mejora la marca anterior de esa lección? */
export function esRecord(previo: ResumenLeccion | undefined, s: Sesion): boolean {
  if (s.pctAcierto < PCT_MINIMO_PARA_RECORD) return false;
  if (!previo) return true;
  return s.ppm > previo.mejorPpm;
}

function diasEntre(fechaA: string, fechaB: string): number {
  const msPorDia = 86400000;
  const tA = Date.UTC(+fechaA.slice(0, 4), +fechaA.slice(5, 7) - 1, +fechaA.slice(8, 10));
  const tB = Date.UTC(+fechaB.slice(0, 4), +fechaB.slice(5, 7) - 1, +fechaB.slice(8, 10));
  return Math.round((tB - tA) / msPorDia);
}

/**
 * Agrega las sesiones por fecha: evolución por día, total de días practicados
 * y días de la semana en curso. `hoyISO` existe para poder probar el paso del
 * tiempo.
 */
export function resumirEvolucion(
  sesiones: readonly Sesion[],
  hoyISO?: string,
): EvolucionTemporal {
  if (sesiones.length === 0) {
    return { dias: [], diasPracticados: 0, diasEstaSemana: 0 };
  }

  const mapaDias = new Map<string, {
    sesiones: number;
    mejorPpm: number;
    msTotales: number;
    sumaPpm: number;
    sumaPct: number;
  }>();

  for (const s of sesiones) {
    const dia = s.terminadaEn.slice(0, 10);
    const previo = mapaDias.get(dia);
    const cuenta = s.pctAcierto >= PCT_MINIMO_PARA_RECORD;
    const mejor = cuenta ? s.ppm : 0;

    if (!previo) {
      mapaDias.set(dia, {
        sesiones: 1,
        mejorPpm: mejor,
        msTotales: s.ms,
        sumaPpm: s.ppm,
        sumaPct: s.pctAcierto,
      });
    } else {
      previo.sesiones++;
      if (cuenta && s.ppm > previo.mejorPpm) previo.mejorPpm = s.ppm;
      previo.msTotales += s.ms;
      previo.sumaPpm += s.ppm;
      previo.sumaPct += s.pctAcierto;
    }
  }

  const fechasOrdenadas = [...mapaDias.keys()].sort();
  const dias: ResumenDia[] = fechasOrdenadas.map((fecha) => {
    const d = mapaDias.get(fecha)!;
    return {
      fecha,
      sesiones: d.sesiones,
      mejorPpm: d.mejorPpm,
      msTotales: d.msTotales,
      ppmMedia: Math.round(d.sumaPpm / d.sesiones),
      pctMedio: Math.round(d.sumaPct / d.sesiones),
    };
  });

  const hoyStr = (hoyISO ?? new Date().toISOString()).slice(0, 10);
  const lunes = lunesDe(hoyStr);
  const diasEstaSemana = fechasOrdenadas.filter((f) => {
    const desdeLunes = diasEntre(lunes, f);
    return desdeLunes >= 0 && desdeLunes < 7;
  }).length;

  return {
    dias,
    diasPracticados: dias.length,
    diasEstaSemana,
  };
}

/** El lunes de la semana de una fecha AAAA-MM-DD, en el mismo formato. */
export function lunesDe(fecha: string): string {
  const t = Date.UTC(+fecha.slice(0, 4), +fecha.slice(5, 7) - 1, +fecha.slice(8, 10));
  // getUTCDay: 0 es domingo. La semana española empieza en lunes.
  const desdeLunes = (new Date(t).getUTCDay() + 6) % 7;
  return new Date(t - desdeLunes * 86400000).toISOString().slice(0, 10);
}

/** "12 min", "1 h 05 min". Para el panel de progreso. */
export function formatearDuracion(ms: number): string {
  const minutos = Math.round(ms / 60000);
  if (minutos < 60) return `${minutos} min`;
  const horas = Math.floor(minutos / 60);
  return `${horas} h ${String(minutos % 60).padStart(2, '0')} min`;
}
