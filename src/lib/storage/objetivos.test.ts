import { describe, expect, it } from 'vitest';
import { LESSONS } from '../lessons';
import type { Sesion } from './progreso';
import {
  conservarLogros, FILA_DISPONIBLE, leccionesSuperadas, nivelDisponible, OBJETIVO_PANEL,
  OBJETIVO_PENDIENTE, objetivoLeccion, PCT_OBJETIVO, SIN_PRESION,
} from './objetivos';

function sesion(leccion = 'reposo', pctAcierto = 90): Sesion {
  return { leccion, pctAcierto, ppm: 1, aciertos: 90, escritos: 100, ms: 60000, terminadaEn: '2026-09-08T12:00:00Z' };
}

describe('objetivos de las lecciones', () => {
  it('mantiene los logros antiguos al recortar el historial del navegador', () => {
    const historial = [sesion('home'), ...Array.from({ length: 500 }, () => sesion('reposo', 40))];
    const recortado = conservarLogros(historial, 500);
    expect(recortado).toHaveLength(500);
    expect(nivelDisponible(recortado)).toBe(1);
    expect(recortado.at(-1)).toBe(historial.at(-1));
  });
  it('empieza por la primera y exige el 90% sin velocidad mínima', () => {
    expect(nivelDisponible([])).toBe(0);
    expect(nivelDisponible([sesion('reposo', 89)])).toBe(0);
    expect(nivelDisponible([sesion()])).toBe(1);
  });

  it('conserva los logros al repetir con menos precisión', () => {
    expect(nivelDisponible([sesion(), sesion('reposo', 30)])).toBe(1);
  });

  it('no permite saltar huecos del temario en históricos importados', () => {
    expect(nivelDisponible([sesion('vocales-1')])).toBe(0);
    expect(nivelDisponible([sesion('vocales-1'), sesion()])).toBe(2);
  });

  it('reconoce equivalencias honestas y excluye práctica libre y retiradas', () => {
    expect(nivelDisponible([sesion('home')])).toBe(1);
    expect(leccionesSuperadas(['top', 'texto-propio', 'practica-continua', 'refuerzo'].map((id) => sesion(id))).size).toBe(0);
  });

  it('descarta resultados vacíos y porcentajes inválidos', () => {
    expect(leccionesSuperadas([
      { ...sesion(), escritos: 0 }, sesion('reposo', NaN),
      sesion('reposo', Infinity), sesion('reposo', 101),
    ]).size).toBe(0);
  });

  it('termina en la última lección al superar todo el temario', () => {
    const sesiones = LESSONS.map((l) => sesion(l.id));
    expect(nivelDisponible(sesiones)).toBe(LESSONS.length - 1);
    expect(leccionesSuperadas(sesiones).size).toBe(LESSONS.length);
  });
});

/**
 * Las fuentes del proyecto como texto, para recorrerlas enteras: el guardián no
 * puede depender de una lista fija de vistas. Con `import.meta.glob` y no con
 * `node:fs`, que está fuera del ámbito del frontend a propósito (el porqué, en
 * `keyboard/geometria.node.d.ts`).
 */
const FUENTES = import.meta.glob('/src/**/*.{svelte,ts}', {
  eager: true, query: '?raw', import: 'default',
});

describe('cómo se comunica el objetivo (issue #54)', () => {
  const RE_SIN_PRESION = new RegExp(SIN_PRESION.join('|'), 'i');
  const frasesConUmbral: [string, string][] = [
    ['la pista de la lección', objetivoLeccion('Aquí va lo que se practica.')],
    ['el diálogo tras un intento por debajo del umbral', OBJETIVO_PENDIENTE],
    ['la nota del panel de progreso', OBJETIVO_PANEL],
  ];

  for (const [donde, texto] of frasesConUmbral) {
    it(`${donde} lleva el umbral y lenguaje que quita presión`, () => {
      expect(texto).toContain(`${PCT_OBJETIVO}%`);
      expect(texto).toMatch(RE_SIN_PRESION);
    });
  }

  it('la etiqueta corta de cada fila no vuelve a meter el número en la tabla', () => {
    // El umbral ya está explicado en la nota del panel, justo encima: repetirlo
    // fila a fila no informa y convierte cada lección en un examen.
    expect(FILA_DISPONIBLE).not.toMatch(/\d/);
    expect(FILA_DISPONIBLE).toMatch(RE_SIN_PRESION);
  });

  it('ninguna vista interpola el umbral por su cuenta', () => {
    const reinciden = Object.entries(FUENTES)
      .filter(([ruta]) => !ruta.endsWith('.test.ts') && !ruta.endsWith('/objetivos.ts'))
      .filter(([, fuente]) => fuente.includes('PCT_OBJETIVO'))
      .map(([ruta]) => ruta);
    expect(reinciden, 'el umbral solo se enseña con las frases de objetivos.ts').toEqual([]);
  });
});
