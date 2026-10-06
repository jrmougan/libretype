import { describe, expect, it } from 'vitest';
import { desplazamientoLectura, trocearEnPalabras } from './lectura';

describe('leer por delante del cursor (2.8)', () => {
  it('trocea por palabras sin perder ni mover un solo carácter', () => {
    const texto = 'la casa  de él, ¿sí?';
    const trozos = trocearEnPalabras(texto);
    expect(trozos.map((t) => t.texto)).toEqual(['la ', 'casa  ', 'de ', 'él, ', '¿sí?']);
    expect(trozos.map((t) => t.texto).join('')).toBe(texto);
    for (const t of trozos) expect(texto.slice(t.inicio, t.inicio + t.texto.length)).toBe(t.texto);
  });

  it('aguanta textos vacíos y que empiezan por espacio', () => {
    expect(trocearEnPalabras('')).toEqual([]);
    expect(trocearEnPalabras(' a').map((t) => t.texto).join('')).toBe(' a');
  });

  // La primera línea empieza a 116 px de la ventana; cada línea mide 54.
  const base = { scrollTop: 0, cabeEntero: false };
  const enLinea = (n: number, scrollTop = 0) => ({ primeroTop: 116 - scrollTop, cursorTop: 116 + 54 * n - scrollTop });

  it('sube la caja para que la línea del cursor quede donde estaba la primera', () => {
    expect(desplazamientoLectura({ ...base, ...enLinea(2) })).toBe(108);
    // Ya desplazada una línea, el cálculo es el mismo: depende de la distancia.
    expect(desplazamientoLectura({ ...base, scrollTop: 54, ...enLinea(3, 54) })).toBe(162);
  });

  it('no mueve nada en la primera línea, si ya está en su sitio o si todo cabe', () => {
    expect(desplazamientoLectura({ ...base, ...enLinea(0) })).toBeNull();
    expect(desplazamientoLectura({ ...base, scrollTop: 108, ...enLinea(2, 108) })).toBeNull();
    expect(desplazamientoLectura({ ...base, scrollTop: 107, ...enLinea(2, 107) })).toBeNull();
    expect(desplazamientoLectura({ ...base, cabeEntero: true, ...enLinea(5) })).toBeNull();
  });

  it('al borrar hacia atrás vuelve a bajar, sin pasarse de cero', () => {
    expect(desplazamientoLectura({ ...base, scrollTop: 108, ...enLinea(1, 108) })).toBe(54);
    expect(desplazamientoLectura({ ...base, scrollTop: 54, ...enLinea(0, 54) })).toBe(0);
  });
});
