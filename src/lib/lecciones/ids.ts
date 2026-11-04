/**
 * Los identificadores que acaban en la columna `leccion` del histórico y qué
 * significa cada familia. Es la única tabla de esto: el progreso, el dominio y
 * el selector preguntan aquí, y así una regla no puede cambiar en un sitio sí y
 * en otro no.
 */

/** Espacio de nombres de las lecciones que escribe el alumno. */
export const PREFIJO_PROPIA = 'propia:';

const RE_ID_PROPIO = /^propia:[A-Za-z0-9_-]{1,64}$/;

export const ID_PRACTICA_CONTINUA = 'practica-continua';
export const ID_TEXTO_PROPIO = 'texto-propio';
export const ID_REFUERZO = 'refuerzo';
/** El refuerzo cuando el texto es relleno: la tecla sola, o pocas palabras en bucle. */
export const ID_REFUERZO_SUELTO = 'refuerzo-suelto';

/**
 * Lo que un curso no puede usar como identificador de lección: los modos de
 * práctica del histórico y los valores del selector de la barra.
 */
export const IDS_RESERVADOS: ReadonlySet<string> = new Set([
  ID_PRACTICA_CONTINUA, ID_TEXTO_PROPIO, ID_REFUERZO, ID_REFUERZO_SUELTO,
  'cero', 'tono', 'leccion', 'continua', 'propio', 'gestionar',
]);

/** Generan un texto nuevo en cada intento, bajo el mismo identificador. */
const MODOS_DE_TEXTO_CAMBIANTE: ReadonlySet<string> = new Set([
  ID_PRACTICA_CONTINUA, ID_TEXTO_PROPIO, ID_REFUERZO, ID_REFUERZO_SUELTO,
]);

export function esIdPropio(id: unknown): id is string {
  return typeof id === 'string' && RE_ID_PROPIO.test(id);
}

/**
 * El texto no dice nada de su destreza. Lo escribió el alumno, y nadie impide que
 * sea «aaaa aaaa», tanto en las lecciones guardadas como en el texto libre de un
 * solo uso; o es el refuerzo sin palabras suficientes, que es exactamente eso.
 */
function esTextoSinVocabulario(id: string): boolean {
  return id.startsWith(PREFIJO_PROPIA) || id === ID_TEXTO_PROPIO || id === ID_REFUERZO_SUELTO;
}

/**
 * ¿Sirve este ejercicio para decidir que una tecla está dominada?
 *
 * Con un texto escrito a medida no: ocho aciertos seguidos de la `a` en «aaaa
 * aaaa» retirarían la ayuda sin demostrar nada, y `dominio.ts` existe para no
 * quitarle la muleta a quien todavía la necesita. El error es asimétrico: una
 * letra que sigue visible un poco más no le hace daño a nadie; una que se retira
 * antes de tiempo deja a la persona sin referencia. La práctica continua y el
 * refuerzo con palabras distintas sí cuentan porque su texto sale de vocabulario real.
 */
export function cuentaParaDominio(id: string): boolean {
  return !esTextoSinVocabulario(id);
}

/**
 * ¿Puede fijar la «mejor marca» global? Con un texto a medida no: una frase de
 * diez caracteres repetidos da una velocidad que no se puede comparar con nada.
 * Su marca propia, en su propia fila, sí existe.
 */
export function cuentaParaMarcaGlobal(id: string): boolean {
  return !esTextoSinVocabulario(id);
}

/**
 * ¿Tiene sentido decir «tu mejor marca en esta lección»? En una guardada o del
 * temario sí, porque es siempre el mismo texto. Bajo los modos de práctica hay textos
 * distintos que comparten identificador: uno más fácil no es una mejora.
 */
export function tieneMarcaPropia(id: string): boolean {
  return !MODOS_DE_TEXTO_CAMBIANTE.has(id);
}
