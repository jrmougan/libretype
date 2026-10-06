/**
 * Dónde se guarda el progreso.
 *
 * Dos backends porque la app corre en dos sitios: `pnpm tauri:dev` (escritorio,
 * con SQLite) y `pnpm dev` (navegador, sin Tauri). Sin el segundo, desarrollar
 * el frontend en el navegador dejaría de funcionar.
 *
 * Si abrir SQLite falla, se cae a localStorage en vez de romper la app: perder
 * el histórico es malo, no poder practicar es peor. Y cuando SQLite vuelve, lo
 * que se guardó mientras tanto se traspasa (`reconciliarRespaldoLocal`).
 *
 * **Perfiles.** Un equipo de aula lo comparten varios alumnos, así que el
 * progreso y el dominio de teclas van por perfil. Las preferencias no: son de
 * este equipo y esta pantalla, y siguen en `preferencias.ts`. Un perfil es un
 * alias, sin contraseña y sin edad. No son privados entre sí, y la interfaz lo
 * dice: cualquiera que use el equipo puede abrir cualquier perfil.
 *
 * **Importar.** Hay dos modos y los dos se escriben de una vez:
 *
 * - *Reemplazar* borra el progreso del perfil y pone el de la copia. Se valida
 *   la copia entera antes de tocar nada, y la escritura es atómica: en SQLite,
 *   un único lote dentro de una transacción; en localStorage, con vuelta atrás
 *   si falla la segunda escritura.
 * - *Combinar* es idempotente: importar dos veces la misma copia deja lo mismo
 *   que importarla una. Las sesiones se identifican por fecha y lección. Las
 *   teclas son contadores acumulados sin rastro de qué sesión los produjo, así
 *   que sumarlos duplicaría lo que ya estaba (el caso típico es restaurar una
 *   copia antigua del mismo alumno, que es un subconjunto de lo que hay). Por
 *   eso se queda, tecla a tecla, el estado con más intentos. Si las dos copias
 *   tenían historias disjuntas, se infravalora el dominio: la ayuda visual tarda
 *   un poco más en retirarse, que es el lado seguro del error.
 */
import type { EstadoTecla } from "../keyboard/dominio";
import type { Sesion } from "./progreso";
import { conservarLogros } from "./objetivos";

export interface Perfil {
  id: number;
  /** Cómo se llama en pantalla. Un alias, no un nombre real obligatorio. */
  alias: string;
  /** ISO 8601. */
  creadoEn: string;
}

/** El perfil al que pertenece todo lo que había antes de que existieran perfiles. */
export const PERFIL_PRINCIPAL = 1;
export const ALIAS_PRINCIPAL = "Principal";
/** Largo máximo de un alias: tiene que caber en un botón al 200%. */
export const MAX_ALIAS = 40;

/**
 * Versión del formato de copia. La 1 no llevaba perfil; la 2 lleva el alias,
 * que es lo que permite juntar varias copias en el informe del docente.
 */
export const VERSION_COPIA = 2;

export interface DatosImportados {
  sesiones: Sesion[];
  teclas: Map<string, EstadoTecla>;
}

export interface CopiaLeida extends DatosImportados {
  version: number;
  /** Alias del perfil que se exportó. Las copias de la versión 1 no lo traen. */
  alias?: string;
  creadaEn?: string;
}

export interface OpcionesImportar {
  /** Por defecto `true`: la copia sustituye al progreso del perfil activo. */
  reemplazar?: boolean;
}

export interface Almacen {
  readonly tipo: "sqlite" | "local";
  /** Indica si falló la base de datos local en escritorio y se degradó a local. */
  readonly errorAlmacen?: boolean;
  /** Perfil cuyo progreso se lee y se escribe. */
  readonly perfil: number;
  usarPerfil(id: number): void;
  listarPerfiles(): Promise<Perfil[]>;
  crearPerfil(alias: string): Promise<Perfil>;
  renombrarPerfil(id: number, alias: string): Promise<void>;
  /** Borra el perfil y todo su progreso. El principal no se puede borrar. */
  borrarPerfil(id: number): Promise<void>;
  guardar(s: Sesion): Promise<void>;
  leerTodas(): Promise<Sesion[]>;
  /** Dominio acumulado por tecla, para saber cuánta ayuda visual retirar. */
  leerTeclas(): Promise<Map<string, EstadoTecla>>;
  guardarTeclas(teclas: ReadonlyMap<string, EstadoTecla>): Promise<void>;
  /** Borra el progreso del perfil activo. */
  borrarTodo(): Promise<void>;
  /** Exporta el progreso del perfil activo a una cadena JSON. */
  exportar(): Promise<string>;
  exportarProgreso(): Promise<string>;
  /** Importa sesiones y estado de teclas desde una cadena JSON al perfil activo. */
  importar(json: string, opciones?: OpcionesImportar): Promise<void>;
  importarProgreso(json: string, opciones?: OpcionesImportar): Promise<void>;
  /** Lo mismo que `importar`, con la copia ya validada. */
  importarDatos(datos: DatosImportados, opciones?: OpcionesImportar): Promise<void>;
}

export interface CopiaSeguridad {
  version: number;
  creadaEn: string;
  perfil?: { alias: string };
  sesiones: Sesion[];
  teclas: Record<string, EstadoTecla>;
}

/**
 * Claves del respaldo en navegador. El perfil principal usa las de siempre: así
 * lo que ya había es suyo sin mover un byte, y una versión anterior de la app
 * sigue leyéndolo si alguien vuelve atrás.
 */
const CLAVE_LOCAL = "libretype.sesiones";
const CLAVE_TECLAS = "libretype.teclas";
const CLAVE_PERFILES = "libretype.perfiles";
const PREFIJO_PERFIL = "libretype.perfil.";
/** Tope del respaldo en navegador; localStorage no es para histórico infinito. */
const TOPE_LOCAL = 500;

function clavesDe(perfil: number): { sesiones: string; teclas: string } {
  return perfil === PERFIL_PRINCIPAL
    ? { sesiones: CLAVE_LOCAL, teclas: CLAVE_TECLAS }
    : { sesiones: `${PREFIJO_PERFIL}${perfil}.sesiones`, teclas: `${PREFIJO_PERFIL}${perfil}.teclas` };
}

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

const esNumero = (n: unknown): n is number => typeof n === "number" && Number.isFinite(n);
const esCuenta = (n: unknown): n is number => esNumero(n) && n >= 0;
const esTexto = (s: unknown): s is string => typeof s === "string" && !s.includes("\u0000");

/**
 * Deja un alias presentable: sin espacios de sobra y con un largo que quepa en
 * pantalla. Lanza si queda vacío.
 */
export function normalizarAlias(alias: string): string {
  const limpio = alias.replace(/\s+/g, " ").trim().slice(0, MAX_ALIAS).trim();
  if (!limpio) throw new Error("Escribe un nombre o un alias para el perfil.");
  return limpio;
}

/** Dos alias que solo se distinguen por mayúsculas o tildes confundirían al elegir. */
export function mismoAlias(a: string, b: string): boolean {
  const clave = (s: string) =>
    s.normalize("NFD").replace(/\p{M}/gu, "").toLocaleLowerCase("es");
  return clave(a.trim()) === clave(b.trim());
}

function aliasDisponible(alias: string, perfiles: readonly Perfil[], excepto?: number): string {
  const limpio = normalizarAlias(alias);
  if (perfiles.some((p) => p.id !== excepto && mismoAlias(p.alias, limpio))) {
    throw new Error(`Ya hay un perfil que se llama «${limpio}». Elige otro nombre.`);
  }
  return limpio;
}

/**
 * Valida y parsea el contenido JSON de una copia de seguridad.
 * Lanza un error descriptivo en español si el formato o los campos son inválidos.
 *
 * Se valida todo antes de devolver nada: quien importa en modo «reemplazar» no
 * puede quedarse con la mitad de una copia porque la sesión 300 venía rota.
 */
export function parsearCopiaSeguridad(json: string): CopiaLeida {
  let datos: unknown;
  try {
    datos = JSON.parse(json);
  } catch {
    throw new Error("El archivo no contiene un JSON válido.");
  }

  if (!datos || typeof datos !== "object" || Array.isArray(datos)) {
    throw new Error("El formato de la copia de seguridad no es un objeto válido.");
  }

  const obj = datos as Record<string, unknown>;

  // Las copias sin número de versión se leen como de la versión 1, que es lo
  // que escribían todas las anteriores. Una versión más nueva no se adivina:
  // podría traer campos que aquí se perderían en silencio.
  let version = 1;
  if (obj.version !== undefined) {
    if (!Number.isInteger(obj.version) || (obj.version as number) < 1) {
      throw new Error("La copia de seguridad no indica una versión reconocible.");
    }
    version = obj.version as number;
    if (version > VERSION_COPIA) {
      throw new Error(
        "Esta copia se hizo con una versión más nueva de LibreType. " +
        "Actualiza la aplicación para poder abrirla.",
      );
    }
  }

  if (!Array.isArray(obj.sesiones)) {
    throw new Error("La copia de seguridad no contiene una lista de sesiones válida.");
  }

  const sesionesValidas: Sesion[] = [];
  for (const s of obj.sesiones) {
    if (
      typeof s !== "object" ||
      s === null ||
      !esTexto(s.leccion) ||
      !s.leccion ||
      !esNumero(s.ppm) ||
      !esNumero(s.pctAcierto) ||
      !esCuenta(s.aciertos) ||
      !esCuenta(s.escritos) ||
      !esCuenta(s.ms) ||
      !esTexto(s.terminadaEn) ||
      Number.isNaN(Date.parse(s.terminadaEn))
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
        !esTexto(code) ||
        !code ||
        typeof val !== "object" ||
        val === null ||
        !esCuenta((val as EstadoTecla).intentos) ||
        !esCuenta((val as EstadoTecla).aciertos) ||
        !esCuenta((val as EstadoTecla).msTotal)
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

  const perfil = obj.perfil as Record<string, unknown> | undefined;
  const alias =
    perfil && typeof perfil === "object" && typeof perfil.alias === "string" && perfil.alias.trim()
      ? perfil.alias.trim().slice(0, MAX_ALIAS)
      : undefined;

  return {
    version,
    alias,
    creadaEn: typeof obj.creadaEn === "string" ? obj.creadaEn : undefined,
    sesiones: sesionesValidas,
    teclas: teclasValidas,
  };
}

/** Identidad de una sesión al combinar: dos intentos no terminan en el mismo milisegundo. */
const claveSesion = (s: Sesion) => `${s.terminadaEn}|${s.leccion}`;

/** Las sesiones de `entrantes` que no están ya en `existentes`, sin repetir. */
export function sesionesNuevas(existentes: readonly Sesion[], entrantes: readonly Sesion[]): Sesion[] {
  const vistas = new Set(existentes.map(claveSesion));
  const nuevas: Sesion[] = [];
  for (const s of entrantes) {
    const clave = claveSesion(s);
    if (vistas.has(clave)) continue;
    vistas.add(clave);
    nuevas.push(s);
  }
  return nuevas;
}

/**
 * Junta dos mapas de dominio sin sumar: por tecla, el estado con más intentos
 * (a igualdad, el que ya estaba). Es idempotente y no infla nunca el dominio;
 * el porqué está en la cabecera del fichero.
 */
export function combinarTeclas(
  existentes: ReadonlyMap<string, EstadoTecla>,
  entrantes: ReadonlyMap<string, EstadoTecla>,
): Map<string, EstadoTecla> {
  const unidas = new Map(existentes);
  for (const [code, e] of entrantes) {
    const previa = unidas.get(code);
    if (!previa || e.intentos > previa.intentos) unidas.set(code, { ...e });
  }
  return unidas;
}

/** Una importación lista para escribir de una vez. */
interface Escritura {
  /** Si se borra antes el progreso del perfil (modo reemplazar). */
  borrarAntes: boolean;
  /** Sesiones que hay que añadir. */
  sesiones: readonly Sesion[];
  /** Estado completo de teclas que debe quedar en el perfil. */
  teclas: ReadonlyMap<string, EstadoTecla>;
}

/**
 * Lo común a los tres backends: perfiles, exportar e importar. Cada backend
 * solo pone cómo se lee y cómo se escribe de forma atómica.
 */
abstract class AlmacenBase implements Almacen {
  abstract readonly tipo: "sqlite" | "local";
  abstract readonly errorAlmacen: boolean;
  #perfil = PERFIL_PRINCIPAL;

  get perfil(): number { return this.#perfil; }
  usarPerfil(id: number): void { this.#perfil = id; }

  abstract listarPerfiles(): Promise<Perfil[]>;
  protected abstract insertarPerfil(alias: string): Promise<Perfil>;
  protected abstract cambiarAlias(id: number, alias: string): Promise<void>;
  protected abstract eliminarPerfil(id: number): Promise<void>;
  protected abstract escribir(e: Escritura): Promise<void>;

  abstract guardar(s: Sesion): Promise<void>;
  abstract leerTodas(): Promise<Sesion[]>;
  abstract leerTeclas(): Promise<Map<string, EstadoTecla>>;
  abstract guardarTeclas(teclas: ReadonlyMap<string, EstadoTecla>): Promise<void>;
  abstract borrarTodo(): Promise<void>;

  async crearPerfil(alias: string): Promise<Perfil> {
    return this.insertarPerfil(aliasDisponible(alias, await this.listarPerfiles()));
  }

  async renombrarPerfil(id: number, alias: string): Promise<void> {
    const perfiles = await this.listarPerfiles();
    if (!perfiles.some((p) => p.id === id)) throw new Error("Ese perfil ya no existe.");
    await this.cambiarAlias(id, aliasDisponible(alias, perfiles, id));
  }

  async borrarPerfil(id: number): Promise<void> {
    if (id === PERFIL_PRINCIPAL) {
      throw new Error("El primer perfil no se puede borrar. Puedes renombrarlo o borrar su progreso.");
    }
    const perfiles = await this.listarPerfiles();
    if (!perfiles.some((p) => p.id === id)) return;
    await this.eliminarPerfil(id);
    if (this.#perfil === id) this.#perfil = PERFIL_PRINCIPAL;
  }

  async exportar(): Promise<string> {
    const [sesiones, teclas, perfiles] = await Promise.all([
      this.leerTodas(), this.leerTeclas(), this.listarPerfiles(),
    ]);
    const alias = perfiles.find((p) => p.id === this.perfil)?.alias ?? ALIAS_PRINCIPAL;
    const copia: CopiaSeguridad = {
      version: VERSION_COPIA,
      creadaEn: new Date().toISOString(),
      perfil: { alias },
      sesiones,
      teclas: Object.fromEntries(teclas),
    };
    return JSON.stringify(copia, null, 2);
  }

  exportarProgreso(): Promise<string> {
    return this.exportar();
  }

  async importar(json: string, opciones?: OpcionesImportar): Promise<void> {
    // Primero se valida la copia entera; hasta aquí no se ha tocado nada.
    await this.importarDatos(parsearCopiaSeguridad(json), opciones);
  }

  importarProgreso(json: string, opciones?: OpcionesImportar): Promise<void> {
    return this.importar(json, opciones);
  }

  async importarDatos(datos: DatosImportados, opciones?: OpcionesImportar): Promise<void> {
    if (opciones?.reemplazar ?? true) {
      await this.escribir({ borrarAntes: true, sesiones: datos.sesiones, teclas: datos.teclas });
      return;
    }
    const [existentes, teclas] = await Promise.all([this.leerTodas(), this.leerTeclas()]);
    await this.escribir({
      borrarAntes: false,
      sesiones: sesionesNuevas(existentes, datos.sesiones),
      teclas: combinarTeclas(teclas, datos.teclas),
    });
  }
}

/**
 * Un valor como literal SQL. Hace falta para los lotes atómicos, que van en
 * una sola llamada sin parámetros (ver `AlmacenSqlite.#lote`). Los números
 * ya vienen validados como finitos; en SQLite una cadena solo se escapa
 * doblando la comilla simple.
 */
export function literalSql(v: string | number): string {
  if (typeof v === "number") {
    if (!Number.isFinite(v)) throw new Error("Valor numérico inválido.");
    return String(v);
  }
  if (v.includes("\u0000")) throw new Error("Texto inválido.");
  return `'${v.replaceAll("'", "''")}'`;
}

export class AlmacenSqlite extends AlmacenBase {
  readonly tipo = "sqlite" as const;
  readonly errorAlmacen = false;
  #db: DbSql;

  constructor(db: DbSql) {
    super();
    this.#db = db;
  }

  /**
   * Ejecuta varias sentencias como una sola transacción.
   *
   * tauri-plugin-sql reparte las llamadas entre las conexiones de un pool, así
   * que un `BEGIN` en una llamada y un `COMMIT` en otra podrían ir a conexiones
   * distintas. Por eso el lote entero viaja en una única llamada sin parámetros
   * (sqlx ejecuta todas las sentencias del texto en la misma conexión) y los
   * valores van como literales con `literalSql`.
   *
   * Los `INSERT OR ROLLBACK` hacen que un fallo de restricción deshaga la
   * transacción en vez de dejarla abierta. Los errores de disco (lleno, E/S)
   * también la deshacen en SQLite. Para todo lo demás queda el `ROLLBACK` de
   * después, que no hace daño si ya no había transacción.
   */
  async #lote(sentencias: readonly string[]): Promise<void> {
    const sql = ["BEGIN IMMEDIATE;", ...sentencias.map((s) => `${s};`), "COMMIT;"].join("\n");
    try {
      await this.#db.execute(sql);
    } catch (err) {
      try { await this.#db.execute("ROLLBACK"); } catch { /* no había transacción abierta */ }
      throw err;
    }
  }

  async listarPerfiles(): Promise<Perfil[]> {
    const filas = await this.#db.select<{ id: number; alias: string; creado_en: string }[]>(
      "SELECT id, alias, creado_en FROM perfiles ORDER BY id ASC",
    );
    return filas.map((f) => ({ id: f.id, alias: f.alias, creadoEn: f.creado_en }));
  }

  protected async insertarPerfil(alias: string): Promise<Perfil> {
    await this.#db.execute(
      "INSERT INTO perfiles (alias, creado_en) VALUES ($1, $2)",
      [alias, new Date().toISOString()],
    );
    const [fila] = await this.#db.select<{ id: number; alias: string; creado_en: string }[]>(
      "SELECT id, alias, creado_en FROM perfiles WHERE alias = $1 ORDER BY id DESC LIMIT 1",
      [alias],
    );
    return { id: fila.id, alias: fila.alias, creadoEn: fila.creado_en };
  }

  protected async cambiarAlias(id: number, alias: string): Promise<void> {
    await this.#db.execute("UPDATE perfiles SET alias = $1 WHERE id = $2", [alias, id]);
  }

  protected async eliminarPerfil(id: number): Promise<void> {
    const p = literalSql(id);
    await this.#lote([
      `DELETE FROM sesiones WHERE perfil = ${p}`,
      `DELETE FROM teclas WHERE perfil = ${p}`,
      `DELETE FROM perfiles WHERE id = ${p}`,
    ]);
  }

  protected async escribir(e: Escritura): Promise<void> {
    const p = literalSql(this.perfil);
    const sentencias: string[] = [];
    if (e.borrarAntes) sentencias.push(`DELETE FROM sesiones WHERE perfil = ${p}`);
    for (const s of e.sesiones) {
      sentencias.push(
        `INSERT OR ROLLBACK INTO sesiones
           (perfil, leccion, ppm, pct_acierto, aciertos, escritos, ms, terminada_en)
         VALUES (${p}, ${[s.leccion, s.ppm, s.pctAcierto, s.aciertos, s.escritos, s.ms, s.terminadaEn]
           .map(literalSql).join(", ")})`,
      );
    }
    // Las teclas que se pasan son el estado completo que debe quedar.
    sentencias.push(`DELETE FROM teclas WHERE perfil = ${p}`);
    for (const [code, t] of e.teclas) {
      sentencias.push(
        `INSERT OR ROLLBACK INTO teclas (perfil, code, intentos, aciertos, ms_total)
         VALUES (${p}, ${[code, t.intentos, t.aciertos, t.msTotal].map(literalSql).join(", ")})`,
      );
    }
    await this.#lote(sentencias);
  }

  async guardar(s: Sesion): Promise<void> {
    await this.#db.execute(
      `INSERT INTO sesiones
         (perfil, leccion, ppm, pct_acierto, aciertos, escritos, ms, terminada_en)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [this.perfil, s.leccion, s.ppm, s.pctAcierto, s.aciertos, s.escritos, s.ms, s.terminadaEn],
    );
  }

  async leerTodas(): Promise<Sesion[]> {
    const filas = await this.#db.select<FilaSql[]>(
      `SELECT leccion, ppm, pct_acierto, aciertos, escritos, ms, terminada_en
         FROM sesiones WHERE perfil = $1 ORDER BY terminada_en ASC`,
      [this.perfil],
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
    >("SELECT code, intentos, aciertos, ms_total FROM teclas WHERE perfil = $1", [this.perfil]);
    return new Map(filas.map((f) => [
      f.code,
      { intentos: f.intentos, aciertos: f.aciertos, msTotal: f.ms_total },
    ]));
  }

  async guardarTeclas(teclas: ReadonlyMap<string, EstadoTecla>): Promise<void> {
    for (const [code, e] of teclas) {
      await this.#db.execute(
        `INSERT INTO teclas (perfil, code, intentos, aciertos, ms_total)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT(perfil, code) DO UPDATE SET
           intentos = excluded.intentos,
           aciertos = excluded.aciertos,
           ms_total = excluded.ms_total`,
        [this.perfil, code, e.intentos, e.aciertos, e.msTotal],
      );
    }
  }

  async borrarTodo(): Promise<void> {
    const p = literalSql(this.perfil);
    await this.#lote([
      `DELETE FROM sesiones WHERE perfil = ${p}`,
      `DELETE FROM teclas WHERE perfil = ${p}`,
    ]);
    // VACUUM no puede ir dentro de una transacción.
    await this.#db.execute("VACUUM");
  }
}

export class AlmacenLocal extends AlmacenBase {
  readonly tipo = "local" as const;
  readonly errorAlmacen: boolean;

  constructor(errorAlmacen = false) {
    super();
    this.errorAlmacen = errorAlmacen;
  }

  static #leerJson(clave: string): unknown {
    try {
      const crudo = localStorage.getItem(clave);
      return crudo ? JSON.parse(crudo) : null;
    } catch {
      return null;
    }
  }

  #leer(): Sesion[] {
    const datos = AlmacenLocal.#leerJson(clavesDe(this.perfil).sesiones);
    return Array.isArray(datos) ? (datos as Sesion[]) : [];
  }

  async listarPerfiles(): Promise<Perfil[]> {
    const datos = AlmacenLocal.#leerJson(CLAVE_PERFILES);
    const guardados = Array.isArray(datos)
      ? (datos as Perfil[]).filter(
        (p) => p && Number.isInteger(p.id) && p.id > 0 && typeof p.alias === "string" && p.alias.trim(),
      )
      : [];
    // El principal existe siempre, aunque nadie lo haya escrito: es el dueño
    // de lo que había antes de que hubiera perfiles.
    if (!guardados.some((p) => p.id === PERFIL_PRINCIPAL)) {
      guardados.unshift({ id: PERFIL_PRINCIPAL, alias: ALIAS_PRINCIPAL, creadoEn: "" });
    }
    return guardados.sort((a, b) => a.id - b.id);
  }

  async #escribirPerfiles(perfiles: readonly Perfil[]): Promise<void> {
    try {
      localStorage.setItem(CLAVE_PERFILES, JSON.stringify(perfiles));
    } catch {
      throw new Error("No se pudo guardar el perfil: el almacenamiento del navegador está lleno o bloqueado.");
    }
  }

  protected async insertarPerfil(alias: string): Promise<Perfil> {
    const perfiles = await this.listarPerfiles();
    const nuevo: Perfil = {
      id: Math.max(...perfiles.map((p) => p.id)) + 1,
      alias,
      creadoEn: new Date().toISOString(),
    };
    await this.#escribirPerfiles([...perfiles, nuevo]);
    return nuevo;
  }

  protected async cambiarAlias(id: number, alias: string): Promise<void> {
    const perfiles = await this.listarPerfiles();
    await this.#escribirPerfiles(perfiles.map((p) => (p.id === id ? { ...p, alias } : p)));
  }

  protected async eliminarPerfil(id: number): Promise<void> {
    const perfiles = await this.listarPerfiles();
    await this.#escribirPerfiles(perfiles.filter((p) => p.id !== id));
    const claves = clavesDe(id);
    try {
      localStorage.removeItem(claves.sesiones);
      localStorage.removeItem(claves.teclas);
    } catch { /* ignorado */ }
  }

  /**
   * localStorage no tiene transacciones: se apunta lo que había y, si la
   * segunda escritura falla (cuota llena), se deja todo como estaba.
   */
  protected async escribir(e: Escritura): Promise<void> {
    const claves = clavesDe(this.perfil);
    const sesiones = conservarLogros(
      e.borrarAntes ? [...e.sesiones] : [...this.#leer(), ...e.sesiones],
      TOPE_LOCAL,
    );
    const antes: [string, string | null][] = [];
    try {
      for (const [clave, valor] of [
        [claves.sesiones, JSON.stringify(sesiones)],
        [claves.teclas, JSON.stringify([...e.teclas])],
      ] as const) {
        antes.push([clave, localStorage.getItem(clave)]);
        localStorage.setItem(clave, valor);
      }
    } catch {
      for (const [clave, valor] of antes) {
        try {
          if (valor === null) localStorage.removeItem(clave);
          else localStorage.setItem(clave, valor);
        } catch { /* lo que no se pudo escribir tampoco cambió */ }
      }
      throw new Error("No se pudo guardar la copia: el almacenamiento del navegador está lleno o bloqueado.");
    }
  }

  async guardar(s: Sesion): Promise<void> {
    const todas = conservarLogros([...this.#leer(), s], TOPE_LOCAL);
    try {
      localStorage.setItem(clavesDe(this.perfil).sesiones, JSON.stringify(todas));
    } catch {
      // Modo privado o cuota llena: se practica igual, sin histórico.
    }
  }

  async leerTodas(): Promise<Sesion[]> {
    return this.#leer();
  }

  async leerTeclas(): Promise<Map<string, EstadoTecla>> {
    const datos = AlmacenLocal.#leerJson(clavesDe(this.perfil).teclas);
    try {
      return new Map(Array.isArray(datos) ? (datos as [string, EstadoTecla][]) : []);
    } catch {
      return new Map();
    }
  }

  async guardarTeclas(teclas: ReadonlyMap<string, EstadoTecla>): Promise<void> {
    try {
      localStorage.setItem(clavesDe(this.perfil).teclas, JSON.stringify([...teclas]));
    } catch { /* modo privado o cuota llena */ }
  }

  async borrarTodo(): Promise<void> {
    const claves = clavesDe(this.perfil);
    try {
      localStorage.removeItem(claves.sesiones);
      localStorage.removeItem(claves.teclas);
    } catch { /* ignorado */ }
  }

  /**
   * Borra todo el progreso del respaldo, de todos los perfiles. Solo lo usa la
   * reconciliación, cuando ya está a salvo en SQLite. Las preferencias no se
   * tocan: son de este equipo, no del alumno.
   */
  vaciarRespaldo(): void {
    try {
      const claves: string[] = [];
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k && (k === CLAVE_LOCAL || k === CLAVE_TECLAS || k === CLAVE_PERFILES || k.startsWith(PREFIJO_PERFIL))) {
          claves.push(k);
        }
      }
      for (const k of claves) localStorage.removeItem(k);
    } catch { /* ignorado */ }
  }
}

/** Almacén que no guarda nada. Para tests y para entornos sin storage. */
export class AlmacenMemoria extends AlmacenBase {
  readonly tipo = "local" as const;
  readonly errorAlmacen: boolean;
  #perfiles: Perfil[] = [{ id: PERFIL_PRINCIPAL, alias: ALIAS_PRINCIPAL, creadoEn: "" }];
  #datos = new Map<number, { sesiones: Sesion[]; teclas: Map<string, EstadoTecla> }>();

  constructor(errorAlmacen = false) {
    super();
    this.errorAlmacen = errorAlmacen;
  }

  #de(perfil = this.perfil) {
    let d = this.#datos.get(perfil);
    if (!d) {
      d = { sesiones: [], teclas: new Map() };
      this.#datos.set(perfil, d);
    }
    return d;
  }

  async listarPerfiles(): Promise<Perfil[]> { return this.#perfiles.map((p) => ({ ...p })); }
  protected async insertarPerfil(alias: string): Promise<Perfil> {
    const nuevo = {
      id: Math.max(...this.#perfiles.map((p) => p.id)) + 1,
      alias,
      creadoEn: new Date().toISOString(),
    };
    this.#perfiles.push(nuevo);
    return { ...nuevo };
  }
  protected async cambiarAlias(id: number, alias: string): Promise<void> {
    this.#perfiles = this.#perfiles.map((p) => (p.id === id ? { ...p, alias } : p));
  }
  protected async eliminarPerfil(id: number): Promise<void> {
    this.#perfiles = this.#perfiles.filter((p) => p.id !== id);
    this.#datos.delete(id);
  }
  protected async escribir(e: Escritura): Promise<void> {
    const d = this.#de();
    d.sesiones = e.borrarAntes ? [...e.sesiones] : [...d.sesiones, ...e.sesiones];
    d.teclas = new Map(e.teclas);
  }

  async guardar(s: Sesion): Promise<void> { this.#de().sesiones.push(s); }
  async leerTodas(): Promise<Sesion[]> { return [...this.#de().sesiones]; }
  async leerTeclas(): Promise<Map<string, EstadoTecla>> { return new Map(this.#de().teclas); }
  async guardarTeclas(t: ReadonlyMap<string, EstadoTecla>): Promise<void> {
    this.#de().teclas = new Map(t);
  }
  async borrarTodo(): Promise<void> { this.#datos.delete(this.perfil); }
}

/**
 * Traspasa a SQLite lo que se guardó en localStorage mientras SQLite falló.
 *
 * En escritorio, localStorage solo se escribe cuando la base de datos no se
 * pudo abrir, así que todo lo que haya ahí está pendiente. Va por perfil: el
 * principal con el principal y los demás por alias, creándolos si hace falta.
 * Se importa en modo combinar, que es idempotente, así que si la app se cierra
 * a medias, repetirlo en el siguiente arranque no duplica nada. Solo cuando
 * todo está escrito se vacía el respaldo.
 *
 * Devuelve cuántas sesiones se traspasaron.
 */
export async function reconciliarRespaldoLocal(
  destino: Almacen,
  origen: AlmacenLocal = new AlmacenLocal(),
): Promise<number> {
  const activo = destino.perfil;
  let traspasadas = 0;
  try {
    const perfilesDestino = await destino.listarPerfiles();
    for (const p of await origen.listarPerfiles()) {
      origen.usarPerfil(p.id);
      const [sesiones, teclas] = await Promise.all([origen.leerTodas(), origen.leerTeclas()]);
      if (sesiones.length === 0 && teclas.size === 0) continue;

      let id = p.id === PERFIL_PRINCIPAL
        ? PERFIL_PRINCIPAL
        : perfilesDestino.find((d) => mismoAlias(d.alias, p.alias))?.id;
      if (id === undefined) {
        const creado = await destino.crearPerfil(p.alias);
        perfilesDestino.push(creado);
        id = creado.id;
      }

      destino.usarPerfil(id);
      const previas = await destino.leerTodas();
      traspasadas += sesionesNuevas(previas, sesiones).length;
      await destino.importarDatos({ sesiones, teclas }, { reemplazar: false });
    }
  } finally {
    destino.usarPerfil(activo);
  }
  origen.vaciarRespaldo();
  return traspasadas;
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
    const almacen = new AlmacenSqlite(db as unknown as DbSql);
    try {
      const n = await reconciliarRespaldoLocal(almacen);
      if (n > 0) console.info(`[libretype] traspasadas ${n} sesiones del respaldo local a SQLite`);
    } catch (err) {
      // El respaldo se queda donde está y se reintenta en el siguiente arranque.
      console.warn("[libretype] no se pudo traspasar el respaldo local:", err);
    }
    return almacen;
  } catch (err) {
    console.warn("[libretype] SQLite no disponible, se usa localStorage:", err);
    errorAlmacen = enEscritorio;
    return new AlmacenLocal(enEscritorio);
  }
}
