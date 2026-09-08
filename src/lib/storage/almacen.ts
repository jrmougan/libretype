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
import type { EstadoTecla } from "../keyboard/dominio";
import type { Sesion } from "./progreso";
import { conservarLogros } from "./objetivos";

export interface Almacen {
  readonly tipo: "sqlite" | "local";
  /** Indica si falló la base de datos local en escritorio y se degradó a local. */
  readonly errorAlmacen?: boolean;
  guardar(s: Sesion): Promise<void>;
  leerTodas(): Promise<Sesion[]>;
  /** Dominio acumulado por tecla, para saber cuánta ayuda visual retirar. */
  leerTeclas(): Promise<Map<string, EstadoTecla>>;
  guardarTeclas(teclas: ReadonlyMap<string, EstadoTecla>): Promise<void>;
  borrarTodo(): Promise<void>;
  /** Exporta el progreso completo a una cadena JSON. */
  exportar(): Promise<string>;
  exportarProgreso(): Promise<string>;
  /** Importa sesiones y estado de teclas desde una cadena JSON. */
  importar(json: string, opciones?: { reemplazar?: boolean }): Promise<void>;
  importarProgreso(json: string, opciones?: { reemplazar?: boolean }): Promise<void>;
}

export interface CopiaSeguridad {
  version: number;
  creadaEn: string;
  sesiones: Sesion[];
  teclas: Record<string, EstadoTecla>;
}

const CLAVE_LOCAL = "libretype.sesiones";
const CLAVE_TECLAS = "libretype.teclas";
/** Tope del respaldo en navegador; localStorage no es para histórico infinito. */
const TOPE_LOCAL = 500;

/** Bandera exportada que indica si se produjo una degradación por fallo de SQLite. */
export let errorAlmacen = false;

export function setErrorAlmacen(valor: boolean): void {
  errorAlmacen = valor;
}

/** Lo que usamos de `Database` de tauri-plugin-sql. */
export interface DbSql {
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

/**
 * Valida y parsea el contenido JSON de una copia de seguridad.
 * Lanza un error descriptivo en español si el formato o los campos son inválidos.
 */
export function parsearCopiaSeguridad(json: string): {
  sesiones: Sesion[];
  teclas: Map<string, EstadoTecla>;
} {
  let datos: unknown;
  try {
    datos = JSON.parse(json);
  } catch {
    throw new Error("El archivo no contiene un JSON válido.");
  }

  if (!datos || typeof datos !== "object") {
    throw new Error("El formato de la copia de seguridad no es un objeto válido.");
  }

  const obj = datos as Record<string, unknown>;

  if (!Array.isArray(obj.sesiones)) {
    throw new Error("La copia de seguridad no contiene una lista de sesiones válida.");
  }

  const sesionesValidas: Sesion[] = [];
  for (const s of obj.sesiones) {
    if (
      typeof s !== "object" ||
      s === null ||
      typeof s.leccion !== "string" ||
      typeof s.ppm !== "number" ||
      typeof s.pctAcierto !== "number" ||
      typeof s.aciertos !== "number" ||
      typeof s.escritos !== "number" ||
      typeof s.ms !== "number" ||
      typeof s.terminadaEn !== "string"
    ) {
      throw new Error("Una o más sesiones de la copia de seguridad contienen campos inválidos.");
    }
    sesionesValidas.push({
      leccion: s.leccion,
      ppm: s.ppm,
      pctAcierto: s.pctAcierto,
      aciertos: s.aciertos,
      escritos: s.escritos,
      ms: s.ms,
      terminadaEn: s.terminadaEn,
    });
  }

  const teclasValidas = new Map<string, EstadoTecla>();
  if (obj.teclas && typeof obj.teclas === "object") {
    const entradas = Array.isArray(obj.teclas)
      ? (obj.teclas as [string, unknown][])
      : Object.entries(obj.teclas as Record<string, unknown>);

    for (const [code, val] of entradas) {
      if (
        typeof code !== "string" ||
        typeof val !== "object" ||
        val === null ||
        typeof (val as EstadoTecla).intentos !== "number" ||
        typeof (val as EstadoTecla).aciertos !== "number" ||
        typeof (val as EstadoTecla).msTotal !== "number"
      ) {
        throw new Error(`El estado de la tecla "${code}" en la copia de seguridad es inválido.`);
      }
      const e = val as EstadoTecla;
      teclasValidas.set(code, {
        intentos: e.intentos,
        aciertos: e.aciertos,
        msTotal: e.msTotal,
      });
    }
  }

  return { sesiones: sesionesValidas, teclas: teclasValidas };
}

export class AlmacenSqlite implements Almacen {
  readonly tipo = "sqlite" as const;
  readonly errorAlmacen = false;
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

  async leerTeclas(): Promise<Map<string, EstadoTecla>> {
    const filas = await this.#db.select<
      { code: string; intentos: number; aciertos: number; ms_total: number }[]
    >("SELECT code, intentos, aciertos, ms_total FROM teclas");
    return new Map(filas.map((f) => [
      f.code,
      { intentos: f.intentos, aciertos: f.aciertos, msTotal: f.ms_total },
    ]));
  }

  async guardarTeclas(teclas: ReadonlyMap<string, EstadoTecla>): Promise<void> {
    for (const [code, e] of teclas) {
      await this.#db.execute(
        `INSERT INTO teclas (code, intentos, aciertos, ms_total)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT(code) DO UPDATE SET
           intentos = excluded.intentos,
           aciertos = excluded.aciertos,
           ms_total = excluded.ms_total`,
        [code, e.intentos, e.aciertos, e.msTotal],
      );
    }
  }

  async borrarTodo(): Promise<void> {
    await this.#db.execute("DELETE FROM sesiones");
    await this.#db.execute("DELETE FROM teclas");
    await this.#db.execute("VACUUM");
  }

  async exportar(): Promise<string> {
    const sesiones = await this.leerTodas();
    const teclas = await this.leerTeclas();
    const copia: CopiaSeguridad = {
      version: 1,
      creadaEn: new Date().toISOString(),
      sesiones,
      teclas: Object.fromEntries(teclas),
    };
    return JSON.stringify(copia, null, 2);
  }

  async exportarProgreso(): Promise<string> {
    return this.exportar();
  }

  async importar(json: string, opciones?: { reemplazar?: boolean }): Promise<void> {
    const { sesiones, teclas } = parsearCopiaSeguridad(json);
    const reemplazar = opciones?.reemplazar ?? true;

    if (reemplazar) {
      await this.#db.execute("DELETE FROM sesiones");
      await this.#db.execute("DELETE FROM teclas");
      for (const s of sesiones) {
        await this.guardar(s);
      }
      await this.guardarTeclas(teclas);
    } else {
      const existentes = await this.leerTodas();
      const claves = new Set(existentes.map((s) => `${s.terminadaEn}|${s.leccion}`));
      for (const s of sesiones) {
        if (!claves.has(`${s.terminadaEn}|${s.leccion}`)) {
          await this.guardar(s);
        }
      }
      const teclasExistentes = await this.leerTeclas();
      for (const [code, val] of teclas) {
        const prev = teclasExistentes.get(code);
        if (!prev) {
          teclasExistentes.set(code, val);
        } else {
          teclasExistentes.set(code, {
            intentos: prev.intentos + val.intentos,
            aciertos: prev.aciertos + val.aciertos,
            msTotal: prev.msTotal + val.msTotal,
          });
        }
      }
      await this.guardarTeclas(teclasExistentes);
    }
  }

  async importarProgreso(json: string, opciones?: { reemplazar?: boolean }): Promise<void> {
    return this.importar(json, opciones);
  }
}

export class AlmacenLocal implements Almacen {
  readonly tipo = "local" as const;
  readonly errorAlmacen: boolean;

  constructor(errorAlmacen = false) {
    this.errorAlmacen = errorAlmacen;
  }

  #leer(): Sesion[] {
    try {
      const crudo = localStorage.getItem(CLAVE_LOCAL);
      return crudo ? (JSON.parse(crudo) as Sesion[]) : [];
    } catch {
      return [];
    }
  }

  async guardar(s: Sesion): Promise<void> {
    const todas = conservarLogros([...this.#leer(), s], TOPE_LOCAL);
    try {
      localStorage.setItem(CLAVE_LOCAL, JSON.stringify(todas));
    } catch {
      // Modo privado o cuota llena: se practica igual, sin histórico.
    }
  }

  async leerTodas(): Promise<Sesion[]> {
    return this.#leer();
  }

  async leerTeclas(): Promise<Map<string, EstadoTecla>> {
    try {
      const crudo = localStorage.getItem(CLAVE_TECLAS);
      return new Map(crudo ? (JSON.parse(crudo) as [string, EstadoTecla][]) : []);
    } catch {
      return new Map();
    }
  }

  async guardarTeclas(teclas: ReadonlyMap<string, EstadoTecla>): Promise<void> {
    try {
      localStorage.setItem(CLAVE_TECLAS, JSON.stringify([...teclas]));
    } catch { /* modo privado o cuota llena */ }
  }

  async borrarTodo(): Promise<void> {
    try {
      localStorage.removeItem(CLAVE_LOCAL);
      localStorage.removeItem(CLAVE_TECLAS);
    } catch { /* ignorado */ }
  }

  async exportar(): Promise<string> {
    const sesiones = await this.leerTodas();
    const teclas = await this.leerTeclas();
    const copia: CopiaSeguridad = {
      version: 1,
      creadaEn: new Date().toISOString(),
      sesiones,
      teclas: Object.fromEntries(teclas),
    };
    return JSON.stringify(copia, null, 2);
  }

  async exportarProgreso(): Promise<string> {
    return this.exportar();
  }

  async importar(json: string, opciones?: { reemplazar?: boolean }): Promise<void> {
    const { sesiones, teclas } = parsearCopiaSeguridad(json);
    const reemplazar = opciones?.reemplazar ?? true;

    if (reemplazar) {
      try {
        localStorage.setItem(CLAVE_LOCAL, JSON.stringify(conservarLogros(sesiones, TOPE_LOCAL)));
        localStorage.setItem(CLAVE_TECLAS, JSON.stringify([...teclas]));
      } catch { /* modo privado o cuota llena */ }
    } else {
      const existentes = this.#leer();
      const claves = new Set(existentes.map((s) => `${s.terminadaEn}|${s.leccion}`));
      const aAnadir = sesiones.filter((s) => !claves.has(`${s.terminadaEn}|${s.leccion}`));
      const unidas = conservarLogros([...existentes, ...aAnadir], TOPE_LOCAL);

      const teclasExistentes = await this.leerTeclas();
      for (const [code, val] of teclas) {
        const prev = teclasExistentes.get(code);
        if (!prev) {
          teclasExistentes.set(code, val);
        } else {
          teclasExistentes.set(code, {
            intentos: prev.intentos + val.intentos,
            aciertos: prev.aciertos + val.aciertos,
            msTotal: prev.msTotal + val.msTotal,
          });
        }
      }

      try {
        localStorage.setItem(CLAVE_LOCAL, JSON.stringify(unidas));
        localStorage.setItem(CLAVE_TECLAS, JSON.stringify([...teclasExistentes]));
      } catch { /* cuota llena */ }
    }
  }

  async importarProgreso(json: string, opciones?: { reemplazar?: boolean }): Promise<void> {
    return this.importar(json, opciones);
  }
}

/** Almacén que no guarda nada. Para tests y para entornos sin storage. */
export class AlmacenMemoria implements Almacen {
  readonly tipo = "local" as const;
  readonly errorAlmacen: boolean;
  #sesiones: Sesion[] = [];
  #teclas = new Map<string, EstadoTecla>();

  constructor(errorAlmacen = false) {
    this.errorAlmacen = errorAlmacen;
  }

  async guardar(s: Sesion): Promise<void> { this.#sesiones.push(s); }
  async leerTodas(): Promise<Sesion[]> { return [...this.#sesiones]; }
  async leerTeclas(): Promise<Map<string, EstadoTecla>> { return new Map(this.#teclas); }
  async guardarTeclas(t: ReadonlyMap<string, EstadoTecla>): Promise<void> {
    this.#teclas = new Map(t);
  }
  async borrarTodo(): Promise<void> { this.#sesiones = []; this.#teclas = new Map(); }

  async exportar(): Promise<string> {
    const copia: CopiaSeguridad = {
      version: 1,
      creadaEn: new Date().toISOString(),
      sesiones: [...this.#sesiones],
      teclas: Object.fromEntries(this.#teclas),
    };
    return JSON.stringify(copia, null, 2);
  }

  async exportarProgreso(): Promise<string> {
    return this.exportar();
  }

  async importar(json: string, opciones?: { reemplazar?: boolean }): Promise<void> {
    const { sesiones, teclas } = parsearCopiaSeguridad(json);
    const reemplazar = opciones?.reemplazar ?? true;

    if (reemplazar) {
      this.#sesiones = [...sesiones];
      this.#teclas = new Map(teclas);
    } else {
      const claves = new Set(this.#sesiones.map((s) => `${s.terminadaEn}|${s.leccion}`));
      for (const s of sesiones) {
        if (!claves.has(`${s.terminadaEn}|${s.leccion}`)) {
          this.#sesiones.push(s);
        }
      }
      for (const [code, val] of teclas) {
        const prev = this.#teclas.get(code);
        if (!prev) {
          this.#teclas.set(code, val);
        } else {
          this.#teclas.set(code, {
            intentos: prev.intentos + val.intentos,
            aciertos: prev.aciertos + val.aciertos,
            msTotal: prev.msTotal + val.msTotal,
          });
        }
      }
    }
  }

  async importarProgreso(json: string, opciones?: { reemplazar?: boolean }): Promise<void> {
    return this.importar(json, opciones);
  }
}

export async function abrirAlmacen(): Promise<Almacen> {
  let enEscritorio = false;
  try {
    const { isTauri } = await import("@tauri-apps/api/core");
    enEscritorio = isTauri();
    if (!enEscritorio) {
      errorAlmacen = false;
      return new AlmacenLocal(false);
    }

    const { default: Database } = await import("@tauri-apps/plugin-sql");
    const db = await Database.load("sqlite:libretype.db");
    errorAlmacen = false;
    return new AlmacenSqlite(db as unknown as DbSql);
  } catch (err) {
    console.warn("[libretype] SQLite no disponible, se usa localStorage:", err);
    errorAlmacen = enEscritorio;
    return new AlmacenLocal(enEscritorio);
  }
}
