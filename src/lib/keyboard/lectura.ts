/**
 * Leer por delante del cursor.
 *
 * Los mecanógrafos mayores compensan la pérdida de velocidad de reacción
 * leyendo más texto por delante (Salthouse, 1984): cuanto más ven de lo que
 * viene, mejor mantienen el ritmo. Con la letra al 200% la caja del texto se
 * desplaza por dentro, y antes nada la movía al avanzar: el cursor se salía por
 * abajo y lo que venía después quedaba fuera de la vista.
 *
 * Dos piezas:
 *
 * - `trocearEnPalabras` agrupa los caracteres por palabra para que el salto de
 *   línea caiga entre palabras. Cada carácter es su propio `<span>` y los
 *   espacios se pintan como espacio duro (para que el cursor pueda marcarlos),
 *   así que sin esto la única forma de partir era por cualquier letra, y una
 *   palabra cortada por la mitad no se lee de un vistazo.
 * - `desplazamientoLectura` decide cuánto desplazar la caja para que la línea
 *   del cursor quede arriba y todo lo visible por debajo sea lo que viene.
 */

export interface Trozo {
  /** Posición en el texto del primer carácter del trozo. */
  inicio: number;
  /** La palabra con los espacios que la siguen. */
  texto: string;
}

/** Parte el texto en palabras, cada una con sus espacios detrás. */
export function trocearEnPalabras(texto: string): Trozo[] {
  const trozos: Trozo[] = [];
  const re = /\S*\s*/gu;
  let m: RegExpExecArray | null;
  while ((m = re.exec(texto)) !== null && m[0] !== '') {
    trozos.push({ inicio: m.index, texto: m[0] });
  }
  return trozos;
}

export interface Medidas {
  /** `scrollTop` actual de la caja. */
  scrollTop: number;
  /**
   * Borde superior del primer carácter y del cursor, en coordenadas de la
   * ventana. Su diferencia no depende de cuánto esté desplazada la caja: es lo
   * que hay entre la primera línea y la del cursor.
   */
  primeroTop: number;
  cursorTop: number;
  /** Si todo el texto cabe sin desplazar, no hay nada que hacer. */
  cabeEntero: boolean;
}

/**
 * El `scrollTop` que deja la línea del cursor donde está la primera línea en
 * reposo, o `null` si ya está ahí (con 2 px de margen para no mover la caja
 * por redondeos).
 */
export function desplazamientoLectura(m: Medidas): number | null {
  if (m.cabeEntero) return null;
  const objetivo = Math.max(0, m.cursorTop - m.primeroTop);
  if (Math.abs(objetivo - m.scrollTop) <= 2) return null;
  return objetivo;
}
