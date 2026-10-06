import { describe, expect, it } from 'vitest';
import { crearFiltroTemblor, MS_REPETICION } from './temblor';

const letra = (data: string) => ({ inputType: 'insertText', data, isComposing: false });

describe('filtro de repetición involuntaria (2.7)', () => {
  it('ignora el mismo carácter repetido en menos de ~60 ms', () => {
    const f = crearFiltroTemblor();
    expect(MS_REPETICION).toBe(60);
    expect(f.debeIgnorar(letra('a'), 1000)).toBe(false);
    expect(f.debeIgnorar(letra('a'), 1030)).toBe(true);
  });

  it('deja pasar una doble letra a ritmo humano y letras distintas seguidas', () => {
    const f = crearFiltroTemblor();
    f.debeIgnorar(letra('l'), 1000);
    expect(f.debeIgnorar(letra('l'), 1120)).toBe(false);
    expect(f.debeIgnorar(letra('a'), 1130)).toBe(false);
  });

  it('una tecla que se queda pulsada no cuela una de cada dos', () => {
    const f = crearFiltroTemblor();
    f.debeIgnorar(letra('e'), 0);
    const repeticiones = [33, 66, 99, 132].map((t) => f.debeIgnorar(letra('e'), t));
    expect(repeticiones).toEqual([true, true, true, true]);
  });

  it('nunca toca una composición ni lo que no es escribir un carácter', () => {
    const f = crearFiltroTemblor();
    f.debeIgnorar(letra('á'), 0);
    expect(f.debeIgnorar({ inputType: 'insertCompositionText', data: 'á', isComposing: true }, 10)).toBe(false);
    expect(f.debeIgnorar({ inputType: 'insertText', data: 'á', isComposing: true }, 20)).toBe(false);
    expect(f.debeIgnorar({ inputType: 'deleteContentBackward', data: null, isComposing: false }, 30)).toBe(false);
    // Tras borrar, volver a escribir la misma letra no es un rebote.
    expect(f.debeIgnorar(letra('á'), 40)).toBe(false);
  });

  it('olvidar() empieza de cero', () => {
    const f = crearFiltroTemblor();
    f.debeIgnorar(letra('s'), 0);
    f.olvidar();
    expect(f.debeIgnorar(letra('s'), 10)).toBe(false);
  });
});
