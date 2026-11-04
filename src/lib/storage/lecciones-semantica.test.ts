/**
 * Qué significa una lección personalizada para el progreso. Son decisiones de
 * producto, con el porqué en `lecciones/personalizadas.ts` y `lecciones/ids.ts`.
 */
import { describe, expect, it } from 'vitest';
import { catalogo } from '../lecciones/catalogo';
import { leccionesAtipicas, resumirDificultad } from './dificultad';
import { idCanonico } from './equivalencias';
import { leccionesSuperadas } from './objetivos';
import { esRecord, PCT_MINIMO_PARA_RECORD, resumirEvolucion, resumirGlobal, resumirLecciones, type Sesion } from './progreso';
import { leccionesOxidadas } from './repaso';

const ID = 'propia:mia';
const sesion = (extra: Partial<Sesion> = {}): Sesion => ({
  leccion: ID, ppm: 300, pctAcierto: 100, aciertos: 100, escritos: 100, ms: 60000,
  terminadaEn: '2026-09-01T10:00:00.000Z', ...extra,
});

describe('una lección personalizada', () => {
  it('no se traduce a ninguna otra', () => {
    expect(idCanonico(ID)).toBe(ID);
  });

  it('no desbloquea el temario', () => {
    const sesiones = [sesion(), sesion()];
    expect(leccionesSuperadas(sesiones).size).toBe(0);
    expect(catalogo.nivelDesbloqueado(leccionesSuperadas(sesiones))).toBe(0);
  });

  it('tampoco si se llama como una lección con el espacio de nombres quitado', () => {
    expect(leccionesSuperadas([sesion({ leccion: `propia:${catalogo.primera.id}` })]).size).toBe(0);
  });

  it('no entra en la dificultad', () => {
    const muchas = Array.from({ length: 40 }, () => sesion({ pctAcierto: 10 }));
    expect(resumirDificultad(muchas).size).toBe(0);
    expect(leccionesAtipicas(muchas).size).toBe(0);
  });

  it('ni se oxida ni cuenta como haber seguido avanzando', () => {
    const primera = sesion({ leccion: catalogo.primera.id, terminadaEn: '2026-08-01T10:00:00.000Z' });
    const propias = Array.from({ length: 5 }, () => sesion({ terminadaEn: '2026-08-20T10:00:00.000Z' }));
    expect(leccionesOxidadas([primera, ...propias], '2026-09-01T10:00:00.000Z')).toEqual([]);
  });

  it('su marca exige la misma precisión que cualquier otra', () => {
    const floja = sesion({ pctAcierto: PCT_MINIMO_PARA_RECORD - 1 });
    expect(esRecord(undefined, floja)).toBe(false);
    expect(resumirLecciones([floja]).get(ID)?.mejorPpm).toBe(0);

    const limpia = sesion({ pctAcierto: PCT_MINIMO_PARA_RECORD, ppm: 40 });
    expect(esRecord(undefined, limpia)).toBe(true);
    expect(resumirLecciones([floja, limpia]).get(ID)?.mejorPpm).toBe(40);
  });

  it.each([ID, 'texto-propio'])('%s no fija la mejor marca global ni la del día', (leccion) => {
    const hinchada = sesion({ leccion, ppm: 900 });
    const normal = sesion({ leccion: catalogo.primera.id, ppm: 30 });
    expect(resumirGlobal([hinchada, normal]).mejorPpm).toBe(30);
    expect(resumirEvolucion([hinchada, normal]).dias[0].mejorPpm).toBe(30);
  });

  it('sí suma sesiones y tiempo: es práctica de verdad', () => {
    const g = resumirGlobal([sesion(), sesion()]);
    expect(g.sesiones).toBe(2);
    expect(g.msTotales).toBe(120000);
  });
});
