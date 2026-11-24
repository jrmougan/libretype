/**
 * Importar en modo «combinar»: juntar la copia de otro equipo con lo que hay en
 * este, sin duplicar. En los tres almacenes, y el de SQLite contra uno de verdad.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { EstadoTecla } from '../keyboard/dominio';
import { crearLeccion } from '../lecciones/personalizadas';
import {
  AlmacenLocal, AlmacenMemoria, AlmacenSqlite, combinarTeclas, sesionesQueFaltan, type Almacen,
} from './almacen';
import type { Sesion } from './progreso';
import { sqliteReal } from './sqlite-de-prueba';

const sesion = (dia: number, extra: Partial<Sesion> = {}): Sesion => ({
  leccion: 'reposo', ppm: 20, pctAcierto: 95, aciertos: 95, escritos: 100, ms: 60000,
  terminadaEn: `2026-09-${String(dia).padStart(2, '0')}T10:00:00.000Z`, ...extra,
});
const tecla = (intentos: number, aciertos = intentos): EstadoTecla => ({ intentos, aciertos, msTotal: intentos * 300 });
const copiaDe = (sesiones: Sesion[], teclas: Record<string, EstadoTecla> = {}, lecciones: unknown[] = []): string =>
  JSON.stringify({ version: 1, creadaEn: '2026-11-04T10:00:00.000Z', sesiones, teclas, lecciones });

beforeEach(() => localStorage.clear());

describe('las piezas', () => {
  it('solo faltan las sesiones que no están, y una copia con repetidas no las cuela', () => {
    const actuales = [sesion(1), sesion(2)];
    const faltan = sesionesQueFaltan(actuales, [sesion(2), sesion(3), sesion(3)]);
    expect(faltan).toEqual([sesion(3)]);
  });

  it('dos sesiones del mismo instante con resultado distinto no son la misma', () => {
    expect(sesionesQueFaltan([sesion(1)], [sesion(1, { ppm: 21 })])).toHaveLength(1);
    expect(sesionesQueFaltan([sesion(1)], [sesion(1, { leccion: 'tildes' })])).toHaveLength(1);
  });

  it('de cada tecla se queda el estado con más intentos, sin sumar', () => {
    const m = combinarTeclas(
      new Map([['KeyA', tecla(20, 18)], ['KeyS', tecla(5)]]),
      new Map([['KeyA', tecla(12, 12)], ['KeyS', tecla(9, 7)], ['KeyD', tecla(3)]]),
    );
    expect(Object.fromEntries(m)).toEqual({ KeyA: tecla(20, 18), KeyS: tecla(9, 7), KeyD: tecla(3) });
  });
});

const ALMACENES: [string, () => Promise<Almacen>][] = [
  ['SQLite', async () => new AlmacenSqlite(await sqliteReal())],
  ['localStorage', async () => new AlmacenLocal()],
  ['memoria', async () => new AlmacenMemoria()],
];

describe.each(ALMACENES)('combinar en %s', (_, abrir) => {
  it('junta las dos historias en orden, sin perder lo que había', async () => {
    const a = await abrir();
    await a.guardar(sesion(2));
    await a.guardarTeclas(new Map([['KeyA', tecla(20, 18)]]));

    const r = await a.importar(copiaDe([sesion(1), sesion(3)], { KeyA: tecla(8), KeyS: tecla(10) }), 'combinar');
    expect(r.sesionesNuevas).toBe(2);
    expect((await a.leerTodas()).map((s) => s.terminadaEn.slice(8, 10))).toEqual(['01', '02', '03']);
    expect(Object.fromEntries(await a.leerTeclas())).toEqual({ KeyA: tecla(20, 18), KeyS: tecla(10) });
  });

  it('es idempotente: combinar dos veces la misma copia no duplica nada', async () => {
    const a = await abrir();
    await a.guardar(sesion(1));
    const copia = copiaDe([sesion(1), sesion(2)], { KeyA: tecla(8) });
    expect((await a.importar(copia, 'combinar')).sesionesNuevas).toBe(1);
    expect((await a.importar(copia, 'combinar')).sesionesNuevas).toBe(0);
    expect(await a.leerTodas()).toHaveLength(2);
    expect((await a.leerTeclas()).get('KeyA')).toEqual(tecla(8));
  });

  it('combinar la propia copia de seguridad no cambia nada', async () => {
    const a = await abrir();
    await a.guardar(sesion(1));
    await a.guardar(sesion(2));
    await a.guardarTeclas(new Map([['KeyA', tecla(20, 18)]]));
    const antes = await a.exportar();
    await a.importar(antes, 'combinar');
    expect(JSON.parse(await a.exportar()).sesiones).toEqual(JSON.parse(antes).sesiones);
    expect(JSON.parse(await a.exportar()).teclas).toEqual(JSON.parse(antes).teclas);
  });

  it('las lecciones propias de la copia se funden, como al restaurar', async () => {
    const a = await abrir();
    const mia = crearLeccion({ titulo: 'Mía', descripcion: '', texto: 'una frase mía' }, '2026-11-01T10:00:00.000Z', 'propia:mia');
    const suya = crearLeccion({ titulo: 'Suya', descripcion: '', texto: 'una frase suya' }, '2026-11-02T10:00:00.000Z', 'propia:suya');
    await a.guardarLeccion(mia);
    await a.importar(copiaDe([], {}, [suya]), 'combinar');
    expect((await a.leerLecciones()).map((l) => l.id).sort()).toEqual(['propia:mia', 'propia:suya']);
  });

  it('sin decir el modo, importar sigue sustituyendo', async () => {
    const a = await abrir();
    await a.guardar(sesion(1));
    const r = await a.importar(copiaDe([sesion(5)]));
    expect(r.sesionesNuevas).toBeUndefined();
    expect((await a.leerTodas()).map((s) => s.terminadaEn.slice(8, 10))).toEqual(['05']);
  });

  it('una copia dañada no toca nada tampoco al combinar', async () => {
    const a = await abrir();
    await a.guardar(sesion(1));
    await expect(a.importar('{"sesiones":[{"leccion":1}]}', 'combinar')).rejects.toThrow(/dañada/);
    expect(await a.leerTodas()).toHaveLength(1);
  });
});

describe('combinar en SQLite cuando algo falla', () => {
  it('si fallan las teclas, lo dice, y repetirlo lo completa sin duplicar las sesiones', async () => {
    const aviso = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const real = await sqliteReal();
    let fallar = true;
    const a = new AlmacenSqlite({
      select: real.select,
      execute: async (sql, v) => {
        if (fallar && sql.includes('INSERT INTO teclas') && sql.includes('json_each')) throw new Error('database or disk is full');
        return real.execute(sql, v);
      },
    });
    await a.guardar(sesion(1));
    const copia = copiaDe([sesion(2)], { KeyA: tecla(8) });
    await expect(a.importar(copia, 'combinar')).rejects.toThrow(/lo que ya entró no se repite/);
    // Lo que había sigue; la sesión de la copia ya entró.
    expect(await a.leerTodas()).toHaveLength(2);

    fallar = false;
    expect((await a.importar(copia, 'combinar')).sesionesNuevas).toBe(0);
    expect(await a.leerTodas()).toHaveLength(2);
    expect((await a.leerTeclas()).get('KeyA')).toEqual(tecla(8));
    aviso.mockRestore();
  });
});
