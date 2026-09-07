import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  AlmacenSqlite,
  AlmacenLocal,
  AlmacenMemoria,
  abrirAlmacen,
  parsearCopiaSeguridad,
  errorAlmacen,
  setErrorAlmacen,
  type DbSql,
} from "./almacen";
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

  it("exporta e importa progreso en formato JSON correctamente", async () => {
    const { db } = crearMockDb();
    const almacen = new AlmacenSqlite(db);

    await almacen.guardar(sesionDemo({ ppm: 45, leccion: "tildes" }));
    const teclas = new Map<string, EstadoTecla>([
      ["KeyA", { intentos: 12, aciertos: 11, msTotal: 2500 }],
    ]);
    await almacen.guardarTeclas(teclas);

    const json = await almacen.exportar();
    expect(json).toBeTypeOf("string");

    const parsed = JSON.parse(json);
    expect(parsed.version).toBe(1);
    expect(parsed.sesiones).toHaveLength(1);
    expect(parsed.sesiones[0].leccion).toBe("tildes");
    expect(parsed.teclas.KeyA.intentos).toBe(12);

    // Borrar y reimportar
    await almacen.borrarTodo();
    expect(await almacen.leerTodas()).toHaveLength(0);

    await almacen.importar(json);
    const sesionesImportadas = await almacen.leerTodas();
    expect(sesionesImportadas).toHaveLength(1);
    expect(sesionesImportadas[0].leccion).toBe("tildes");

    const teclasImportadas = await almacen.leerTeclas();
    expect(teclasImportadas.get("KeyA")?.intentos).toBe(12);
  });

  it("soporta importar en modo combinar (reemplazar: false)", async () => {
    const { db } = crearMockDb();
    const almacen = new AlmacenSqlite(db);

    await almacen.guardar(sesionDemo({ terminadaEn: "2026-09-01T10:00:00.000Z", ppm: 20 }));
    await almacen.guardarTeclas(new Map([["KeyA", { intentos: 5, aciertos: 5, msTotal: 1000 }]]));

    const copiaParaImportar = JSON.stringify({
      version: 1,
      creadaEn: "2026-09-02T10:00:00.000Z",
      sesiones: [
        sesionDemo({ terminadaEn: "2026-09-01T10:00:00.000Z", ppm: 20 }), // duplicada
        sesionDemo({ terminadaEn: "2026-09-02T10:00:00.000Z", ppm: 30 }), // nueva
      ],
      teclas: {
        KeyA: { intentos: 10, aciertos: 9, msTotal: 2000 },
        KeyB: { intentos: 4, aciertos: 4, msTotal: 800 },
      },
    });

    await almacen.importar(copiaParaImportar, { reemplazar: false });

    const todas = await almacen.leerTodas();
    expect(todas).toHaveLength(2);

    const teclas = await almacen.leerTeclas();
    // KeyA debe acumular intentos: 5 + 10 = 15
    expect(teclas.get("KeyA")?.intentos).toBe(15);
    expect(teclas.get("KeyB")?.intentos).toBe(4);
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

    const json = await almacen.exportarProgreso();
    localStorage.clear();

    await almacen.importarProgreso(json);
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
});

describe("parsearCopiaSeguridad", () => {
  it("valida JSON sintácticamente incorrecto", () => {
    expect(() => parsearCopiaSeguridad("no es json")).toThrow("El archivo no contiene un JSON válido.");
  });

  it("valida objeto raíz", () => {
    expect(() => parsearCopiaSeguridad(JSON.stringify("cadena"))).toThrow("El formato de la copia de seguridad no es un objeto válido.");
  });

  it("valida que sesiones sea un array", () => {
    expect(() => parsearCopiaSeguridad(JSON.stringify({ sesiones: "no-array" }))).toThrow(
      "La copia de seguridad no contiene una lista de sesiones válida.",
    );
  });

  it("valida campos requeridos en sesiones", () => {
    const invalido = JSON.stringify({
      sesiones: [{ leccion: "reposo" }], // faltan ppm, escritos, etc.
    });
    expect(() => parsearCopiaSeguridad(invalido)).toThrow(
      "Una o más sesiones de la copia de seguridad contienen campos inválidos.",
    );
  });

  it("valida tipos en el estado de teclas", () => {
    const invalido = JSON.stringify({
      sesiones: [],
      teclas: {
        KeyA: { intentos: "muchos" },
      },
    });
    expect(() => parsearCopiaSeguridad(invalido)).toThrow(
      'El estado de la tecla "KeyA" en la copia de seguridad es inválido.',
    );
  });
});

describe("abrirAlmacen y degradación transparente (Issue #29)", () => {
  beforeEach(() => {
    vi.resetModules();
    setErrorAlmacen(false);
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

    const { abrirAlmacen: abrir, errorAlmacen: errFlag } = await import("./almacen");
    const almacen = await abrir();
    expect(almacen.tipo).toBe("local");
    expect(almacen.errorAlmacen).toBe(true);
  });
});
