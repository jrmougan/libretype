/**
 * Cuánto domina el alumno cada tecla, y cuánta ayuda visual retirarle.
 *
 * El teclado en pantalla es una muleta: mirar la pantalla para encontrar la
 * tecla es justo el hábito que hay que romper. Pero quitarlo de golpe deja
 * tirado a quien empieza. La salida es retirar el andamiaje poco a poco y por
 * tecla: cuando ya sabes dónde está la A, la A deja de mostrar su letra.
 *
 * Es una decisión pedagógica, no una animación. Por eso vive aquí, separada del
 * componente y con tests.
 */

export interface EstadoTecla {
  /** Veces que le ha tocado esta tecla. */
  intentos: number;
  /** De esas, cuántas la acertó. */
  aciertos: number;
  /** Milisegundos acumulados, para sacar la media. */
  msTotal: number;
}

/**
 * Por debajo de esto no se retira nada: con tres intentos no se sabe si
 * alguien domina una tecla o ha tenido suerte.
 */
export const INTENTOS_MINIMOS = 8;

/** Precisión por debajo de la cual no se retira ayuda, por buena que sea la velocidad. */
export const PRECISION_MINIMA = 0.9;

/** Referencias de velocidad por carácter, en milisegundos. */
export const MS_LENTO = 1200;
export const MS_RAPIDO = 300;

/** A partir de este dominio la tecla se considera aprendida. */
export const DOMINADA = 0.85;

const acotar = (n: number, min = 0, max = 1) => Math.min(max, Math.max(min, n));

/**
 * Dominio de una tecla, de 0 a 1.
 *
 * La precisión pesa mucho más que la velocidad, y va al cuadrado: teclear
 * rápido fallando no es dominar nada, y la aplicación no debe premiarlo ni
 * aquí ni en las marcas.
 */
export function dominioDe(e: EstadoTecla | undefined): number {
  if (!e || e.intentos < INTENTOS_MINIMOS) return 0;

  const precision = e.aciertos / e.intentos;
  if (precision < PRECISION_MINIMA) return 0;

  const msMedio = e.msTotal / e.intentos;
  const velocidad = acotar((MS_LENTO - msMedio) / (MS_LENTO - MS_RAPIDO));

  return acotar(precision * precision * (0.5 + 0.5 * velocidad));
}

/**
 * Opacidad de la letra dibujada en la tecla.
 *
 * No baja gradualmente hasta quedar en un gris ilegible: eso parecería un fallo
 * de dibujo y además incumpliría el contraste. Se mantiene entera mientras hace
 * falta y desaparece del todo al dominarla.
 */
export function opacidadEtiqueta(dominio: number): number {
  if (dominio >= DOMINADA) return 0;
  if (dominio <= 0.5) return 1;
  // Entre 0,5 y 0,85 se atenúa, pero nunca por debajo de un valor legible
  // (mínimo 0,65 para mantener contraste >= 4,5:1 sobre la tecla en tema claro).
  return acotar(1 - ((dominio - 0.5) / (DOMINADA - 0.5)) * 0.35, 0.65, 1);
}

/**
 * Cuántos intentos «recientes» pesan en el dominio.
 *
 * Contar toda la vida de una tecla tiene dos fallos que se notan pronto. Un
 * niño que falló mucho la primera semana arrastra esos fallos durante cientos
 * de intentos aunque hoy ya no falle: la ayuda visual no se le retira nunca. Y
 * al revés, una tecla dominada hace meses con quinientos aciertos tendría que
 * fallarse cincuenta veces seguidas para que la letra volviera a aparecer.
 *
 * La salida es una media que olvida, **sin tocar el esquema** de la base de
 * datos (que guarda enteros: intentos, aciertos y milisegundos). Cuando una
 * tecla llega a dos ventanas de intentos, todo se reescala a una ventana en la
 * misma proporción. Lo antiguo no se borra de golpe: cada vez pesa la mitad.
 *
 * 24 da entre 24 y 48 intentos de memoria: bastante para que el 90% no dependa
 * de un solo fallo, poco para que lo de hace semanas mande sobre lo de hoy.
 * Las reglas de siempre siguen intactas: con menos de `INTENTOS_MINIMOS` no se
 * retira nada y por debajo de `PRECISION_MINIMA` tampoco.
 */
export const VENTANA = 24;

/**
 * Redondeo al par en el empate. Al reescalar los fallos hay que redondear, y
 * redondear siempre hacia arriba dejaría un fallo eterno (1 → 1 → 1…) que ya
 * no se podría olvidar; siempre hacia abajo regalaría precisión. Al par no
 * sesga hacia ningún lado.
 */
function redondearAlPar(x: number): number {
  const abajo = Math.floor(x);
  const resto = x - abajo;
  if (resto > 0.5) return abajo + 1;
  if (resto < 0.5) return abajo;
  return abajo % 2 === 0 ? abajo : abajo + 1;
}

/**
 * Reescala un estado demasiado largo a una ventana, conservando la proporción
 * de aciertos y la velocidad media. Lo de menos de dos ventanas no se toca.
 * También sirve para datos de versiones anteriores, que acumulaban sin límite:
 * el primer intento nuevo los trae a la ventana.
 */
export function olvidar(e: EstadoTecla): EstadoTecla {
  if (e.intentos < 2 * VENTANA) return e;
  const factor = VENTANA / e.intentos;
  const fallos = Math.min(
    VENTANA,
    Math.max(0, redondearAlPar((e.intentos - e.aciertos) * factor)),
  );
  return {
    intentos: VENTANA,
    aciertos: VENTANA - fallos,
    msTotal: Math.round(e.msTotal * factor),
  };
}

/** Registra un intento sobre una tecla. */
export function registrar(
  previo: EstadoTecla | undefined,
  acierto: boolean,
  ms: number,
): EstadoTecla {
  const base = previo ?? { intentos: 0, aciertos: 0, msTotal: 0 };
  return olvidar({
    intentos: base.intentos + 1,
    aciertos: base.aciertos + (acierto ? 1 : 0),
    // Un parón largo (se fue a por café) falsearía la media hacia arriba.
    msTotal: base.msTotal + Math.min(ms, MS_LENTO * 3),
  });
}

export type MapaDominio = ReadonlyMap<string, number>;

export function mapaDeDominio(estados: ReadonlyMap<string, EstadoTecla>): Map<string, number> {
  const m = new Map<string, number>();
  for (const [code, e] of estados) m.set(code, dominioDe(e));
  return m;
}

/** Cuántas teclas se consideran aprendidas, para poder decírselo al alumno. */
export function contarDominadas(dominios: MapaDominio): number {
  let n = 0;
  for (const d of dominios.values()) if (d >= DOMINADA) n++;
  return n;
}
