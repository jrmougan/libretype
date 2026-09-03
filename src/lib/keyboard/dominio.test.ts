import { describe, it, expect } from 'vitest';
import {
  contarDominadas, DOMINADA, dominioDe, INTENTOS_MINIMOS, mapaDeDominio,
  MS_LENTO, MS_RAPIDO, opacidadEtiqueta, PRECISION_MINIMA, registrar,
  type EstadoTecla,
} from './dominio';

/** Ojo: `aciertos` se redondea, así que para probar umbrales hay que elegir
 *  proporciones que no queden en el filo. */
const est = (intentos: number, precision: number, msMedio: number): EstadoTecla => ({
  intentos,
  aciertos: Math.floor(intentos * precision),
  msTotal: intentos * msMedio,
});

describe('dominio de una tecla', () => {
  it('sin datos no se retira nada', () => {
    expect(dominioDe(undefined)).toBe(0);
  });

  it('con pocos intentos tampoco, por buenos que sean', () => {
    // Tres aciertos rapidísimos pueden ser suerte. Retirar la ayuda ahí dejaría
    // tirado a quien todavía no sabe dónde está la tecla.
    expect(dominioDe(est(INTENTOS_MINIMOS - 1, 1, MS_RAPIDO))).toBe(0);
    expect(dominioDe(est(INTENTOS_MINIMOS, 1, MS_RAPIDO))).toBeGreaterThan(0);
  });

  it('teclear rápido fallando no cuenta como dominar', () => {
    expect(dominioDe(est(50, 0.7, 150))).toBe(0);
    // Justo por debajo del umbral: 44 de 50 es 0,88.
    expect(dominioDe({ intentos: 50, aciertos: 44, msTotal: 50 * 150 })).toBe(0);
    // Y justo en el umbral sí cuenta.
    expect(dominioDe({ intentos: 50, aciertos: 45, msTotal: 50 * 150 })).toBeGreaterThan(0);
    expect(PRECISION_MINIMA).toBe(0.9);
  });

  it('mucha precisión y buena velocidad es dominio alto', () => {
    expect(dominioDe(est(30, 1, MS_RAPIDO))).toBeGreaterThanOrEqual(DOMINADA);
  });

  it('preciso pero lento aún no se considera dominado', () => {
    const d = dominioDe(est(30, 1, MS_LENTO));
    expect(d).toBeGreaterThan(0);
    expect(d).toBeLessThan(DOMINADA);
  });

  it('la velocidad no compensa la falta de precisión', () => {
    const rapidoImpreciso = dominioDe(est(40, 0.88, MS_RAPIDO));
    const lentoPreciso = dominioDe(est(40, 1, MS_LENTO));
    expect(rapidoImpreciso).toBe(0);
    expect(lentoPreciso).toBeGreaterThan(0);
  });

  it('nunca se sale del rango 0 a 1', () => {
    for (const e of [est(100, 1, 10), est(100, 1, 99999), est(9, 0.95, 400)]) {
      const d = dominioDe(e);
      expect(d).toBeGreaterThanOrEqual(0);
      expect(d).toBeLessThanOrEqual(1);
    }
  });
});

describe('opacidad de la letra', () => {
  it('entera mientras haga falta', () => {
    expect(opacidadEtiqueta(0)).toBe(1);
    expect(opacidadEtiqueta(0.5)).toBe(1);
  });

  it('desaparece del todo al dominarla', () => {
    expect(opacidadEtiqueta(DOMINADA)).toBe(0);
    expect(opacidadEtiqueta(1)).toBe(0);
  });

  it('nunca se queda en un gris ilegible por el camino', () => {
    // Una letra al 20% parecería un fallo de dibujo y no cumpliría contraste.
    // O se lee, o no está.
    for (let d = 0.5; d < DOMINADA; d += 0.02) {
      const o = opacidadEtiqueta(d);
      expect(o, `dominio ${d.toFixed(2)}`).toBeGreaterThanOrEqual(0.55);
    }
  });

  it('no sube al aumentar el dominio', () => {
    let previa = 1;
    for (let d = 0; d <= 1; d += 0.05) {
      const o = opacidadEtiqueta(d);
      expect(o).toBeLessThanOrEqual(previa + 1e-9);
      previa = o;
    }
  });
});

describe('registrar intentos', () => {
  it('acumula', () => {
    let e = registrar(undefined, true, 400);
    e = registrar(e, false, 600);
    expect(e).toEqual({ intentos: 2, aciertos: 1, msTotal: 1000 });
  });

  it('un parón largo no falsea la media', () => {
    // Alguien se levanta a por café a mitad de lección. Sin tope, esa tecla
    // quedaría marcada como lentísima para siempre.
    const e = registrar(undefined, true, 10 * 60 * 1000);
    expect(e.msTotal).toBeLessThanOrEqual(MS_LENTO * 3);
  });
});

describe('mapa de dominio', () => {
  it('traduce estados a dominios', () => {
    const m = mapaDeDominio(new Map([
      ['KeyA', est(30, 1, MS_RAPIDO)],
      ['KeyZ', est(2, 1, MS_RAPIDO)],
    ]));
    expect(m.get('KeyA')).toBeGreaterThanOrEqual(DOMINADA);
    expect(m.get('KeyZ')).toBe(0);
  });

  it('cuenta las dominadas', () => {
    const m = mapaDeDominio(new Map([
      ['KeyA', est(30, 1, MS_RAPIDO)],
      ['KeyS', est(30, 1, MS_RAPIDO)],
      ['KeyZ', est(30, 1, MS_LENTO)],
    ]));
    expect(contarDominadas(m)).toBe(2);
  });
});
