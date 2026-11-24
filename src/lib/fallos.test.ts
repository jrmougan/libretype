import { describe, expect, it } from 'vitest';
import { anotarFallo, enumerar, nombreTecla, teclasConMasFallos } from './fallos';

describe('las teclas que más costaron en el intento', () => {
  it('solo apunta los fallos y no muta el mapa anterior', () => {
    const vacio = new Map<string, number>();
    const a = anotarFallo(vacio, 'KeyA', true);
    expect(a.size).toBe(0);
    const b = anotarFallo(anotarFallo(a, 'KeyP', false), 'KeyP', false);
    expect(b.get('KeyP')).toBe(2);
    expect(vacio.size).toBe(0);
  });

  it('devuelve como mucho tres, de más a menos fallos', () => {
    const m = new Map([['KeyA', 1], ['KeyP', 4], ['Quote', 2], ['Space', 3], ['KeyS', 0]]);
    const top = teclasConMasFallos(m);
    expect(top.map((t) => t.code)).toEqual(['KeyP', 'Space', 'Quote']);
    expect(top.map((t) => t.nombre)).toEqual(['la P', 'el espacio', 'la tilde (´)']);
  });

  it('un intento sin fallos no tiene nada que contar', () => {
    expect(teclasConMasFallos(new Map())).toEqual([]);
    expect(teclasConMasFallos(new Map([['KeyA', 0]]))).toEqual([]);
  });

  it('nombra las teclas como se dicen', () => {
    expect(nombreTecla('KeyA')).toBe('la A');
    expect(nombreTecla('Semicolon')).toBe('la Ñ');
    expect(nombreTecla('Digit5')).toBe('el 5');
    expect(nombreTecla('Comma')).toBe('la coma');
  });

  it('enumera en castellano', () => {
    expect(enumerar(['la P'])).toBe('la P');
    expect(enumerar(['la P', 'la A'])).toBe('la P y la A');
    expect(enumerar(['la P', 'la A', 'el espacio'])).toBe('la P, la A y el espacio');
  });
});
