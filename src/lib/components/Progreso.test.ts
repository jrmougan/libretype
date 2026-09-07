import { describe, it, expect, vi, afterEach } from "vitest";
import { flushSync, mount, tick, unmount } from "svelte";
import Progreso from "./Progreso.svelte";
import { LESSONS } from "../lessons";
import { AlmacenMemoria } from "../storage/almacen";
import type { Sesion } from "../storage/progreso";

let componente: ReturnType<typeof Progreso> | undefined;

afterEach(async () => {
  if (componente) await unmount(componente);
  componente = undefined;
  document.body.replaceChildren();
  vi.restoreAllMocks();
});

const sesionPrueba: Sesion = {
  leccion: "reposo",
  ppm: 40,
  pctAcierto: 95,
  aciertos: 38,
  escritos: 40,
  ms: 60000,
  terminadaEn: "2026-09-01T12:00:00.000Z",
};

describe("Progreso.svelte - Aviso de degradación (Issue #29)", () => {
  it("muestra el aviso veraz de degradación cuando errorAlmacen es true", () => {
    componente = mount(Progreso, {
      target: document.body,
      props: {
        sesiones: [],
        lecciones: LESSONS,
        tipoAlmacen: "local",
        errorAlmacen: true,
        onBorrar: () => {},
      },
    });
    flushSync();

    const alerta = document.querySelector("[role='alert']");
    expect(alerta).not.toBeNull();
    expect(alerta?.textContent).toContain("No se pudo abrir la base de datos local");
    expect(alerta?.textContent?.replace(/\s+/g, " ")).toContain("almacenamiento del navegador temporalmente");
  });

  it("muestra el aviso normal de navegador si es local sin errorAlmacen", () => {
    componente = mount(Progreso, {
      target: document.body,
      props: {
        sesiones: [],
        lecciones: LESSONS,
        tipoAlmacen: "local",
        errorAlmacen: false,
        onBorrar: () => {},
      },
    });
    flushSync();

    const aviso = document.querySelector(".aviso");
    expect(aviso).not.toBeNull();
    expect(aviso?.textContent).toContain("Guardando en el navegador");
    expect(document.querySelector("[role='alert']")).toBeNull();
  });

  it("no muestra ningún aviso de degradación o navegador cuando tipoAlmacen es sqlite", () => {
    componente = mount(Progreso, {
      target: document.body,
      props: {
        sesiones: [],
        lecciones: LESSONS,
        tipoAlmacen: "sqlite",
        errorAlmacen: false,
        onBorrar: () => {},
      },
    });
    flushSync();

    expect(document.querySelector(".aviso")).toBeNull();
  });
});

describe("Progreso.svelte - Exportación e importación (Issue #28)", () => {
  it("el botón de exportar está deshabilitado si no hay sesiones", () => {
    componente = mount(Progreso, {
      target: document.body,
      props: {
        sesiones: [],
        lecciones: LESSONS,
        tipoAlmacen: "sqlite",
        onBorrar: () => {},
      },
    });
    flushSync();

    const botonExportar = [...document.querySelectorAll("button")].find(
      (b) => b.textContent?.includes("Exportar copia de seguridad"),
    );
    expect(botonExportar).not.toBeNull();
    expect(botonExportar?.disabled).toBe(true);
  });

  it("exporta la copia de seguridad y muestra mensaje de éxito al hacer clic", async () => {
    const onExportar = vi.fn().mockResolvedValue(JSON.stringify({
      version: 1,
      creadaEn: "2026-09-01T12:00:00.000Z",
      sesiones: [sesionPrueba],
      teclas: {},
    }));

    // Simular URL.createObjectURL y URL.revokeObjectURL
    globalThis.URL.createObjectURL = vi.fn().mockReturnValue("blob:demo");
    globalThis.URL.revokeObjectURL = vi.fn();

    componente = mount(Progreso, {
      target: document.body,
      props: {
        sesiones: [sesionPrueba],
        lecciones: LESSONS,
        tipoAlmacen: "sqlite",
        onBorrar: () => {},
        onExportar,
      },
    });
    flushSync();

    const botonExportar = [...document.querySelectorAll("button")].find(
      (b) => b.textContent?.includes("Exportar copia de seguridad"),
    )!;
    expect(botonExportar.disabled).toBe(false);

    botonExportar.click();
    await tick();
    await new Promise((r) => setTimeout(r, 10));

    expect(onExportar).toHaveBeenCalled();
    const mensaje = document.querySelector("[role='status']");
    expect(mensaje?.textContent).toContain("Copia de seguridad exportada correctamente");
  });

  it("importa correctamente un archivo JSON válido", async () => {
    const onImportar = vi.fn().mockResolvedValue(undefined);

    componente = mount(Progreso, {
      target: document.body,
      props: {
        sesiones: [], // sin sesiones previas: importa directo sin confirmación
        lecciones: LESSONS,
        tipoAlmacen: "sqlite",
        onBorrar: () => {},
        onImportar,
      },
    });
    flushSync();

    const input = document.querySelector("input[type='file']") as HTMLInputElement;
    expect(input).not.toBeNull();

    const contenidoValido = JSON.stringify({
      version: 1,
      creadaEn: "2026-09-01T12:00:00.000Z",
      sesiones: [sesionPrueba],
      teclas: {},
    });

    const archivo = new File([contenidoValido], "copia.json", { type: "application/json" });
    Object.defineProperty(input, "files", { value: [archivo] });

    input.dispatchEvent(new Event("change", { bubbles: true }));
    await tick();
    await new Promise((r) => setTimeout(r, 20));

    expect(onImportar).toHaveBeenCalledWith(contenidoValido);
    const mensaje = document.querySelector("[role='status']");
    expect(mensaje?.textContent).toContain("Copia de seguridad importada con éxito");
  });

  it("muestra alerta de error si el archivo contiene JSON inválido", async () => {
    const onImportar = vi.fn();

    componente = mount(Progreso, {
      target: document.body,
      props: {
        sesiones: [],
        lecciones: LESSONS,
        tipoAlmacen: "sqlite",
        onBorrar: () => {},
        onImportar: () => {
          throw new Error("El archivo no contiene un JSON válido.");
        },
      },
    });
    flushSync();

    const input = document.querySelector("input[type='file']") as HTMLInputElement;
    const archivoInvalido = new File(["no es json"], "copia.json", { type: "application/json" });
    Object.defineProperty(input, "files", { value: [archivoInvalido] });

    input.dispatchEvent(new Event("change", { bubbles: true }));
    await tick();
    await new Promise((r) => setTimeout(r, 20));

    const alerta = document.querySelector("[role='alert']");
    expect(alerta?.textContent).toContain("El archivo no contiene un JSON válido.");
  });

  it("pide confirmación antes de importar si ya existen sesiones previas", async () => {
    const onImportar = vi.fn().mockResolvedValue(undefined);

    componente = mount(Progreso, {
      target: document.body,
      props: {
        sesiones: [sesionPrueba],
        lecciones: LESSONS,
        tipoAlmacen: "sqlite",
        onBorrar: () => {},
        onImportar,
      },
    });
    flushSync();

    const input = document.querySelector("input[type='file']") as HTMLInputElement;
    const contenido = JSON.stringify({
      version: 1,
      sesiones: [sesionPrueba],
      teclas: {},
    });
    const archivo = new File([contenido], "copia.json", { type: "application/json" });
    Object.defineProperty(input, "files", { value: [archivo] });

    input.dispatchEvent(new Event("change", { bubbles: true }));
    await tick();
    await new Promise((r) => setTimeout(r, 20));

    // Aún no ha importado porque espera confirmación
    expect(onImportar).not.toHaveBeenCalled();
    const alerta = document.querySelector(".confirmacion[role='alert']");
    expect(alerta?.textContent).toContain("se sustituirá el progreso actual");

    // Usuario confirma
    const botonConfirmar = [...document.querySelectorAll<HTMLButtonElement>(".confirmacion button")].find(
      (b) => b.textContent?.includes("Sí, importar"),
    )!;
    botonConfirmar.click();
    await tick();
    await new Promise((r) => setTimeout(r, 20));

    expect(onImportar).toHaveBeenCalledWith(contenido);
    expect(document.querySelector("[role='status']")?.textContent).toContain("con éxito");
  });
});

describe("Progreso.svelte - Evolución temporal (Issue #26) y Teclas flojas (Issue #22)", () => {
  it("muestra la evolución temporal y los días practicados", () => {
    componente = mount(Progreso, {
      target: document.body,
      props: {
        sesiones: [sesionPrueba],
        lecciones: LESSONS,
        tipoAlmacen: "sqlite",
        onBorrar: () => {},
      },
    });
    flushSync();

    const dtDias = [...document.querySelectorAll("dt")].find(
      (dt) => dt.textContent?.includes("Días practicados"),
    );
    expect(dtDias).not.toBeNull();
    expect(dtDias?.nextElementSibling?.textContent).toContain("1");

    const tituloEvolucion = document.querySelector("#titulo-evolucion");
    expect(tituloEvolucion).not.toBeNull();
    expect(tituloEvolucion?.textContent).toContain("Evolución temporal");
  });

  it("muestra la lista de teclas y permite iniciar ejercicio de refuerzo", async () => {
    const onPracticarRefuerzo = vi.fn();
    const teclas = new Map([
      ["KeyP", { intentos: 10, aciertos: 6, msTotal: 8000 }], // floja (60%)
      ["KeyA", { intentos: 15, aciertos: 15, msTotal: 4000 }], // dominada (100%)
    ]);

    componente = mount(Progreso, {
      target: document.body,
      props: {
        sesiones: [sesionPrueba],
        lecciones: LESSONS,
        tipoAlmacen: "sqlite",
        teclas,
        onBorrar: () => {},
        onPracticarRefuerzo,
      },
    });
    flushSync();

    // Comprobar que aparece la sección de teclas
    const tituloTeclas = document.querySelector("#titulo-teclas");
    expect(tituloTeclas).not.toBeNull();

    // Comprobar que la tecla floja está destacada
    const teclaFloja = document.querySelector(".tecla-card.tecla-floja");
    expect(teclaFloja).not.toBeNull();
    expect(teclaFloja?.textContent).toContain("P");
    expect(teclaFloja?.textContent).toContain("reforzar");

    // Comprobar que existe el botón de refuerzo y funciona
    const btnRefuerzo = document.querySelector(".btn-refuerzo") as HTMLButtonElement;
    expect(btnRefuerzo).not.toBeNull();

    btnRefuerzo.click();
    await tick();

    expect(onPracticarRefuerzo).toHaveBeenCalled();
    const arg = onPracticarRefuerzo.mock.calls[0][0];
    expect(arg.id).toBe("refuerzo");
    expect(arg.teclasFlojas).toContain("p");
  });
});
