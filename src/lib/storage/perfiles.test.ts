/**
 * Perfiles en los tres almacenes, y la migración 4 contra un SQLite de verdad con
 * datos de una instalación anterior: lo que había tiene que seguir siendo de
 * alguien, y de una sola persona.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { EstadoTecla } from '../keyboard/dominio';
import { crearLeccion } from '../lecciones/personalizadas';
import {
  ALIAS_PRINCIPAL, AlmacenLocal, AlmacenMemoria, AlmacenSqlite, MAX_ALIAS, MAX_PERFILES, PERFIL_PRINCIPAL,
  parsearCopiaSeguridad, traspasarRespaldo, type Almacen,
} from './almacen';
import type { Sesion } from './progreso';
import { migraciones, migrarHasta, sqliteReal } from './sqlite-de-prueba';

const sesion = (dia: number, extra: Partial<Sesion> = {}): Sesion => ({
  leccion: 'reposo', ppm: 20, pctAcierto: 95, aciertos: 95, escritos: 100, ms: 60000,
  terminadaEn: `2026-09-${String(dia).padStart(2, '0')}T10:00:00.000Z`, ...extra,
});
const tecla = (intentos: number): EstadoTecla => ({ intentos, aciertos: intentos, msTotal: intentos * 300 });
const leccion = (id: string, titulo = id) =>
  crearLeccion({ titulo, descripcion: '', texto: 'una frase para practicar' }, '2026-11-04T10:00:00.000Z', id);

beforeEach(() => localStorage.clear());

const ALMACENES: [string, () => Promise<Almacen>][] = [
  ['SQLite', async () => new AlmacenSqlite(await sqliteReal())],
  ['localStorage', async () => new AlmacenLocal()],
  ['memoria', async () => new AlmacenMemoria()],
];

describe.each(ALMACENES)('perfiles en %s', (_, abrir) => {
  it('empieza con un solo perfil, el principal, que es el activo', async () => {
    const a = await abrir();
    const perfiles = await a.listarPerfiles();
    expect(perfiles.map((p) => [p.id, p.alias])).toEqual([[PERFIL_PRINCIPAL, ALIAS_PRINCIPAL]]);
    expect(a.perfil).toBe(PERFIL_PRINCIPAL);
  });

  it('cada perfil tiene su progreso, sus teclas y sus lecciones propias', async () => {
    const a = await abrir();
    await a.guardar(sesion(1));
    await a.guardarTeclas(new Map([['KeyA', tecla(20)]]));
    await a.guardarLeccion(leccion('propia:del-principal'));

    const ana = await a.crearPerfil('Ana');
    a.usarPerfil(ana.id);
    expect(await a.leerTodas()).toEqual([]);
    expect(await a.leerTeclas()).toEqual(new Map());
    expect(await a.leerLecciones()).toEqual([]);

    await a.guardar(sesion(2, { leccion: 'tildes' }));
    await a.guardarTeclas(new Map([['KeyA', tecla(3)], ['KeyS', tecla(9)]]));
    await a.guardarLeccion(leccion('propia:de-ana'));

    a.usarPerfil(PERFIL_PRINCIPAL);
    expect((await a.leerTodas()).map((s) => s.leccion)).toEqual(['reposo']);
    expect(Object.fromEntries(await a.leerTeclas())).toEqual({ KeyA: tecla(20) });
    expect((await a.leerLecciones()).map((l) => l.id)).toEqual(['propia:del-principal']);

    a.usarPerfil(ana.id);
    expect((await a.leerTodas()).map((s) => s.leccion)).toEqual(['tildes']);
    expect(Object.fromEntries(await a.leerTeclas())).toEqual({ KeyA: tecla(3), KeyS: tecla(9) });
    expect((await a.leerLecciones()).map((l) => l.id)).toEqual(['propia:de-ana']);
  });

  it('la misma lección importada en dos perfiles es de cada uno: editar una no toca la otra', async () => {
    const a = await abrir();
    const ana = await a.crearPerfil('Ana');
    await a.guardarLeccion(leccion('propia:compartida', 'La del principal'));
    a.usarPerfil(ana.id);
    await a.guardarLeccion(leccion('propia:compartida', 'La de Ana'));
    await a.borrarLeccion('propia:compartida', '2026-11-05T10:00:00.000Z');

    a.usarPerfil(PERFIL_PRINCIPAL);
    const [mia] = await a.leerLecciones();
    expect(mia.titulo).toBe('La del principal');
    expect(mia.borradaEn).toBeNull();
  });

  it('borrar el progreso de un perfil no toca el de los demás', async () => {
    const a = await abrir();
    await a.guardar(sesion(1));
    const ana = await a.crearPerfil('Ana');
    a.usarPerfil(ana.id);
    await a.guardar(sesion(2));
    await a.guardarTeclas(new Map([['KeyA', tecla(3)]]));
    await a.borrarTodo();
    expect(await a.leerTodas()).toEqual([]);
    expect(await a.leerTeclas()).toEqual(new Map());

    a.usarPerfil(PERFIL_PRINCIPAL);
    expect(await a.leerTodas()).toHaveLength(1);
  });

  it('importar, sustituyendo o combinando, entra en el perfil activo y solo en él', async () => {
    const a = await abrir();
    await a.guardar(sesion(1));
    await a.guardarTeclas(new Map([['KeyA', tecla(20)]]));
    const ana = await a.crearPerfil('Ana');
    a.usarPerfil(ana.id);
    await a.guardar(sesion(2));
    const copia = JSON.stringify({ version: 1, sesiones: [sesion(3), sesion(4)], teclas: { KeyS: tecla(5) } });

    await a.importar(copia);
    expect((await a.leerTodas()).map((s) => s.terminadaEn.slice(8, 10))).toEqual(['03', '04']);
    await a.importar(JSON.stringify({ version: 1, sesiones: [sesion(5)], teclas: {} }), 'combinar');
    expect(await a.leerTodas()).toHaveLength(3);

    a.usarPerfil(PERFIL_PRINCIPAL);
    expect((await a.leerTodas()).map((s) => s.terminadaEn.slice(8, 10))).toEqual(['01']);
    expect(Object.fromEntries(await a.leerTeclas())).toEqual({ KeyA: tecla(20) });
  });

  it('la copia de seguridad es la del perfil activo y dice de quién es', async () => {
    const a = await abrir();
    await a.guardar(sesion(1));
    const ana = await a.crearPerfil('Ana');
    a.usarPerfil(ana.id);
    await a.guardar(sesion(2));
    const copia = parsearCopiaSeguridad(await a.exportar());
    expect(copia.alias).toBe('Ana');
    expect(copia.sesiones.map((s) => s.terminadaEn.slice(8, 10))).toEqual(['02']);
    a.usarPerfil(PERFIL_PRINCIPAL);
    expect(parsearCopiaSeguridad(await a.exportar()).alias).toBe(ALIAS_PRINCIPAL);
  });

  it('el alias se limpia, no puede quedar vacío y no se repite ni cambiando mayúsculas o tildes', async () => {
    const a = await abrir();
    expect((await a.crearPerfil('  Ana   María \n')).alias).toBe('Ana María');
    await expect(a.crearPerfil('   ')).rejects.toThrow(/Escribe un nombre/);
    await expect(a.crearPerfil('ana maría')).rejects.toThrow(/Ya hay un perfil que se llama «ana maría»/);
    await expect(a.crearPerfil('ANA MARIA')).rejects.toThrow(/Ya hay un perfil/);
    await expect(a.crearPerfil('principal')).rejects.toThrow(/Ya hay un perfil/);
    expect((await a.crearPerfil('x'.repeat(MAX_ALIAS + 20))).alias).toHaveLength(MAX_ALIAS);
    expect(await a.listarPerfiles()).toHaveLength(3);
  });

  it('renombrar conserva el progreso, y puede dejar el mismo nombre con otra grafía', async () => {
    const a = await abrir();
    const ana = await a.crearPerfil('Ana');
    a.usarPerfil(ana.id);
    await a.guardar(sesion(2));
    await a.renombrarPerfil(ana.id, 'ANA');
    await a.renombrarPerfil(PERFIL_PRINCIPAL, 'Aula 2');
    expect((await a.listarPerfiles()).map((p) => p.alias)).toEqual(['Aula 2', 'ANA']);
    expect(await a.leerTodas()).toHaveLength(1);
    await expect(a.renombrarPerfil(ana.id, 'aula 2')).rejects.toThrow(/Ya hay un perfil/);
    await expect(a.renombrarPerfil(999, 'Nadie')).rejects.toThrow(/ya no existe/);
  });

  it('borrar un perfil se lleva todo lo suyo, y si era el activo se vuelve al principal', async () => {
    const a = await abrir();
    await a.guardar(sesion(1));
    const ana = await a.crearPerfil('Ana');
    a.usarPerfil(ana.id);
    await a.guardar(sesion(2));
    await a.guardarTeclas(new Map([['KeyA', tecla(3)]]));
    await a.guardarLeccion(leccion('propia:de-ana'));

    await a.borrarPerfil(ana.id);
    expect(a.perfil).toBe(PERFIL_PRINCIPAL);
    expect((await a.listarPerfiles()).map((p) => p.alias)).toEqual([ALIAS_PRINCIPAL]);
    expect(await a.leerTodas()).toHaveLength(1);

    // Un perfil nuevo no hereda nada del borrado, aunque le tocase el mismo sitio.
    const otra = await a.crearPerfil('Ana');
    a.usarPerfil(otra.id);
    expect(await a.leerTodas()).toEqual([]);
    expect(await a.leerTeclas()).toEqual(new Map());
    expect(await a.leerLecciones()).toEqual([]);
  });

  it('el principal no se puede borrar: es el dueño de lo que había antes de los perfiles', async () => {
    const a = await abrir();
    await a.guardar(sesion(1));
    await expect(a.borrarPerfil(PERFIL_PRINCIPAL)).rejects.toThrow(/no se puede borrar/);
    expect(await a.leerTodas()).toHaveLength(1);
  });

  it('hay un máximo de perfiles, y se dice en vez de fallar raro', async () => {
    const a = await abrir();
    for (let i = 1; i < MAX_PERFILES; i++) await a.crearPerfil(`Alumno ${i}`);
    await expect(a.crearPerfil('Uno más')).rejects.toThrow(/es el máximo/);
    expect(await a.listarPerfiles()).toHaveLength(MAX_PERFILES);
  });
});

describe('la migración de perfiles', () => {
  it('es la cuarta y no editó las tres anteriores', () => {
    const sql = migraciones();
    expect(sql).toHaveLength(4);
    expect(sql[3]).toContain('CREATE TABLE IF NOT EXISTS perfiles');
    for (const anterior of sql.slice(0, 3)) expect(anterior).not.toMatch(/perfil/);
  });

  it('una instalación anterior conserva todo, y todo pasa a ser del perfil principal', async () => {
    // Como la dejó la versión con lecciones propias: esquema 3, con datos.
    const db = await sqliteReal(3);
    db.exec(`
      INSERT INTO sesiones (leccion, ppm, pct_acierto, aciertos, escritos, ms, terminada_en)
        VALUES ('reposo', 20, 95, 95, 100, 60000, '2026-09-01T10:00:00.000Z'),
               ('propia:vieja', 30, 97, 97, 100, 50000, '2026-09-02T10:00:00.000Z');
      INSERT INTO teclas (code, intentos, aciertos, ms_total) VALUES ('KeyA', 20, 19, 6000), ('KeyS', 9, 9, 2700);
      INSERT INTO lecciones_propias (id, titulo, descripcion, texto, creada_en, actualizada_en, borrada_en)
        VALUES ('propia:vieja', 'La de antes', 'Qué se practica', 'una frase de antes',
                '2026-08-01T10:00:00.000Z', '2026-08-02T10:00:00.000Z', NULL),
               ('propia:borrada', 'Ya no está', '', '',
                '2026-08-01T10:00:00.000Z', '2026-08-03T10:00:00.000Z', '2026-08-03T10:00:00.000Z');
    `);

    migrarHasta(db, 4);
    const a = new AlmacenSqlite(db);

    expect((await a.listarPerfiles()).map((p) => [p.id, p.alias])).toEqual([[1, 'Principal']]);
    expect((await a.leerTodas()).map((s) => s.leccion)).toEqual(['reposo', 'propia:vieja']);
    expect(Object.fromEntries(await a.leerTeclas())).toEqual({
      KeyA: { intentos: 20, aciertos: 19, msTotal: 6000 }, KeyS: { intentos: 9, aciertos: 9, msTotal: 2700 },
    });
    const lecciones = await a.leerLecciones();
    expect(lecciones.map((l) => l.id).sort()).toEqual(['propia:borrada', 'propia:vieja']);
    expect(lecciones.find((l) => l.id === 'propia:vieja')).toMatchObject({
      titulo: 'La de antes', descripcion: 'Qué se practica', texto: 'una frase de antes', borradaEn: null,
    });
    expect(lecciones.find((l) => l.id === 'propia:borrada')?.borradaEn).toBe('2026-08-03T10:00:00.000Z');

    // Y nadie más lo ve: un perfil nuevo empieza de cero.
    const ana = await a.crearPerfil('Ana');
    expect(ana.id).toBe(2);
    a.usarPerfil(ana.id);
    expect(await a.leerTodas()).toEqual([]);
    expect(await a.leerLecciones()).toEqual([]);
  });

  it('una instalación nueva queda igual que una migrada', async () => {
    const a = new AlmacenSqlite(await sqliteReal());
    expect((await a.listarPerfiles()).map((p) => [p.id, p.alias])).toEqual([[1, 'Principal']]);
    await a.guardar(sesion(1));
    expect(await a.leerTodas()).toHaveLength(1);
  });
});

describe('el respaldo de localStorage con perfiles', () => {
  it('el perfil principal usa las claves de siempre: lo que había es suyo sin moverlo', async () => {
    localStorage.setItem('libretype.sesiones', JSON.stringify([sesion(1)]));
    localStorage.setItem('libretype.teclas', JSON.stringify([['KeyA', tecla(4)]]));
    localStorage.setItem('libretype.lecciones', JSON.stringify([leccion('propia:vieja')]));
    const a = new AlmacenLocal();
    expect(await a.leerTodas()).toHaveLength(1);
    expect((await a.leerTeclas()).get('KeyA')).toEqual(tecla(4));
    expect((await a.leerLecciones()).map((l) => l.id)).toEqual(['propia:vieja']);
  });

  it('una lista de perfiles dañada no deja a nadie sin practicar: queda el principal', async () => {
    localStorage.setItem('libretype.perfiles', '{roto');
    expect((await new AlmacenLocal().listarPerfiles()).map((p) => p.id)).toEqual([1]);
    localStorage.setItem('libretype.perfiles', JSON.stringify([{ id: 'x' }, { id: 2, alias: 'Ana', creadoEn: 'ayer' }, 7]));
    expect((await new AlmacenLocal().listarPerfiles()).map((p) => p.alias)).toEqual(['Principal', 'Ana']);
  });

  it('el traspaso a SQLite va perfil a perfil, y lo de un perfil que ya no existe va al principal', async () => {
    const sqlite = new AlmacenSqlite(await sqliteReal());
    const ana = await sqlite.crearPerfil('Ana');
    sqlite.usarPerfil(ana.id);

    // Mientras SQLite fallaba se practicó como Ana (2) y como un perfil 9 que ya no está.
    const respaldo = new AlmacenLocal(true);
    respaldo.usarPerfil(ana.id);
    await respaldo.guardar(sesion(2));
    await respaldo.guardarLeccion(leccion('propia:de-ana'));
    respaldo.usarPerfil(9);
    await respaldo.guardar(sesion(3));

    expect(await traspasarRespaldo(sqlite)).toBe(2);
    // El perfil activo no cambia por traspasar.
    expect(sqlite.perfil).toBe(ana.id);
    expect((await sqlite.leerTodas()).map((s) => s.terminadaEn.slice(8, 10))).toEqual(['02']);
    expect((await sqlite.leerLecciones()).map((l) => l.id)).toEqual(['propia:de-ana']);
    sqlite.usarPerfil(PERFIL_PRINCIPAL);
    expect((await sqlite.leerTodas()).map((s) => s.terminadaEn.slice(8, 10))).toEqual(['03']);
    expect(Object.keys(localStorage).filter((k) => k.startsWith('libretype.perfil'))).toEqual([]);
  });

  it('si el traspaso de un perfil falla, los demás pasan y ese se queda para la próxima', async () => {
    const aviso = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const destino = new AlmacenMemoria();
    const ana = await destino.crearPerfil('Ana');
    const respaldo = new AlmacenLocal(true);
    await respaldo.guardar(sesion(1));
    respaldo.usarPerfil(ana.id);
    await respaldo.guardar(sesion(2));

    const real = destino.importar.bind(destino);
    vi.spyOn(destino, 'importar').mockImplementation(async (json, modo) => {
      if (destino.perfil === ana.id) throw new Error('database is locked');
      return real(json, modo);
    });

    expect(await traspasarRespaldo(destino)).toBe(1);
    expect(localStorage.getItem('libretype.sesiones')).toBeNull();
    expect(localStorage.getItem(`libretype.perfil.${ana.id}.sesiones`)).not.toBeNull();
    aviso.mockRestore();
  });
});
