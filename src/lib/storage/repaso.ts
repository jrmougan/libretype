/**
 * Repaso espaciado de lo que ya se superó.
 *
 * Superar una lección la deja superada para siempre, y eso está bien para
 * *desbloquear* pero no dice nada de *retener*, que son objetivos distintos: la
 * retención de una destreza motora no es monótona y sin repaso se degrada
 * (curva del olvido de Ebbinghaus). Alguien puede superar «Tildes» un martes,
 * pasar dos semanas con las lecciones siguientes y no volver a poner una tilde
 * delante; como la aplicación no vuelve a medirlo, nunca se entera de que eso se
 * está oxidando.
 *
 * Este módulo responde a «qué lecciones superadas llevan demasiado tiempo sin
 * volver a practicarse», para que el flujo pueda invitar a Práctica continua. El
 * mecanismo de repaso ya existe y no se toca: `vocabularioHasta()` acumula las
 * palabras de todo lo desbloqueado, así que ese modo ya es repaso espaciado. Lo
 * que faltaba era que el recorrido por defecto pasara por él.
 *
 * No es `refuerzo.ts` ni lo sustituye. Refuerzo ataca las teclas que MÁS cuestan
 * (precisión baja o dominio sin consolidar); esto ataca las que se OLVIDARON, y
 * una tecla olvidada no tiene por qué tener mal histórico acumulado: lo tuvo
 * bueno, hace un mes. Son dos señales distintas.
 */
import { LESSONS } from '../lessons';
import { idCanonico } from './equivalencias';
import { leccionesSuperadas, nivelDisponible } from './objetivos';
import type { Sesion } from './progreso';

/**
 * Días naturales sin volver a una lección superada antes de darla por oxidada.
 *
 * Una semana es el primer escalón del repaso espaciado y el umbral es
 * deliberadamente flojo: esto decide cuándo se le propone algo a una persona, y
 * por debajo la invitación aparece en casi cada intento, que es como se deja de
 * hacer caso a una ayuda.
 */
export const DIAS_PARA_REPASAR = 7;

/**
 * Intentos en OTRAS lecciones del temario desde la última vez que se tocó.
 *
 * Es un suelo y no un disparador, por dos razones. Primera: quien practica cinco
 * veces al día llegaría a cualquier umbral de intentos antes que quien practica
 * una, justo al revés de lo que dice la curva del olvido; los días, en cambio,
 * significan lo mismo para los dos. Segunda: exige que de verdad se haya seguido
 * avanzando con material nuevo, que es lo que interfiere con lo aprendido. Quien
 * vuelve tras un mes y todavía no ha terminado tres intentos no se encuentra una
 * invitación como primera pantalla, y quien lleva semanas en práctica libre
 * tampoco, porque el repaso ya lo está haciendo.
 */
export const SESIONES_PARA_REPASAR = 3;

export interface LeccionOxidada {
  /** Identificador canónico, traducido ya si venía de una versión anterior. */
  id: string;
  /** Días naturales desde el último intento de verdad en esa lección. */
  diasSinRepasar: number;
}

const MS_POR_DIA = 86400000;
const FECHA_ISO = /^\d{4}-\d{2}-\d{2}/;

/** Medianoche UTC del día de una fecha ISO, o NaN si no se puede leer. */
function diaUTC(iso: string): number {
  if (!FECHA_ISO.test(iso)) return NaN;
  return Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10));
}

interface Intento {
  id: string;
  /** Instante, para saber qué fue después de qué. */
  t: number;
  /** Día natural, para contar el tiempo como lo cuenta una persona. */
  dia: number;
}

/**
 * Intentos que valen para estas cuentas: con el identificador ya traducido, de
 * lecciones del temario actual y habiendo tecleado algo.
 */
function intentosUtiles(sesiones: readonly Sesion[]): Intento[] {
  const actuales = new Set(LESSONS.map((l) => l.id));
  const intentos: Intento[] = [];

  for (const s of sesiones) {
    // Sin nada escrito no se ha tocado la lección, aunque haya sesión.
    if (!(s.escritos > 0)) continue;
    const t = Date.parse(s.terminadaEn);
    const dia = diaUTC(s.terminadaEn);
    if (!Number.isFinite(t) || !Number.isFinite(dia)) continue;
    // Fuera la práctica libre y las retiradas: ni envejecen ni cuentan como
    // haber seguido avanzando. Las primeras porque repasar ya es lo que hacen.
    const id = idCanonico(s.leccion);
    if (!actuales.has(id)) continue;
    intentos.push({ id, t, dia });
  }

  return intentos;
}

/**
 * Lecciones superadas que llevan demasiado tiempo sin volver a practicarse, la
 * más oxidada primero.
 *
 * @param hoyISO Fecha de referencia inyectable, igual que en
 *   `resumirEvolucion()`: sin ella no se puede probar el paso del tiempo de
 *   forma determinista.
 * @param enCurso Identificador de la lección abierta ahora mismo. Nunca sale
 *   como oxidada: el alumno ya la tiene delante.
 */
export function leccionesOxidadas(
  sesiones: readonly Sesion[],
  hoyISO?: string,
  enCurso?: string | null,
): LeccionOxidada[] {
  const superadas = leccionesSuperadas(sesiones);
  if (superadas.size === 0) return [];

  const hoy = diaUTC(hoyISO ?? new Date().toISOString());
  if (!Number.isFinite(hoy)) return [];

  // Solo se invita a repasar lo que se puede abrir: con un histórico importado
  // puede haber lecciones superadas por encima del nivel desbloqueado, y la
  // práctica continua no llega hasta ellas.
  const tope = nivelDisponible(sesiones);
  const abierta = enCurso === undefined || enCurso === null ? null : idCanonico(enCurso);
  const intentos = intentosUtiles(sesiones);
  const oxidadas: LeccionOxidada[] = [];

  for (let ix = 0; ix < LESSONS.length && ix <= tope; ix++) {
    const leccion = LESSONS[ix];
    if (leccion.id === abierta || !superadas.has(leccion.id)) continue;

    // Cuenta la última vez que se tocó, sea cual sea la precisión de entonces:
    // lo que se oxida es el tiempo sin pasar por la tecla, no la nota.
    let ultimoT = -Infinity;
    let ultimoDia = NaN;
    for (const i of intentos) {
      if (i.id === leccion.id && i.t > ultimoT) { ultimoT = i.t; ultimoDia = i.dia; }
    }
    if (ultimoT === -Infinity) continue;

    const diasSinRepasar = Math.round((hoy - ultimoDia) / MS_POR_DIA);
    if (diasSinRepasar < DIAS_PARA_REPASAR) continue;
    if (intentos.filter((i) => i.t > ultimoT).length < SESIONES_PARA_REPASAR) continue;

    oxidadas.push({ id: leccion.id, diasSinRepasar });
  }

  // Los empates conservan el orden del temario: se recorre `LESSONS` en orden y
  // `sort` es estable. Va antes la que más tiempo lleva sin salir, que es la que
  // más se está oxidando y además sostiene a todas las que vinieron después.
  return oxidadas.sort((a, b) => b.diasSinRepasar - a.diasSinRepasar);
}
