/**
 * Un SQLite de verdad para los tests, con las migraciones de verdad.
 *
 * Los dobles que imitaban la base de datos buscando trozos de SQL en la
 * consulta probaban que el código escribía ese SQL, no que funcionara: un
 * `ON CONFLICT` contra una clave que no existe, o una migración que pierde
 * filas, pasaban en verde. Aquí se usa `node:sqlite` (Node 24) y el esquema se
 * saca de `src-tauri/src/lib.rs`, el mismo texto que aplica tauri-plugin-sql.
 *
 * Solo lo importan los tests: no llega al bundle de la aplicación.
 */
import { DatabaseSync } from 'node:sqlite';
import fuenteRust from '../../../src-tauri/src/lib.rs?raw';
import type { DbSql } from './almacen';

export interface MigracionRust {
  version: number;
  descripcion: string;
  sql: string;
}

/**
 * Las migraciones tal como están en `lib.rs`. El SQL va entre comillas dobles
 * de Rust sin secuencias de escape (lo comprueba el test), así que el texto que
 * se lee aquí es byte a byte el que recibe SQLite en la aplicación.
 */
export function migracionesDeRust(fuente: string = fuenteRust): MigracionRust[] {
  const patron =
    /Migration\s*\{\s*version:\s*(\d+),\s*description:\s*"([^"]*)",\s*sql:\s*"([^"]*)",\s*kind:\s*MigrationKind::Up/g;
  return [...fuente.matchAll(patron)].map((m) => ({
    version: Number(m[1]),
    descripcion: m[2],
    sql: m[3],
  }));
}

export interface DbDePrueba {
  db: DbSql;
  nativa: DatabaseSync;
  /** Aplica una migración como lo hace sqlx: dentro de una transacción. */
  migrar(version: number): void;
  /** Sentencias que se han ejecutado, para comprobar que algo fue en un solo lote. */
  ejecutadas: string[];
}

/**
 * Una base de datos en memoria con las migraciones aplicadas hasta `hasta`.
 *
 * El adaptador imita a tauri-plugin-sql: `execute` sin valores ejecuta todas
 * las sentencias del texto (sqlx lo hace así en SQLite) y los parámetros van
 * como `$1`, que `node:sqlite` llama `?1`.
 */
export function crearDbDePrueba(hasta = Infinity): DbDePrueba {
  const nativa = new DatabaseSync(':memory:');
  const migraciones = migracionesDeRust();
  const ejecutadas: string[] = [];
  const posicional = (sql: string) => sql.replace(/\$(\d+)/g, '?$1');

  const migrar = (version: number) => {
    const m = migraciones.find((x) => x.version === version);
    if (!m) throw new Error(`No hay migración ${version}`);
    nativa.exec('BEGIN');
    try {
      nativa.exec(m.sql);
      nativa.exec('COMMIT');
    } catch (err) {
      nativa.exec('ROLLBACK');
      throw err;
    }
  };

  for (const m of migraciones) if (m.version <= hasta) migrar(m.version);

  const db: DbSql = {
    async execute(sql, valores) {
      ejecutadas.push(sql);
      if (valores && valores.length > 0) return nativa.prepare(posicional(sql)).run(...valores);
      nativa.exec(sql);
      return {};
    },
    async select<T>(sql: string, valores?: unknown[]): Promise<T> {
      return nativa.prepare(posicional(sql)).all(...(valores ?? [])) as T;
    },
  };

  return { db, nativa, migrar, ejecutadas };
}
