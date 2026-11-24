/**
 * Un SQLite de verdad para los tests, con las migraciones reales de `lib.rs`: un
 * doble no notaría una columna mal escrita ni un parámetro de más.
 *
 * Solo lo importan los tests. `node:sqlite` se carga por una variable para que
 * quede fuera del ámbito de tipos del frontend, igual que el resto de Node.
 */
import type { DbSql } from './almacen';

const LIB_RS = Object.values(import.meta.glob('/src-tauri/src/lib.rs', {
  eager: true, query: '?raw', import: 'default',
}))[0] as string;

/** El fuente de Rust, para los tests que miran las migraciones como texto. */
export const fuenteLibRs = (): string => LIB_RS;

/** Las migraciones reales, en orden, sacadas del fuente de Rust. */
export function migraciones(): string[] {
  return [...LIB_RS.matchAll(/sql: "([\s\S]*?)",\s*kind: MigrationKind::Up/g)].map((m) => m[1]);
}

export interface SqliteDePrueba extends DbSql {
  /** Para preparar datos como los dejó una versión anterior. */
  exec(sql: string): void;
}

/**
 * Abre una base de datos en memoria y le aplica las migraciones `desde` (número
 * de la primera, empezando en 1) `hasta` (incluida). Sin argumentos, todas.
 */
export async function sqliteReal(hasta = Infinity, desde = 1): Promise<SqliteDePrueba> {
  const modulo = 'node:sqlite';
  const { DatabaseSync } = await import(/* @vite-ignore */ modulo);
  const db = new DatabaseSync(':memory:');
  migraciones().forEach((sql, i) => {
    if (i + 1 >= desde && i + 1 <= hasta) db.exec(sql);
  });
  // sqlx enlaza `$1` por su número; `node:sqlite` solo lo hace con `?1`.
  const numerados = (sql: string) => sql.replace(/\$(\d+)/g, '?$1');
  return {
    async execute(sql: string, valores: unknown[] = []) { return db.prepare(numerados(sql)).run(...valores); },
    async select<T>(sql: string, valores: unknown[] = []) { return db.prepare(numerados(sql)).all(...valores) as T; },
    exec(sql: string) { db.exec(sql); },
  };
}

/** Aplica a una base ya abierta las migraciones que le faltan, como al actualizar la app. */
export function migrarHasta(db: SqliteDePrueba, desde: number, hasta = Infinity): void {
  migraciones().forEach((sql, i) => {
    if (i + 1 >= desde && i + 1 <= hasta) db.exec(sql);
  });
}
