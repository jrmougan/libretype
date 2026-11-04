import { describe, it, expect, vi, afterEach } from "vitest";
import { flushSync, mount, tick, unmount } from "svelte";
import Progreso from "./Progreso.svelte";
import { LIMITES } from "../lecciones/personalizadas";
import { LESSONS } from "../lessons";
import { AlmacenMemoria } from "../storage/almacen";
import { FILA_DISPONIBLE, PCT_OBJETIVO, SIN_PRESION } from "../storage/objetivos";
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
    expect(alerta?.textContent).toContain("No se ha podido abrir la base de datos de este equipo");
    expect(alerta?.textContent?.replace(/\s+/g, " ")).toContain("almacén provisional de la aplicación");
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
    expect(aviso?.textContent).toContain("Tu progreso se guarda en este navegador");
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
    // Guardar carga la API de Tauri en diferido: no cabe una espera fija.
    await vi.waitFor(() =>
      expect(document.querySelector("[role='status']")?.textContent)
        .toContain("Copia de seguridad exportada correctamente"));

    expect(onExportar).toHaveBeenCalled();
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

describe("Progreso.svelte - restaurar sin pisarse", () => {
  async function hastaConfirmar(onImportar: (j: string) => Promise<void>): Promise<void> {
    componente = mount(Progreso, {
      target: document.body,
      props: { sesiones: [sesionPrueba], lecciones: LESSONS, tipoAlmacen: "sqlite", onBorrar: () => {}, onImportar },
    });
    flushSync();
    const input = document.querySelector("input[type='file']") as HTMLInputElement;
    Object.defineProperty(input, "files", { value: [new File(["{}"], "c.json")] });
    input.dispatchEvent(new Event("change", { bubbles: true }));
    await vi.waitFor(() => expect(document.querySelector(".confirmacion")).not.toBeNull());
  }
  const confirmar = () => [...document.querySelectorAll<HTMLButtonElement>(".confirmacion button")]
    .find((b) => b.textContent?.includes("Sí, importar"))!;

  it("un doble clic solo importa una vez, y mientras dura lo dice y no se puede pulsar nada", async () => {
    let acabar = (): void => {};
    const onImportar = vi.fn(() => new Promise<void>((r) => { acabar = r; }));
    await hastaConfirmar(onImportar);

    const boton = confirmar();
    boton.click();
    boton.click();
    flushSync();

    expect(onImportar).toHaveBeenCalledTimes(1);
    expect(document.querySelector("[role='status']")?.textContent).toContain("Importando");
    for (const b of document.querySelectorAll<HTMLButtonElement>(".confirmacion button")) expect(b.disabled).toBe(true);
    expect(document.querySelector<HTMLButtonElement>(".importar")!.disabled).toBe(true);

    acabar();
    await vi.waitFor(() => expect(document.querySelector("[role='status']")?.textContent).toContain("con éxito"));
    expect(document.querySelector<HTMLButtonElement>(".importar")!.disabled).toBe(false);
  });

  it("mientras se restaura tampoco responden gestionar ni borrar", async () => {
    let acabar = (): void => {};
    const onImportar = vi.fn(() => new Promise<void>((r) => { acabar = r; }));
    componente = mount(Progreso, {
      target: document.body,
      props: {
        sesiones: [sesionPrueba, { ...sesionPrueba, leccion: "propia:a" }], lecciones: LESSONS, tipoAlmacen: "sqlite", onBorrar: () => {}, onImportar,
        onGestionarLecciones: () => {},
        leccionesPropias: [{ id: "propia:a", titulo: "Mía", descripcion: "", texto: "la sal", creadaEn: "2026-01-01T00:00:00.000Z", actualizadaEn: "2026-01-01T00:00:00.000Z", borradaEn: null }],
      },
    });
    flushSync();
    const boton = (t: string) => [...document.querySelectorAll<HTMLButtonElement>("button")].find((b) => b.textContent?.trim() === t)!;
    boton("Borrar progreso").click();
    flushSync();
    const input = document.querySelector("input[type='file']") as HTMLInputElement;
    Object.defineProperty(input, "files", { value: [new File(["{}"], "c.json")] });
    input.dispatchEvent(new Event("change", { bubbles: true }));
    await vi.waitFor(() => expect(document.querySelector(".confirmacion")).not.toBeNull());
    confirmar().click();
    flushSync();

    for (const t of ["Gestionar", "Sí, borrar"]) expect(boton(t).disabled, t).toBe(true);

    acabar();
    await vi.waitFor(() => expect(boton("Gestionar").disabled).toBe(false));
  });

  it("si falla, se puede volver a intentar", async () => {
    await hastaConfirmar(() => Promise.reject(new Error("Tu historial sigue como estaba.")));
    confirmar().click();
    await vi.waitFor(() => expect(document.querySelector("[role='alert']")?.textContent).toContain("sigue como estaba"));
    expect(document.querySelector<HTMLButtonElement>(".importar")!.disabled).toBe(false);
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
    expect(tituloEvolucion?.textContent).toContain("Evolución por días");
  });

  it("un día de refuerzo con texto repetido no se atribuye al alumno", () => {
    componente = mount(Progreso, {
      target: document.body,
      props: {
        sesiones: [{ ...sesionPrueba, leccion: "refuerzo-suelto" }],
        lecciones: LESSONS,
        tipoAlmacen: "sqlite",
        onBorrar: () => {},
      },
    });
    flushSync();

    // Ese texto lo generó la aplicación: «textos tuyos» sería falso.
    const fila = document.querySelector("#titulo-evolucion")?.closest("section")?.querySelector("tbody tr");
    expect(fila?.textContent).toContain("solo textos a medida");
    expect(document.body.textContent).not.toContain("textos tuyos");
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

describe("Progreso.svelte - El umbral nunca se muestra como número aislado (Issue #54)", () => {
  const RE_UMBRAL = new RegExp(`\\b${PCT_OBJETIVO}\\s*%`);
  const RE_SIN_PRESION = new RegExp(SIN_PRESION.join("|"), "i");

  function montar(sesiones: readonly Sesion[]): void {
    componente = mount(Progreso, {
      target: document.body,
      props: { sesiones, lecciones: LESSONS, tipoAlmacen: "sqlite", onBorrar: () => {} },
    });
    flushSync();
  }

  /**
   * Recorre el DOM montado en vez de mirar solo los sitios conocidos: si una
   * vista nueva habla del objetivo y suelta la cifra, falla aquí. Las marcas de
   * la tabla no cuentan, porque un porcentaje conseguido no es el objetivo.
   */
  function ningunaCifraSuelta(): void {
    const menciones = [...document.querySelectorAll<HTMLElement>("body *")]
      .filter((el) => /objetivo/i.test(el.textContent ?? ""));
    expect(menciones.length).toBeGreaterThan(0);
    for (const el of menciones) {
      const texto = el.textContent ?? "";
      if (!RE_UMBRAL.test(texto)) continue;
      expect(texto, `<${el.tagName.toLowerCase()}> enseña el umbral sin quitar presión`)
        .toMatch(RE_SIN_PRESION);
    }
  }

  it("sin lecciones superadas anuncia el umbral una sola vez y sin velocidad mínima", () => {
    montar([]);

    const nota = document.querySelector("p.nota");
    expect(nota?.textContent).toContain(`${PCT_OBJETIVO}% de precisión`);
    expect(nota?.textContent).toMatch(RE_SIN_PRESION);
    expect(document.querySelectorAll("tbody th small")).toHaveLength(0);
    ningunaCifraSuelta();
  });

  it("con lecciones superadas no repite el umbral en ninguna fila de la tabla", () => {
    montar([sesionPrueba]);

    const etiquetas = [...document.querySelectorAll("tbody th small")]
      .map((small) => small.textContent ?? "");
    expect(etiquetas).toContain("Superada");
    expect(etiquetas).toContain(FILA_DISPONIBLE);
    for (const etiqueta of etiquetas) {
      expect(etiqueta, `«${etiqueta}» mete una cifra en la fila`).not.toMatch(/\d/);
    }
    ningunaCifraSuelta();
  });

  it("una marca clavada en el umbral no se confunde con el objetivo", () => {
    montar([{ ...sesionPrueba, pctAcierto: 90, aciertos: 36 }]);

    const fila = document.querySelector("tbody tr");
    expect(fila?.textContent).toContain("90%");
    expect(fila?.textContent).not.toMatch(/objetivo/i);
    ningunaCifraSuelta();
  });
});

describe("Progreso.svelte - Intentos hasta superar (Issue #53)", () => {
  function montar(sesiones: readonly Sesion[]): void {
    componente = mount(Progreso, {
      target: document.body,
      props: {
        sesiones,
        lecciones: LESSONS,
        tipoAlmacen: "sqlite",
        onBorrar: () => {},
      },
    });
    flushSync();
  }

  /** La columna se busca por su cabecera: no depende de cuántas haya ni de dónde. */
  function columnaHastaSuperar(): number {
    return [...document.querySelectorAll("thead th")]
      .findIndex((th) => th.textContent?.trim() === "Hasta superar");
  }

  function celdaDe(titulo: string, columna: number): string | undefined {
    const fila = [...document.querySelectorAll("tbody tr")]
      .find((tr) => tr.querySelector("th")?.textContent?.includes(titulo));
    return fila?.children[columna]?.textContent?.replace(/\s+/g, " ").trim();
  }

  it("enseña lo que costó superar cada lección, sin el repaso posterior", () => {
    const dia = (n: number) => `2026-09-0${n}T12:00:00.000Z`;
    montar([
      { ...sesionPrueba, pctAcierto: 60, aciertos: 24, terminadaEn: dia(1) },
      { ...sesionPrueba, pctAcierto: 75, aciertos: 30, terminadaEn: dia(2) },
      { ...sesionPrueba, pctAcierto: 95, terminadaEn: dia(3) },
      // Repaso de una lección ya superada: suma en «Intentos» y no debe sumar
      // aquí, que es justo por lo que esa columna no sirve para comparar.
      { ...sesionPrueba, pctAcierto: 100, aciertos: 40, terminadaEn: dia(4) },
      { ...sesionPrueba, leccion: "tildes", pctAcierto: 50, aciertos: 20, terminadaEn: dia(5) },
    ]);

    const col = columnaHastaSuperar();
    expect(col).toBeGreaterThan(0);
    expect(celdaDe("Fila de reposo", col)).toBe("3");
    expect(celdaDe("Fila de reposo", col - 1)).toBe("4");
    expect(celdaDe("Tildes", col)).toContain("1");
    expect(celdaDe("Tildes", col)).toContain("sin superar");
  });

  it("lo que no es una lección del temario no tiene nada que superar", () => {
    montar([
      sesionPrueba,
      { ...sesionPrueba, leccion: "practica-continua", terminadaEn: "2026-09-02T12:00:00.000Z" },
    ]);

    const col = columnaHastaSuperar();
    expect(celdaDe("Práctica continua", col)).toBe("—");
    expect(celdaDe("Las vocales que mandan", col)).toBe("—");
  });
});

describe("Progreso: lecciones personalizadas", () => {
  const AHORA = "2026-09-02T12:00:00.000Z";
  const sesionDe = (leccion: string, extra: Partial<Sesion> = {}): Sesion => ({
    leccion, ppm: 40, pctAcierto: 95, aciertos: 95, escritos: 100, ms: 60000, terminadaEn: AHORA, ...extra,
  });
  const propia = (id: string, titulo: string, borradaEn: string | null = null) => ({
    id, titulo, descripcion: "", texto: borradaEn ? "" : "una frase", creadaEn: AHORA, actualizadaEn: AHORA, borradaEn,
  });
  const montar = (sesiones: Sesion[], extra: Record<string, unknown> = {}) => {
    const c = mount(Progreso, {
      target: document.body,
      props: { sesiones, lecciones: LESSONS, tipoAlmacen: "local", onBorrar: () => {}, ...extra },
    });
    flushSync();
    return c;
  };
  const seccion = () => document.querySelector("section[aria-labelledby='titulo-propias']");

  afterEach(() => document.body.replaceChildren());

  it("las enseña aparte, con su nombre, y no como lección retirada", async () => {
    const c = montar([sesionDe("propia:a")], { leccionesPropias: [propia("propia:a", "Refranes")] });
    expect(seccion()?.textContent).toContain("Refranes");
    expect(seccion()?.textContent).not.toContain("lección borrada");
    expect(document.body.textContent).not.toContain("lección retirada");
    await unmount(c);
  });

  it("borrada sigue saliendo con su nombre", async () => {
    const c = montar([sesionDe("propia:a")], { leccionesPropias: [propia("propia:a", "Refranes", AHORA)] });
    expect(seccion()?.textContent).toContain("Refranes");
    expect(seccion()?.textContent).toContain("lección borrada");
    await unmount(c);
  });

  it("si no se conoce el nombre, lo dice sin enseñar el identificador", async () => {
    const c = montar([sesionDe("propia:perdida")]);
    expect(seccion()?.textContent).toContain("Lección sin nombre");
    expect(document.body.textContent).not.toContain("propia:perdida");
    await unmount(c);
  });

  it("no cuentan como lección practicada del temario ni fijan la mejor marca", async () => {
    const c = montar([sesionDe("propia:a", { ppm: 900 })], { leccionesPropias: [propia("propia:a", "Refranes")] });
    const global = document.querySelector("dl.global")!.textContent!;
    expect(global).toContain(`0 de ${LESSONS.length}`);
    expect(global).toContain("Mejor marca0 ppm");
    expect(seccion()?.textContent).toContain("900");
    await unmount(c);
  });

  it("sin marca todavía lo dice en su fila", async () => {
    const c = montar([sesionDe("propia:a", { pctAcierto: 50 })], { leccionesPropias: [propia("propia:a", "Refranes")] });
    expect(seccion()?.textContent).toContain("sin marca todavía");
    await unmount(c);
  });

  it("sin histórico de lecciones propias no hay sección", async () => {
    const c = montar([sesionDe("reposo")]);
    expect(seccion()).toBeNull();
    await unmount(c);
  });

  it("un id de una copia dañada no pinta lo que hereda Object.prototype", async () => {
    const c = montar(["constructor", "toString", "__proto__"].map((id) => sesionDe(id)));
    const filas = [...document.querySelectorAll("tr.retirada")].map((f) => f.textContent ?? "");
    expect(filas).toHaveLength(3);
    for (const f of filas) {
      expect(f).toContain("lección retirada");
      expect(f).not.toContain("native code");
      expect(f).not.toContain("[object");
    }
    await unmount(c);
  });

  it("si no hay ejercicio posible lo dice, en vez de no hacer nada", async () => {
    const onPracticarRefuerzo = vi.fn();
    const c = mount(Progreso, {
      target: document.body,
      props: {
        sesiones: [sesionDe("reposo")],
        lecciones: LESSONS,
        tipoAlmacen: "local",
        teclas: new Map([["Enter", { intentos: 20, aciertos: 8, msTotal: 20000 }]]),
        onBorrar: () => {},
        onPracticarRefuerzo,
      },
    });
    flushSync();
    const estado = document.querySelector(".estado-refuerzo")!;
    expect(estado.getAttribute("role")).toBe("status");
    expect(estado.textContent?.trim()).toBe("");
    (document.querySelector(".btn-refuerzo") as HTMLButtonElement).click();
    flushSync();
    expect(onPracticarRefuerzo).not.toHaveBeenCalled();
    expect(estado.textContent).toContain("Todavía no hay palabras");
    await unmount(c);
  });

  it("enlaza con la gestión", async () => {
    const onGestionarLecciones = vi.fn();
    const c = montar([sesionDe("propia:a")], { onGestionarLecciones });
    [...seccion()!.querySelectorAll("button")].find((b) => b.textContent === "Gestionar")!.click();
    expect(onGestionarLecciones).toHaveBeenCalledOnce();
    await unmount(c);
  });
});


describe("Progreso: los modos de práctica no son lecciones retiradas", () => {
  it("el refuerzo sale con su nombre y sin la nota de versión anterior", () => {
    const base = { ppm: 30, pctAcierto: 95, aciertos: 95, escritos: 100, ms: 1000, terminadaEn: "2026-09-01T10:00:00.000Z" };
    componente = mount(Progreso, {
      target: document.body,
      props: {
        sesiones: [{ ...base, leccion: "reposo" }, { ...base, leccion: "refuerzo" }],
        lecciones: LESSONS,
        tipoAlmacen: "sqlite",
        onBorrar: () => {},
      },
    });
    const fila = document.querySelector("tr.retirada")!;
    expect(fila.textContent).toContain("Refuerzo de teclas");
    expect(fila.textContent).toContain("práctica libre");
    expect(fila.textContent).not.toContain("retirada");
    expect(document.body.textContent).not.toContain("versión anterior");
  });

  it("un fichero demasiado grande no se llega a leer", async () => {
    const onImportar = vi.fn();
    componente = mount(Progreso, {
      target: document.body,
      props: { sesiones: [], lecciones: LESSONS, tipoAlmacen: "sqlite", onBorrar: () => {}, onImportar },
    });
    const input = document.querySelector<HTMLInputElement>('input[type="file"]')!;
    const archivo = new File(["{}"], "copia.json");
    Object.defineProperty(archivo, "size", { value: LIMITES.copiaBytes + 1 });
    Object.defineProperty(input, "files", { configurable: true, value: [archivo] });
    input.dispatchEvent(new Event("change", { bubbles: true }));
    await vi.waitFor(() => expect(document.querySelector("[role='alert']")?.textContent).toContain("demasiado grande"));
    expect(onImportar).not.toHaveBeenCalled();
  });
});
