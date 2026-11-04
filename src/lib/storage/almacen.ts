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
import {
  aplicarDeCopia, LIMITES, sanearLista, sanearLeccion, lapidaDe, type LeccionPropia,
} from "../lecciones/personalizadas";
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
  /**
   * Borra sesiones, teclas y lápidas. Las lecciones personalizadas vivas se
   * quedan: son trabajo de alguien, no progreso (`personalizadas.ts`).
   */
  borrarTodo(): Promise<void>;
  /** Lecciones personalizadas, lápidas incluidas y ya saneadas. */
  leerLecciones(): Promise<LeccionPropia[]>;
  /** Crea o sustituye. Lanza si no se pudo: es texto que alguien acaba de escribir. */
  guardarLeccion(l: LeccionPropia): Promise<void>;
  /** Deja la lápida: el nombre sigue, el texto no. */
  borrarLeccion(id: string, ahora: string): Promise<void>;
  /** Exporta el progreso completo a una cadena JSON. */
  exportar(): Promise<string>;
  /**
   * Sustituye sesiones y teclas por las de una copia de seguridad en JSON. Las
   * lecciones no se sustituyen: se aplica la versión más reciente de cada una.
   */
  importar(json: string): Promise<ResultadoRestauracion>;
}

export interface ResultadoRestauracion {
  /** Lecciones de la copia que no han cabido en el límite. */
  leccionesSinSitio: number;
}

export interface CopiaSeguridad {
  version: number;
  creadaEn: string;
  sesiones: Sesion[];
  teclas: Record<string, EstadoTecla>;
  /**
   * Añadido sin subir la versión: es opcional y una copia sin él se lee igual.
   * Con lápidas, para que el histórico restaurado conserve sus nombres.
   */
  lecciones?: LeccionPropia[];
}

const CLAVE_LOCAL = "libretype.sesiones";
const CLAVE_TECLAS = "libretype.teclas";
const CLAVE_LECCIONES = "libretype.lecciones";
/** Tope del respaldo en navegador; localStorage no es para histórico infinito. */
const TOPE_LOCAL = 500;

/** Lo que usamos de `Database` de tauri-plugin-sql. */
export interface DbSql {
  execute(query: string, valores?: unknown[]): Promise<unknown>;
  select<T>(query: string, valores?: unknown[]): Promise<T>;
}

interface FilaLeccionSql {
  id: string;
  titulo: string;
  descripcion: string;
  texto: string;
  creada_en: string;
  actualizada_en: string;
  borrada_en: string | null;
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

const numeroValido = (n: unknown): n is number => Number.isFinite(n) && (n as number) >= 0;

/** Lo que `progreso.ts` da por hecho al agregar: fecha ISO incluida, porque agrupa por sus diez primeros caracteres. */
function sesionValida(crudo: unknown): crudo is Sesion {
  if (typeof crudo !== "object" || crudo === null) return false;
  const s = crudo as Record<string, unknown>;
  return typeof s.leccion === "string"
    && numeroValido(s.ppm)
    && numeroValido(s.pctAcierto)
    && numeroValido(s.aciertos)
    && numeroValido(s.escritos)
    && numeroValido(s.ms)
    && typeof s.terminadaEn === "string"
    && /^\d{4}-\d{2}-\d{2}/.test(s.terminadaEn)
    && Number.isFinite(Date.parse(s.terminadaEn));
}

function estadoTeclaValido(crudo: unknown): crudo is EstadoTecla {
  if (typeof crudo !== "object" || crudo === null) return false;
  const e = crudo as Record<string, unknown>;
  return numeroValido(e.intentos) && numeroValido(e.aciertos) && numeroValido(e.msTotal);
}

/**
 * Valida y parsea el contenido JSON de una copia de seguridad.
 * Lanza un error descriptivo en español si el formato o los campos son inválidos.
 */
export function parsearCopiaSeguridad(json: string): {
  sesiones: Sesion[];
  teclas: Map<string, EstadoTecla>;
  lecciones: LeccionPropia[];
} {
  let datos: unknown;
  try {
    datos = JSON.parse(json);
  } catch {
    throw new Error("Este fichero no se puede leer: no es una copia de seguridad de LibreType.");
  }

  if (!datos || typeof datos !== "object") {
    throw new Error("Este fichero no se puede leer: no es una copia de seguridad de LibreType.");
  }

  const obj = datos as Record<string, unknown>;

  if (!Array.isArray(obj.sesiones)) {
    throw new Error("Esta copia de seguridad no trae la lista de sesiones, así que no se ha importado.");
  }

  const sesionesValidas: Sesion[] = [];
  for (const s of obj.sesiones) {
    if (!sesionValida(s)) {
      throw new Error("Alguna sesión de esta copia de seguridad está dañada, así que no se ha importado.");
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
    const entradas: unknown[] = Array.isArray(obj.teclas)
      ? obj.teclas
      : Object.entries(obj.teclas as Record<string, unknown>);

    for (const entrada of entradas) {
      if (!Array.isArray(entrada) || entrada.length !== 2) {
        throw new Error("Los datos de alguna tecla en esta copia de seguridad están dañados, así que no se ha importado.");
      }
      const [code, val] = entrada as [unknown, unknown];
      if (typeof code !== "string" || !estadoTeclaValido(val)) {
        throw new Error(`Los datos de la tecla «${code}» en esta copia de seguridad están dañados, así que no se ha importado.`);
      }
      teclasValidas.set(code, {
        intentos: val.intentos,
        aciertos: val.aciertos,
        msTotal: val.msTotal,
      });
    }
  }

  const lecciones = sanearLista(obj.lecciones);
  const distintas = new Set(sesionesValidas.map((s) => s.leccion)).size;
  if (Math.max(distintas, teclasValidas.size, lecciones.length) > LIMITES.copiaIdentificadores) {
    throw new Error("Esta copia de seguridad trae muchas más lecciones o teclas de las que salen practicando, así que no se ha importado.");
  }

  return { sesiones: sesionesValidas, teclas: teclasValidas, lecciones };
}

function serializarCopia(
  sesiones: Sesion[],
  teclas: ReadonlyMap<string, EstadoTecla>,
  lecciones: LeccionPropia[],
): string {
  const copia: CopiaSeguridad = {
    version: 1,
    creadaEn: new Date().toISOString(),
    sesiones,
    teclas: Object.fromEntries(teclas),
    lecciones,
  };
  return JSON.stringify(copia, null, 2);
}

export class AlmacenSqlite implements Almacen {
  readonly tipo = "sqlite" as const;
  readonly errorAlmacen = false;
  #db: DbSql;
  #restaurando = false;

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
    await this.#db.execute("DELETE FROM lecciones_propias WHERE borrada_en IS NOT NULL");
    await this.#db.execute("VACUUM");
  }

  async leerLecciones(): Promise<LeccionPropia[]> {
    try {
      const filas = await this.#db.select<FilaLeccionSql[]>(
        `SELECT id, titulo, descripcion, texto, creada_en, actualizada_en, borrada_en
           FROM lecciones_propias`,
      );
      return sanearLista(filas.map((f) => ({
        id: f.id,
        titulo: f.titulo,
        descripcion: f.descripcion,
        texto: f.texto,
        creadaEn: f.creada_en,
        actualizadaEn: f.actualizada_en,
        borradaEn: f.borrada_en,
      })));
    } catch (err) {
      // Que falle esto no puede impedir practicar el temario.
      console.warn("[libretype] no se pudieron leer las lecciones propias:", err);
      return [];
    }
  }

  async guardarLeccion(l: LeccionPropia): Promise<void> {
    await this.#db.execute(
      `INSERT INTO lecciones_propias
         (id, titulo, descripcion, texto, creada_en, actualizada_en, borrada_en)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT(id) DO UPDATE SET
         titulo = excluded.titulo,
         descripcion = excluded.descripcion,
         texto = excluded.texto,
         creada_en = excluded.creada_en,
         actualizada_en = excluded.actualizada_en,
         borrada_en = excluded.borrada_en`,
      [l.id, l.titulo, l.descripcion, l.texto, l.creadaEn, l.actualizadaEn, l.borradaEn],
    );
  }

  async borrarLeccion(id: string, ahora: string): Promise<void> {
    await this.#db.execute(
      `UPDATE lecciones_propias
          SET texto = '', descripcion = '', actualizada_en = $1, borrada_en = $2
        WHERE id = $3`,
      [ahora, ahora, id],
    );
  }

  async exportar(): Promise<string> {
    return serializarCopia(await this.leerTodas(), await this.leerTeclas(), await this.leerLecciones());
  }


  async importar(json: string): Promise<ResultadoRestauracion> {
    const copia = parsearCopiaSeguridad(json);
    // Dos restauraciones intercaladas dejarían más filas de las que trae la copia.
    if (this.#restaurando) {
      throw new Error("Ya se está importando una copia de seguridad. Espera a que termine.");
    }
    this.#restaurando = true;
    try {
      await this.#sustituirProgreso(copia.sesiones, copia.teclas);
      return await this.#fundirLecciones(copia.lecciones);
    } finally {
      this.#restaurando = false;
    }
  }

  /**
   * Sin `BEGIN`: `tauri-plugin-sql` reparte cada llamada por un pool de conexiones, y
   * nada asegura que un `COMMIT` llegue a la misma que el `BEGIN`. Lo que sí es
   * atómico en SQLite es una sentencia, así que cada tabla se escribe de una sola
   * vez desde JSON (`json_each`) y lo antiguo se borra lo último: si falla a medias,
   * disco lleno por ejemplo, el historial sigue como estaba.
   *
   * Queda un hueco: un cierre brusco justo antes del último `DELETE` deja las dos
   * cosas, la antigua y la copia. Son milisegundos, frente a una inserción por sesión
   * de antes, y volver a importar lo arregla.
   */
  async #sustituirProgreso(sesiones: Sesion[], teclas: ReadonlyMap<string, EstadoTecla>): Promise<void> {
    const [{ tope }] = await this.#db.select<{ tope: number }[]>(
      "SELECT COALESCE(MAX(id), 0) AS tope FROM sesiones",
    );
    const filasTeclas = JSON.stringify([...teclas].map(([code, e]) => ({ code, ...e })));
    try {
      await this.#db.execute(
        `INSERT INTO sesiones
           (leccion, ppm, pct_acierto, aciertos, escritos, ms, terminada_en)
         SELECT json_extract(value, '$.leccion'), json_extract(value, '$.ppm'),
                json_extract(value, '$.pctAcierto'), json_extract(value, '$.aciertos'),
                json_extract(value, '$.escritos'), json_extract(value, '$.ms'),
                json_extract(value, '$.terminadaEn')
           FROM json_each($1)`,
        [JSON.stringify(sesiones)],
      );
      // El `WHERE true` lo exige SQLite: sin él, `ON` se leería como parte del `FROM`.
      await this.#db.execute(
        `INSERT INTO teclas (code, intentos, aciertos, ms_total)
         SELECT json_extract(value, '$.code'), json_extract(value, '$.intentos'),
                json_extract(value, '$.aciertos'), json_extract(value, '$.msTotal')
           FROM json_each($1) WHERE true
         ON CONFLICT(code) DO UPDATE SET
           intentos = excluded.intentos,
           aciertos = excluded.aciertos,
           ms_total = excluded.ms_total`,
        [filasTeclas],
      );
      await this.#db.execute(
        `DELETE FROM teclas
          WHERE code NOT IN (SELECT json_extract(value, '$.code') FROM json_each($1))`,
        [filasTeclas],
      );
      await this.#db.execute("DELETE FROM sesiones WHERE id <= $1", [tope]);
    } catch (err) {
      console.warn("[libretype] no se pudo restaurar la copia:", err);
      await this.#db.execute("DELETE FROM sesiones WHERE id > $1", [tope]).catch((e: unknown) => {
        console.warn("[libretype] no se pudo deshacer la restauración:", e);
      });
      throw new Error(
        "No se ha podido importar la copia de seguridad. Tu historial sigue como estaba. "
          + "Si el disco está lleno, libera algo de espacio y prueba otra vez.",
      );
    }
  }

  /** Se funden con las que hay, fila a fila: repetir la importación no daña nada. */
  async #fundirLecciones(lecciones: LeccionPropia[]): Promise<ResultadoRestauracion> {
    try {
      const { aEscribir, sinSitio } = aplicarDeCopia(await this.leerLecciones(), lecciones);
      for (const l of aEscribir) {
        await this.guardarLeccion(l);
      }
      return { leccionesSinSitio: sinSitio.length };
    } catch (err) {
      console.warn("[libretype] no se pudieron restaurar las lecciones:", err);
      throw new Error(
        "Se ha importado tu progreso, pero no todas tus lecciones. Prueba a importar la copia otra vez.",
      );
    }
  }
}

export class AlmacenLocal implements Almacen {
  readonly tipo = "local" as const;
  readonly errorAlmacen: boolean;

  constructor(errorAlmacen = false) {
    this.errorAlmacen = errorAlmacen;
  }

  /**
   * Fila a fila: una dañada no puede llevarse el resto del histórico ni, sobre todo,
   * dejar la aplicación sin arrancar. Esto es también el respaldo del escritorio.
   */
  #leer(): Sesion[] {
    try {
      const datos: unknown = JSON.parse(localStorage.getItem(CLAVE_LOCAL) ?? "[]");
      return Array.isArray(datos) ? datos.filter(sesionValida) : [];
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
      const datos: unknown = JSON.parse(localStorage.getItem(CLAVE_TECLAS) ?? "[]");
      if (!Array.isArray(datos)) return new Map();
      return new Map(datos.filter((f): f is [string, EstadoTecla] =>
        Array.isArray(f) && typeof f[0] === "string" && estadoTeclaValido(f[1])));
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
      localStorage.setItem(
        CLAVE_LECCIONES,
        JSON.stringify(this.#leerLecciones().filter((l) => l.borradaEn === null)),
      );
    } catch { /* ignorado */ }
  }

  #leerLecciones(): LeccionPropia[] {
    try {
      const crudo = localStorage.getItem(CLAVE_LECCIONES);
      return crudo ? sanearLista(JSON.parse(crudo)) : [];
    } catch {
      return [];
    }
  }

  /** Sin capturar a propósito: si no cabe, quien la escribió tiene que saberlo. */
  #escribirLecciones(lista: LeccionPropia[]): void {
    localStorage.setItem(CLAVE_LECCIONES, JSON.stringify(lista));
  }

  async leerLecciones(): Promise<LeccionPropia[]> {
    return this.#leerLecciones();
  }

  async guardarLeccion(l: LeccionPropia): Promise<void> {
    this.#escribirLecciones([...this.#leerLecciones().filter((x) => x.id !== l.id), l]);
  }

  async borrarLeccion(id: string, ahora: string): Promise<void> {
    this.#escribirLecciones(
      this.#leerLecciones().map((l) => (l.id === id ? lapidaDe(l, ahora) : l)),
    );
  }

  async exportar(): Promise<string> {
    return serializarCopia(await this.leerTodas(), await this.leerTeclas(), await this.leerLecciones());
  }


  async importar(json: string): Promise<ResultadoRestauracion> {
    const { sesiones, teclas, lecciones } = parsearCopiaSeguridad(json);
    const actuales = this.#leerLecciones();
    const { aEscribir, sinSitio } = aplicarDeCopia(actuales, lecciones);
    const ids = new Set(aEscribir.map((l) => l.id));
    const nuevos: [string, string][] = [
      [CLAVE_LOCAL, JSON.stringify(conservarLogros(sesiones, TOPE_LOCAL))],
      [CLAVE_TECLAS, JSON.stringify([...teclas])],
      [CLAVE_LECCIONES, JSON.stringify([...actuales.filter((l) => !ids.has(l.id)), ...aEscribir])],
    ];
    // Todo o nada: decir «importada» sin haberla escrito, o mezclar la mitad de la
    // copia con la mitad de lo que había, sería peor que no importar.
    const previos = nuevos.map(([clave]) => [clave, localStorage.getItem(clave)] as const);
    try {
      for (const [clave, valor] of nuevos) localStorage.setItem(clave, valor);
    } catch {
      for (const [clave, valor] of previos) {
        try {
          if (valor === null) localStorage.removeItem(clave);
          else localStorage.setItem(clave, valor);
        } catch { /* Lo anterior ya cabía; si ni eso se puede, no hay nada más que hacer. */ }
      }
      throw new Error("Esta copia no cabe en el espacio de este equipo. No se ha cambiado nada de lo que tenías.");
    }
    return { leccionesSinSitio: sinSitio.length };
  }
}

/** Almacén que no guarda nada. Para tests y para entornos sin storage. */
export class AlmacenMemoria implements Almacen {
  readonly tipo = "local" as const;
  readonly errorAlmacen: boolean;
  #sesiones: Sesion[] = [];
  #teclas = new Map<string, EstadoTecla>();
  #lecciones = new Map<string, LeccionPropia>();

  constructor(errorAlmacen = false) {
    this.errorAlmacen = errorAlmacen;
  }

  async guardar(s: Sesion): Promise<void> { this.#sesiones.push(s); }
  async leerTodas(): Promise<Sesion[]> { return [...this.#sesiones]; }
  async leerTeclas(): Promise<Map<string, EstadoTecla>> { return new Map(this.#teclas); }
  async guardarTeclas(t: ReadonlyMap<string, EstadoTecla>): Promise<void> {
    this.#teclas = new Map(t);
  }
  async borrarTodo(): Promise<void> {
    this.#sesiones = [];
    this.#teclas = new Map();
    for (const [id, l] of this.#lecciones) if (l.borradaEn !== null) this.#lecciones.delete(id);
  }

  async leerLecciones(): Promise<LeccionPropia[]> { return [...this.#lecciones.values()]; }
  async guardarLeccion(l: LeccionPropia): Promise<void> {
    const saneada = sanearLeccion(l);
    if (saneada) this.#lecciones.set(saneada.id, saneada);
  }
  async borrarLeccion(id: string, ahora: string): Promise<void> {
    const l = this.#lecciones.get(id);
    if (l) this.#lecciones.set(id, lapidaDe(l, ahora));
  }

  async exportar(): Promise<string> {
    return serializarCopia([...this.#sesiones], this.#teclas, await this.leerLecciones());
  }


  async importar(json: string): Promise<ResultadoRestauracion> {
    const { sesiones, teclas, lecciones } = parsearCopiaSeguridad(json);
    this.#sesiones = [...sesiones];
    this.#teclas = new Map(teclas);
    const { aEscribir, sinSitio } = aplicarDeCopia(await this.leerLecciones(), lecciones);
    for (const l of aEscribir) {
      this.#lecciones.set(l.id, l);
    }
    return { leccionesSinSitio: sinSitio.length };
  }
}

export async function abrirAlmacen(): Promise<Almacen> {
  let enEscritorio = false;
  try {
    const { isTauri } = await import("@tauri-apps/api/core");
    enEscritorio = isTauri();
    if (!enEscritorio) return new AlmacenLocal(false);

    const { default: Database } = await import("@tauri-apps/plugin-sql");
    const db = await Database.load("sqlite:libretype.db");
    return new AlmacenSqlite(db as unknown as DbSql);
  } catch (err) {
    console.warn("[libretype] SQLite no disponible, se usa localStorage:", err);
    return new AlmacenLocal(enEscritorio);
  }
}

export interface DatosGuardados {
  /** Puede no ser el que se pidió: ver `cargarDatos`. */
  almacen: Almacen;
  sesiones: Sesion[];
  propias: LeccionPropia[];
  teclas: Map<string, EstadoTecla>;
}

/**
 * Todo lo que hace falta para arrancar, y nunca lanza: si no se puede leer el
 * progreso se practica sin él. Si lo que falla es SQLite se sigue en el respaldo,
 * igual que si no se hubiera podido abrir, para que el aviso de Progreso diga la
 * verdad y lo nuevo no se pierda.
 */
export async function cargarDatos(almacen: Almacen): Promise<DatosGuardados> {
  try {
    return {
      almacen,
      sesiones: await almacen.leerTodas(),
      propias: await almacen.leerLecciones(),
      teclas: await almacen.leerTeclas(),
    };
  } catch (err) {
    console.warn("[libretype] no se pudo leer el progreso:", err);
    if (almacen.tipo === "sqlite") return cargarDatos(new AlmacenLocal(true));
    return { almacen, sesiones: [], propias: [], teclas: new Map() };
  }
}
