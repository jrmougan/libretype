import { describe, it, expect } from 'vitest';
import {
  contarDominadas, DOMINADA, dominioDe, INTENTOS_MINIMOS, mapaDeDominio,
  MS_LENTO, MS_RAPIDO, olvidar, opacidadEtiqueta, registrar, VENTANA,
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
    // Justo por debajo del 90% (44 de 50 = 0,88): dominio nulo.
    expect(dominioDe({ intentos: 50, aciertos: 44, msTotal: 50 * 150 })).toBe(0);
    // En el umbral exacto del 90% (45 de 50 = 0,90): empieza a contar dominio.
    expect(dominioDe({ intentos: 50, aciertos: 45, msTotal: 50 * 150 })).toBeGreaterThan(0);
    // Con 100 intentos: 89 aciertos (0,89) no cuenta, 90 aciertos (0,90) sí cuenta.
    expect(dominioDe({ intentos: 100, aciertos: 89, msTotal: 100 * 150 })).toBe(0);
    expect(dominioDe({ intentos: 100, aciertos: 90, msTotal: 100 * 150 })).toBeGreaterThan(0);
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
    expect(opacidadEtiqueta(0.84)).toBeGreaterThan(0);
    expect(opacidadEtiqueta(DOMINADA)).toBe(0);
    expect(opacidadEtiqueta(0.85)).toBe(0);
    expect(opacidadEtiqueta(1)).toBe(0);
  });

  it('nunca se queda en un gris ilegible por el camino', () => {
    // Una letra al 20% parecería un fallo de dibujo y no cumpliría contraste.
    // O se lee, o no está.
    for (let d = 0.5; d < DOMINADA; d += 0.02) {
      const o = opacidadEtiqueta(d);
      expect(o, `dominio ${d.toFixed(2)}`).toBeGreaterThanOrEqual(0.65);
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

  it('nunca guarda más de dos ventanas de intentos', () => {
    let e: EstadoTecla | undefined;
    for (let i = 0; i < 500; i++) {
      e = registrar(e, i % 10 !== 0, 400);
      expect(e.intentos).toBeLessThan(2 * VENTANA);
      expect(Number.isInteger(e.aciertos)).toBe(true);
      expect(Number.isInteger(e.msTotal)).toBe(true);
    }
    // El 90% de acierto sobrevive al reescalado, no se deforma.
    expect(e!.aciertos / e!.intentos).toBeGreaterThanOrEqual(0.85);
    expect(e!.aciertos / e!.intentos).toBeLessThanOrEqual(0.95);
  });

  it('el reescalado conserva la proporción y la velocidad media', () => {
    const e = olvidar({ intentos: 480, aciertos: 432, msTotal: 480 * 500 });
    // 48 fallos de 480 son 2,4 en una ventana de 24: se quedan en 2.
    expect(e).toEqual({ intentos: VENTANA, aciertos: VENTANA - 2, msTotal: VENTANA * 500 });
    // Lo que no llega a dos ventanas se queda como estaba.
    const corto = { intentos: 2 * VENTANA - 1, aciertos: 3, msTotal: 99 };
    expect(olvidar(corto)).toBe(corto);
  });

  it('un fallo suelto se acaba olvidando', () => {
    // Redondear siempre hacia arriba dejaría ese fallo para siempre y la tecla
    // no llegaría nunca al 100%.
    let e: EstadoTecla | undefined = registrar(undefined, false, 300);
    for (let i = 0; i < 4 * VENTANA; i++) e = registrar(e, true, 300);
    expect(e!.aciertos).toBe(e!.intentos);
  });

  it('el niño que mejora: los fallos del principio dejan de pesar', () => {
    // Cuarenta intentos al 70% el primer día; luego ya no falla. Contando toda
    // la vida haría falta un centenar de intentos para llegar al 90%: con la
    // ventana, la ayuda se retira mucho antes.
    let e: EstadoTecla | undefined;
    for (let i = 0; i < 40; i++) e = registrar(e, i % 10 >= 3, 900);
    expect(dominioDe(e)).toBe(0);
    let hasta = 0;
    while (dominioDe(e) < DOMINADA && hasta < 200) {
      e = registrar(e, true, MS_RAPIDO);
      hasta++;
    }
    expect(dominioDe(e)).toBeGreaterThanOrEqual(DOMINADA);
    // Con la cuenta de toda la vida: (28 + n) / (40 + n) >= 0,9 pide n >= 80.
    expect(hasta).toBeLessThan(80);
  });

  it('una tecla dominada hace tiempo vuelve a enseñar su letra si se falla', () => {
    // Quinientos aciertos de hace meses no pueden tapar que hoy no sale.
    let e: EstadoTecla | undefined = { intentos: 500, aciertos: 500, msTotal: 500 * MS_RAPIDO };
    expect(dominioDe(e)).toBeGreaterThanOrEqual(DOMINADA);
    for (let i = 0; i < 6; i++) e = registrar(e, false, 900);
    expect(dominioDe(e)).toBe(0);
    expect(opacidadEtiqueta(dominioDe(e))).toBe(1);
  });

  it('las reglas de siempre siguen valiendo con la ventana', () => {
    // Por debajo de 8 intentos no se retira nada aunque todos sean aciertos.
    let e: EstadoTecla | undefined;
    for (let i = 0; i < INTENTOS_MINIMOS - 1; i++) e = registrar(e, true, MS_RAPIDO);
    expect(dominioDe(e)).toBe(0);
    // Y fallando una de cada cinco tampoco, por rápido que sea y en ningún
    // momento: el reescalado no puede colar un 90% que no existe.
    e = undefined;
    for (let i = 0; i < 300; i++) {
      e = registrar(e, i % 5 !== 0, MS_RAPIDO);
      expect(dominioDe(e), `intento ${i}`).toBe(0);
    }
    expect(dominioDe(e)).toBe(0);
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
