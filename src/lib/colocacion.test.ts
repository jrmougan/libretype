import { describe, expect, it } from 'vitest';
import { abreLeccion, PALABRAS_POR_TRAMO, sesionDeTramo, tramoDe } from './colocacion';
import { alfabetoHasta, LESSONS } from './lessons';
import { nivelDisponible, PCT_OBJETIVO } from './storage/objetivos';

const stats = (accuracy: number) => ({ wpm: 30, accuracy, correct: 30, typed: 32, elapsedMs: 12345.6 });

describe('prueba de colocación (2.9)', () => {
  it('cada tramo es texto de su lección, corto y solo con sus teclas', () => {
    LESSONS.forEach((l, i) => {
      const tramo = tramoDe(l);
      expect(l.text.startsWith(tramo)).toBe(true);
      expect(tramo.split(' ').length).toBeLessThanOrEqual(PALABRAS_POR_TRAMO);
      const permitidas = alfabetoHasta(i);
      for (const c of tramo) if (c !== ' ') expect(permitidas.has(c), `${l.id}: ${c}`).toBe(true);
    });
  });

  it('un tramo se guarda como una sesión normal, sin campos nuevos', () => {
    const s = sesionDeTramo('reposo', stats(95), '2026-09-01T10:00:00Z');
    expect(Object.keys(s).sort()).toEqual(
      ['aciertos', 'escritos', 'leccion', 'ms', 'pctAcierto', 'ppm', 'terminadaEn'],
    );
    expect(s.ms).toBe(12346);
  });

  it('abre la lección con el mismo criterio que el resto de la app', () => {
    expect(abreLeccion(sesionDeTramo('reposo', stats(PCT_OBJETIVO), 'x'))).toBe(true);
    expect(abreLeccion(sesionDeTramo('reposo', stats(PCT_OBJETIVO - 1), 'x'))).toBe(false);
    // Y la API de desbloqueo de siempre lo reconoce sin cambiar nada.
    const tramos = LESSONS.slice(0, 3).map((l) => sesionDeTramo(l.id, stats(96), 'x'));
    expect(nivelDisponible(tramos)).toBe(3);
  });
});
