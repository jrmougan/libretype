/**
 * Dónde se guarda el progreso.
 *
 * Dos backends porque la app corre en dos sitios: `pnpm tauri:dev` (escritorio,
 * con SQLite) y `pnpm dev` (navegador, sin Tauri). Sin el segundo, desarrollar
 * el frontend en el navegador dejaría de funcionar.
 *
 * Si abrir SQLite falla, se cae a localStorage en vez de romper la app: perder
 * el histórico es malo, no poder practicar es peor.
 */
import type { Sesion } from './progreso';

export interface Almacen {
  readonly tipo: 'sqlite' | 'local';
  guardar(s: Sesion): Promise<void>;
  leerTodas(): Promise<Sesion[]>;
  borrarTodo(): Promise<void>;
}

const CLAVE_LOCAL = 'libretype.sesiones';
/** Tope del respaldo en navegador; localStorage no es para histórico infinito. */
const TOPE_LOCAL = 500;

/** Lo que usamos de `Database` de tauri-plugin-sql. */
interface DbSql {
  execute(query: string, valores?: unknown[]): Promise<unknown>;
  select<T>(query: string, valores?: unknown[]): Promise<T>;
}

interface FilaSql {
  leccion: string;
  ppm: number;
  pct_acierto: number;
  aciertos: number;
  escritos: number;
  ms: number;
  terminada_en: string;
}

class AlmacenSqlite implements Almacen {
  readonly tipo = 'sqlite' as const;
  #db: DbSql;

  constructor(db: DbSql) { this.#db = db; }

  async guardar(s: Sesion): Promise<void> {
    await this.#db.execute(
      `INSERT INTO sesiones
         (leccion, ppm, pct_acierto, aciertos, escritos, ms, terminada_en)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [s.leccion, s.ppm, s.pctAcierto, s.aciertos, s.escritos, s.ms, s.terminadaEn],
    );
  }

  async leerTodas(): Promise<Sesion[]> {
    const filas = await this.#db.select<FilaSql[]>(
      `SELECT leccion, ppm, pct_acierto, aciertos, escritos, ms, terminada_en
         FROM sesiones ORDER BY terminada_en ASC`,
    );
    return filas.map((f) => ({
      leccion: f.leccion,
      ppm: f.ppm,
      pctAcierto: f.pct_acierto,
      aciertos: f.aciertos,
      escritos: f.escritos,
      ms: f.ms,
      terminadaEn: f.terminada_en,
    }));
  }

  async borrarTodo(): Promise<void> {
    await this.#db.execute('DELETE FROM sesiones');
  }
}

export class AlmacenLocal implements Almacen {
  readonly tipo = 'local' as const;

  #leer(): Sesion[] {
    try {
      const crudo = localStorage.getItem(CLAVE_LOCAL);
      return crudo ? (JSON.parse(crudo) as Sesion[]) : [];
    } catch {
      return [];
    }
  }

  async guardar(s: Sesion): Promise<void> {
    const todas = [...this.#leer(), s].slice(-TOPE_LOCAL);
    try {
      localStorage.setItem(CLAVE_LOCAL, JSON.stringify(todas));
    } catch {
      // Modo privado o cuota llena: se practica igual, sin histórico.
    }
  }

  async leerTodas(): Promise<Sesion[]> {
    return this.#leer();
  }

  async borrarTodo(): Promise<void> {
    try { localStorage.removeItem(CLAVE_LOCAL); } catch { /* ignorado */ }
  }
}

/** Almacén que no guarda nada. Para tests y para entornos sin storage. */
export class AlmacenMemoria implements Almacen {
  readonly tipo = 'local' as const;
  #sesiones: Sesion[] = [];
  async guardar(s: Sesion): Promise<void> { this.#sesiones.push(s); }
  async leerTodas(): Promise<Sesion[]> { return [...this.#sesiones]; }
  async borrarTodo(): Promise<void> { this.#sesiones = []; }
}

export async function abrirAlmacen(): Promise<Almacen> {
  try {
    const { isTauri } = await import('@tauri-apps/api/core');
    if (!isTauri()) return new AlmacenLocal();

    const { default: Database } = await import('@tauri-apps/plugin-sql');
    const db = await Database.load('sqlite:libretype.db');
    return new AlmacenSqlite(db as unknown as DbSql);
  } catch (err) {
    console.warn('[libretype] SQLite no disponible, se usa localStorage:', err);
    return new AlmacenLocal();
  }
}
