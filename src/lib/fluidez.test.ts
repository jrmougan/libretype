import { describe, expect, it } from 'vitest';
import {
  bigramasDisponibles, explicacionFluidez, generarTanda, ID_FLUIDEZ, PALABRAS_FRECUENTES,
  palabrasDisponibles, ritmoReferencia, valorarTanda,
} from './fluidez';
import { alfabetoHasta, LESSONS } from './lessons';
import type { Sesion } from './storage/progreso';
import { buildIndex, ES_ISO } from './keyboard/layouts';

/** Generador reproducible para no depender del azar en los tests. */
function semilla(n: number): () => number {
  let x = n;
  return () => ((x = (x * 1103515245 + 12345) % 2147483648) / 2147483648);
}

const tanda = (leccion: string, ppm: number, pctAcierto: number, dia: number): Sesion => ({
  leccion, ppm, pctAcierto, aciertos: 1, escritos: 100, ms: 60000,
  terminadaEn: `2026-09-${String(dia).padStart(2, '0')}T10:00:00Z`,
});

describe('tandas de fluidez (2.5)', () => {
  it('el banco es escribible con la distribución y no repite palabras', () => {
    const index = buildIndex(ES_ISO);
    for (const p of PALABRAS_FRECUENTES) for (const c of p) expect(index.has(c), `${p}: ${c}`).toBe(true);
    expect(new Set(PALABRAS_FRECUENTES).size).toBe(PALABRAS_FRECUENTES.length);
  });

  it('nunca usa teclas sin enseñar, en ningún punto del temario', () => {
    for (let nivel = 0; nivel < LESSONS.length; nivel++) {
      const permitidas = alfabetoHasta(nivel);
      for (let s = 1; s <= 5; s++) {
        const texto = generarTanda(nivel, 20, semilla(s * 31 + nivel));
        for (const c of texto) if (c !== ' ') expect(permitidas.has(c), `nivel ${nivel}: «${c}»`).toBe(true);
      }
    }
  });

  it('da exactamente las palabras pedidas, para respetar la longitud elegida', () => {
    for (const n of [10, 20, 40]) expect(generarTanda(5, n, semilla(n)).split(' ')).toHaveLength(n);
  });

  it('las palabras más frecuentes salen más que las raras', () => {
    const nivel = LESSONS.length - 1;
    const texto = generarTanda(nivel, 2000, semilla(7)).split(' ');
    const cuenta = (p: string) => texto.filter((w) => w === p).length;
    expect(cuenta('de')).toBeGreaterThan(cuenta('menos'));
  });

  it('encadena trenes de palabras que comparten un bigrama frecuente', () => {
    const nivel = LESSONS.length - 1;
    const trenes = bigramasDisponibles(nivel);
    expect(trenes.size).toBeGreaterThan(5);
    const palabras = generarTanda(nivel, 20, semilla(3)).split(' ');
    const tren = palabras.slice(5, 8);
    const comun = [...trenes.keys()].some((b) => tren.every((p) => p.includes(b)));
    expect(comun, tren.join(' ')).toBe(true);
  });

  it('al principio del temario sigue saliendo algo escribible', () => {
    expect(palabrasDisponibles(0).length).toBeGreaterThan(0);
    expect(generarTanda(0, 10, semilla(1)).split(' ')).toHaveLength(10);
  });
});

describe('meta contra el propio ritmo, nunca a costa de la precisión (2.5)', () => {
  it('el ritmo de referencia es la mediana de las últimas tandas limpias', () => {
    const ss = [
      tanda(ID_FLUIDEZ, 10, 95, 1), tanda(ID_FLUIDEZ, 20, 95, 2), tanda(ID_FLUIDEZ, 14, 95, 3),
      // Rápida pero sucia: no cuenta.
      tanda(ID_FLUIDEZ, 60, 70, 4),
      // Otra lección: tampoco.
      tanda('reposo', 50, 99, 5),
    ];
    expect(ritmoReferencia(ss)).toBe(14);
    expect(ritmoReferencia([])).toBeNull();
  });

  it('solo mira las últimas tandas: el ritmo de hace meses no es la meta de hoy', () => {
    const viejas = [1, 2, 3, 4, 5].map((d) => tanda(ID_FLUIDEZ, 5, 95, d));
    const nuevas = [6, 7, 8, 9, 10].map((d) => tanda(ID_FLUIDEZ, 25, 95, d));
    expect(ritmoReferencia([...nuevas, ...viejas])).toBe(25);
  });

  it('con muchos fallos pide precisión, sin cifras ni reproches, aunque fuera rápido', () => {
    const texto = valorarTanda(80, 70, 20);
    expect(texto).not.toMatch(/\d/);
    expect(texto).toMatch(/despacio/);
    expect(texto).not.toMatch(/mal|error|nunca/i);
  });

  it('compara contra el ritmo propio, en las dos direcciones sin reprender', () => {
    expect(valorarTanda(22, 96, 20)).toContain('Por encima de tu ritmo habitual');
    expect(valorarTanda(15, 96, 20)).toContain('Sin prisa');
    expect(valorarTanda(15, 96, null)).toContain('Primera tanda limpia');
  });

  it('la explicación nunca da una meta fija de velocidad', () => {
    expect(explicacionFluidez(null)).not.toMatch(/\d/);
    expect(explicacionFluidez(18)).toContain('sin perder precisión');
  });
});
