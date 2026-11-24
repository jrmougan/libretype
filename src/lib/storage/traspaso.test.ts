/**
 * Lo que se guardó en localStorage mientras SQLite falló tiene que acabar en
 * SQLite cuando vuelve: si no, queda en un sitio que la aplicación ya no mira.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { crearLeccion, LIMITES } from '../lecciones/personalizadas';
import { AlmacenLocal, AlmacenMemoria, AlmacenSqlite, traspasarRespaldo } from './almacen';
import type { Sesion } from './progreso';
import { sqliteReal } from './sqlite-de-prueba';

const sesion = (dia: number, extra: Partial<Sesion> = {}): Sesion => ({
  leccion: 'reposo', ppm: 20, pctAcierto: 95, aciertos: 95, escritos: 100, ms: 60000,
  terminadaEn: `2026-09-${String(dia).padStart(2, '0')}T10:00:00.000Z`, ...extra,
});
const leccion = (id: string) =>
  crearLeccion({ titulo: id, descripcion: '', texto: 'una frase para practicar' }, '2026-11-04T10:00:00.000Z', id);
const CLAVES = ['libretype.sesiones', 'libretype.teclas', 'libretype.lecciones'];

beforeEach(() => {
  localStorage.clear();
  vi.resetModules();
  vi.doUnmock('@tauri-apps/api/core');
  vi.doUnmock('@tauri-apps/plugin-sql');
});

describe('traspaso del respaldo a SQLite', () => {
  it('pasa sesiones, teclas y lecciones, y vacía el respaldo', async () => {
    const respaldo = new AlmacenLocal(true);
    await respaldo.guardar(sesion(2));
    await respaldo.guardarTeclas(new Map([['KeyA', { intentos: 9, aciertos: 9, msTotal: 2700 }]]));
    await respaldo.guardarLeccion(leccion('propia:nueva'));

    const sqlite = new AlmacenSqlite(await sqliteReal());
    await sqlite.guardar(sesion(1));
    expect(await traspasarRespaldo(sqlite)).toBe(1);

    expect((await sqlite.leerTodas()).map((s) => s.terminadaEn.slice(8, 10))).toEqual(['01', '02']);
    expect((await sqlite.leerTeclas()).get('KeyA')?.intentos).toBe(9);
    expect((await sqlite.leerLecciones()).map((l) => l.id)).toEqual(['propia:nueva']);
    for (const clave of CLAVES) expect(localStorage.getItem(clave), clave).toBeNull();
  });

  it('las preferencias no son respaldo: no se tocan', async () => {
    localStorage.setItem('libretype.preferencias', '{"escala":2}');
    await new AlmacenLocal(true).guardar(sesion(2));
    await traspasarRespaldo(new AlmacenSqlite(await sqliteReal()));
    expect(localStorage.getItem('libretype.preferencias')).toBe('{"escala":2}');
  });

  it('sin nada en el respaldo no hace nada', async () => {
    const sqlite = new AlmacenSqlite(await sqliteReal());
    const importar = vi.spyOn(sqlite, 'importar');
    expect(await traspasarRespaldo(sqlite)).toBe(0);
    expect(importar).not.toHaveBeenCalled();
  });

  it('si falla, el respaldo se queda entero y el siguiente arranque no duplica', async () => {
    const aviso = vi.spyOn(console, 'warn').mockImplementation(() => {});
    await new AlmacenLocal(true).guardar(sesion(2));
    const sqlite = new AlmacenSqlite(await sqliteReal());
    const roto = new AlmacenMemoria();
    vi.spyOn(roto, 'importar').mockRejectedValue(new Error('database is locked'));

    expect(await traspasarRespaldo(roto)).toBe(0);
    expect(JSON.parse(localStorage.getItem('libretype.sesiones')!)).toHaveLength(1);

    // Dos arranques buenos seguidos, por si el vaciado no llegase a hacerse.
    expect(await traspasarRespaldo(sqlite)).toBe(1);
    localStorage.setItem('libretype.sesiones', JSON.stringify([sesion(2)]));
    expect(await traspasarRespaldo(sqlite)).toBe(0);
    expect(await sqlite.leerTodas()).toHaveLength(1);
    aviso.mockRestore();
  });

  it('si alguna lección no cabe, no se vacía: nadie pierde un texto que escribió', async () => {
    const sqlite = new AlmacenSqlite(await sqliteReal());
    for (let i = 0; i < LIMITES.lecciones; i++) await sqlite.guardarLeccion(leccion(`propia:llena${i}`));
    const respaldo = new AlmacenLocal(true);
    await respaldo.guardar(sesion(2));
    await respaldo.guardarLeccion(leccion('propia:sin-sitio'));

    expect(await traspasarRespaldo(sqlite)).toBe(1);
    expect((await respaldo.leerLecciones()).map((l) => l.id)).toEqual(['propia:sin-sitio']);
    // La sesión ya está en SQLite, y volver a intentarlo no la repite.
    expect(await traspasarRespaldo(sqlite)).toBe(0);
    expect(await sqlite.leerTodas()).toHaveLength(1);
  });

  it('un respaldo ilegible no impide arrancar', async () => {
    localStorage.setItem('libretype.sesiones', '{no es json');
    const sqlite = new AlmacenSqlite(await sqliteReal());
    expect(await traspasarRespaldo(sqlite)).toBe(0);
    expect(await sqlite.leerTodas()).toEqual([]);
  });
});

describe('al abrir en el escritorio', () => {
  it('si SQLite vuelve a abrir, recupera lo practicado durante el fallo y lo cuenta', async () => {
    const db = await sqliteReal();
    localStorage.setItem('libretype.sesiones', JSON.stringify([sesion(3), sesion(4)]));
    vi.doMock('@tauri-apps/api/core', () => ({ isTauri: () => true }));
    vi.doMock('@tauri-apps/plugin-sql', () => ({ default: { load: () => Promise.resolve(db) } }));

    const { abrirAlmacen } = await import('./almacen');
    const almacen = await abrirAlmacen();
    expect(almacen.tipo).toBe('sqlite');
    expect(almacen.recuperadas).toBe(2);
    expect(await almacen.leerTodas()).toHaveLength(2);
    expect(localStorage.getItem('libretype.sesiones')).toBeNull();
  });

  it('en el navegador localStorage es el almacén, no un respaldo: no se traspasa nada', async () => {
    localStorage.setItem('libretype.sesiones', JSON.stringify([sesion(3)]));
    vi.doMock('@tauri-apps/api/core', () => ({ isTauri: () => false }));
    const { abrirAlmacen } = await import('./almacen');
    const almacen = await abrirAlmacen();
    expect(almacen.tipo).toBe('local');
    expect(await almacen.leerTodas()).toHaveLength(1);
  });
});
