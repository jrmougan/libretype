import { describe, expect, it } from 'vitest';
import { avisoQuitados, caracteresQuitados, MAX_ENUMERADOS, mostrarCaracter } from './texto-propio';
import { buildIndex, obtenerLayout } from './keyboard/layouts';
import { normalizarTextoLibre } from './lessons';

const permitidos = new Set(buildIndex(obtenerLayout('es-iso')).keys());

describe('aviso de lo que quitó Texto propio (2.6)', () => {
  it('enumera, sin repetir y en orden, justo lo que la normalización quita', () => {
    const texto = '“Hola” — dijo.\tAdiós “otra vez”';
    const quitados = caracteresQuitados(texto, permitidos);
    expect(quitados).toEqual(['“', '”', '—']);
    const limpio = normalizarTextoLibre(texto, permitidos);
    for (const c of quitados) expect(limpio).not.toContain(c);
    // El tabulador no se «quita»: pasa a ser un espacio.
    expect(quitados).not.toContain('\t');
  });

  it('no dice nada si no se quitó nada', () => {
    expect(caracteresQuitados('Hola, ¿qué tal?', permitidos)).toEqual([]);
    expect(avisoQuitados([])).toBe('');
  });

  it('nombra por su código lo que no se vería entre comillas', () => {
    expect(mostrarCaracter('—')).toBe('«—»');
    expect(mostrarCaracter('​')).toBe('U+200B');
  });

  it('concuerda en número y resume una lista larga', () => {
    expect(avisoQuitados(['—'])).toMatch(/^Se ha quitado «—»: no se puede/);
    const muchos = Array.from({ length: MAX_ENUMERADOS + 3 }, (_, i) => String.fromCodePoint(0x2600 + i));
    expect(avisoQuitados(muchos)).toContain('y 3 más');
  });
});
