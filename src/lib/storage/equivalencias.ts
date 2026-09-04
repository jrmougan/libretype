/**
 * Identificadores de lección de versiones anteriores.
 *
 * La v0.1.0 se publicó con el temario tradicional (`home`, `top`, `bottom`…) y
 * el reordenado por frecuencias renombró casi todo. El identificador es lo que
 * guarda cada fila de `sesiones`, así que quien practicó con la 0.1.0 tiene un
 * histórico que ya no casa con ninguna lección: cuenta en los totales pero no
 * aparece en ninguna fila de la tabla de progreso. Desaparecer el trabajo de
 * alguien es peor que enseñarlo mal, y con una release publicada esto solo va a
 * más.
 *
 * De ahí las dos tablas, y la línea que las separa: **solo se renombra lo que
 * es de verdad la misma lección con otro nombre.** Traducir `top` a alguna
 * lección actual le regalaría al alumno una marca en teclas que nunca practicó,
 * y `esRecord()` la daría por buena. Lo que no tiene equivalente honesto se
 * marca como retirado y se enseña aparte, con su nombre de entonces.
 *
 * Al renombrar una lección en el futuro: añadir aquí la entrada en el mismo
 * commit. `equivalencias.test.ts` comprueba contra `LESSONS` que ningún destino
 * apunte al vacío y que ninguna tabla pise un identificador vivo.
 */

/**
 * Lección de antes → lección de ahora. Misma lección, otro nombre.
 *
 * Las dos de la fila de reposo se funden en una: `home` era el mismo juego de
 * teclas exacto que `reposo` (`asdfjklñ`) y `home-words` el mismo con palabras,
 * que es lo que hoy hace `reposo`. Sus intentos se suman y la marca es la mejor
 * de las dos, que es lo que significa haberlas unido.
 */
export const RENOMBRADAS: ReadonlyMap<string, string> = new Map([
  ['home', 'reposo'],
  ['home-words', 'reposo'],
]);

/**
 * Lecciones que ya no existen, con el nombre que tenían. No se traducen a
 * ninguna actual porque ninguna enseña lo mismo:
 *
 * - `top` y `bottom` iban por filas del teclado; el temario de ahora va por
 *   frecuencia y ninguna lección se corresponde con una fila.
 * - `enye` era un ejercicio dedicado a la ñ, que hoy entra dentro de `reposo`
 *   junto a las otras siete teclas del ancla.
 * - `dieresis` comparte palabras con `raras` (pingüino, vergüenza) pero `raras`
 *   estrena además z, x y w: darla por hecha sería acreditar tres teclas que
 *   esa persona no tocó.
 * - `mixed` era texto corrido con puntuación, que ya no es una lección.
 */
export const RETIRADAS: ReadonlyMap<string, string> = new Map([
  ['top', 'Fila superior'],
  ['bottom', 'Fila inferior'],
  ['enye', 'La eñe'],
  ['dieresis', 'Diéresis y mayúsculas'],
  ['mixed', 'Texto corrido'],
]);

/**
 * El identificador con el que hay que agrupar una sesión guardada. Devuelve el
 * mismo que entra si no hay nada que traducir, incluidos los retirados y los
 * desconocidos: nunca inventa una lección.
 */
export function idCanonico(leccion: string): string {
  return RENOMBRADAS.get(leccion) ?? leccion;
}

/** El nombre que tenía una lección retirada, para poder enseñar su histórico. */
export function tituloRetirada(leccion: string): string | undefined {
  return RETIRADAS.get(leccion);
}
