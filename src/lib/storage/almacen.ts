/**
 * Dónde se guarda el progreso.
 *
 * Dos backends porque la app corre en dos sitios: `pnpm tauri:dev` (escritorio,
 * con SQLite) y `pnpm dev` (navegador, sin Tauri). Sin el segundo, desarrollar
 * el frontend en el navegador dejaría de funcionar.
 *
 * Si abrir SQLite falla, se cae a localStorage en vez de romper la app: perder
 * el histórico es malo, no poder practicar es peor.
 *
 * **Perfiles.** Un equipo de aula lo comparten varios alumnos, así que el
 * progreso, el dominio de teclas y las lecciones propias van por perfil. Las
 * preferencias no: son de este equipo y esta pantalla, y siguen en
 * `preferencias.ts`. Un perfil es un alias, sin contraseña ni edad; no son
 * privados entre sí y la interfaz lo dice. El almacén trabaja siempre sobre un
 * perfil activo (`usarPerfil`), y todo lo que había antes de que existieran es
 * del primero, que no se puede borrar.
 */
import type { EstadoTecla } from "../keyboard/dominio";
import {
  aplicarDeCopia, LIMITES, sanearLista, sanearLeccion, lapidaDe, type LeccionPropia,
} from "../lecciones/personalizadas";
import type { Sesion } from "./progreso";
import { conservarLogros } from "./objetivos";

export interface Perfil {
  id: number;
  alias: string;
  /** ISO 8601. */
  creadoEn: string;
}

/** El perfil al que pertenece todo lo que había antes de que existieran perfiles. */
export const PERFIL_PRINCIPAL = 1;
export const ALIAS_PRINCIPAL = "Principal";
/** Un nombre o un alias, no una frase. */
export const MAX_ALIAS = 40;
/** Un aula con holgura. Sin tope, la pantalla de «¿Quién practica?» no tendría fin. */
export const MAX_PERFILES = 60;

/** Sin espacios de más ni saltos de línea, y acotado. Lanza si se queda en nada. */
function aliasLimpio(alias: string): string {
  const limpio = [...alias.normalize("NFC").replace(/\s+/g, " ").trim()].slice(0, MAX_ALIAS).join("").trim();
  if (!limpio) throw new Error("Escribe un nombre o un alias para el perfil.");
  return limpio;
}

/** «Ana» y «ana » son la misma persona para quien busca su nombre en la lista. */
const mismoAlias = (a: string, b: string): boolean =>
  a.localeCompare(b, "es", { sensitivity: "base" }) === 0;

/** El perfil que se llama así, con la misma tolerancia que al crearlo. */
export function buscarPerfil(perfiles: readonly Perfil[], alias: string): Perfil | undefined {
  const buscado = alias.normalize("NFC").replace(/\s+/g, " ").trim();
  return perfiles.find((p) => mismoAlias(p.alias, buscado));
}

function aliasDisponible(alias: string, perfiles: readonly Perfil[], excepto?: number): string {
  const limpio = aliasLimpio(alias);
  if (perfiles.some((p) => p.id !== excepto && mismoAlias(p.alias, limpio))) {
    throw new Error(`Ya hay un perfil que se llama «${limpio}». Elige otro nombre.`);
  }
  return limpio;
}

function comprobarCupo(perfiles: readonly Perfil[]): void {
  if (perfiles.length >= MAX_PERFILES) {
    throw new Error(`Este equipo ya tiene ${MAX_PERFILES} perfiles, que es el máximo. Borra alguno que ya no se use.`);
  }
}

const NO_BORRAR_PRINCIPAL =
  "El primer perfil no se puede borrar. Puedes cambiarle el nombre o borrar su progreso.";

export interface Almacen {
  readonly tipo: "sqlite" | "local";
  /** Perfil cuyo progreso se lee y se escribe. */
  readonly perfil: number;
  /** Cambia de perfil. No comprueba que exista: quien llama acaba de listarlos. */
  usarPerfil(id: number): void;
  listarPerfiles(): Promise<Perfil[]>;
  /** Lanza con una frase legible si el alias está vacío, repetido o no caben más. */
  crearPerfil(alias: string): Promise<Perfil>;
  renombrarPerfil(id: number, alias: string): Promise<void>;
  /** Borra el perfil y todo lo suyo, lecciones incluidas. El principal no se puede borrar. */
  borrarPerfil(id: number): Promise<void>;
  /** Indica si falló la base de datos local en escritorio y se degradó a local. */
  readonly errorAlmacen?: boolean;
  /**
   * Sesiones recuperadas al abrir: las que se guardaron en el respaldo mientras
   * SQLite fallaba y ya están en la base de datos. Ver `traspasarRespaldo`.
   */
  readonly recuperadas?: number;
  guardar(s: Sesion): Promise<void>;
  leerTodas(): Promise<Sesion[]>;
  /** Dominio acumulado por tecla, para saber cuánta ayuda visual retirar. */
  leerTeclas(): Promise<Map<string, EstadoTecla>>;
  guardarTeclas(teclas: ReadonlyMap<string, EstadoTecla>): Promise<void>;
  /**
   * Borra sesiones, teclas y lápidas del perfil activo. Las lecciones
   * personalizadas vivas se quedan: son trabajo de alguien, no progreso
   * (`personalizadas.ts`).
   */
  borrarTodo(): Promise<void>;
  /** Lecciones personalizadas, lápidas incluidas y ya saneadas. */
  leerLecciones(): Promise<LeccionPropia[]>;
  /** Crea o sustituye. Lanza si no se pudo: es texto que alguien acaba de escribir. */
  guardarLeccion(l: LeccionPropia): Promise<void>;
  /** Deja la lápida: el nombre sigue, el texto no. */
  borrarLeccion(id: string, ahora: string): Promise<void>;
  /** Exporta el progreso completo del perfil activo a una cadena JSON. */
  exportar(): Promise<string>;
  /**
   * Trae una copia de seguridad en JSON. Por defecto **sustituye** sesiones y teclas
   * por las de la copia; con `combinar` las **junta** con lo que hay, sin duplicar
   * (ver `sesionesQueFaltan` y `combinarTeclas`). Las lecciones no se sustituyen en
   * ningún modo: se aplica la versión más reciente de cada una.
   */
  importar(json: string, modo?: ModoImportacion): Promise<ResultadoRestauracion>;
}

/**
 * `sustituir` es restaurar una copia; `combinar`, juntar la de otro equipo con lo
 * que hay en este. Combinar es idempotente: repetirlo con la misma copia no cambia
 * nada, y por eso sirve también para traspasar el respaldo local a SQLite.
 */
export type ModoImportacion = "sustituir" | "combinar";

export interface ResultadoRestauracion {
  /** Lecciones de la copia que no han cabido en el límite. */
  leccionesSinSitio: number;
  /** Al combinar: cuántas sesiones de la copia no estaban ya. */
  sesionesNuevas?: number;
}

/** Dos sesiones son la misma si coinciden en todo: la fecha lleva milisegundos. */
const claveSesion = (s: Sesion): string =>
  [s.terminadaEn, s.leccion, s.ppm, s.pctAcierto, s.aciertos, s.escritos, s.ms].join("\u0000");

/**
 * Las sesiones de una copia que no están ya entre las actuales, sin repetidas entre
 * sí. Es lo que hace que combinar dos veces la misma copia no duplique el historial.
 */
export function sesionesQueFaltan(actuales: readonly Sesion[], copia: readonly Sesion[]): Sesion[] {
  const vistas = new Set(actuales.map(claveSesion));
  const faltan: Sesion[] = [];
  for (const s of copia) {
    const clave = claveSesion(s);
    if (vistas.has(clave)) continue;
    vistas.add(clave);
    faltan.push(s);
  }
  return faltan;
}

/**
 * De cada tecla se queda el estado con más intentos, en vez de sumarlos. Sumar no
 * es posible sin saber qué sesión produjo cada intento: importar dos veces la misma
 * copia duplicaría intentos y aciertos y falsearía el dominio, y restaurar una copia
 * antigua del mismo alumno es el caso típico. Si las dos historias eran disjuntas se
 * infravalora el dominio, que es el lado seguro: una letra visible de más no
 * perjudica a nadie.
 */
export function combinarTeclas(
  actuales: ReadonlyMap<string, EstadoTecla>,
  copia: ReadonlyMap<string, EstadoTecla>,
): Map<string, EstadoTecla> {
  const m = new Map(actuales);
  for (const [code, e] of copia) {
    const previo = m.get(code);
    if (!previo || e.intentos > previo.intentos) m.set(code, e);
  }
  return m;
}

const porFecha = (a: Sesion, b: Sesion): number =>
  (a.terminadaEn < b.terminadaEn ? -1 : a.terminadaEn > b.terminadaEn ? 1 : 0);

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
  /**
   * Alias del perfil que se exportó, también opcional y sin subir la versión. No
   * se usa al importar (la copia entra en el perfil activo, se llame como se
   * llame): es para que el informe del docente sepa de quién es cada copia.
   */
  alias?: string;
}

/**
 * Claves del respaldo en navegador. El perfil principal usa las de siempre: así
 * lo que había antes de que existieran perfiles es suyo sin mover nada.
 */
const CLAVE_LOCAL = "libretype.sesiones";
const CLAVE_TECLAS = "libretype.teclas";
const CLAVE_LECCIONES = "libretype.lecciones";
const CLAVE_PERFILES = "libretype.perfiles";
const PREFIJO_PERFIL = "libretype.perfil.";

interface ClavesPerfil { sesiones: string; teclas: string; lecciones: string }

function clavesDe(perfil: number): ClavesPerfil {
  return perfil === PERFIL_PRINCIPAL
    ? { sesiones: CLAVE_LOCAL, teclas: CLAVE_TECLAS, lecciones: CLAVE_LECCIONES }
    : {
      sesiones: `${PREFIJO_PERFIL}${perfil}.sesiones`,
      teclas: `${PREFIJO_PERFIL}${perfil}.teclas`,
      lecciones: `${PREFIJO_PERFIL}${perfil}.lecciones`,
    };
}

function perfilValido(crudo: unknown): crudo is Perfil {
  if (typeof crudo !== "object" || crudo === null) return false;
  const p = crudo as Record<string, unknown>;
  return Number.isInteger(p.id) && (p.id as number) >= 1
    && typeof p.alias === "string" && p.alias.trim().length > 0
    && typeof p.creadoEn === "string";
}

/** El principal existe siempre, aunque nadie lo haya creado. */
const principalImplicito = (): Perfil => ({
  id: PERFIL_PRINCIPAL, alias: ALIAS_PRINCIPAL, creadoEn: new Date(0).toISOString(),
});
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
  /** De quién es la copia, si lo dice. */
  alias: string | null;
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

  let alias: string | null = null;
  if (typeof obj.alias === "string") {
    try { alias = aliasLimpio(obj.alias); } catch { alias = null; }
  }

  return { sesiones: sesionesValidas, teclas: teclasValidas, lecciones, alias };
}

function serializarCopia(
  sesiones: Sesion[],
  teclas: ReadonlyMap<string, EstadoTecla>,
  lecciones: LeccionPropia[],
  alias: string,
): string {
  const copia: CopiaSeguridad = {
    version: 1,
    creadaEn: new Date().toISOString(),
    sesiones,
    teclas: Object.fromEntries(teclas),
    lecciones,
    alias,
  };
  return JSON.stringify(copia, null, 2);
}

export class AlmacenSqlite implements Almacen {
  readonly tipo = "sqlite" as const;
  readonly errorAlmacen = false;
  recuperadas = 0;
  #db: DbSql;
  #restaurando = false;
  #perfil = PERFIL_PRINCIPAL;

  constructor(db: DbSql) { this.#db = db; }

  get perfil(): number { return this.#perfil; }
  usarPerfil(id: number): void { this.#perfil = id; }

  async listarPerfiles(): Promise<Perfil[]> {
    const filas = await this.#db.select<{ id: number; alias: string; creado_en: string }[]>(
      "SELECT id, alias, creado_en FROM perfiles ORDER BY id ASC",
    );
    return filas.map((f) => ({ id: f.id, alias: f.alias, creadoEn: f.creado_en }));
  }

  async crearPerfil(alias: string): Promise<Perfil> {
    const perfiles = await this.listarPerfiles();
    const limpio = aliasDisponible(alias, perfiles);
    comprobarCupo(perfiles);
    const creadoEn = new Date().toISOString();
    await this.#db.execute("INSERT INTO perfiles (alias, creado_en) VALUES ($1, $2)", [limpio, creadoEn]);
    const [fila] = await this.#db.select<{ id: number }[]>(
      "SELECT id FROM perfiles WHERE alias = $1 ORDER BY id DESC LIMIT 1", [limpio],
    );
    return { id: fila.id, alias: limpio, creadoEn };
  }

  async renombrarPerfil(id: number, alias: string): Promise<void> {
    const perfiles = await this.listarPerfiles();
    if (!perfiles.some((p) => p.id === id)) throw new Error("Ese perfil ya no existe.");
    await this.#db.execute(
      "UPDATE perfiles SET alias = $1 WHERE id = $2", [aliasDisponible(alias, perfiles, id), id],
    );
  }

  /**
   * Primero lo suyo y lo último la fila del perfil: si falla a medias, el perfil
   * sigue en la lista y borrarlo otra vez termina el trabajo.
   */
  async borrarPerfil(id: number): Promise<void> {
    if (id === PERFIL_PRINCIPAL) throw new Error(NO_BORRAR_PRINCIPAL);
    await this.#db.execute("DELETE FROM sesiones WHERE perfil = $1", [id]);
    await this.#db.execute("DELETE FROM teclas WHERE perfil = $1", [id]);
    await this.#db.execute("DELETE FROM lecciones_propias WHERE perfil = $1", [id]);
    await this.#db.execute("DELETE FROM perfiles WHERE id = $1", [id]);
    if (this.#perfil === id) this.#perfil = PERFIL_PRINCIPAL;
  }

  // El perfil va el último en todas las sentencias: los demás parámetros conservan
  // el número que tenían antes de que existieran perfiles.
  async guardar(s: Sesion): Promise<void> {
    await this.#db.execute(
      `INSERT INTO sesiones
         (leccion, ppm, pct_acierto, aciertos, escritos, ms, terminada_en, perfil)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [s.leccion, s.ppm, s.pctAcierto, s.aciertos, s.escritos, s.ms, s.terminadaEn, this.#perfil],
    );
  }

  async leerTodas(): Promise<Sesion[]> {
    const filas = await this.#db.select<FilaSql[]>(
      `SELECT leccion, ppm, pct_acierto, aciertos, escritos, ms, terminada_en
         FROM sesiones WHERE perfil = $1 ORDER BY terminada_en ASC`,
      [this.#perfil],
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
    >("SELECT code, intentos, aciertos, ms_total FROM teclas WHERE perfil = $1", [this.#perfil]);
    return new Map(filas.map((f) => [
      f.code,
      { intentos: f.intentos, aciertos: f.aciertos, msTotal: f.ms_total },
    ]));
  }

  async guardarTeclas(teclas: ReadonlyMap<string, EstadoTecla>): Promise<void> {
    for (const [code, e] of teclas) {
      await this.#db.execute(
        `INSERT INTO teclas (code, intentos, aciertos, ms_total, perfil)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT(perfil, code) DO UPDATE SET
           intentos = excluded.intentos,
           aciertos = excluded.aciertos,
           ms_total = excluded.ms_total`,
        [code, e.intentos, e.aciertos, e.msTotal, this.#perfil],
      );
    }
  }

  async borrarTodo(): Promise<void> {
    await this.#db.execute("DELETE FROM sesiones WHERE perfil = $1", [this.#perfil]);
    await this.#db.execute("DELETE FROM teclas WHERE perfil = $1", [this.#perfil]);
    await this.#db.execute(
      "DELETE FROM lecciones_propias WHERE perfil = $1 AND borrada_en IS NOT NULL", [this.#perfil],
    );
    await this.#db.execute("VACUUM");
  }

  async leerLecciones(): Promise<LeccionPropia[]> {
    try {
      const filas = await this.#db.select<FilaLeccionSql[]>(
        `SELECT id, titulo, descripcion, texto, creada_en, actualizada_en, borrada_en
           FROM lecciones_propias WHERE perfil = $1`,
        [this.#perfil],
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
         (id, titulo, descripcion, texto, creada_en, actualizada_en, borrada_en, perfil)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       ON CONFLICT(perfil, id) DO UPDATE SET
         titulo = excluded.titulo,
         descripcion = excluded.descripcion,
         texto = excluded.texto,
         creada_en = excluded.creada_en,
         actualizada_en = excluded.actualizada_en,
         borrada_en = excluded.borrada_en`,
      [l.id, l.titulo, l.descripcion, l.texto, l.creadaEn, l.actualizadaEn, l.borradaEn, this.#perfil],
    );
  }

  async borrarLeccion(id: string, ahora: string): Promise<void> {
    await this.#db.execute(
      `UPDATE lecciones_propias
          SET texto = '', descripcion = '', actualizada_en = $1, borrada_en = $2
        WHERE id = $3 AND perfil = $4`,
      [ahora, ahora, id, this.#perfil],
    );
  }

  async exportar(): Promise<string> {
    const alias = (await this.listarPerfiles()).find((p) => p.id === this.#perfil)?.alias ?? ALIAS_PRINCIPAL;
    return serializarCopia(await this.leerTodas(), await this.leerTeclas(), await this.leerLecciones(), alias);
  }


  async importar(json: string, modo: ModoImportacion = "sustituir"): Promise<ResultadoRestauracion> {
    const copia = parsearCopiaSeguridad(json);
    // Dos restauraciones intercaladas dejarían más filas de las que trae la copia.
    if (this.#restaurando) {
      throw new Error("Ya se está importando una copia de seguridad. Espera a que termine.");
    }
    this.#restaurando = true;
    try {
      if (modo === "combinar") {
        const sesionesNuevas = await this.#combinarProgreso(copia.sesiones, copia.teclas);
        return { ...(await this.#fundirLecciones(copia.lecciones)), sesionesNuevas };
      }
      await this.#sustituirProgreso(copia.sesiones, copia.teclas);
      return await this.#fundirLecciones(copia.lecciones);
    } finally {
      this.#restaurando = false;
    }
  }

  /**
   * Junta la copia con lo que hay. Dos sentencias, cada una atómica, y ninguna
   * borra nada: si la segunda falla, repetir la operación la completa sin duplicar,
   * porque las sesiones que ya entraron se reconocen y las teclas solo cambian a un
   * estado con más intentos.
   */
  async #combinarProgreso(sesiones: Sesion[], teclas: ReadonlyMap<string, EstadoTecla>): Promise<number> {
    const nuevas = sesionesQueFaltan(await this.leerTodas(), sesiones);
    try {
      if (nuevas.length > 0) {
        await this.#db.execute(
          `INSERT INTO sesiones
             (leccion, ppm, pct_acierto, aciertos, escritos, ms, terminada_en, perfil)
           SELECT json_extract(value, '$.leccion'), json_extract(value, '$.ppm'),
                  json_extract(value, '$.pctAcierto'), json_extract(value, '$.aciertos'),
                  json_extract(value, '$.escritos'), json_extract(value, '$.ms'),
                  json_extract(value, '$.terminadaEn'), $2
             FROM json_each($1)`,
          [JSON.stringify(nuevas), this.#perfil],
        );
      }
      await this.#db.execute(
        `INSERT INTO teclas (code, intentos, aciertos, ms_total, perfil)
         SELECT json_extract(value, '$.code'), json_extract(value, '$.intentos'),
                json_extract(value, '$.aciertos'), json_extract(value, '$.msTotal'), $2
           FROM json_each($1) WHERE true
         ON CONFLICT(perfil, code) DO UPDATE SET
           intentos = excluded.intentos,
           aciertos = excluded.aciertos,
           ms_total = excluded.ms_total
         WHERE excluded.intentos > teclas.intentos`,
        [JSON.stringify([...teclas].map(([code, e]) => ({ code, ...e }))), this.#perfil],
      );
    } catch (err) {
      console.warn("[libretype] no se pudo combinar la copia:", err);
      throw new Error(
        "No se ha podido combinar la copia entera. Lo que tenías sigue ahí, y puedes "
          + "probar otra vez sin miedo: lo que ya entró no se repite.",
      );
    }
    return nuevas.length;
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
    // El perfil se fija aquí: si alguien cambiase de perfil a media restauración,
    // el borrado final no puede irse al de otra persona.
    const perfil = this.#perfil;
    try {
      await this.#db.execute(
        `INSERT INTO sesiones
           (leccion, ppm, pct_acierto, aciertos, escritos, ms, terminada_en, perfil)
         SELECT json_extract(value, '$.leccion'), json_extract(value, '$.ppm'),
                json_extract(value, '$.pctAcierto'), json_extract(value, '$.aciertos'),
                json_extract(value, '$.escritos'), json_extract(value, '$.ms'),
                json_extract(value, '$.terminadaEn'), $2
           FROM json_each($1)`,
        [JSON.stringify(sesiones), perfil],
      );
      // El `WHERE true` lo exige SQLite: sin él, `ON` se leería como parte del `FROM`.
      await this.#db.execute(
        `INSERT INTO teclas (code, intentos, aciertos, ms_total, perfil)
         SELECT json_extract(value, '$.code'), json_extract(value, '$.intentos'),
                json_extract(value, '$.aciertos'), json_extract(value, '$.msTotal'), $2
           FROM json_each($1) WHERE true
         ON CONFLICT(perfil, code) DO UPDATE SET
           intentos = excluded.intentos,
           aciertos = excluded.aciertos,
           ms_total = excluded.ms_total`,
        [filasTeclas, perfil],
      );
      await this.#db.execute(
        `DELETE FROM teclas
          WHERE perfil = $2
            AND code NOT IN (SELECT json_extract(value, '$.code') FROM json_each($1))`,
        [filasTeclas, perfil],
      );
      await this.#db.execute("DELETE FROM sesiones WHERE id <= $1 AND perfil = $2", [tope, perfil]);
    } catch (err) {
      console.warn("[libretype] no se pudo restaurar la copia:", err);
      await this.#db.execute("DELETE FROM sesiones WHERE id > $1 AND perfil = $2", [tope, perfil]).catch((e: unknown) => {
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
  #perfil = PERFIL_PRINCIPAL;

  constructor(errorAlmacen = false) {
    this.errorAlmacen = errorAlmacen;
  }

  get perfil(): number { return this.#perfil; }
  usarPerfil(id: number): void { this.#perfil = id; }
  get #claves(): ClavesPerfil { return clavesDe(this.#perfil); }

  #leerPerfiles(): Perfil[] {
    let lista: Perfil[] = [];
    try {
      const datos: unknown = JSON.parse(localStorage.getItem(CLAVE_PERFILES) ?? "[]");
      if (Array.isArray(datos)) lista = datos.filter(perfilValido);
    } catch { /* ilegible: queda solo el principal */ }
    const unicos = new Map(lista.map((p) => [p.id, { id: p.id, alias: p.alias, creadoEn: p.creadoEn }]));
    if (!unicos.has(PERFIL_PRINCIPAL)) unicos.set(PERFIL_PRINCIPAL, principalImplicito());
    return [...unicos.values()].sort((a, b) => a.id - b.id);
  }

  /** Sin capturar: si no se puede escribir, quien pidió el cambio tiene que saberlo. */
  #escribirPerfiles(lista: Perfil[]): void {
    localStorage.setItem(CLAVE_PERFILES, JSON.stringify(lista));
  }

  async listarPerfiles(): Promise<Perfil[]> {
    return this.#leerPerfiles();
  }

  async crearPerfil(alias: string): Promise<Perfil> {
    const perfiles = this.#leerPerfiles();
    const limpio = aliasDisponible(alias, perfiles);
    comprobarCupo(perfiles);
    const nuevo: Perfil = {
      id: Math.max(...perfiles.map((p) => p.id)) + 1, alias: limpio, creadoEn: new Date().toISOString(),
    };
    this.#escribirPerfiles([...perfiles, nuevo]);
    return nuevo;
  }

  async renombrarPerfil(id: number, alias: string): Promise<void> {
    const perfiles = this.#leerPerfiles();
    if (!perfiles.some((p) => p.id === id)) throw new Error("Ese perfil ya no existe.");
    const limpio = aliasDisponible(alias, perfiles, id);
    this.#escribirPerfiles(perfiles.map((p) => (p.id === id ? { ...p, alias: limpio } : p)));
  }

  async borrarPerfil(id: number): Promise<void> {
    if (id === PERFIL_PRINCIPAL) throw new Error(NO_BORRAR_PRINCIPAL);
    for (const clave of Object.values(clavesDe(id))) localStorage.removeItem(clave);
    this.#escribirPerfiles(this.#leerPerfiles().filter((p) => p.id !== id));
    if (this.#perfil === id) this.#perfil = PERFIL_PRINCIPAL;
  }

  /**
   * Fila a fila: una dañada no puede llevarse el resto del histórico ni, sobre todo,
   * dejar la aplicación sin arrancar. Esto es también el respaldo del escritorio.
   */
  #leer(): Sesion[] {
    try {
      const datos: unknown = JSON.parse(localStorage.getItem(this.#claves.sesiones) ?? "[]");
      return Array.isArray(datos) ? datos.filter(sesionValida) : [];
    } catch {
      return [];
    }
  }

  async guardar(s: Sesion): Promise<void> {
    const todas = conservarLogros([...this.#leer(), s], TOPE_LOCAL);
    try {
      localStorage.setItem(this.#claves.sesiones, JSON.stringify(todas));
    } catch {
      // Modo privado o cuota llena: se practica igual, sin histórico.
    }
  }

  async leerTodas(): Promise<Sesion[]> {
    return this.#leer();
  }

  async leerTeclas(): Promise<Map<string, EstadoTecla>> {
    try {
      const datos: unknown = JSON.parse(localStorage.getItem(this.#claves.teclas) ?? "[]");
      if (!Array.isArray(datos)) return new Map();
      return new Map(datos.filter((f): f is [string, EstadoTecla] =>
        Array.isArray(f) && typeof f[0] === "string" && estadoTeclaValido(f[1])));
    } catch {
      return new Map();
    }
  }

  async guardarTeclas(teclas: ReadonlyMap<string, EstadoTecla>): Promise<void> {
    try {
      localStorage.setItem(this.#claves.teclas, JSON.stringify([...teclas]));
    } catch { /* modo privado o cuota llena */ }
  }

  async borrarTodo(): Promise<void> {
    try {
      localStorage.removeItem(this.#claves.sesiones);
      localStorage.removeItem(this.#claves.teclas);
      localStorage.setItem(
        this.#claves.lecciones,
        JSON.stringify(this.#leerLecciones().filter((l) => l.borradaEn === null)),
      );
    } catch { /* ignorado */ }
  }

  /**
   * Los perfiles que tienen algo guardado aquí, tengan o no fila en la lista. Lo
   * pregunta el traspaso a SQLite: en el escritorio esto solo es respaldo, y lo
   * que haya se escribió con el perfil que estaba activo cuando SQLite falló.
   */
  perfilesConDatos(): number[] {
    const ids = new Set<number>();
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const clave = localStorage.key(i) ?? "";
        if (clave === CLAVE_LOCAL || clave === CLAVE_TECLAS || clave === CLAVE_LECCIONES) {
          ids.add(PERFIL_PRINCIPAL);
        } else if (clave.startsWith(PREFIJO_PERFIL)) {
          const id = Number(clave.slice(PREFIJO_PERFIL.length).split(".")[0]);
          if (Number.isInteger(id) && id > PERFIL_PRINCIPAL) ids.add(id);
        }
      }
    } catch { /* sin acceso: como si no hubiera nada */ }
    return [...ids].sort((a, b) => a - b);
  }

  /** Quita todo lo del perfil activo, lecciones vivas incluidas: solo tras haberlo traspasado. */
  vaciar(): void {
    try {
      for (const c of Object.values(this.#claves)) localStorage.removeItem(c);
    } catch { /* si no se puede, el próximo traspaso lo vuelve a combinar sin duplicar */ }
  }

  /** Olvida la lista de perfiles del respaldo: los de verdad están en SQLite. */
  olvidarPerfiles(): void {
    try { localStorage.removeItem(CLAVE_PERFILES); } catch { /* nada que hacer */ }
  }

  #leerLecciones(): LeccionPropia[] {
    try {
      const crudo = localStorage.getItem(this.#claves.lecciones);
      return crudo ? sanearLista(JSON.parse(crudo)) : [];
    } catch {
      return [];
    }
  }

  /** Sin capturar a propósito: si no cabe, quien la escribió tiene que saberlo. */
  #escribirLecciones(lista: LeccionPropia[]): void {
    localStorage.setItem(this.#claves.lecciones, JSON.stringify(lista));
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
    const alias = this.#leerPerfiles().find((p) => p.id === this.#perfil)?.alias ?? ALIAS_PRINCIPAL;
    return serializarCopia(await this.leerTodas(), await this.leerTeclas(), await this.leerLecciones(), alias);
  }


  async importar(json: string, modo: ModoImportacion = "sustituir"): Promise<ResultadoRestauracion> {
    const copia = parsearCopiaSeguridad(json);
    const { lecciones } = copia;
    const combinar = modo === "combinar";
    const faltan = combinar ? sesionesQueFaltan(this.#leer(), copia.sesiones) : [];
    const sesiones = combinar ? [...this.#leer(), ...faltan].sort(porFecha) : copia.sesiones;
    const teclas = combinar ? combinarTeclas(await this.leerTeclas(), copia.teclas) : copia.teclas;
    const actuales = this.#leerLecciones();
    const { aEscribir, sinSitio } = aplicarDeCopia(actuales, lecciones);
    const ids = new Set(aEscribir.map((l) => l.id));
    const claves = this.#claves;
    const nuevos: [string, string][] = [
      [claves.sesiones, JSON.stringify(conservarLogros(sesiones, TOPE_LOCAL))],
      [claves.teclas, JSON.stringify([...teclas])],
      [claves.lecciones, JSON.stringify([...actuales.filter((l) => !ids.has(l.id)), ...aEscribir])],
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
    return combinar
      ? { leccionesSinSitio: sinSitio.length, sesionesNuevas: faltan.length }
      : { leccionesSinSitio: sinSitio.length };
  }
}

interface DatosPerfilMemoria {
  sesiones: Sesion[];
  teclas: Map<string, EstadoTecla>;
  lecciones: Map<string, LeccionPropia>;
}

/** Almacén que no guarda nada. Para tests y para entornos sin storage. */
export class AlmacenMemoria implements Almacen {
  readonly tipo = "local" as const;
  readonly errorAlmacen: boolean;
  #perfil = PERFIL_PRINCIPAL;
  #perfiles: Perfil[] = [principalImplicito()];
  #datos = new Map<number, DatosPerfilMemoria>();

  constructor(errorAlmacen = false) {
    this.errorAlmacen = errorAlmacen;
  }

  get perfil(): number { return this.#perfil; }
  usarPerfil(id: number): void { this.#perfil = id; }

  /** Lo del perfil activo; se crea vacío la primera vez que se toca. */
  get #mio(): DatosPerfilMemoria {
    let d = this.#datos.get(this.#perfil);
    if (!d) {
      d = { sesiones: [], teclas: new Map(), lecciones: new Map() };
      this.#datos.set(this.#perfil, d);
    }
    return d;
  }

  async listarPerfiles(): Promise<Perfil[]> { return this.#perfiles.map((p) => ({ ...p })); }

  async crearPerfil(alias: string): Promise<Perfil> {
    const limpio = aliasDisponible(alias, this.#perfiles);
    comprobarCupo(this.#perfiles);
    const nuevo: Perfil = {
      id: Math.max(...this.#perfiles.map((p) => p.id)) + 1, alias: limpio, creadoEn: new Date().toISOString(),
    };
    this.#perfiles.push(nuevo);
    return { ...nuevo };
  }

  async renombrarPerfil(id: number, alias: string): Promise<void> {
    if (!this.#perfiles.some((p) => p.id === id)) throw new Error("Ese perfil ya no existe.");
    const limpio = aliasDisponible(alias, this.#perfiles, id);
    this.#perfiles = this.#perfiles.map((p) => (p.id === id ? { ...p, alias: limpio } : p));
  }

  async borrarPerfil(id: number): Promise<void> {
    if (id === PERFIL_PRINCIPAL) throw new Error(NO_BORRAR_PRINCIPAL);
    this.#datos.delete(id);
    this.#perfiles = this.#perfiles.filter((p) => p.id !== id);
    if (this.#perfil === id) this.#perfil = PERFIL_PRINCIPAL;
  }

  async guardar(s: Sesion): Promise<void> { this.#mio.sesiones.push(s); }
  async leerTodas(): Promise<Sesion[]> { return [...this.#mio.sesiones]; }
  async leerTeclas(): Promise<Map<string, EstadoTecla>> { return new Map(this.#mio.teclas); }
  async guardarTeclas(t: ReadonlyMap<string, EstadoTecla>): Promise<void> {
    this.#mio.teclas = new Map(t);
  }
  async borrarTodo(): Promise<void> {
    const mio = this.#mio;
    mio.sesiones = [];
    mio.teclas = new Map();
    for (const [id, l] of mio.lecciones) if (l.borradaEn !== null) mio.lecciones.delete(id);
  }

  async leerLecciones(): Promise<LeccionPropia[]> { return [...this.#mio.lecciones.values()]; }
  async guardarLeccion(l: LeccionPropia): Promise<void> {
    const saneada = sanearLeccion(l);
    if (saneada) this.#mio.lecciones.set(saneada.id, saneada);
  }
  async borrarLeccion(id: string, ahora: string): Promise<void> {
    const l = this.#mio.lecciones.get(id);
    if (l) this.#mio.lecciones.set(id, lapidaDe(l, ahora));
  }

  async exportar(): Promise<string> {
    const alias = this.#perfiles.find((p) => p.id === this.#perfil)?.alias ?? ALIAS_PRINCIPAL;
    return serializarCopia([...this.#mio.sesiones], this.#mio.teclas, await this.leerLecciones(), alias);
  }


  async importar(json: string, modo: ModoImportacion = "sustituir"): Promise<ResultadoRestauracion> {
    const { sesiones, teclas, lecciones } = parsearCopiaSeguridad(json);
    const combinar = modo === "combinar";
    const mio = this.#mio;
    const faltan = combinar ? sesionesQueFaltan(mio.sesiones, sesiones) : [];
    mio.sesiones = combinar ? [...mio.sesiones, ...faltan].sort(porFecha) : [...sesiones];
    mio.teclas = combinar ? combinarTeclas(mio.teclas, teclas) : new Map(teclas);
    const { aEscribir, sinSitio } = aplicarDeCopia(await this.leerLecciones(), lecciones);
    for (const l of aEscribir) {
      mio.lecciones.set(l.id, l);
    }
    return combinar
      ? { leccionesSinSitio: sinSitio.length, sesionesNuevas: faltan.length }
      : { leccionesSinSitio: sinSitio.length };
  }
}

/**
 * Pasa a SQLite lo que se guardó en localStorage mientras SQLite falló.
 *
 * En el escritorio localStorage solo se usa de respaldo, así que si SQLite abre
 * y ahí hay algo, es práctica hecha durante un fallo: sin esto se quedaría en un
 * sitio que la aplicación ya no mira, y a todos los efectos se habría perdido.
 * Se combina (no duplica aunque se repita) y solo entonces se vacía el respaldo.
 *
 * Va perfil a perfil: el respaldo guardó cada cosa con el perfil que estaba
 * activo. Lo de un perfil que ya no existe en SQLite va al principal antes que
 * perderse. Si algo falla, o alguna lección no cabe, ese perfil del respaldo se
 * queda como está y se vuelve a intentar en el siguiente arranque. Nunca lanza:
 * no poder traspasar no puede impedir practicar. Devuelve cuántas sesiones se
 * han recuperado.
 */
export async function traspasarRespaldo(
  destino: Almacen,
  respaldo: AlmacenLocal = new AlmacenLocal(),
): Promise<number> {
  const activo = destino.perfil;
  let recuperadas = 0;
  let pendientes = false;
  try {
    const conDatos = respaldo.perfilesConDatos();
    if (conDatos.length === 0) return 0;
    const existentes = new Set((await destino.listarPerfiles()).map((p) => p.id));
    for (const id of conDatos) {
      try {
        respaldo.usarPerfil(id);
        destino.usarPerfil(existentes.has(id) ? id : PERFIL_PRINCIPAL);
        const r = await destino.importar(await respaldo.exportar(), "combinar");
        if (r.leccionesSinSitio === 0) respaldo.vaciar();
        else pendientes = true;
        recuperadas += r.sesionesNuevas ?? 0;
      } catch (err) {
        pendientes = true;
        console.warn("[libretype] no se pudo traspasar el respaldo local:", err);
      }
    }
    if (!pendientes) respaldo.olvidarPerfiles();
  } catch (err) {
    console.warn("[libretype] no se pudo traspasar el respaldo local:", err);
  } finally {
    destino.usarPerfil(activo);
  }
  return recuperadas;
}

export async function abrirAlmacen(): Promise<Almacen> {
  let enEscritorio = false;
  try {
    const { isTauri } = await import("@tauri-apps/api/core");
    enEscritorio = isTauri();
    if (!enEscritorio) return new AlmacenLocal(false);

    const { default: Database } = await import("@tauri-apps/plugin-sql");
    const db = await Database.load("sqlite:libretype.db");
    const almacen = new AlmacenSqlite(db as unknown as DbSql);
    almacen.recuperadas = await traspasarRespaldo(almacen);
    return almacen;
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
    if (almacen.tipo === "sqlite") {
      // En el respaldo, con el mismo perfil: así el traspaso sabrá de quién es.
      const respaldo = new AlmacenLocal(true);
      respaldo.usarPerfil(almacen.perfil);
      return cargarDatos(respaldo);
    }
    return { almacen, sesiones: [], propias: [], teclas: new Map() };
  }
}
