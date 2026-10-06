/**
 * Texto propio: avisar de lo que se quitó.
 *
 * `normalizarTextoLibre()` (en `lessons.ts`) quita en silencio los caracteres
 * que la distribución no puede escribir: comillas tipográficas, rayas, emojis…
 * Quitarlos es correcto —si no, la persona se quedaría atascada en un carácter
 * imposible—, pero en silencio parecía que la app se había comido parte del
 * texto. Esto dice cuáles fueron.
 */

/** Los caracteres que se quitarán, sin repetir y en el orden en que aparecen. */
export function caracteresQuitados(texto: string, permitidos: ReadonlySet<string>): string[] {
  const vistos = new Set<string>();
  for (const c of texto) {
    // Los saltos de línea y tabuladores no se quitan: se convierten en espacio.
    if (/\s/.test(c) || permitidos.has(c)) continue;
    vistos.add(c);
  }
  return [...vistos];
}

/** Cuántos se enumeran antes de resumir: una lista de cuarenta no se lee. */
export const MAX_ENUMERADOS = 12;

/**
 * Cómo se enseña cada carácter. Los invisibles o de control (un espacio de
 * ancho cero pegado de una web, por ejemplo) se nombran por su código, porque
 * entre comillas no se verían.
 */
export function mostrarCaracter(c: string): string {
  const visible = /[\p{L}\p{N}\p{P}\p{S}]/u.test(c);
  if (visible) return `«${c}»`;
  return `U+${c.codePointAt(0)!.toString(16).toUpperCase().padStart(4, '0')}`;
}

/** La frase del aviso, o '' si no se quitó nada. */
export function avisoQuitados(quitados: readonly string[]): string {
  if (quitados.length === 0) return '';
  const lista = quitados.slice(0, MAX_ENUMERADOS).map(mostrarCaracter).join(' ');
  const resto = quitados.length - MAX_ENUMERADOS;
  const mas = resto > 0 ? ` y ${resto} más` : '';
  const uno = quitados.length === 1;
  return `${uno ? 'Se ha quitado' : 'Se han quitado'} ${lista}${mas}: ` +
    `${uno ? 'no se puede escribir' : 'no se pueden escribir'} con la distribución de teclado elegida.`;
}
