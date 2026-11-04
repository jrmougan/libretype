/**
 * Las lecciones personalizadas en los tres almacenes, y el de SQLite contra un
 * SQLite de verdad con las migraciones reales de `lib.rs`: un doble no notaría una
 * columna mal escrita ni un parámetro de más.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { crearLeccion, type LeccionPropia } from '../lecciones/personalizadas';
import { AlmacenLocal, AlmacenMemoria, AlmacenSqlite, parsearCopiaSeguridad, type Almacen, type DbSql } from './almacen';
import type { Sesion } from './progreso';

const LIB_RS = Object.values(import.meta.glob('/src-tauri/src/lib.rs', {
  eager: true, query: '?raw', import: 'default',
}))[0] as string;

const AHORA = '2026-11-04T10:00:00.000Z';
const LUEGO = '2026-11-05T10:00:00.000Z';
const sesion: Sesion = {
  leccion: 'propia:a', ppm: 30, pctAcierto: 95, aciertos: 95, escritos: 100, ms: 60000, terminadaEn: AHORA,
};
const leccion = (id = 'propia:a', titulo = 'Mi lección'): LeccionPropia =>
  crearLeccion({ titulo, descripcion: 'Qué se practica', texto: 'una frase para practicar' }, AHORA, id);

/** Las migraciones reales, en orden, sacadas del fuente de Rust. */
function migraciones(): string[] {
  return [...LIB_RS.matchAll(/sql: "([\s\S]*?)",\s*kind: MigrationKind::Up/g)].map((m) => m[1]);
}

/** `node:sqlite` por una variable: fuera del ámbito de tipos del frontend. */
async function sqliteReal(): Promise<DbSql> {
  const modulo = 'node:sqlite';
  const { DatabaseSync } = await import(/* @vite-ignore */ modulo);
  const db = new DatabaseSync(':memory:');
  for (const sql of migraciones()) db.exec(sql);
  // sqlx enlaza `$1` por su número; `node:sqlite` solo lo hace con `?1`.
  const numerados = (sql: string) => sql.replace(/\$(\d+)/g, '?$1');
  return {
    async execute(sql: string, valores: unknown[] = []) { return db.prepare(numerados(sql)).run(...valores); },
    async select<T>(sql: string, valores: unknown[] = []) { return db.prepare(numerados(sql)).all(...valores) as T; },
  };
}

beforeEach(() => localStorage.clear());

const ALMACENES: [string, () => Promise<Almacen>][] = [
  ['SQLite', async () => new AlmacenSqlite(await sqliteReal())],
  ['localStorage', async () => new AlmacenLocal()],
  ['memoria', async () => new AlmacenMemoria()],
];

describe.each(ALMACENES)('lecciones personalizadas en %s', (_, abrir) => {
  it('empieza sin ninguna', async () => {
    expect(await (await abrir()).leerLecciones()).toEqual([]);
  });

  it('guarda y lee, y volver a guardar sustituye', async () => {
    const a = await abrir();
    await a.guardarLeccion(leccion());
    expect(await a.leerLecciones()).toEqual([leccion()]);

    const editada = { ...leccion(), titulo: 'Otro nombre', actualizadaEn: LUEGO };
    await a.guardarLeccion(editada);
    expect(await a.leerLecciones()).toEqual([editada]);
  });

  it('borrar deja la lápida: el nombre sigue y el texto no', async () => {
    const a = await abrir();
    await a.guardarLeccion(leccion());
    await a.borrarLeccion('propia:a', LUEGO);
    expect(await a.leerLecciones()).toEqual([{
      ...leccion(), texto: '', descripcion: '', actualizadaEn: LUEGO, borradaEn: LUEGO,
    }]);
  });

  it('borrar lo que no existe no rompe nada', async () => {
    const a = await abrir();
    await a.borrarLeccion('propia:nada', LUEGO);
    expect(await a.leerLecciones()).toEqual([]);
  });

  it('borrar el progreso se lleva las lápidas pero no las lecciones vivas', async () => {
    const a = await abrir();
    await a.guardar(sesion);
    await a.guardarLeccion(leccion('propia:viva'));
    await a.guardarLeccion(leccion('propia:muerta'));
    await a.borrarLeccion('propia:muerta', LUEGO);
    await a.borrarTodo();
    expect(await a.leerTodas()).toEqual([]);
    expect((await a.leerLecciones()).map((l) => l.id)).toEqual(['propia:viva']);
  });

  it('la copia de seguridad las lleva, con lápidas, y restaurar no se lleva lo de después', async () => {
    const a = await abrir();
    await a.guardar(sesion);
    await a.guardarLeccion(leccion('propia:viva'));
    await a.guardarLeccion(leccion('propia:muerta', 'Ya no está'));
    await a.borrarLeccion('propia:muerta', LUEGO);
    const copia = await a.exportar();
    expect(JSON.parse(copia).version).toBe(1);

    const b = await abrir();
    await b.guardarLeccion(leccion('propia:posterior'));
    await b.importar(copia);
    const ids = (await b.leerLecciones()).map((l) => l.id).sort();
    expect(ids).toEqual(['propia:muerta', 'propia:posterior', 'propia:viva']);
    expect((await b.leerTodas()).map((s) => s.leccion)).toEqual(['propia:a']);
  });

  it('una copia antigua, sin lecciones, se sigue leyendo y no toca las que hay', async () => {
    const a = await abrir();
    await a.guardarLeccion(leccion());
    await a.importar(JSON.stringify({ version: 1, sesiones: [sesion], teclas: {} }));
    expect(await a.leerLecciones()).toEqual([leccion()]);
  });
});

describe('datos corruptos', () => {
  it('localStorage ilegible se trata como vacío', async () => {
    localStorage.setItem('libretype.lecciones', '{no es json');
    expect(await new AlmacenLocal().leerLecciones()).toEqual([]);
  });

  it('en localStorage se quita lo roto y se conserva lo aprovechable', async () => {
    localStorage.setItem('libretype.lecciones', JSON.stringify([
      leccion(), 7, { id: 'reposo', titulo: 'x', texto: 'y' }, { id: 'propia:b', texto: 'sin nombre' },
    ]));
    const lista = await new AlmacenLocal().leerLecciones();
    expect(lista.map((l) => l.id)).toEqual(['propia:a', 'propia:b']);
    expect(lista[1].titulo).toBe('Lección sin nombre');
  });

  it('en SQLite una fila rota no se lleva las demás por delante', async () => {
    const db = await sqliteReal();
    const a = new AlmacenSqlite(db);
    await a.guardarLeccion(leccion());
    await db.execute(
      `INSERT INTO lecciones_propias (id, titulo, descripcion, texto, creada_en, actualizada_en)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      ['reposo', 'no', '', 'x', 'ayer', 'ayer'],
    );
    await db.execute(
      `INSERT INTO lecciones_propias (id, titulo, descripcion, texto, creada_en, actualizada_en)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      ['propia:rota', '', '', '', 'ayer', 'ayer'],
    );
    expect((await a.leerLecciones()).map((l) => l.id)).toEqual(['propia:a']);
  });

  it('si la consulta falla no se tumba la aplicación', async () => {
    const aviso = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const a = new AlmacenSqlite({
      execute: async () => ({}),
      select: async () => { throw new Error('no such table'); },
    });
    expect(await a.leerLecciones()).toEqual([]);
    aviso.mockRestore();
  });

  it('una copia con lecciones rotas se lee sin ellas', () => {
    const { lecciones } = parsearCopiaSeguridad(JSON.stringify({
      sesiones: [], teclas: {}, lecciones: [leccion(), 'x', { id: 'reposo' }],
    }));
    expect(lecciones.map((l) => l.id)).toEqual(['propia:a']);
    expect(parsearCopiaSeguridad(JSON.stringify({ sesiones: [], lecciones: 'x' })).lecciones).toEqual([]);
  });
});

describe('si no cabe, se dice', () => {
  it('localStorage lleno al guardar una lección lanza en vez de perderla callando', async () => {
    const lleno = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('QuotaExceededError');
    });
    await expect(new AlmacenLocal().guardarLeccion(leccion())).rejects.toThrow();
    lleno.mockRestore();
  });
});

describe('la migración', () => {
  it('es la tercera, nueva, y no editó las dos anteriores', () => {
    const sql = migraciones();
    expect(sql).toHaveLength(3);
    expect(sql[0]).toContain('sesiones');
    expect(sql[1]).toContain('teclas');
    expect(sql[2]).toContain('lecciones_propias');
    expect(sql[0]).not.toContain('lecciones_propias');
    expect(sql[1]).not.toContain('lecciones_propias');
  });
});

describe('restaurar una copia en SQLite', () => {
  const copiaDe = (sesiones: Sesion[], teclas: Record<string, unknown> = {}): string =>
    JSON.stringify({ version: 1, creadaEn: AHORA, sesiones, teclas });
  const nSesiones = (n: number): Sesion[] => Array.from({ length: n }, (_, i) => ({ ...sesion, ppm: i + 1 }));

  it('exporta e importa el progreso', async () => {
    const a = new AlmacenSqlite(await sqliteReal());
    await a.guardar({ ...sesion, leccion: 'tildes', ppm: 45 });
    await a.guardarTeclas(new Map([['KeyA', { intentos: 12, aciertos: 11, msTotal: 2500 }]]));

    const json = await a.exportar();
    const leido = JSON.parse(json);
    expect(leido.version).toBe(1);
    expect(leido.sesiones).toHaveLength(1);
    expect(leido.teclas.KeyA.intentos).toBe(12);

    await a.borrarTodo();
    expect(await a.leerTodas()).toHaveLength(0);

    await a.importar(json);
    expect(await a.leerTodas()).toEqual([{ ...sesion, leccion: 'tildes', ppm: 45 }]);
    expect((await a.leerTeclas()).get('KeyA')).toEqual({ intentos: 12, aciertos: 11, msTotal: 2500 });
  });

  it('sustituye: de lo anterior no queda nada, tampoco teclas que la copia no trae', async () => {
    const a = new AlmacenSqlite(await sqliteReal());
    await a.guardar({ ...sesion, ppm: 99 });
    await a.guardarTeclas(new Map([['KeyZ', { intentos: 1, aciertos: 1, msTotal: 1 }]]));
    await a.importar(copiaDe(nSesiones(3), { KeyA: { intentos: 2, aciertos: 2, msTotal: 2 } }));
    expect((await a.leerTodas()).map((s) => s.ppm).sort()).toEqual([1, 2, 3]);
    expect([...(await a.leerTeclas()).keys()]).toEqual(['KeyA']);
  });

  it('dos a la vez no duplican: era un doble clic y dejaba más filas de las de la copia', async () => {
    const real = await sqliteReal();
    const conLatencia: DbSql = {
      execute: async (sql, v) => { await new Promise((r) => setTimeout(r, 1)); return real.execute(sql, v); },
      select: async (sql, v) => { await new Promise((r) => setTimeout(r, 1)); return real.select(sql, v); },
    };
    const a = new AlmacenSqlite(conLatencia);
    await a.guardar(sesion);
    const json = copiaDe(nSesiones(300));
    const resultados = await Promise.allSettled([a.importar(json), a.importar(json)]);
    expect(resultados.map((r) => r.status)).toEqual(['fulfilled', 'rejected']);
    expect((resultados[1] as PromiseRejectedResult).reason.message).toMatch(/Ya se está importando/);
    expect(await a.leerTodas()).toHaveLength(300);
    // Y acabada una, se puede volver a importar.
    await a.importar(json);
    expect(await a.leerTodas()).toHaveLength(300);
  });

  /** Un disco lleno de verdad no se puede provocar aquí; un disparador falla igual. */
  async function conFalloEnLaFila(n: number): Promise<{ a: AlmacenSqlite; db: DbSql }> {
    const db = await sqliteReal();
    const a = new AlmacenSqlite(db);
    await a.guardar({ ...sesion, ppm: 99 });
    await a.guardarTeclas(new Map([['KeyZ', { intentos: 1, aciertos: 1, msTotal: 1 }]]));
    await db.execute(
      `CREATE TRIGGER falla BEFORE INSERT ON sesiones WHEN NEW.ppm = ${n}
       BEGIN SELECT RAISE(ABORT, 'database or disk is full'); END`,
    );
    return { a, db };
  }

  it('si falla a medias, el historial sigue como estaba y se dice en español', async () => {
    const aviso = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { a, db } = await conFalloEnLaFila(4);
    await expect(a.importar(copiaDe(nSesiones(300), { KeyA: { intentos: 2, aciertos: 2, msTotal: 2 } })))
      .rejects.toThrow(/historial sigue como estaba/);
    expect((await a.leerTodas()).map((s) => s.ppm)).toEqual([99]);
    expect([...(await a.leerTeclas()).keys()]).toEqual(['KeyZ']);
    // Y no se queda atascado: arreglado el problema, se puede repetir.
    await db.execute('DROP TRIGGER falla');
    await a.importar(copiaDe(nSesiones(300)));
    expect(await a.leerTodas()).toHaveLength(300);
    aviso.mockRestore();
  });

  it('si falla en las teclas, tampoco quedan las sesiones de la copia junto a las antiguas', async () => {
    const aviso = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const real = await sqliteReal();
    const a = new AlmacenSqlite({
      select: real.select,
      execute: async (sql, v) => {
        if (sql.includes('INSERT INTO teclas') && sql.includes('json_each')) throw new Error('database or disk is full');
        return real.execute(sql, v);
      },
    });
    await a.guardar({ ...sesion, ppm: 99 });
    await expect(a.importar(copiaDe(nSesiones(3)))).rejects.toThrow(/sigue como estaba/);
    expect((await a.leerTodas()).map((s) => s.ppm)).toEqual([99]);
    aviso.mockRestore();
  });

  it('una copia dañada no toca nada', async () => {
    const a = new AlmacenSqlite(await sqliteReal());
    await a.guardar(sesion);
    await expect(a.importar('{"sesiones":[],"teclas":[1]}')).rejects.toThrow(/dañados/);
    expect(await a.leerTodas()).toHaveLength(1);
  });
});

describe('una copia con las teclas rotas', () => {
  it.each([
    ['un número', '[1]'],
    ['un par a medias', '[["KeyA"]]'],
    ['una tecla que no es texto', '[[1, {"intentos":1,"aciertos":1,"msTotal":1}]]'],
    ['un estado roto', '[["KeyA", 3]]'],
  ])('con %s explica el problema en español', (_n, teclas) => {
    expect(() => parsearCopiaSeguridad(`{"sesiones":[],"teclas":${teclas}}`)).toThrow(/copia de seguridad están dañados/);
  });

  it('en forma de pares sigue valiendo', () => {
    const c = parsearCopiaSeguridad('{"sesiones":[],"teclas":[["KeyA",{"intentos":1,"aciertos":1,"msTotal":1}]]}');
    expect(c.teclas.get('KeyA')?.intentos).toBe(1);
  });
});

