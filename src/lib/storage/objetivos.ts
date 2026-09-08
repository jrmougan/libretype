import { LESSONS, nivelDesbloqueado } from '../lessons';
import { idCanonico } from './equivalencias';
import { type Sesion } from './progreso';

/**
 * Se prima la precisión; cada persona puede practicar a su ritmo.
 *
 * La interfaz no enseña este número: enseña las frases de más abajo, que lo
 * llevan dentro junto con lenguaje que quita presión. Por eso viven aquí y no
 * en los componentes, para que el umbral y cómo se cuenta no puedan separarse.
 */
export const PCT_OBJETIVO = 90;

/**
 * Vocabulario que acompaña siempre al umbral. Un número suelto plantea una meta
 * de rendimiento («¿llego o no llego?») en lugar de maestría, y en un público
 * con ansiedad frente a la tecnología ese marco de amenaza pesa más que el
 * beneficio pedagógico del umbral. Los tests de tono exigen que toda mención del
 * objetivo en la interfaz contenga una de estas frases.
 */
export const SIN_PRESION: readonly string[] = [
  'sin prisa', 'a tu ritmo', 'sin velocidad mínima',
];

/** Pista de la lección, que se lee antes de empezar a teclear. */
export function objetivoLeccion(queSePractica: string): string {
  return `Objetivo: termina con al menos un ${PCT_OBJETIVO}% de precisión, sin prisa. ${queSePractica}`;
}

/** Diálogo de resultado cuando el intento se quedó por debajo del umbral. */
export const OBJETIVO_PENDIENTE =
  `Objetivo: ${PCT_OBJETIVO}% de precisión. ` +
  'Puedes repetir a tu ritmo para desbloquear la siguiente lección.';

/** Nota del panel de progreso, justo encima de la tabla de lecciones. */
export const OBJETIVO_PANEL =
  `Objetivo: terminar cada lección con al menos un ${PCT_OBJETIVO}% de precisión ` +
  'para desbloquear la siguiente. Sin velocidad mínima.';

/**
 * Etiqueta corta de la fila disponible. Es el único sitio donde el umbral no
 * cabe: va dentro de un `<th>` y el número ya está explicado en la nota del
 * panel. Repetirlo fila a fila no informa de nada y convierte cada lección en
 * un examen.
 */
export const FILA_DISPONIBLE = 'Disponible · a tu ritmo';

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
