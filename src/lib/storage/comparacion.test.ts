import { describe, expect, it } from 'vitest';
import {
  comparacionPropia, fraseResumen, recienDominadas, serieGrafica, teclasDelTemario, teclasSinMirar,
} from './comparacion';
import { ES_ISO } from '../keyboard/layouts';
import type { EstadoTecla } from '../keyboard/dominio';
import { LESSONS } from '../lessons';
import type { Sesion } from './progreso';

const sesion = (dia: string, extra: Partial<Sesion> = {}): Sesion => ({
  leccion: 'reposo', ppm: 10, pctAcierto: 90, aciertos: 90, escritos: 100, ms: 60000,
  terminadaEn: `${dia}T10:00:00Z`, ...extra,
});
const dominada: EstadoTecla = { intentos: 20, aciertos: 20, msTotal: 20 * 250 };
const floja: EstadoTecla = { intentos: 20, aciertos: 12, msTotal: 20 * 900 };

describe('teclas que ya escribes sin mirar (2.4)', () => {
  it('cuenta sobre las teclas del temario abierto, con el criterio de dominio.ts', () => {
    const temario = teclasDelTemario(0, ES_ISO);
    expect(temario.size).toBe(8); // asdfjklñ
    const teclas = new Map([['KeyA', dominada], ['KeyS', dominada], ['KeyD', floja], ['KeyE', dominada]]);
    // KeyE está dominada pero aún no es del temario abierto: no cuenta.
    expect(teclasSinMirar(teclas, 0, ES_ISO)).toEqual({ dominadas: 2, total: 8 });
    expect(teclasSinMirar(teclas, 1, ES_ISO)).toEqual({ dominadas: 3, total: 10 });
  });

  it('las tildes cuentan la tecla del acento además de la vocal', () => {
    const tildes = LESSONS.findIndex((l) => l.id === 'tildes');
    const antes = teclasDelTemario(tildes - 1, ES_ISO);
    const despues = teclasDelTemario(tildes, ES_ISO);
    expect(despues.size).toBe(antes.size + 1);
  });

  it('detecta las teclas recién retiradas, para celebrarlo al terminar', () => {
    const antes = new Map([['KeyA', floja], ['KeyS', dominada]]);
    const despues = new Map([['KeyA', dominada], ['KeyS', dominada], ['KeyD', floja]]);
    expect(recienDominadas(antes, despues, ES_ISO)).toEqual(['a']);
    expect(recienDominadas(despues, despues, ES_ISO)).toEqual([]);
  });
});

describe('comparación con uno mismo (2.4)', () => {
  it('sin dos semanas de historia no compara periodos', () => {
    const ss = [sesion('2026-09-01', { pctAcierto: 80 }), sesion('2026-09-08', { pctAcierto: 99 })];
    expect(comparacionPropia(ss, '2026-09-10')).toEqual([]);
  });

  it('compara los primeros días con esta semana y cuenta la mejora', () => {
    const ss = [
      sesion('2026-09-01', { pctAcierto: 86, ppm: 6 }),
      sesion('2026-09-02', { pctAcierto: 92, ppm: 8 }),
      sesion('2026-09-20', { pctAcierto: 95, ppm: 14 }),
      sesion('2026-09-21', { pctAcierto: 97, ppm: 16 }),
    ];
    const frases = comparacionPropia(ss, '2026-09-21');
    expect(frases[0]).toBe('Tu precisión media ha pasado del 89% de tus primeros días al 96% de esta semana.');
    // El ritmo, solo con intentos limpios: 8 (el del 86% no cuenta) frente a 15.
    expect(frases[1]).toContain('de 8 a 15 palabras por minuto');
  });

  it('nunca contra la última sesión: una mala tarde no cambia las medias de la semana', () => {
    const ss = [
      sesion('2026-09-01', { pctAcierto: 85 }),
      sesion('2026-09-20', { pctAcierto: 98 }),
      sesion('2026-09-21', { pctAcierto: 98 }),
      sesion('2026-09-21', { pctAcierto: 70, terminadaEn: '2026-09-21T23:00:00Z' }),
    ];
    // Contra la última (70%) sería una bajada; contra la media de la semana, no.
    expect(comparacionPropia(ss, '2026-09-21')[0]).toContain('del 85% de tus primeros días al 89%');
  });

  it('si ha ido a peor no dice nada: no hay frase que reprenda', () => {
    const ss = [
      sesion('2026-09-01', { pctAcierto: 98, ppm: 20 }),
      sesion('2026-09-21', { pctAcierto: 91, ppm: 12 }),
    ];
    expect(comparacionPropia(ss, '2026-09-21')).toEqual([]);
  });

  it('compara lo que costaron las primeras lecciones con las últimas', () => {
    const ss: Sesion[] = [];
    const costes = [6, 4, 2, 1];
    LESSONS.slice(0, 4).forEach((l, i) => {
      for (let k = 1; k < costes[i]; k++) ss.push(sesion('2026-09-01', { leccion: l.id, pctAcierto: 60 }));
      ss.push(sesion('2026-09-01', { leccion: l.id, pctAcierto: 95 }));
    });
    expect(comparacionPropia(ss, '2026-09-02'))
      .toContain('Las primeras lecciones te costaron de media 5 intentos; las dos últimas, 2.');
  });
});

describe('resumen en una frase y gráfica (2.4)', () => {
  it('resume en una frase lo conseguido, sin clasificaciones', () => {
    expect(fraseResumen({ superadas: 3, lecciones: 12, sinMirar: { dominadas: 8, total: 17 }, diasEstaSemana: 2 }))
      .toBe('Has superado 3 de 12 lecciones y ya escribes 8 de 17 teclas sin mirar. Esta semana has practicado 2 días.');
    expect(fraseResumen({ superadas: 0, lecciones: 12, sinMirar: { dominadas: 0, total: 8 }, diasEstaSemana: 0 }))
      .toBe('Todavía no has superado ninguna lección, y no hay prisa.');
  });

  it('la gráfica enseña los últimos días con práctica', () => {
    const dias = Array.from({ length: 20 }, (_, i) => ({
      fecha: `2026-09-${String(i + 1).padStart(2, '0')}`, sesiones: 1, mejorPpm: i, msTotales: 1, ppmMedia: i, pctMedio: 90,
    }));
    const serie = serieGrafica(dias);
    expect(serie).toHaveLength(14);
    expect(serie.at(-1)?.fecha).toBe('2026-09-20');
  });
});
