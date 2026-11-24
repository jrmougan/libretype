import { describe, expect, it } from 'vitest';
import type { EstadoTecla } from '../keyboard/dominio';
import { catalogo } from '../lecciones/catalogo';
import { aliasParaFichero, juntarCopias, MAX_COPIAS, resumirAlumno } from './informe';
import { PCT_OBJETIVO } from './objetivos';
import type { Sesion } from './progreso';

const LECCIONES = catalogo.principal.lecciones;
const sesion = (dia: string, extra: Partial<Sesion> = {}): Sesion => ({
  leccion: 'reposo', ppm: 20, pctAcierto: 95, aciertos: 95, escritos: 100, ms: 60000,
  terminadaEn: `${dia}T10:00:00.000Z`, ...extra,
});
const dominada: EstadoTecla = { intentos: 20, aciertos: 20, msTotal: 20 * 250 };
const floja: EstadoTecla = { intentos: 20, aciertos: 12, msTotal: 20 * 900 };
const copia = (alias: string | undefined, sesiones: Sesion[], teclas: Record<string, EstadoTecla> = {}): string =>
  JSON.stringify({ version: 1, creadaEn: '2026-11-04T10:00:00.000Z', sesiones, teclas, ...(alias ? { alias } : {}) });

describe('informe de un alumno', () => {
  it('resume constancia, lecciones superadas, teclas sin mirar y semanas', () => {
    const sesiones = [
      sesion('2026-09-07', { leccion: LECCIONES[0].id, pctAcierto: 80, ppm: 10 }), // lunes
      sesion('2026-09-08', { leccion: LECCIONES[0].id, pctAcierto: 96, ppm: 14 }),
      sesion('2026-09-08', { leccion: LECCIONES[1].id, pctAcierto: 94, ppm: 18, terminadaEn: '2026-09-08T11:00:00.000Z' }),
      sesion('2026-09-16', { leccion: LECCIONES[2].id, pctAcierto: 70, ppm: 30 }), // la semana siguiente
    ];
    const informe = resumirAlumno('Ana', sesiones, new Map([['KeyA', dominada], ['KeyS', floja], ['Space', dominada]]));

    expect(informe.alias).toBe('Ana');
    expect(informe).toMatchObject({ sesiones: 4, diasPracticados: 3, msTotales: 240000, superadas: 2, totalLecciones: catalogo.lecciones.length });
    expect(informe.primeraPractica).toBe('2026-09-07T10:00:00.000Z');
    expect(informe.ultimaPractica).toBe('2026-09-16T10:00:00.000Z');
    expect(informe.cursos[0].lecciones.slice(0, 3)).toEqual([
      { titulo: LECCIONES[0].title, superada: true },
      { titulo: LECCIONES[1].title, superada: true },
      { titulo: LECCIONES[2].title, superada: false },
    ]);
    expect(informe.teclasSinMirar).toEqual([' ', 'a']);
    expect(informe.semanas).toEqual([
      { semana: '2026-09-07', diasPracticados: 2, sesiones: 3, msTotales: 180000, comparables: 3, pctMedio: 90, ppmMedia: 14 },
      { semana: '2026-09-14', diasPracticados: 1, sesiones: 1, msTotales: 60000, comparables: 1, pctMedio: 70, ppmMedia: 30 },
    ]);
  });

  it('las lecciones propias cuentan como práctica, pero ni superan nada ni entran en las medias', () => {
    const sesiones = [
      sesion('2026-09-07', { leccion: 'propia:abc', pctAcierto: 100, ppm: 90 }),
      sesion('2026-09-07', { leccion: 'texto-propio', pctAcierto: 100, ppm: 90, terminadaEn: '2026-09-07T11:00:00.000Z' }),
      sesion('2026-09-08', { leccion: LECCIONES[0].id, pctAcierto: PCT_OBJETIVO - 5, ppm: 10 }),
      sesion('2026-09-15', { leccion: 'propia:abc', pctAcierto: 100, ppm: 95 }),
    ];
    const informe = resumirAlumno('Ana', sesiones, new Map());
    expect(informe.superadas).toBe(0);
    expect(informe.cursos.flatMap((c) => c.lecciones).some((l) => l.superada)).toBe(false);
    expect(informe).toMatchObject({ sesiones: 4, diasPracticados: 3 });
    expect(informe.semanas[0]).toMatchObject({ sesiones: 3, comparables: 1, pctMedio: PCT_OBJETIVO - 5, ppmMedia: 10 });
    // Una semana solo con textos propios no tiene media: no se inventa un cero.
    expect(informe.semanas[1]).toMatchObject({ sesiones: 1, comparables: 0, pctMedio: 0, ppmMedia: 0 });
  });

  it('sin práctica no se inventa nada', () => {
    const informe = resumirAlumno('Luis', [], new Map());
    expect(informe).toMatchObject({
      sesiones: 0, diasPracticados: 0, msTotales: 0, primeraPractica: null, ultimaPractica: null, superadas: 0,
    });
    expect(informe.semanas).toEqual([]);
    expect(informe.teclasSinMirar).toEqual([]);
  });

  it('no lleva ninguna cifra de clasificación: ni puesto ni mejor marca', () => {
    const claves = Object.keys(resumirAlumno('Ana', [sesion('2026-09-07')], new Map()));
    expect(claves.join(' ')).not.toMatch(/puesto|rank|mejor|marca|record/i);
  });
});

describe('juntar varias copias', () => {
  it('ordena por nombre y nunca por velocidad', () => {
    const { alumnos, errores } = juntarCopias([
      { nombre: 'z.json', contenido: copia('Zoe', [sesion('2026-09-07', { ppm: 90 })]) },
      { nombre: 'a.json', contenido: copia('álvaro', [sesion('2026-09-07', { ppm: 5 })]) },
      { nombre: 'm.json', contenido: copia('Marta', [sesion('2026-09-07', { ppm: 40 })]) },
    ]);
    expect(errores).toEqual([]);
    expect(alumnos.map((a) => a.alias)).toEqual(['álvaro', 'Marta', 'Zoe']);
  });

  it('junta las copias del mismo alumno de dos equipos sin duplicar sesiones ni sumar teclas', () => {
    const comun = sesion('2026-09-07');
    const { alumnos } = juntarCopias([
      { nombre: 'aula.json', contenido: copia('Ana', [comun, sesion('2026-09-08')], { KeyA: { intentos: 20, aciertos: 20, msTotal: 5000 } }) },
      { nombre: 'casa.json', contenido: copia('ANA', [comun, sesion('2026-09-09')], { KeyA: { intentos: 9, aciertos: 9, msTotal: 2700 } }) },
    ]);
    expect(alumnos).toHaveLength(1);
    expect(alumnos[0]).toMatchObject({ alias: 'Ana', sesiones: 3, diasPracticados: 3, archivos: ['aula.json', 'casa.json'] });
    expect(alumnos[0].teclasSinMirar).toEqual(['a']);
  });

  it('una copia que trae la misma sesión dos veces no la cuenta doble', () => {
    const { alumnos } = juntarCopias([{ nombre: 'a.json', contenido: copia('Ana', [sesion('2026-09-07'), sesion('2026-09-07')]) }]);
    expect(alumnos[0].sesiones).toBe(1);
  });

  it('las copias anteriores a los perfiles usan el nombre del fichero, y las rotas se listan aparte', () => {
    const { alumnos, errores } = juntarCopias([
      { nombre: 'pedro-clase-b.json', contenido: copia(undefined, [sesion('2026-09-07')]) },
      { nombre: 'rota.json', contenido: '{no es json' },
      { nombre: 'otra-cosa.json', contenido: '{"hola":1}' },
    ]);
    expect(alumnos.map((a) => a.alias)).toEqual(['pedro-clase-b']);
    expect(errores.map((e) => e.nombre)).toEqual(['rota.json', 'otra-cosa.json']);
    expect(errores[0].motivo).toMatch(/no es una copia de seguridad/);
  });

  it('abrir demasiadas de una vez se dice, sin colgarse', () => {
    const archivos = Array.from({ length: MAX_COPIAS + 2 }, (_, i) => ({
      nombre: `a${i}.json`, contenido: copia(`Alumno ${String(i).padStart(3, '0')}`, []),
    }));
    const { alumnos, errores } = juntarCopias(archivos);
    expect(alumnos).toHaveLength(MAX_COPIAS);
    expect(errores).toHaveLength(2);
    expect(errores[0].motivo).toContain(`${MAX_COPIAS} copias`);
  });
});

describe('el alias en un nombre de fichero', () => {
  it('queda en letras sin tilde, cifras y guiones', () => {
    expect(aliasParaFichero('Ana María Ñ.')).toBe('ana-maria-n');
    expect(aliasParaFichero('  3º B / Luis  ')).toBe('3-b-luis');
    expect(aliasParaFichero('¡¡¡')).toBe('');
    expect(aliasParaFichero('x'.repeat(80))).toHaveLength(30);
  });
});
