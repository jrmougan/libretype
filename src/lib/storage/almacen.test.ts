import { afterEach, describe, it, expect, beforeEach, vi } from "vitest";
import {
  AlmacenSqlite,
  AlmacenLocal,
  AlmacenMemoria,
  abrirAlmacen,
  parsearCopiaSeguridad,
  cargarDatos,
  type DbSql,
} from "./almacen";
import { LIMITES } from "../lecciones/personalizadas";
import type { Sesion } from "./progreso";
import type { EstadoTecla } from "../keyboard/dominio";

const sesionDemo = (parcial: Partial<Sesion> = {}): Sesion => ({
  leccion: "reposo",
  ppm: 35,
  pctAcierto: 98,
  aciertos: 50,
  escritos: 51,
  ms: 45000,
  terminadaEn: "2026-09-01T12:00:00.000Z",
  ...parcial,
});

function crearMockDb(): { db: DbSql; consultas: { sql: string; params?: unknown[] }[] } {
  const consultas: { sql: string; params?: unknown[] }[] = [];
  const filasSesiones: any[] = [];
  const filasTeclas: any[] = [];

  const db: DbSql = {
    async execute(sql: string, params?: unknown[]): Promise<unknown> {
      consultas.push({ sql, params });
      if (sql.includes("DELETE FROM sesiones")) {
        filasSesiones.length = 0;
      } else if (sql.includes("DELETE FROM teclas")) {
        filasTeclas.length = 0;
      } else if (sql.includes("INSERT INTO sesiones")) {
        filasSesiones.push({
          leccion: params![0],
          ppm: params![1],
          pct_acierto: params![2],
          aciertos: params![3],
          escritos: params![4],
          ms: params![5],
          terminada_en: params![6],
        });
      } else if (sql.includes("INSERT INTO teclas")) {
        const code = params![0] as string;
        const ix = filasTeclas.findIndex((t) => t.code === code);
        const fila = {
          code,
          intentos: params![1] as number,
          aciertos: params![2] as number,
          ms_total: params![3] as number,
        };
        if (ix >= 0) filasTeclas[ix] = fila;
        else filasTeclas.push(fila);
      }
      return {};
    },
    async select<T>(sql: string): Promise<T> {
      consultas.push({ sql });
      if (sql.includes("FROM sesiones")) {
        return [...filasSesiones] as unknown as T;
      }
      if (sql.includes("FROM teclas")) {
        return [...filasTeclas] as unknown as T;
      }
      return [] as unknown as T;
    },
  };

  return { db, consultas };
}

describe("AlmacenSqlite", () => {
  it("ejecuta VACUUM al borrar todo para dejar la base de datos limpia", async () => {
    const { db, consultas } = crearMockDb();
    const almacen = new AlmacenSqlite(db);

    await almacen.borrarTodo();

    const sqles = consultas.map((c) => c.sql);
    expect(sqles).toContain("DELETE FROM sesiones");
    expect(sqles).toContain("DELETE FROM teclas");
    expect(sqles).toContain("VACUUM");
  });

  it("guarda, actualiza y recupera el mapa de teclas íntegro (Issue #38)", async () => {
    const { db } = crearMockDb();
    const almacen = new AlmacenSqlite(db);

    // Inicialmente vacío
    expect(await almacen.leerTeclas()).toEqual(new Map());

    // Guardar múltiples teclas con todas sus propiedades
    const teclasIniciales = new Map<string, EstadoTecla>([
      ["KeyA", { intentos: 10, aciertos: 9, msTotal: 2500 }],
      ["KeyS", { intentos: 20, aciertos: 20, msTotal: 3600 }],
      ["Quote", { intentos: 5, aciertos: 4, msTotal: 1200 }],
    ]);
    await almacen.guardarTeclas(teclasIniciales);

    const recuperadas = await almacen.leerTeclas();
    expect(recuperadas.size).toBe(3);
    expect(recuperadas.get("KeyA")).toEqual({ intentos: 10, aciertos: 9, msTotal: 2500 });
    expect(recuperadas.get("KeyS")).toEqual({ intentos: 20, aciertos: 20, msTotal: 3600 });
    expect(recuperadas.get("Quote")).toEqual({ intentos: 5, aciertos: 4, msTotal: 1200 });

    // Actualización de teclas existentes (ON CONFLICT DO UPDATE)
    const teclasActualizadas = new Map<string, EstadoTecla>([
      ["KeyA", { intentos: 15, aciertos: 14, msTotal: 3500 }],
      ["Space", { intentos: 30, aciertos: 29, msTotal: 4000 }],
    ]);
    await almacen.guardarTeclas(teclasActualizadas);

    const trasActualizar = await almacen.leerTeclas();
    expect(trasActualizar.size).toBe(4);
    expect(trasActualizar.get("KeyA")).toEqual({ intentos: 15, aciertos: 14, msTotal: 3500 });
    expect(trasActualizar.get("KeyS")).toEqual({ intentos: 20, aciertos: 20, msTotal: 3600 });
    expect(trasActualizar.get("Space")).toEqual({ intentos: 30, aciertos: 29, msTotal: 4000 });

    // borrarTodo limpia también las teclas
    await almacen.borrarTodo();
    expect(await almacen.leerTeclas()).toEqual(new Map());
  });
});

describe("AlmacenLocal", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("exporta e importa copias de seguridad", async () => {
    const almacen = new AlmacenLocal();
    await almacen.guardar(sesionDemo({ ppm: 55 }));
    await almacen.guardarTeclas(new Map([["KeyF", { intentos: 20, aciertos: 19, msTotal: 3000 }]]));

    const json = await almacen.exportar();
    localStorage.clear();

    await almacen.importar(json);
    const sesiones = await almacen.leerTodas();
    expect(sesiones).toHaveLength(1);
    expect(sesiones[0].ppm).toBe(55);

    const teclas = await almacen.leerTeclas();
    expect(teclas.get("KeyF")?.intentos).toBe(20);
  });

  it("expone errorAlmacen según su constructor", () => {
    expect(new AlmacenLocal(false).errorAlmacen).toBe(false);
    expect(new AlmacenLocal(true).errorAlmacen).toBe(true);
  });

  it("guarda, actualiza y recupera el mapa de teclas íntegro en localStorage (Issue #38)", async () => {
    const almacen = new AlmacenLocal();

    // Inicialmente vacío
    expect(await almacen.leerTeclas()).toEqual(new Map());

    const teclas = new Map<string, EstadoTecla>([
      ["KeyD", { intentos: 15, aciertos: 14, msTotal: 2800 }],
      ["KeyK", { intentos: 8, aciertos: 7, msTotal: 1500 }],
    ]);
    await almacen.guardarTeclas(teclas);

    const leidas = await almacen.leerTeclas();
    expect(leidas.size).toBe(2);
    expect(leidas.get("KeyD")).toEqual({ intentos: 15, aciertos: 14, msTotal: 2800 });
    expect(leidas.get("KeyK")).toEqual({ intentos: 8, aciertos: 7, msTotal: 1500 });

    // Actualiza y añade
    teclas.set("KeyD", { intentos: 20, aciertos: 19, msTotal: 3600 });
    teclas.set("Space", { intentos: 40, aciertos: 39, msTotal: 5000 });
    await almacen.guardarTeclas(teclas);

    const actualizadas = await almacen.leerTeclas();
    expect(actualizadas.size).toBe(3);
    expect(actualizadas.get("KeyD")).toEqual({ intentos: 20, aciertos: 19, msTotal: 3600 });
    expect(actualizadas.get("Space")).toEqual({ intentos: 40, aciertos: 39, msTotal: 5000 });

    // borrarTodo elimina la clave de localStorage
    await almacen.borrarTodo();
    expect(await almacen.leerTeclas()).toEqual(new Map());
    expect(localStorage.getItem("libretype.teclas")).toBeNull();
  });

  it("maneja datos corruptos o no conformes en localStorage sin romper la app (Issue #38)", async () => {
    const almacen = new AlmacenLocal();

    // JSON no parseable
    localStorage.setItem("libretype.teclas", "no es json {[[");
    expect(await almacen.leerTeclas()).toEqual(new Map());

    // Tipo inesperado (objeto en vez de array de entradas)
    localStorage.setItem("libretype.teclas", JSON.stringify({ no: "es un array de entradas" }));
    expect(await almacen.leerTeclas()).toEqual(new Map());
  });
});

describe("AlmacenMemoria", () => {
  it("exporta e importa cumpliendo el contrato", async () => {
    const a = new AlmacenMemoria();
    await a.guardar(sesionDemo({ ppm: 40 }));
    const json = await a.exportar();

    await a.borrarTodo();
    expect(await a.leerTodas()).toHaveLength(0);

    await a.importar(json);
    expect((await a.leerTodas())[0].ppm).toBe(40);
  });

  it("guarda, actualiza y recupera el mapa de teclas devolviendo copias defensivas (Issue #38)", async () => {
    const a = new AlmacenMemoria();

    expect(await a.leerTeclas()).toEqual(new Map());

    const teclas = new Map<string, EstadoTecla>([
      ["KeyJ", { intentos: 25, aciertos: 24, msTotal: 4000 }],
      ["KeyF", { intentos: 30, aciertos: 28, msTotal: 4500 }],
    ]);
    await a.guardarTeclas(teclas);

    const leidas = await a.leerTeclas();
    expect(leidas.size).toBe(2);
    expect(leidas.get("KeyJ")).toEqual({ intentos: 25, aciertos: 24, msTotal: 4000 });

    // Comprueba copia defensiva: mutar el mapa devuelto no altera el almacén interno
    leidas.set("KeyJ", { intentos: 999, aciertos: 0, msTotal: 0 });
    const leidas2 = await a.leerTeclas();
    expect(leidas2.get("KeyJ")?.intentos).toBe(25);

    // Actualización oficial mediante guardarTeclas
    teclas.set("KeyJ", { intentos: 35, aciertos: 34, msTotal: 5200 });
    await a.guardarTeclas(teclas);
    expect((await a.leerTeclas()).get("KeyJ")?.intentos).toBe(35);

    // borrarTodo limpia el mapa
    await a.borrarTodo();
    expect(await a.leerTeclas()).toEqual(new Map());
  });
});

describe("parsearCopiaSeguridad", () => {
  it("valida JSON sintácticamente incorrecto", () => {
    expect(() => parsearCopiaSeguridad("no es json")).toThrow("Este fichero no se puede leer: no es una copia de seguridad de LibreType.");
  });

  it("valida objeto raíz", () => {
    expect(() => parsearCopiaSeguridad(JSON.stringify("cadena"))).toThrow("Este fichero no se puede leer: no es una copia de seguridad de LibreType.");
  });

  it("valida que sesiones sea un array", () => {
    expect(() => parsearCopiaSeguridad(JSON.stringify({ sesiones: "no-array" }))).toThrow(
      "Esta copia de seguridad no trae la lista de sesiones",
    );
  });

  it("valida campos requeridos en sesiones", () => {
    const invalido = JSON.stringify({
      sesiones: [{ leccion: "reposo" }], // faltan ppm, escritos, etc.
    });
    expect(() => parsearCopiaSeguridad(invalido)).toThrow(
      "Alguna sesión de esta copia de seguridad está dañada",
    );
  });

  it("rechaza una copia con más identificadores de los que salen practicando", () => {
    const sesion = (leccion: string) => ({ leccion, ppm: 20, pctAcierto: 95, aciertos: 19, escritos: 20, ms: 60000, terminadaEn: "2026-01-01T00:00:00.000Z" });
    const distintas = (n: number) => JSON.stringify({ sesiones: Array.from({ length: n }, (_, i) => sesion(`x${i}`)) });
    expect(parsearCopiaSeguridad(distintas(LIMITES.copiaIdentificadores)).sesiones).toHaveLength(LIMITES.copiaIdentificadores);
    expect(() => parsearCopiaSeguridad(distintas(LIMITES.copiaIdentificadores + 1))).toThrow("no se ha importado");

    // Muchas sesiones de pocas lecciones son un historial normal, no un abuso.
    const largo = JSON.stringify({ sesiones: Array.from({ length: LIMITES.copiaIdentificadores * 3 }, () => sesion("reposo")) });
    expect(parsearCopiaSeguridad(largo).sesiones).toHaveLength(LIMITES.copiaIdentificadores * 3);

    const teclas = Object.fromEntries(Array.from({ length: LIMITES.copiaIdentificadores + 1 }, (_, i) => [`K${i}`, { intentos: 1, aciertos: 1, msTotal: 1 }]));
    expect(() => parsearCopiaSeguridad(JSON.stringify({ sesiones: [], teclas }))).toThrow("no se ha importado");
  });

  it("valida tipos en el estado de teclas", () => {
    const invalido = JSON.stringify({
      sesiones: [],
      teclas: {
        KeyA: { intentos: "muchos" },
      },
    });
    expect(() => parsearCopiaSeguridad(invalido)).toThrow(
      'Los datos de la tecla «KeyA» en esta copia de seguridad están dañados',
    );
  });
});

describe("abrirAlmacen y degradación transparente (Issue #29)", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("en entorno web (!isTauri) devuelve AlmacenLocal sin errorAlmacen", async () => {
    vi.doMock("@tauri-apps/api/core", () => ({
      isTauri: () => false,
    }));

    const { abrirAlmacen: abrir } = await import("./almacen");
    const almacen = await abrir();
    expect(almacen.tipo).toBe("local");
    expect(almacen.errorAlmacen).toBe(false);
  });

  it("en entorno escritorio (isTauri) si falla Database.load devuelve AlmacenLocal con errorAlmacen: true", async () => {
    vi.doMock("@tauri-apps/api/core", () => ({
      isTauri: () => true,
    }));
    vi.doMock("@tauri-apps/plugin-sql", () => ({
      default: {
        load: () => Promise.reject(new Error("Error abriendo libretype.db")),
      },
    }));

    const { abrirAlmacen: abrir } = await import("./almacen");
    const almacen = await abrir();
    expect(almacen.tipo).toBe("local");
    expect(almacen.errorAlmacen).toBe(true);
  });
});

describe("datos dañados en el respaldo local", () => {
  beforeEach(() => localStorage.clear());
  const buena = { leccion: "reposo", ppm: 20, pctAcierto: 95, aciertos: 95, escritos: 100, ms: 1000, terminadaEn: "2026-09-01T10:00:00.000Z" };

  it.each([
    ["[null]"], ["{}"], ["[{}]"], ["3"], ["no es json"],
    [JSON.stringify([{ ...buena, ppm: "20" }])],
    [JSON.stringify([{ ...buena, terminadaEn: "ayer" }])],
  ])("sesiones %s: se leen como si no hubiera, sin lanzar", async (crudo) => {
    localStorage.setItem("libretype.sesiones", crudo);
    expect(await new AlmacenLocal().leerTodas()).toEqual([]);
  });

  it("una fila dañada no se lleva a las buenas", async () => {
    localStorage.setItem("libretype.sesiones", JSON.stringify([null, buena, {}]));
    expect(await new AlmacenLocal().leerTodas()).toEqual([buena]);
  });

  it.each([
    ['[["KeyA",null]]'], ["{}"], ["[1]"], ['[["KeyA",{"intentos":"3"}]]'], ["no es json"],
  ])("teclas %s: se leen como si no hubiera, sin lanzar", async (crudo) => {
    localStorage.setItem("libretype.teclas", crudo);
    expect((await new AlmacenLocal().leerTeclas()).size).toBe(0);
  });

  it("una tecla dañada no se lleva a las buenas", async () => {
    const e = { intentos: 3, aciertos: 2, msTotal: 100 };
    localStorage.setItem("libretype.teclas", JSON.stringify([["KeyA", null], ["KeyS", e]]));
    expect([...(await new AlmacenLocal().leerTeclas())]).toEqual([["KeyS", e]]);
  });
});

describe("cargarDatos", () => {
  beforeEach(() => localStorage.clear());

  it("si SQLite no se puede leer, sigue en el respaldo y lo dice", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const db: DbSql = { execute: async () => undefined, select: () => Promise.reject(new Error("rota")) };
    const datos = await cargarDatos(new AlmacenSqlite(db));
    expect(datos.almacen.tipo).toBe("local");
    expect(datos.almacen.errorAlmacen).toBe(true);
    expect(datos.sesiones).toEqual([]);
    vi.restoreAllMocks();
  });

  it("nunca lanza, aunque falle cualquier almacén", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const roto = new AlmacenMemoria();
    roto.leerTeclas = () => Promise.reject(new Error("rota"));
    const datos = await cargarDatos(roto);
    expect(datos).toMatchObject({ sesiones: [], propias: [] });
    expect(datos.teclas.size).toBe(0);
    vi.restoreAllMocks();
  });
});

describe("restaurar una copia con demasiadas lecciones", () => {
  beforeEach(() => localStorage.clear());

  it("no pasa del límite y cuenta las que no han cabido", async () => {
    const lecciones = Array.from({ length: LIMITES.lecciones + 5 }, (_, i) => ({
      id: `propia:x${i}`, titulo: `x${i}`, descripcion: "", texto: "una frase cualquiera",
      creadaEn: "2026-09-01T10:00:00.000Z", actualizadaEn: "2026-09-01T10:00:00.000Z", borradaEn: null,
    }));
    const almacen = new AlmacenLocal();
    const r = await almacen.importar(JSON.stringify({ version: 1, creadaEn: "2026-09-01T10:00:00.000Z", sesiones: [], teclas: {}, lecciones }));
    expect(r.leccionesSinSitio).toBe(5);
    expect(await almacen.leerLecciones()).toHaveLength(LIMITES.lecciones);
  });
});

describe("importar sin sitio en localStorage", () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => vi.restoreAllMocks());

  const copia = JSON.stringify({
    version: 1,
    creadaEn: "2026-09-01T10:00:00.000Z",
    sesiones: [{ leccion: "reposo", ppm: 20, pctAcierto: 95, aciertos: 19, escritos: 20, ms: 1000, terminadaEn: "2026-09-01T10:00:00.000Z" }],
    teclas: {},
    lecciones: [],
  });

  it("avisa en vez de decir que ha ido bien, y deja lo que había", async () => {
    const almacen = new AlmacenLocal();
    const propia: Sesion = { leccion: "mia", ppm: 10, pctAcierto: 50, aciertos: 5, escritos: 10, ms: 1000, terminadaEn: "2026-08-01T10:00:00.000Z" };
    await almacen.guardar(propia);

    // Lo primero cabe y lo segundo no: es el caso que dejaría una copia a medias.
    const real = Storage.prototype.setItem;
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(function (this: Storage, clave: string, valor: string) {
      if (clave === "libretype.teclas") throw new DOMException("sin sitio", "QuotaExceededError");
      real.call(this, clave, valor);
    });

    await expect(almacen.importar(copia)).rejects.toThrow(/no cabe/);
    expect((await almacen.leerTodas()).map((s) => s.leccion)).toEqual(["mia"]);
  });
});
