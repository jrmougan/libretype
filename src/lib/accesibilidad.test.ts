import appSvelte from "../App.svelte?raw";
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import drillSvelte from "./components/Drill.svelte?raw";
import leccionCeroSvelte from "./components/LeccionCero.svelte?raw";
import { DOMINADA, opacidadEtiqueta } from "./keyboard/dominio";

const tokensCss = readFileSync("src/styles/tokens.css", "utf8");

function sRGBtoLin(c: number): number {
  c = c / 255;
  return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

function lumHex(hex: string): number {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return 0.2126 * sRGBtoLin(r) + 0.7152 * sRGBtoLin(g) + 0.0722 * sRGBtoLin(b);
}

function contrast(hex1: string, hex2: string): number {
  const l1 = lumHex(hex1);
  const l2 = lumHex(hex2);
  return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
}

function blend(fgHex: string, bgHex: string, alpha: number): string {
  const rFg = parseInt(fgHex.slice(1, 3), 16);
  const gFg = parseInt(fgHex.slice(3, 5), 16);
  const bFg = parseInt(fgHex.slice(5, 7), 16);
  const rBg = parseInt(bgHex.slice(1, 3), 16);
  const gBg = parseInt(bgHex.slice(3, 5), 16);
  const bBg = parseInt(bgHex.slice(5, 7), 16);

  const r = Math.round(alpha * rFg + (1 - alpha) * rBg);
  const g = Math.round(alpha * gFg + (1 - alpha) * gBg);
  const b = Math.round(alpha * bFg + (1 - alpha) * bBg);

  const toHex = (n: number) => n.toString(16).padStart(2, "0");
  return "#" + toHex(r) + toHex(g) + toHex(b);
}

describe("Accesibilidad visual (WCAG 2.2)", () => {
  describe("Issue #12: Contraste de bordes de interfaz (>= 3:1, WCAG 1.4.11)", () => {
    it("tema claro: --border-strong tiene ratio >= 3:1 frente a --surface y --bg", () => {
      const bg = "#faf9f7";
      const surface = "#ffffff";
      const borderStrong = "#8c867b";

      expect(tokensCss).toContain("--border-strong: #8c867b;");
      expect(contrast(borderStrong, surface)).toBeGreaterThanOrEqual(3.0);
      expect(contrast(borderStrong, bg)).toBeGreaterThanOrEqual(3.0);
    });

    it("tema oscuro: --border-strong tiene ratio >= 3:1 frente a --surface y --bg", () => {
      const bg = "#15151a";
      const surface = "#1d1d24";
      const borderStrong = "#707080";

      expect(tokensCss).toContain("--border-strong: #707080;");
      expect(contrast(borderStrong, surface)).toBeGreaterThanOrEqual(3.0);
      expect(contrast(borderStrong, bg)).toBeGreaterThanOrEqual(3.0);
    });
  });

  describe("Issue #14: Etiquetas atenuadas del teclado (>= 4.5:1, WCAG 1.4.3)", () => {
    it("la opacidad mínima de etiqueta atenuada no cae de 4.5:1 en tema claro", () => {
      const bgTecla = "#f0eee9"; // --surface-sunken en claro
      const fgTecla = "#1b1b19"; // --fg en claro

      for (let d = 0.5; d < DOMINADA; d += 0.01) {
        const opac = opacidadEtiqueta(d);
        const colorAtenuado = blend(fgTecla, bgTecla, opac);
        const ratio = contrast(colorAtenuado, bgTecla);
        expect(ratio, "dominio " + d.toFixed(2) + " con opac " + opac.toFixed(2)).toBeGreaterThanOrEqual(4.5);
      }
    });

    it("el punto de tecla aprendida cumple contraste >= 4.5:1 sobre la tecla", () => {
      const bgTecla = "#f0eee9";
      const fgMuted = "#5f5c55";
      expect(contrast(fgMuted, bgTecla)).toBeGreaterThanOrEqual(4.5);
    });
  });

  describe("Issue #17: Colores de dedo con contraste >= 3:1 (WCAG 1.4.11)", () => {
    const dedosClaro: Record<string, string> = {
      "--finger-l-pinky": "#7c3aed",
      "--finger-l-ring": "#2563eb",
      "--finger-l-middle": "#0891b2",
      "--finger-l-index": "#059669",
      "--finger-r-index": "#a16207",
      "--finger-r-middle": "#ea580c",
      "--finger-r-ring": "#dc2626",
      "--finger-r-pinky": "#be185d",
      "--finger-thumb": "#475569",
    };

    const bgClaro = "#faf9f7";
    const surfaceClaro = "#ffffff";

    for (const [nombre, hex] of Object.entries(dedosClaro)) {
      it(nombre + " (" + hex + ") cumple contraste >= 3:1 frente a bg y surface", () => {
        expect(contrast(hex, bgClaro), nombre + " vs bg").toBeGreaterThanOrEqual(3.0);
        expect(contrast(hex, surfaceClaro), nombre + " vs surface").toBeGreaterThanOrEqual(3.0);
      });
    }

    it("define los 5 alias de dedos y pulgar en tokens.css", () => {
      expect(tokensCss).toContain("--finger-pinky:");
      expect(tokensCss).toContain("--finger-ring:");
      expect(tokensCss).toContain("--finger-middle:");
      expect(tokensCss).toContain("--finger-index:");
      expect(tokensCss).toContain("--finger-thumb:");
    });
  });

  describe("Issue #18: Tamaño mínimo de controles interactivos (--target-min, WCAG 2.5.8)", () => {
    it("Drill.svelte: el botón .explica respeta --target-min", () => {
      expect(drillSvelte).toMatch(/\.explica\s*\{[^}]*min-height:\s*var\(--target-min\)/);
      expect(drillSvelte).toMatch(/\.explica\s*\{[^}]*min-width:\s*var\(--target-min\)/);
    });

    it("LeccionCero.svelte: el botón .enlace respeta --target-min", () => {
      expect(leccionCeroSvelte).toMatch(/\.enlace\s*\{[^}]*min-height:\s*var\(--target-min\)/);
      expect(leccionCeroSvelte).toMatch(/\.enlace\s*\{[^}]*min-width:\s*var\(--target-min\)/);
    });
  });

  describe("Issue #11: Accesibilidad de paneles y modales", () => {
    it("App.svelte: los botones de Progreso y Ajustes apuntan a aria-controls='panel-dialogo'", () => {
      expect(appSvelte).toMatch(/<button[\s\S]*?aria-controls="panel-dialogo"[\s\S]*?>\s*Progreso\s*<\/button>/);
      expect(appSvelte).toMatch(/<button[\s\S]*?aria-controls="panel-dialogo"[\s\S]*?>\s*Ajustes\s*<\/button>/);
    });

    it("App.svelte: el panel lateral tiene id='panel-dialogo'", () => {
      expect(appSvelte).toContain('id="panel-dialogo"');
    });

    it("App.svelte: el diálogo de resultado anuncia estado con aria-live y aria-describedby", () => {
      expect(appSvelte).toContain('id="dialogo-resultado"');
      expect(appSvelte).toContain('aria-live="polite"');
      expect(appSvelte).toContain('aria-describedby="resultado-desc"');
    });
  });

  describe("Issue #15: Animaciones reducidas y cursor", () => {
    it("Drill.svelte: cursor usa animation: blink y se desactiva con reduced motion", () => {
      expect(drillSvelte).toMatch(/\.ch\.current\s*\{[^}]*animation:\s*blink/);
      expect(drillSvelte).toMatch(/@media\s*\(\s*prefers-reduced-motion:\s*reduce\s*\)[\s\S]*?\.ch\.current\s*\{[^}]*animation:\s*none;[^}]*opacity:\s*1/);
      expect(drillSvelte).toMatch(/data-motion="reducido"[\s\S]*?\.ch\.current\s*\{[^}]*animation:\s*none;[^}]*opacity:\s*1/);
    });

    it("tokens.css: desactiva animación del cursor y resetea tokens con reduced motion y data-motion", () => {
      expect(tokensCss).toMatch(/@media\s*\(\s*prefers-reduced-motion:\s*reduce\s*\)[\s\S]*?\.ch\.current\s*\{[^}]*animation:\s*none;\s*opacity:\s*1;/);
      expect(tokensCss).toMatch(/:root\[data-motion="reducido"\]\s*\.ch\.current[\s\S]*?\{[^}]*animation:\s*none;\s*opacity:\s*1;/);
    });
  });

  describe("Issue #16: Texto accesible a lector de pantalla sin inundar pista", () => {
    it("Drill.svelte: textarea y contenedor tienen aria-label descriptivo con el texto de la lección", () => {
      expect(drillSvelte).toMatch(/aria-label=\{`Escribe el texto de la lección: \$\{target\}`\}/);
      expect(drillSvelte).toMatch(/aria-label=\{`Texto de la lección: \$\{target\}`\}/);
    });

    it("Drill.svelte: elementos decorativos tienen aria-hidden='true'", () => {
      expect(drillSvelte).toMatch(/<p\s+class="hint"\s+aria-hidden="true">/);
      expect(drillSvelte).toMatch(/<div\s+class="teclado"\s+aria-hidden="true">/);
    });
  });
});

/**
 * Alto contraste (2.2). Se leen las paletas del propio tokens.css en vez de
 * copiarlas aquí: si alguien retoca un color, se mide el que de verdad se usa.
 */
describe("Alto contraste propio (2.2)", () => {
  /** Declaraciones `--x: #rrggbb` del primer bloque con ese selector exacto. */
  function bloque(selector: string): Record<string, string> {
    const inicio = tokensCss.indexOf(selector + " {");
    expect(inicio, `falta el bloque ${selector}`).toBeGreaterThanOrEqual(0);
    const cuerpo = tokensCss.slice(inicio, tokensCss.indexOf("}", inicio));
    return Object.fromEntries(
      [...cuerpo.matchAll(/(--[a-z-]+):\s*(#[0-9a-f]{6});/gi)].map((m) => [m[1], m[2].toLowerCase()]),
    );
  }

  const CLARO = [
    ':root[data-contrast="alto"]',
    ':root:not([data-contrast])',
  ];
  const OSCURO = [
    ':root[data-contrast="alto"]:not([data-theme="light"])',
    ':root[data-contrast="alto"][data-theme="dark"]',
    ':root:not([data-contrast]):not([data-theme="light"])',
    ':root:not([data-contrast])[data-theme="dark"]',
  ];

  it("se activa por preferencia y también con prefers-contrast: more", () => {
    expect(tokensCss).toMatch(/@media \(prefers-contrast: more\)/);
    expect(tokensCss).toContain(':root[data-contrast="alto"] {');
  });

  it("las copias de cada paleta dicen exactamente lo mismo", () => {
    for (const grupo of [CLARO, OSCURO]) {
      const [primera, ...resto] = grupo.map(bloque);
      expect(Object.keys(primera).length).toBeGreaterThan(20);
      for (const otra of resto) expect(otra).toEqual(primera);
    }
  });

  for (const [nombre, selector] of [["claro", CLARO[0]], ["oscuro", OSCURO[0]]] as const) {
    describe(`paleta ${nombre}`, () => {
      const t = bloque(selector);
      const fondos = ["--bg", "--surface", "--surface-sunken"] as const;

      it("el texto, también el atenuado, llega a 7:1 (AAA) sobre cualquier fondo", () => {
        for (const fondo of fondos) {
          expect(contrast(t["--fg"], t[fondo]), `--fg sobre ${fondo}`).toBeGreaterThanOrEqual(7);
          expect(contrast(t["--fg-muted"], t[fondo]), `--fg-muted sobre ${fondo}`).toBeGreaterThanOrEqual(7);
        }
      });

      it("los bordes se ven de sobra (muy por encima de 3:1)", () => {
        for (const fondo of fondos) {
          expect(contrast(t["--border"], t[fondo])).toBeGreaterThanOrEqual(7);
          expect(contrast(t["--border-strong"], t[fondo])).toBeGreaterThanOrEqual(7);
        }
      });

      it("el acento se lee como texto y como fondo de botón", () => {
        expect(contrast(t["--accent-fg"], t["--accent"])).toBeGreaterThanOrEqual(7);
        expect(contrast(t["--accent"], t["--bg"])).toBeGreaterThanOrEqual(7);
      });

      it("acierto, error y pendiente se leen sobre su fondo y sobre el general", () => {
        for (const estado of ["--ok", "--error", "--pending"]) {
          expect(contrast(t[estado], t[`${estado}-bg`]), estado).toBeGreaterThanOrEqual(7);
          expect(contrast(t[estado], t["--bg"]), estado).toBeGreaterThanOrEqual(7);
        }
      });

      it("los colores de dedo superan 3:1 frente al fondo y la tecla", () => {
        const dedos = Object.keys(t).filter((k) => k.startsWith("--finger-"));
        expect(dedos.length).toBe(9);
        for (const d of dedos) {
          expect(contrast(t[d], t["--bg"]), d).toBeGreaterThanOrEqual(3);
          expect(contrast(t[d], t["--surface-sunken"]), d).toBeGreaterThanOrEqual(3);
        }
      });

      it("la letra atenuada de una tecla casi dominada sigue a 4,5:1 o más", () => {
        for (let d = 0.5; d < DOMINADA; d += 0.01) {
          const atenuado = blend(t["--fg"], t["--surface-sunken"], opacidadEtiqueta(d));
          expect(contrast(atenuado, t["--surface-sunken"])).toBeGreaterThanOrEqual(4.5);
        }
      });
    });
  }

  it("va después del tono de juego, para que su acento no lo pise", () => {
    expect(tokensCss.indexOf(':root[data-contrast="alto"] {'))
      .toBeGreaterThan(tokensCss.lastIndexOf('[data-tono="juego"]'));
  });
});
