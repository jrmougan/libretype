import { LESSONS, nivelDesbloqueado } from '../lessons';
import { idCanonico } from './equivalencias';
import { type Sesion } from './progreso';

/** Se prima la precisión; cada persona puede practicar a su ritmo. */
export const PCT_OBJETIVO = 90;

/** Las sesiones solo se registran al terminar un ejercicio. */
export function leccionesSuperadas(sesiones: readonly Sesion[]): Set<string> {
  const actuales = new Set(LESSONS.map((l) => l.id));
  return new Set(sesiones
    .filter((s) => s.escritos > 0 && Number.isFinite(s.pctAcierto)
      && s.pctAcierto >= PCT_OBJETIVO && s.pctAcierto <= 100)
    .map((s) => idCanonico(s.leccion))
    .filter((id) => actuales.has(id)));
}

export function nivelDisponible(sesiones: readonly Sesion[]): number {
  return nivelDesbloqueado(leccionesSuperadas(sesiones));
}

/** El recorte del respaldo local nunca debe volver a bloquear una lección. */
export function conservarLogros(sesiones: readonly Sesion[], tope: number): Sesion[] {
  if (sesiones.length <= tope) return [...sesiones];
  const conservar = new Set<number>();
  const pendientes = leccionesSuperadas(sesiones);
  for (let i = sesiones.length - 1; i >= 0; i--) {
    const id = idCanonico(sesiones[i].leccion);
    if (pendientes.has(id) && leccionesSuperadas([sesiones[i]]).has(id)) {
      conservar.add(i);
      pendientes.delete(id);
    }
  }
  for (let i = sesiones.length - 1; i >= 0 && conservar.size < tope; i--) conservar.add(i);
  return sesiones.filter((_, i) => conservar.has(i));
}
