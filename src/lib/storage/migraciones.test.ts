import { describe, expect, it } from 'vitest';
import { AlmacenSqlite, PERFIL_PRINCIPAL } from './almacen';
import { crearDbDePrueba, migracionesDeRust } from './sqlite-de-prueba';

/**
 * Las migraciones se prueban aplicando el SQL de `lib.rs` a un SQLite real con
 * datos escritos como los escribía la versión anterior. Comprobar que el texto
 * contiene «CREATE TABLE» (lo que hace el test de Rust) no dice si una fila
 * sobrevive.
 */
describe('migraciones del esquema', () => {
  it('se leen de lib.rs, van en orden y su SQL no lleva escapes de Rust', () => {
    const migs = migracionesDeRust();
    expect(migs.map((m) => m.version)).toEqual([1, 2, 3]);
    for (const m of migs) {
      expect(m.sql.trim()).not.toBe('');
      // Sin barras invertidas, el texto leído aquí es el que recibe SQLite.
      expect(m.sql).not.toContain('\\');
    }
  });

  it('las sesiones y teclas de la v0.2 pasan al perfil principal al migrar a la 3', async () => {
    const { nativa, migrar, db } = crearDbDePrueba(2);

    // Tal cual las escribía AlmacenSqlite antes de los perfiles.
    nativa.prepare(
      `INSERT INTO sesiones (leccion, ppm, pct_acierto, aciertos, escritos, ms, terminada_en)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)`,
    ).run('home', 20, 95, 40, 42, 60000, '2026-01-10T10:00:00.000Z');
    nativa.prepare(
      `INSERT INTO sesiones (leccion, ppm, pct_acierto, aciertos, escritos, ms, terminada_en)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)`,
    ).run('reposo', 25, 98, 50, 51, 45000, '2026-02-01T10:00:00.000Z');
    nativa.prepare(
      'INSERT INTO teclas (code, intentos, aciertos, ms_total) VALUES (?1, ?2, ?3, ?4)',
    ).run('KeyA', 30, 29, 9000);

    migrar(3);

    const almacen = new AlmacenSqlite(db);
    expect(almacen.perfil).toBe(PERFIL_PRINCIPAL);
    expect(await almacen.listarPerfiles()).toEqual([
      expect.objectContaining({ id: 1, alias: 'Principal' }),
    ]);
    const sesiones = await almacen.leerTodas();
    expect(sesiones.map((s) => s.leccion)).toEqual(['home', 'reposo']);
    expect(sesiones[0]).toEqual({
      leccion: 'home', ppm: 20, pctAcierto: 95, aciertos: 40, escritos: 42, ms: 60000,
      terminadaEn: '2026-01-10T10:00:00.000Z',
    });
    expect(await almacen.leerTeclas()).toEqual(
      new Map([['KeyA', { intentos: 30, aciertos: 29, msTotal: 9000 }]]),
    );
  });

  it('tras la 3, la misma tecla puede tener dominio distinto en dos perfiles', async () => {
    const { db } = crearDbDePrueba();
    const almacen = new AlmacenSqlite(db);
    const ana = await almacen.crearPerfil('Ana');

    await almacen.guardarTeclas(new Map([['KeyF', { intentos: 10, aciertos: 10, msTotal: 3000 }]]));
    almacen.usarPerfil(ana.id);
    await almacen.guardarTeclas(new Map([['KeyF', { intentos: 2, aciertos: 1, msTotal: 900 }]]));

    expect((await almacen.leerTeclas()).get('KeyF')?.intentos).toBe(2);
    almacen.usarPerfil(PERFIL_PRINCIPAL);
    expect((await almacen.leerTeclas()).get('KeyF')?.intentos).toBe(10);
  });

  it('una migración 3 que falla a medias no deja el esquema a medio cambiar', () => {
    const { nativa, migrar } = crearDbDePrueba(2);
    // Un perfil 1 ya existente hace fallar el INSERT de la migración después
    // de haber creado la tabla: la transacción tiene que deshacerlo todo.
    nativa.exec(`CREATE TABLE perfiles (id INTEGER PRIMARY KEY, alias TEXT NOT NULL, creado_en TEXT NOT NULL);
                 INSERT INTO perfiles VALUES (1, 'x', 'y');`);
    expect(() => migrar(3)).toThrow();
    const columnas = nativa.prepare('PRAGMA table_info(sesiones)').all() as { name: string }[];
    expect(columnas.map((c) => c.name)).not.toContain('perfil');
    const teclas = nativa.prepare('PRAGMA table_info(teclas)').all() as { name: string; pk: number }[];
    expect(teclas.find((c) => c.name === 'code')?.pk).toBe(1);
  });
});
