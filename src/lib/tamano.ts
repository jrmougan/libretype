/**
 * Tamaño del texto: los valores fijos y los atajos de teclado.
 *
 * El deslizador solo no basta. Con temblor o poca precisión de ratón cuesta
 * dejarlo justo en un valor, y quien necesita la letra grande es a menudo quien
 * peor maneja un control fino. Por eso hay cuatro botones de valor fijo y los
 * atajos de siempre de cualquier navegador (Ctrl+, Ctrl−, Ctrl+0), que mueven
 * `--ui-scale` en vez del zoom del motor web: el zoom del motor no pasa por el
 * orden de sacrificio de la ventana y rompería el «todo cabe sin scroll».
 */

export const ESCALA_MIN = 1;
export const ESCALA_MAX = 2;

/** Botones de valor fijo de Ajustes y de la primera pantalla. */
export const ESCALAS_FIJAS = [1, 1.25, 1.5, 2] as const;

/**
 * Paradas de Ctrl+ y Ctrl−. Más finas que los botones, como los navegadores,
 * para que quien va subiendo de uno en uno encuentre su punto.
 */
const PARADAS = [1, 1.1, 1.25, 1.5, 1.75, 2] as const;

/** La parada siguiente (dir = 1) o anterior (dir = −1), dentro de 100–200%. */
export function siguienteEscala(actual: number, dir: 1 | -1): number {
  const eps = 1e-6;
  if (dir > 0) return PARADAS.find((p) => p > actual + eps) ?? ESCALA_MAX;
  return [...PARADAS].reverse().find((p) => p < actual - eps) ?? ESCALA_MIN;
}

/**
 * Traduce una pulsación a un cambio de escala, o `null` si no es un atajo de
 * tamaño.
 *
 * Se mira `key` y no `code` a propósito, al revés que en el canal físico del
 * motor: el atajo es «la tecla que pone +», esté donde esté en cada
 * distribución (en ES-ISO el + no lleva Mayús; en US es Mayús+=).
 *
 * Con Alt se descarta: en Windows AltGr llega como Ctrl+Alt, y AltGr+0 o
 * AltGr++ escriben caracteres. Durante una composición tampoco se toca nada.
 */
export function escalaPorAtajo(
  e: Pick<KeyboardEvent, 'key' | 'ctrlKey' | 'metaKey' | 'altKey' | 'isComposing'>,
  actual: number,
): number | null {
  if (!(e.ctrlKey || e.metaKey) || e.altKey || e.isComposing) return null;
  if (e.key === '+' || e.key === '=') return siguienteEscala(actual, 1);
  if (e.key === '-' || e.key === '_') return siguienteEscala(actual, -1);
  if (e.key === '0') return ESCALA_MIN;
  return null;
}

/**
 * Escucha los atajos en la ventana. No es un manejador de texto: no lee lo que
 * se escribe ni sustituye al `<textarea>` de la práctica, que sigue recibiendo
 * todo lo demás por el método de entrada del sistema. Devuelve la limpieza.
 */
export function escucharAtajosTamano(
  ventana: Window,
  leer: () => number,
  cambiar: (escala: number) => void,
): () => void {
  function alPulsar(e: KeyboardEvent): void {
    const nueva = escalaPorAtajo(e, leer());
    if (nueva === null) return;
    // Sin esto el propio motor web haría zoom encima (o nada, según la
    // plataforma), y el resultado dependería de dónde corre la app.
    e.preventDefault();
    if (nueva !== leer()) cambiar(nueva);
  }
  ventana.addEventListener('keydown', alPulsar);
  return () => ventana.removeEventListener('keydown', alPulsar);
}
