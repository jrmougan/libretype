/**
 * Progreso del alumno: tipos y agregación.
 *
 * La agregación se hace aquí y no en SQL a propósito. Los volúmenes son
 * minúsculos (una persona practicando), y a cambio la lógica que decide qué es
 * un récord y qué media se enseña se puede probar sin base de datos.
 */

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

/**
 * Un intento con muchos fallos puede dar palabras por minuto altísimas: se
 * teclea rápido y mal. Contarlo como récord enseñaría lo contrario de lo que
 * queremos, así que por debajo de este acierto no cuenta para la marca.
 */
export const PCT_MINIMO_PARA_RECORD = 90;

export function resumirLecciones(sesiones: readonly Sesion[]): Map<string, ResumenLeccion> {
  const porLeccion = new Map<string, ResumenLeccion>();

  for (const s of sesiones) {
    const previo = porLeccion.get(s.leccion);
    const cuenta = s.pctAcierto >= PCT_MINIMO_PARA_RECORD;

    if (!previo) {
      porLeccion.set(s.leccion, {
        leccion: s.leccion,
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
    lecciones.add(s.leccion);
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

/** "12 min", "1 h 05 min". Para el panel de progreso. */
export function formatearDuracion(ms: number): string {
  const minutos = Math.round(ms / 60000);
  if (minutos < 60) return `${minutos} min`;
  const horas = Math.floor(minutos / 60);
  return `${horas} h ${String(minutos % 60).padStart(2, '0')} min`;
}
