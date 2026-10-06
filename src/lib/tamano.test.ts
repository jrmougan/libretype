import { describe, expect, it, vi } from 'vitest';
import {
  ESCALA_MAX, ESCALA_MIN, ESCALAS_FIJAS, escalaPorAtajo, escucharAtajosTamano, siguienteEscala,
} from './tamano';

const tecla = (key: string, extra: Partial<KeyboardEvent> = {}) =>
  ({ key, ctrlKey: true, metaKey: false, altKey: false, isComposing: false, ...extra });

describe('tamaño del texto (2.1)', () => {
  it('los botones fijos cubren de 100% a 200%', () => {
    expect(ESCALAS_FIJAS[0]).toBe(ESCALA_MIN);
    expect(ESCALAS_FIJAS.at(-1)).toBe(ESCALA_MAX);
    expect([...ESCALAS_FIJAS]).toEqual([1, 1.25, 1.5, 2]);
  });

  it('Ctrl+ y Ctrl− recorren las paradas sin salirse del rango', () => {
    expect(siguienteEscala(1, 1)).toBe(1.1);
    expect(siguienteEscala(1.1, 1)).toBe(1.25);
    expect(siguienteEscala(2, 1)).toBe(2);
    expect(siguienteEscala(1, -1)).toBe(1);
    expect(siguienteEscala(1.5, -1)).toBe(1.25);
    // Desde un valor del deslizador que no es parada, va a la vecina.
    expect(siguienteEscala(1.3, 1)).toBe(1.5);
    expect(siguienteEscala(1.3, -1)).toBe(1.25);
  });

  it('reconoce Ctrl+, Ctrl−, Ctrl+0 y Cmd en macOS', () => {
    expect(escalaPorAtajo(tecla('+'), 1)).toBe(1.1);
    expect(escalaPorAtajo(tecla('='), 1)).toBe(1.1);
    expect(escalaPorAtajo(tecla('-'), 1.5)).toBe(1.25);
    expect(escalaPorAtajo(tecla('0'), 1.75)).toBe(1);
    expect(escalaPorAtajo(tecla('+', { ctrlKey: false, metaKey: true }), 1)).toBe(1.1);
  });

  it('no roba AltGr, las teclas sin Ctrl ni una composición a medias', () => {
    // En Windows, AltGr llega como Ctrl+Alt.
    expect(escalaPorAtajo(tecla('0', { altKey: true }), 1.5)).toBeNull();
    expect(escalaPorAtajo(tecla('+', { ctrlKey: false }), 1)).toBeNull();
    expect(escalaPorAtajo(tecla('+', { isComposing: true }), 1)).toBeNull();
    expect(escalaPorAtajo(tecla('a'), 1)).toBeNull();
  });

  it('escucha en la ventana, evita el zoom del motor y se puede quitar', () => {
    let escala = 1;
    const cambiar = vi.fn((n: number) => { escala = n; });
    const quitar = escucharAtajosTamano(window, () => escala, cambiar);

    const ev = new KeyboardEvent('keydown', { key: '+', ctrlKey: true, cancelable: true });
    window.dispatchEvent(ev);
    expect(ev.defaultPrevented).toBe(true);
    expect(escala).toBe(1.1);

    // Una tecla cualquiera sigue su camino sin tocar nada.
    const normal = new KeyboardEvent('keydown', { key: 'a', cancelable: true });
    window.dispatchEvent(normal);
    expect(normal.defaultPrevented).toBe(false);

    quitar();
    window.dispatchEvent(new KeyboardEvent('keydown', { key: '+', ctrlKey: true }));
    expect(escala).toBe(1.1);
    expect(cambiar).toHaveBeenCalledTimes(1);
  });
});
