import appSvelte from "../App.svelte?raw";
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import drillSvelte from "./components/Drill.svelte?raw";
import keyboardSvelte from "./components/Keyboard.svelte?raw";
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

/** Valor de un token en el primer bloque que lo define a partir de `desde`. */
function token(nombre: string, desde: string): string {
  const bloque = tokensCss.slice(tokensCss.indexOf(desde));
  const m = bloque.match(new RegExp(`${nombre}:\\s*(#[0-9a-fA-F]{6});`));
  if (!m) throw new Error(`no encuentro ${nombre} tras ${desde}`);
  return m[1];
}

/** Dónde empieza cada paleta normal en tokens.css. */
const TEMAS = {
  claro: ":root {",
  "oscuro del sistema": "@media (prefers-color-scheme: dark)",
  "oscuro elegido": ':root[data-theme="dark"] {',
} as const;

const DEDOS = [
  "--finger-l-pinky", "--finger-l-ring", "--finger-l-middle", "--finger-l-index",
  "--finger-r-index", "--finger-r-middle", "--finger-r-ring", "--finger-r-pinky",
  "--finger-thumb",
] as const;

describe("Accesibilidad visual (WCAG 2.2)", () => {
  // Se leen los valores del propio tokens.css: antes estaban copiados aquí y,
  // al cambiar la paleta, el test seguía midiendo los colores viejos.
  describe("Issue #12: Contraste de bordes de interfaz (>= 3:1, WCAG 1.4.11)", () => {
    for (const [tema, desde] of Object.entries(TEMAS)) {
      it(`${tema}: --border-strong tiene ratio >= 3:1 frente a --surface y --bg`, () => {
        const borde = token("--border-strong", desde);
        expect(contrast(borde, token("--surface", desde))).toBeGreaterThanOrEqual(3.0);
        expect(contrast(borde, token("--bg", desde))).toBeGreaterThanOrEqual(3.0);
      });
    }
  });

  describe("Issue #14: Etiquetas atenuadas del teclado (>= 4.5:1, WCAG 1.4.3)", () => {
    // La tecla puede pintarse sobre --surface o sobre --surface-sunken (las de
    // control): se exige en las dos.
    const FONDOS_TECLA = ["--surface", "--surface-sunken"];

    for (const [tema, desde] of Object.entries(TEMAS)) {
      it(`${tema}: la opacidad mínima de etiqueta atenuada no cae de 4.5:1`, () => {
        const fgTecla = token("--fg", desde);
        for (const fondo of FONDOS_TECLA) {
          const bgTecla = token(fondo, desde);
          for (let d = 0.5; d < DOMINADA; d += 0.01) {
            const opac = opacidadEtiqueta(d);
            const ratio = contrast(blend(fgTecla, bgTecla, opac), bgTecla);
            expect(ratio, `${fondo}, dominio ${d.toFixed(2)} con opac ${opac.toFixed(2)}`)
              .toBeGreaterThanOrEqual(4.5);
          }
        }
      });

      it(`${tema}: el punto de tecla aprendida cumple contraste >= 4.5:1 sobre la tecla`, () => {
        for (const fondo of FONDOS_TECLA) {
          expect(contrast(token("--fg-muted", desde), token(fondo, desde)), fondo)
            .toBeGreaterThanOrEqual(4.5);
        }
      });
    }
  });

  describe("Issue #17: Colores de dedo con contraste >= 3:1 (WCAG 1.4.11)", () => {
    for (const [tema, desde] of Object.entries(TEMAS)) {
      for (const nombre of DEDOS) {
        it(`${tema}: ${nombre} cumple contraste >= 3:1 frente a bg, surface y la tecla`, () => {
          const hex = token(nombre, desde);
          for (const fondo of ["--bg", "--surface", "--surface-sunken"]) {
            expect(contrast(hex, token(fondo, desde)), `${nombre} vs ${fondo}`)
              .toBeGreaterThanOrEqual(3.0);
          }
        });
      }
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

    it("App.svelte: el diálogo de resultado tiene una sola región viva (roadmap 0.11)", () => {
      const dialogo = appSvelte.slice(
        appSvelte.indexOf('id="dialogo-resultado"'),
        appSvelte.indexOf('id="panel-dialogo"'),
      );
      const regiones = dialogo.match(/aria-live=|role="(status|alert|log)"/g) ?? [];
      expect(regiones).toHaveLength(1);
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
    it("Drill.svelte: el nombre del campo es corto y el texto va en aria-describedby (roadmap 0.11)", () => {
      // El nombre con la lección entera se repetía cada vez que volvía el foco.
      expect(drillSvelte).not.toMatch(/aria-label=\{`[^`]*\$\{target\}`\}/);
      expect(drillSvelte).toMatch(/aria-describedby="\{uid\}-texto"/);
    });

    it("Drill.svelte: elementos decorativos tienen aria-hidden='true'", () => {
      expect(drillSvelte).toMatch(/<div\s+class="hint"\s+aria-hidden="true">/);
      expect(drillSvelte).toMatch(/<div\s+class="teclado"\s+aria-hidden="true">/);
    });
  });
});

describe("Contraste de controles y teclas (roadmap 0.10, WCAG 1.4.11)", () => {
  for (const [tema, desde] of Object.entries(TEMAS)) {
    it(`${tema}: el contorno de controles y teclas llega a 3:1 con lo que tiene al lado`, () => {
      const borde = token("--border-strong", desde);
      // La tecla en reposo se rellena con --surface-sunken y está sobre --bg;
      // los controles se pintan sobre --surface o --bg.
      for (const fondo of ["--bg", "--surface", "--surface-sunken"]) {
        expect(contrast(borde, token(fondo, desde)), `${tema}: --border-strong vs ${fondo}`)
          .toBeGreaterThanOrEqual(3.0);
      }
    });
  }

  it("las teclas en reposo se perfilan con --border-strong y no con el borde decorativo", () => {
    expect(keyboardSvelte).toMatch(/'var\(--border-strong\)'\}/);
    expect(keyboardSvelte).not.toMatch(/'var\(--border\)'/);
  });

  it("la caja del texto de práctica y el selector de nivel usan el contorno de control", () => {
    expect(drillSvelte).toMatch(/\.text\s*\{[^}]*border:\s*1px solid var\(--border-strong\)/);
    expect(appSvelte).toMatch(/\.barra-practica select\s*\{[^}]*border:\s*1px solid var\(--border-strong\)/);
  });

  it("el cursor de práctica se ve en alto contraste del sistema (forced-colors)", () => {
    expect(drillSvelte).toMatch(
      /@media\s*\(\s*forced-colors:\s*active\s*\)\s*\{[^@]*\.ch\.current\s*\{[^}]*outline:[^;]*Highlight/,
    );
  });

  it("tokens.css no pone border a un <g> de SVG, que no tiene caja", () => {
    expect(tokensCss).not.toMatch(/\.key\s*\{[^}]*border:/);
    const forzado = tokensCss.slice(tokensCss.indexOf("@media (forced-colors: active)"));
    expect(forzado).toMatch(/--accent:\s*Highlight/);
  });
});

describe("Tipografía para dislexia (roadmap 0.9)", () => {
  // Antes solo se nombraba OpenDyslexic sin incluirla, y en Linux el ajuste no
  // cambiaba nada. Estos tests fallan si la fuente vuelve a quedarse fuera.
  const caras = [...tokensCss.matchAll(/@font-face\s*\{[^}]*\}/g)].map((m) => m[0]);
  const urls = caras.flatMap((c) => [...c.matchAll(/url\("\.\.\/([^"]+)"\)/g)].map((m) => m[1]));

  it("declara OpenDyslexic con @font-face en normal y negrita", () => {
    const deOpenDyslexic = caras.filter((c) => c.includes('font-family: "OpenDyslexic"'));
    expect(deOpenDyslexic.map((c) => c.match(/font-weight:\s*(\d+)/)?.[1]).sort()).toEqual(["400", "700"]);
    expect(urls.length).toBeGreaterThanOrEqual(2);
  });

  it("los ficheros existen, son woff2 de verdad y llevan la licencia OFL al lado", () => {
    for (const url of urls) {
      const binario = readFileSync(`src/${url}`, "latin1");
      expect(binario.slice(0, 4), url).toBe("wOF2");
    }
    const licencia = readFileSync("src/assets/fonts/OFL.txt", "utf8");
    expect(licencia).toContain("SIL OPEN FONT LICENSE Version 1.1");
    expect(licencia).toContain("OpenDyslexic");
  });

  it("la pila para dislexia empieza por la fuente incluida y no por una que no existe en Linux", () => {
    const bloque = tokensCss.slice(tokensCss.indexOf(':root[data-font="dyslexic"]'));
    expect(bloque).toMatch(/--font-stack:\s*"OpenDyslexic"/);
    expect(bloque).toMatch(/--font-drill:\s*"OpenDyslexic"/);
    expect(tokensCss).not.toContain("Comic Sans");
    expect(tokensCss).not.toContain("OpenDyslexic Mono");
  });

  it("el teclado conserva la monoespaciada con la que está medida su geometría", () => {
    expect(keyboardSvelte).toMatch(/\.lbl\s*\{[^}]*font-family:\s*var\(--font-key\)/);
    const bloque = tokensCss.slice(tokensCss.indexOf(':root[data-font="dyslexic"]'));
    expect(bloque.slice(0, bloque.indexOf("}"))).not.toContain("--font-key");
  });
});

describe("Tipografía Atkinson Hyperlegible, incluida con la app", () => {
  const caras = [...tokensCss.matchAll(/@font-face\s*\{[^}]*\}/g)].map((m) => m[0]);

  for (const familia of ["Atkinson Hyperlegible Next", "Atkinson Hyperlegible Mono"]) {
    it(`${familia}: normal, media y negrita, en woff2 de verdad y sin pedir nada a la red`, () => {
      const propias = caras.filter((c) => c.includes(`font-family: "${familia}"`));
      expect(propias.map((c) => c.match(/font-weight:\s*(\d+)/)?.[1]).sort()).toEqual(["400", "500", "700"]);
      for (const cara of propias) {
        const url = cara.match(/url\("\.\.\/([^"]+)"\)/)?.[1];
        expect(url, "cada cara apunta a un fichero del paquete").toMatch(/^assets\/fonts\/.+\.woff2$/);
        expect(readFileSync(`src/${url}`, "latin1").slice(0, 4), url).toBe("wOF2");
      }
      const licencia = readFileSync(`src/assets/fonts/OFL-${familia.replace(/ /g, "")}.txt`, "utf8");
      expect(licencia).toContain("SIL Open Font License, Version 1.1");
      expect(licencia).toContain(familia);
    });
  }

  it("ninguna fuente se carga de un servidor", () => {
    expect(tokensCss).not.toMatch(/url\(["']?https?:/);
    expect(tokensCss).not.toMatch(/@import/);
  });

  it("la interfaz va en Next y el texto de práctica y las teclas en Mono", () => {
    expect(tokensCss).toMatch(/--font-ui:\s*"Atkinson Hyperlegible Next",/);
    expect(tokensCss).toMatch(/--font-drill:\s*"Atkinson Hyperlegible Mono",/);
    expect(tokensCss).toMatch(/--font-key:\s*"Atkinson Hyperlegible Mono",/);
  });
});

/**
 * Pares de color de la dirección visual 1a. Cada par es uno que un componente
 * pinta de verdad (texto sobre fondo); si alguien retoca la paleta, se mide el
 * valor nuevo.
 */
describe("Paleta: texto sobre sus fondos (WCAG 1.4.3, 4,5:1)", () => {
  for (const [tema, desde] of Object.entries(TEMAS)) {
    const t = (nombre: string) => token(nombre, desde);
    const par = (texto: string, fondo: string) =>
      expect(contrast(t(texto), t(fondo)), `${tema}: ${texto} sobre ${fondo}`).toBeGreaterThanOrEqual(4.5);

    it(`${tema}: --on-finger se lee sobre CUALQUIER color de dedo`, () => {
      // La tecla siguiente y la teja de la pista ponen la letra encima del
      // color del dedo. La maqueta la ponía siempre en blanco, y en oscuro (o
      // con el amarillo del índice derecho en claro) no llegaba.
      for (const dedo of DEDOS) par("--on-finger", dedo);
    });

    it(`${tema}: el botón principal y el cursor del texto (--accent-fg sobre --accent)`, () => {
      par("--accent-fg", "--accent");
    });

    it(`${tema}: los enlaces y chips en acento (--accent-ink)`, () => {
      for (const fondo of ["--surface", "--bg", "--accent-soft"]) par("--accent-ink", fondo);
    });

    it(`${tema}: la insignia de récord (--on-celebracion sobre --celebracion)`, () => {
      par("--on-celebracion", "--celebracion");
      par("--fg", "--celebracion-soft");
    });

    it(`${tema}: el texto secundario sobre los tres fondos`, () => {
      for (const fondo of ["--surface", "--bg", "--surface-sunken"]) {
        par("--fg-muted", fondo);
        par("--fg", fondo);
      }
    });

    it(`${tema}: acierto, error y aviso sobre su fondo y sobre el papel`, () => {
      for (const estado of ["--ok", "--error", "--pending"]) {
        par(estado, `${estado}-bg`);
        par(estado, "--surface");
      }
    });

    it(`${tema}: el contorno de controles llega a 3:1 (WCAG 1.4.11)`, () => {
      for (const fondo of ["--bg", "--surface", "--surface-sunken"]) {
        expect(contrast(t("--border-strong"), t(fondo))).toBeGreaterThanOrEqual(3);
      }
    });
  }
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

      it("los tokens nuevos de la paleta también se leen (on-finger, accent-ink, celebración)", () => {
        const dedos = Object.keys(t).filter((k) => k.startsWith("--finger-"));
        for (const d of dedos) {
          expect(contrast(t["--on-finger"], t[d]), `--on-finger sobre ${d}`).toBeGreaterThanOrEqual(4.5);
        }
        for (const fondo of [...fondos, "--accent-soft"]) {
          expect(contrast(t["--accent-ink"], t[fondo]), `--accent-ink sobre ${fondo}`).toBeGreaterThanOrEqual(7);
        }
        expect(contrast(t["--on-celebracion"], t["--celebracion"])).toBeGreaterThanOrEqual(7);
        expect(contrast(t["--fg"], t["--celebracion-soft"])).toBeGreaterThanOrEqual(7);
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
