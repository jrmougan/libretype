import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  AlmacenSqlite,
  AlmacenLocal,
  AlmacenMemoria,
  PERFIL_PRINCIPAL,
  combinarTeclas,
  literalSql,
  parsearCopiaSeguridad,
  reconciliarRespaldoLocal,
  setErrorAlmacen,
  type Almacen,
} from "./almacen";
import type { Sesion } from "./progreso";
import type { EstadoTecla } from "../keyboard/dominio";
import { crearDbDePrueba } from "./sqlite-de-prueba";

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

const copia = (parcial: Record<string, unknown> = {}) =>
  JSON.stringify({
    version: 2,
    creadaEn: "2026-09-02T10:00:00.000Z",
    perfil: { alias: "Ana" },
    sesiones: [
      sesionDemo({ terminadaEn: "2026-09-01T10:00:00.000Z", ppm: 20 }),
      sesionDemo({ terminadaEn: "2026-09-02T10:00:00.000Z", ppm: 30 }),
    ],
    teclas: {
      KeyA: { intentos: 10, aciertos: 9, msTotal: 2000 },
      KeyB: { intentos: 4, aciertos: 4, msTotal: 800 },
    },
    ...parcial,
  });

/**
 * El contrato que tienen que cumplir los tres backends. Se pasa una fábrica
 * para que cada test empiece con un almacén vacío.
 */
function contrato(nombre: string, crear: () => Almacen) {
  describe(`${nombre}: contrato común`, () => {
    it("guarda, actualiza y recupera sesiones y teclas", async () => {
      const a = crear();
      expect(await a.leerTodas()).toEqual([]);
      expect(await a.leerTeclas()).toEqual(new Map());

      await a.guardar(sesionDemo({ ppm: 45, leccion: "tildes" }));
      await a.guardarTeclas(new Map([["KeyA", { intentos: 12, aciertos: 11, msTotal: 2500 }]]));
      await a.guardarTeclas(new Map([
        ["KeyA", { intentos: 15, aciertos: 14, msTotal: 3500 }],
        ["Space", { intentos: 30, aciertos: 29, msTotal: 4000 }],
      ]));

      expect((await a.leerTodas()).map((s) => s.ppm)).toEqual([45]);
      const teclas = await a.leerTeclas();
      expect(teclas.get("KeyA")).toEqual({ intentos: 15, aciertos: 14, msTotal: 3500 });
      expect(teclas.get("Space")).toEqual({ intentos: 30, aciertos: 29, msTotal: 4000 });

      await a.borrarTodo();
      expect(await a.leerTodas()).toEqual([]);
      expect(await a.leerTeclas()).toEqual(new Map());
    });

    it("exporta con versión 2 y alias, y reimporta lo mismo", async () => {
      const a = crear();
      await a.guardar(sesionDemo({ ppm: 45, leccion: "tildes" }));
      await a.guardarTeclas(new Map([["KeyA", { intentos: 12, aciertos: 11, msTotal: 2500 }]]));

      const json = await a.exportar();
      const parsed = JSON.parse(json);
      expect(parsed.version).toBe(2);
      expect(parsed.perfil).toEqual({ alias: "Principal" });
      expect(parsed.sesiones).toHaveLength(1);
      expect(parsed.teclas.KeyA.intentos).toBe(12);

      await a.borrarTodo();
      await a.importar(json);
      expect((await a.leerTodas())[0].leccion).toBe("tildes");
      expect((await a.leerTeclas()).get("KeyA")?.intentos).toBe(12);
    });

    it("importar dos veces la misma copia en modo combinar no duplica nada (0.5)", async () => {
      const a = crear();
      await a.guardar(sesionDemo({ terminadaEn: "2026-09-01T10:00:00.000Z", ppm: 20 }));
      await a.guardarTeclas(new Map([["KeyA", { intentos: 5, aciertos: 5, msTotal: 1000 }]]));

      await a.importar(copia(), { reemplazar: false });
      const sesiones1 = await a.leerTodas();
      const teclas1 = await a.leerTeclas();

      await a.importar(copia(), { reemplazar: false });
      expect(await a.leerTodas()).toEqual(sesiones1);
      expect(await a.leerTeclas()).toEqual(teclas1);

      // La sesión repetida no entra dos veces, y la tecla no se suma: se queda
      // el estado con más intentos.
      expect(sesiones1).toHaveLength(2);
      expect(teclas1.get("KeyA")).toEqual({ intentos: 10, aciertos: 9, msTotal: 2000 });
      expect(teclas1.get("KeyB")).toEqual({ intentos: 4, aciertos: 4, msTotal: 800 });
    });

    it("restaurar una copia antigua en modo combinar no rebaja lo que ya había", async () => {
      const a = crear();
      await a.guardarTeclas(new Map([["KeyA", { intentos: 50, aciertos: 49, msTotal: 9000 }]]));
      await a.importar(copia(), { reemplazar: false });
      expect((await a.leerTeclas()).get("KeyA")?.intentos).toBe(50);
    });

    it("reemplazar sustituye el progreso del perfil por el de la copia", async () => {
      const a = crear();
      await a.guardar(sesionDemo({ terminadaEn: "2025-01-01T00:00:00.000Z", leccion: "vieja" }));
      await a.guardarTeclas(new Map([["KeyZ", { intentos: 9, aciertos: 9, msTotal: 900 }]]));

      await a.importar(copia());

      expect((await a.leerTodas()).map((s) => s.terminadaEn)).toEqual([
        "2026-09-01T10:00:00.000Z", "2026-09-02T10:00:00.000Z",
      ]);
      expect([...(await a.leerTeclas()).keys()].sort()).toEqual(["KeyA", "KeyB"]);
    });

    it("una copia inválida no toca nada, ni siquiera en modo reemplazar", async () => {
      const a = crear();
      await a.guardar(sesionDemo());
      const roto = copia({
        sesiones: [sesionDemo(), { ...sesionDemo(), ppm: "rápido" }],
      });
      await expect(a.importar(roto)).rejects.toThrow("campos inválidos");
      expect(await a.leerTodas()).toHaveLength(1);
    });

    it("cada perfil tiene su progreso y borrar uno no toca los demás (3.2)", async () => {
      const a = crear();
      await a.guardar(sesionDemo({ ppm: 11 }));
      await a.guardarTeclas(new Map([["KeyA", { intentos: 9, aciertos: 9, msTotal: 900 }]]));

      const ana = await a.crearPerfil("  Ana   María ");
      expect(ana.alias).toBe("Ana María");
      a.usarPerfil(ana.id);
      expect(await a.leerTodas()).toEqual([]);
      expect(await a.leerTeclas()).toEqual(new Map());
      await a.guardar(sesionDemo({ ppm: 22 }));

      // Exportar lleva el alias del perfil activo.
      expect(JSON.parse(await a.exportar()).perfil).toEqual({ alias: "Ana María" });

      await a.borrarPerfil(ana.id);
      expect(a.perfil).toBe(PERFIL_PRINCIPAL);
      expect((await a.listarPerfiles()).map((p) => p.alias)).toEqual(["Principal"]);
      expect((await a.leerTodas()).map((s) => s.ppm)).toEqual([11]);
      expect((await a.leerTeclas()).size).toBe(1);

      // Si se vuelve a crear con el mismo nombre, empieza de cero.
      const otra = await a.crearPerfil("Ana María");
      a.usarPerfil(otra.id);
      expect(await a.leerTodas()).toEqual([]);
    });

    it("no deja dos perfiles con el mismo alias, ni vacío, ni borrar el principal", async () => {
      const a = crear();
      const ana = await a.crearPerfil("Ana");
      await expect(a.crearPerfil("ANA")).rejects.toThrow("Ya hay un perfil");
      await expect(a.crearPerfil("ána")).rejects.toThrow("Ya hay un perfil");
      await expect(a.crearPerfil("   ")).rejects.toThrow("Escribe un nombre");
      await expect(a.renombrarPerfil(ana.id, "principal")).rejects.toThrow("Ya hay un perfil");
      await expect(a.borrarPerfil(PERFIL_PRINCIPAL)).rejects.toThrow("no se puede borrar");

      await a.renombrarPerfil(ana.id, "Ana B.");
      await a.renombrarPerfil(PERFIL_PRINCIPAL, "Aula 3");
      expect((await a.listarPerfiles()).map((p) => p.alias)).toEqual(["Aula 3", "Ana B."]);
    });

    it("borrarTodo solo vacía el perfil activo", async () => {
      const a = crear();
      await a.guardar(sesionDemo());
      const ana = await a.crearPerfil("Ana");
      a.usarPerfil(ana.id);
      await a.guardar(sesionDemo());
      await a.borrarTodo();
      expect(await a.leerTodas()).toEqual([]);
      a.usarPerfil(PERFIL_PRINCIPAL);
      expect(await a.leerTodas()).toHaveLength(1);
    });
  });
}

contrato("AlmacenSqlite", () => new AlmacenSqlite(crearDbDePrueba().db));
contrato("AlmacenLocal", () => {
  localStorage.clear();
  return new AlmacenLocal();
});
contrato("AlmacenMemoria", () => new AlmacenMemoria());

describe("AlmacenSqlite", () => {
  it("ejecuta VACUUM al borrar todo para dejar la base de datos limpia", async () => {
    const { db, ejecutadas } = crearDbDePrueba();
    await new AlmacenSqlite(db).borrarTodo();
    expect(ejecutadas).toContain("VACUUM");
  });

  it("reemplazar va en un único lote transaccional, no en llamadas sueltas (0.5)", async () => {
    const { db, ejecutadas } = crearDbDePrueba();
    const a = new AlmacenSqlite(db);
    ejecutadas.length = 0;

    await a.importar(copia());

    // Una sola llamada: con el pool de tauri-plugin-sql, un BEGIN y un COMMIT
    // en llamadas distintas podrían ir a conexiones distintas.
    const escrituras = ejecutadas.filter((s) => /DELETE|INSERT/.test(s));
    expect(escrituras).toHaveLength(1);
    expect(escrituras[0]).toMatch(/^BEGIN IMMEDIATE;/);
    expect(escrituras[0]).toMatch(/COMMIT;$/);
  });

  it("si el lote de reemplazar falla a medias, no se pierde nada de lo que había (0.5)", async () => {
    const { db, nativa } = crearDbDePrueba();
    const a = new AlmacenSqlite(db);
    await a.guardar(sesionDemo({ leccion: "mia" }));
    await a.guardarTeclas(new Map([["KeyZ", { intentos: 9, aciertos: 9, msTotal: 900 }]]));

    // Un fallo que no es de restricción (RAISE(FAIL) no deshace nada por sí
    // mismo) después de haber borrado y de haber insertado sesiones.
    nativa.exec(`CREATE TRIGGER fallo BEFORE INSERT ON teclas WHEN NEW.code = 'KeyB'
                 BEGIN SELECT RAISE(FAIL, 'disco roto'); END;`);

    await expect(a.importar(copia())).rejects.toThrow("disco roto");

    expect((await a.leerTodas()).map((s) => s.leccion)).toEqual(["mia"]);
    expect(await a.leerTeclas()).toEqual(
      new Map([["KeyZ", { intentos: 9, aciertos: 9, msTotal: 900 }]]),
    );
    // Y la conexión no se queda con una transacción abierta.
    await a.guardar(sesionDemo({ leccion: "despues", terminadaEn: "2026-12-01T00:00:00.000Z" }));
    nativa.exec("DROP TRIGGER fallo");
    expect((await a.leerTodas()).map((s) => s.leccion)).toEqual(["mia", "despues"]);
  });

  it("guarda textos con comillas sin romper el SQL del lote", async () => {
    const { db } = crearDbDePrueba();
    const a = new AlmacenSqlite(db);
    await a.importar(copia({
      sesiones: [sesionDemo({ leccion: "l'apòstrof'); DROP TABLE sesiones; --" })],
      teclas: { "Quote'": { intentos: 1, aciertos: 1, msTotal: 1 } },
    }));
    expect((await a.leerTodas())[0].leccion).toBe("l'apòstrof'); DROP TABLE sesiones; --");
    expect((await a.leerTeclas()).has("Quote'")).toBe(true);
  });
});

describe("AlmacenLocal", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("lo que había antes de los perfiles es del perfil principal, sin moverlo de sitio", async () => {
    localStorage.setItem("libretype.sesiones", JSON.stringify([sesionDemo({ ppm: 77 })]));
    localStorage.setItem("libretype.teclas", JSON.stringify([["KeyF", { intentos: 8, aciertos: 8, msTotal: 800 }]]));

    const a = new AlmacenLocal();
    expect(await a.listarPerfiles()).toEqual([
      expect.objectContaining({ id: PERFIL_PRINCIPAL, alias: "Principal" }),
    ]);
    expect((await a.leerTodas())[0].ppm).toBe(77);
    expect((await a.leerTeclas()).get("KeyF")?.intentos).toBe(8);
  });

  it("los demás perfiles usan sus propias claves y se borran con el perfil", async () => {
    const a = new AlmacenLocal();
    const ana = await a.crearPerfil("Ana");
    a.usarPerfil(ana.id);
    await a.guardar(sesionDemo());
    await a.guardarTeclas(new Map([["KeyA", { intentos: 1, aciertos: 1, msTotal: 1 }]]));
    expect(localStorage.getItem(`libretype.perfil.${ana.id}.sesiones`)).not.toBeNull();
    expect(localStorage.getItem("libretype.sesiones")).toBeNull();

    await a.borrarPerfil(ana.id);
    expect(localStorage.getItem(`libretype.perfil.${ana.id}.sesiones`)).toBeNull();
    expect(localStorage.getItem(`libretype.perfil.${ana.id}.teclas`)).toBeNull();
  });

  it("si reemplazar se queda sin cuota a medias, deja todo como estaba (0.5)", async () => {
    const a = new AlmacenLocal();
    await a.guardar(sesionDemo({ leccion: "mia" }));
    await a.guardarTeclas(new Map([["KeyZ", { intentos: 9, aciertos: 9, msTotal: 900 }]]));

    const original = Storage.prototype.setItem;
    const espia = vi.spyOn(Storage.prototype, "setItem").mockImplementation(function (
      this: Storage, clave: string, valor: string,
    ) {
      if (clave === "libretype.teclas") throw new DOMException("lleno", "QuotaExceededError");
      original.call(this, clave, valor);
    });

    await expect(a.importar(copia())).rejects.toThrow("No se pudo guardar la copia");
    espia.mockRestore();

    expect((await a.leerTodas()).map((s) => s.leccion)).toEqual(["mia"]);
    expect((await a.leerTeclas()).has("KeyZ")).toBe(true);
  });

  it("expone errorAlmacen según su constructor", () => {
    expect(new AlmacenLocal(false).errorAlmacen).toBe(false);
    expect(new AlmacenLocal(true).errorAlmacen).toBe(true);
  });

  it("maneja datos corruptos o no conformes en localStorage sin romper la app (Issue #38)", async () => {
    const almacen = new AlmacenLocal();

    localStorage.setItem("libretype.teclas", "no es json {[[");
    expect(await almacen.leerTeclas()).toEqual(new Map());

    localStorage.setItem("libretype.teclas", JSON.stringify({ no: "es un array de entradas" }));
    expect(await almacen.leerTeclas()).toEqual(new Map());

    localStorage.setItem("libretype.sesiones", JSON.stringify({ tampoco: true }));
    expect(await almacen.leerTodas()).toEqual([]);

    localStorage.setItem("libretype.perfiles", "{roto");
    expect((await almacen.listarPerfiles()).map((p) => p.id)).toEqual([PERFIL_PRINCIPAL]);
  });
});

describe("combinarTeclas", () => {
  it("es idempotente y se queda con el estado con más intentos", () => {
    const a = new Map<string, EstadoTecla>([["KeyA", { intentos: 5, aciertos: 5, msTotal: 500 }]]);
    const b = new Map<string, EstadoTecla>([
      ["KeyA", { intentos: 8, aciertos: 6, msTotal: 900 }],
      ["KeyB", { intentos: 1, aciertos: 1, msTotal: 100 }],
    ]);
    const una = combinarTeclas(a, b);
    expect(combinarTeclas(una, b)).toEqual(una);
    expect(una.get("KeyA")).toEqual({ intentos: 8, aciertos: 6, msTotal: 900 });
    // No muta la entrada.
    expect(a.get("KeyA")?.intentos).toBe(5);
  });
});

describe("literalSql", () => {
  it("escapa comillas y rechaza lo que no se puede escribir como literal", () => {
    expect(literalSql("o'clock")).toBe("'o''clock'");
    expect(literalSql(12.5)).toBe("12.5");
    expect(() => literalSql(Infinity)).toThrow();
    expect(() => literalSql(Number.NaN)).toThrow();
    expect(() => literalSql("a\u0000b")).toThrow();
  });
});

describe("parsearCopiaSeguridad", () => {
  it("valida JSON sintácticamente incorrecto", () => {
    expect(() => parsearCopiaSeguridad("no es json")).toThrow("El archivo no contiene un JSON válido.");
  });

  it("valida objeto raíz", () => {
    expect(() => parsearCopiaSeguridad(JSON.stringify("cadena"))).toThrow("El formato de la copia de seguridad no es un objeto válido.");
    expect(() => parsearCopiaSeguridad(JSON.stringify([]))).toThrow("no es un objeto válido");
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

  it("rechaza números que JSON convierte en infinito y fechas que no lo son", () => {
    const infinito = `{"sesiones":[${JSON.stringify(sesionDemo()).replace('"ppm":35', '"ppm":1e999')}]}`;
    expect(() => parsearCopiaSeguridad(infinito)).toThrow("campos inválidos");
    const sinFecha = JSON.stringify({ sesiones: [sesionDemo({ terminadaEn: "ayer" })] });
    expect(() => parsearCopiaSeguridad(sinFecha)).toThrow("campos inválidos");
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

  it("comprueba la versión: la 1 y la 2 valen, una más nueva se rechaza (3.1)", () => {
    expect(parsearCopiaSeguridad(JSON.stringify({ version: 1, sesiones: [] })).version).toBe(1);
    expect(parsearCopiaSeguridad(JSON.stringify({ sesiones: [] })).version).toBe(1);
    const v2 = parsearCopiaSeguridad(copia());
    expect(v2.version).toBe(2);
    expect(v2.alias).toBe("Ana");
    expect(() => parsearCopiaSeguridad(JSON.stringify({ version: 3, sesiones: [] }))).toThrow(
      "versión más nueva de LibreType",
    );
    expect(() => parsearCopiaSeguridad(JSON.stringify({ version: "dos", sesiones: [] }))).toThrow(
      "versión reconocible",
    );
  });
});

describe("reconciliarRespaldoLocal (3.1)", () => {
  beforeEach(() => localStorage.clear());

  it("traspasa a SQLite lo guardado en localStorage mientras falló, por perfil y sin duplicar", async () => {
    // Mientras SQLite falló: dos sesiones del principal y una de Ana.
    const local = new AlmacenLocal(true);
    await local.guardar(sesionDemo({ terminadaEn: "2026-09-01T10:00:00.000Z" }));
    await local.guardar(sesionDemo({ terminadaEn: "2026-09-03T10:00:00.000Z" }));
    await local.guardarTeclas(new Map([["KeyA", { intentos: 9, aciertos: 9, msTotal: 900 }]]));
    const anaLocal = await local.crearPerfil("Ana");
    local.usarPerfil(anaLocal.id);
    await local.guardar(sesionDemo({ terminadaEn: "2026-09-04T10:00:00.000Z" }));
    localStorage.setItem("libretype.preferencias", JSON.stringify({ escala: 2 }));

    // SQLite ya tenía una de ellas (se guardó antes de fallar).
    const sqlite = new AlmacenSqlite(crearDbDePrueba().db);
    await sqlite.guardar(sesionDemo({ terminadaEn: "2026-09-01T10:00:00.000Z" }));

    expect(await reconciliarRespaldoLocal(sqlite)).toBe(2);

    expect((await sqlite.leerTodas()).map((s) => s.terminadaEn)).toEqual([
      "2026-09-01T10:00:00.000Z", "2026-09-03T10:00:00.000Z",
    ]);
    expect((await sqlite.leerTeclas()).get("KeyA")?.intentos).toBe(9);
    const ana = (await sqlite.listarPerfiles()).find((p) => p.alias === "Ana");
    expect(ana).toBeDefined();
    sqlite.usarPerfil(ana!.id);
    expect(await sqlite.leerTodas()).toHaveLength(1);
    sqlite.usarPerfil(PERFIL_PRINCIPAL);

    // El respaldo se vacía, las preferencias del equipo no.
    expect(localStorage.getItem("libretype.sesiones")).toBeNull();
    expect(localStorage.getItem("libretype.perfiles")).toBeNull();
    expect(localStorage.getItem("libretype.preferencias")).not.toBeNull();

    // Repetirlo no cambia nada.
    expect(await reconciliarRespaldoLocal(sqlite)).toBe(0);
    expect(await sqlite.leerTodas()).toHaveLength(2);
  });

  it("si el traspaso falla, el respaldo se queda para el siguiente arranque", async () => {
    const local = new AlmacenLocal(true);
    await local.guardar(sesionDemo());
    const sqlite = new AlmacenSqlite(crearDbDePrueba().db);
    vi.spyOn(sqlite, "importarDatos").mockRejectedValueOnce(new Error("disco lleno"));

    await expect(reconciliarRespaldoLocal(sqlite)).rejects.toThrow("disco lleno");
    expect(localStorage.getItem("libretype.sesiones")).not.toBeNull();
    expect(sqlite.perfil).toBe(PERFIL_PRINCIPAL);
  });
});

describe("abrirAlmacen y degradación transparente (Issue #29)", () => {
  beforeEach(() => {
    vi.resetModules();
    setErrorAlmacen(false);
    localStorage.clear();
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

  it("cuando SQLite vuelve a abrir, recoge lo que quedó en localStorage", async () => {
    localStorage.setItem("libretype.sesiones", JSON.stringify([sesionDemo()]));
    const { db } = crearDbDePrueba();
    vi.doMock("@tauri-apps/api/core", () => ({ isTauri: () => true }));
    vi.doMock("@tauri-apps/plugin-sql", () => ({ default: { load: async () => db } }));

    const { abrirAlmacen: abrir } = await import("./almacen");
    const almacen = await abrir();
    expect(almacen.tipo).toBe("sqlite");
    expect(await almacen.leerTodas()).toHaveLength(1);
    expect(localStorage.getItem("libretype.sesiones")).toBeNull();
  });
});
