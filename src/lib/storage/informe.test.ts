import { describe, expect, it } from 'vitest';
import { juntarCopias, lunesDe, resumirAlumno } from './informe';
import { LESSONS } from '../lessons';
import type { Sesion } from './progreso';
import type { EstadoTecla } from '../keyboard/dominio';

const sesion = (p: Partial<Sesion> = {}): Sesion => ({
  leccion: LESSONS[0].id, ppm: 10, pctAcierto: 95, aciertos: 95, escritos: 100, ms: 60000,
  terminadaEn: '2026-09-07T10:00:00.000Z', ...p,
});

const dominada: EstadoTecla = { intentos: 40, aciertos: 40, msTotal: 40 * 250 };
const floja: EstadoTecla = { intentos: 40, aciertos: 20, msTotal: 40 * 900 };

const copia = (alias: string | undefined, sesiones: Sesion[], teclas: Record<string, EstadoTecla> = {}) =>
  JSON.stringify({ version: alias ? 2 : 1, ...(alias ? { perfil: { alias } } : {}), sesiones, teclas });

describe('informe de un alumno (3.3)', () => {
  it('lunesDe da el lunes de la semana', () => {
    expect(lunesDe('2026-09-07T10:00:00Z')).toBe('2026-09-07'); // lunes
    expect(lunesDe('2026-09-13T23:00:00Z')).toBe('2026-09-07'); // domingo
    expect(lunesDe('2026-09-14T00:00:00Z')).toBe('2026-09-14');
  });

  it('resume constancia, lecciones superadas, teclas sin mirar y semanas', () => {
    const inf = resumirAlumno('Ana', [
      sesion({ terminadaEn: '2026-09-15T10:00:00.000Z', pctAcierto: 80, leccion: LESSONS[1].id }),
      sesion({ terminadaEn: '2026-09-07T10:00:00.000Z' }),
      sesion({ terminadaEn: '2026-09-07T11:00:00.000Z', pctAcierto: 85 }),
    ], new Map([['KeyF', dominada], ['KeyJ', floja]]));

    expect(inf.diasPracticados).toBe(2);
    expect(inf.sesiones).toBe(3);
    expect(inf.primeraPractica).toBe('2026-09-07T10:00:00.000Z');
    expect(inf.ultimaPractica).toBe('2026-09-15T10:00:00.000Z');
    expect(inf.superadas.map((l) => l.id)).toEqual([LESSONS[0].id]);
    expect(inf.totalLecciones).toBe(LESSONS.length);
    expect(inf.teclasSinMirar).toEqual(['f']);
    expect(inf.semanas).toEqual([
      { semana: '2026-09-07', diasPracticados: 1, sesiones: 2, msTotales: 120000, pctMedio: 90, ppmMedia: 10 },
      { semana: '2026-09-14', diasPracticados: 1, sesiones: 1, msTotales: 60000, pctMedio: 80, ppmMedia: 10 },
    ]);
  });

  it('sin práctica no se inventa nada', () => {
    const inf = resumirAlumno('Luis', [], new Map());
    expect(inf).toMatchObject({ sesiones: 0, diasPracticados: 0, primeraPractica: null, superadas: [], semanas: [] });
  });
});

describe('juntar varias copias (3.3)', () => {
  it('ordena por nombre y nunca por velocidad', () => {
    const { alumnos } = juntarCopias([
      { nombre: 'z.json', contenido: copia('Zoe', [sesion({ ppm: 90 })]) },
      { nombre: 'a.json', contenido: copia('álvaro', [sesion({ ppm: 5 })]) },
      { nombre: 'm.json', contenido: copia('Marta', [sesion({ ppm: 40 })]) },
    ]);
    expect(alumnos.map((a) => a.alias)).toEqual(['álvaro', 'Marta', 'Zoe']);
  });

  it('junta las copias del mismo alumno de dos equipos sin duplicar sesiones', () => {
    const comun = sesion({ terminadaEn: '2026-09-07T10:00:00.000Z' });
    const { alumnos } = juntarCopias([
      { nombre: 'equipo1.json', contenido: copia('Ana', [comun], { KeyF: floja }) },
      { nombre: 'equipo2.json', contenido: copia('ANA', [comun, sesion({ terminadaEn: '2026-09-08T10:00:00.000Z' })], { KeyF: dominada }) },
    ]);
    expect(alumnos).toHaveLength(1);
    expect(alumnos[0].sesiones).toBe(2);
    expect(alumnos[0].archivos).toEqual(['equipo1.json', 'equipo2.json']);
    expect(alumnos[0].teclasSinMirar).toEqual([]); // misma cantidad de intentos: se queda la primera
  });

  it('las copias antiguas sin alias usan el nombre del fichero, y las rotas se listan aparte', () => {
    const { alumnos, errores } = juntarCopias([
      { nombre: 'pedro.json', contenido: copia(undefined, [sesion()]) },
      { nombre: 'roto.json', contenido: '{no es json' },
      { nombre: 'futuro.json', contenido: JSON.stringify({ version: 99, sesiones: [] }) },
    ]);
    expect(alumnos.map((a) => a.alias)).toEqual(['pedro']);
    expect(errores.map((e) => e.nombre)).toEqual(['roto.json', 'futuro.json']);
    expect(errores[1].motivo).toContain('versión más nueva');
  });
});
