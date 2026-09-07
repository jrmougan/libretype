/**
 * Presupuesto geométrico de las etiquetas del teclado en pantalla (issue #13).
 *
 * ## Qué protege esto y por qué no es un test de estilo
 *
 * Las letras del teclado son texto SVG: sus `font-size` están en unidades del
 * `viewBox`, no en píxeles reales, así que escalan con la caja del teclado y no
 * con `--ui-scale`. Como el teclado es la pieza que absorbe el espacio sobrante,
 * subir el texto al 200% lo comprimía hasta su suelo y sus letras acababan MÁS
 * pequeñas que al 100%: exactamente lo que WCAG 1.4.4 prohíbe.
 *
 * El arreglo tiene dos palancas, y cada una sirve para un caso distinto:
 *
 * - `--factor-tecla` (tokens.css) agranda la letra DENTRO de la tecla. Es lo
 *   único que sirve cuando el límite es el ANCHO de la ventana, que es el caso
 *   de la lección cero (teclado y texto van uno al lado del otro).
 * - el suelo de `.teclado` (Drill.svelte) agranda el teclado ENTERO. Es lo único
 *   que sirve cuando el límite es el ALTO.
 *
 * La primera palanca tiene un techo duro: la `y` de cada etiqueta es una
 * constante del `viewBox`, así que al crecer la fuente la letra de Mayús se
 * echa encima de la principal. Por eso `--factor-tecla` lleva tope y por eso la
 * etiqueta de Mayús se sube en proporción al factor. Las tres cosas —tope,
 * subida y geometría de la tecla— son un solo cálculo, y este test es el que
 * impide que alguien toque una y deje las otras dos atrás.
 *
 * ## Las constantes de aquí abajo están MEDIDAS, no supuestas
 *
 * No se pueden calcular: dependen de la métrica real de la fuente
 * monoespaciada del sistema (`--font-drill`). Se midieron sobre el SVG real en
 * Chrome con la app corriendo, tomando el peor caso de todas las teclas del
 * layout ES-ISO. Para remedirlas: `pnpm dev`, abrir una lección y en la consola
 *
 *     const svg = document.querySelector('svg.keyboard');
 *     const p = svg.getScreenCTM();
 *     for (const g of svg.querySelectorAll('g.key')) {
 *       for (const t of g.querySelectorAll('text')) {
 *         const b = t.getBBox(), m = t.getScreenCTM();
 *         const dy = (m.f - p.f) / p.d;       // translateY aplicado, en unidades
 *         const fs = parseFloat(getComputedStyle(t).fontSize);
 *         const base = +t.getAttribute('y');
 *         console.log(t.textContent.trim(),
 *           'asc', (base + dy - b.y) / fs, 'desc', (b.y + b.height - base - dy) / fs);
 *       }
 *     }
 *
 * y quedarse con el MÁXIMO de cada columna, redondeando hacia arriba. Hay que
 * repetirlo con `--ui-scale` a 1 y a 2, porque el `hinting` cambia el bbox.
 *
 * Los valores de abajo son deliberadamente algo más pesimistas que lo medido
 * (medido: ascendente 0,952 · descendente 0,251 · avance 0,6022), para que el
 * test no dependa de la fuente exacta de la máquina que lo ejecuta ni del motor
 * (la app corre sobre WKWebView, WebKitGTK y WebView2, con métricas distintas).
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { LAYOUTS } from './layouts';
// Los componentes llegan como texto con el `?raw` de Vite. El CSS no puede:
// vitest sustituye por cadena vacía cualquier import de un `.css`, incluso con
// `?raw`, así que ese se lee del disco. El porqué de los tipos está en
// `geometria.node.d.ts`. La ruta es relativa a la raíz del proyecto, que es
// desde donde vitest ejecuta (`pnpm test`).
import teclado from '../components/Keyboard.svelte?raw';
import drill from '../components/Drill.svelte?raw';

const tokens = (() => {
  try {
    return readFileSync('src/styles/tokens.css', 'utf8');
  } catch {
    throw new Error(
      'No puedo leer src/styles/tokens.css. Este test se ejecuta desde la raíz ' +
        'del proyecto (`pnpm test`); desde un subdirectorio no encuentra el fichero.',
    );
  }
})();

/** Ascendente del glifo por encima de la línea base, en múltiplos del font-size. */
const ASCENDENTE_EM = 0.96;
/** Descendente del glifo por debajo de la línea base, en múltiplos del font-size. */
const DESCENDENTE_EM = 0.26;
/** Ancho de un carácter de la monoespaciada, en múltiplos del font-size. */
const AVANCE_EM = 0.61;
/**
 * Holgura mínima que le exigimos a cada lado de una etiqueta larga dentro de su
 * tecla. No es estética: sin ella el texto toca el borde y parece un fallo de
 * dibujo. Medido con `Bloq Mayús` al tope: sobran 10,97 unidades.
 */
const HOLGURA_HORIZONTAL_MIN = 4;

/** Extrae un número de una expresión, o falla con un mensaje que se entienda. */
function capturar(fuente: string, re: RegExp, que: string): string {
  const m = fuente.match(re);
  if (!m) {
    throw new Error(
      `No encuentro ${que}. Si lo has movido o reescrito, actualiza este test: ` +
        'existe para que el tope del factor y la geometría de la tecla no se ' +
        'separen nunca (issue #13).',
    );
  }
  return m[1];
}

// --- Lo que dice el CSS ahora mismo -----------------------------------------

/** `--factor-tecla: min(TOPE, BASE + PENDIENTE * var(--ui-scale))` */
const factorTecla = capturar(
  tokens,
  /--factor-tecla:\s*([^;]+);/,
  '`--factor-tecla` en src/styles/tokens.css',
);
const [, topeStr, baseStr, pendienteStr] =
  factorTecla.match(
    /min\(\s*([\d.]+)\s*,\s*([\d.]+)\s*\+\s*([\d.]+)\s*\*\s*var\(--ui-scale\)\s*\)/,
  ) ??
  (() => {
    throw new Error(
      `\`--factor-tecla\` ya no tiene la forma min(tope, base + pendiente * var(--ui-scale)): ` +
        `vale «${factorTecla}». Si cambias la forma, este test tiene que saber ` +
        'calcular el tope, porque es lo que se compara con el presupuesto geométrico.',
    );
  })();

const TOPE = Number(topeStr);
const BASE = Number(baseStr);
const PENDIENTE = Number(pendienteStr);

/** `.sup { transform: translateY(calc(-Npx * (var(--factor-tecla) - 1))) }` */
const reglaSup = capturar(
  teclado,
  /\.sup\s*\{([^}]*)\}/,
  'la regla `.sup` en src/lib/components/Keyboard.svelte',
);
const SUBIDA_POR_UNIDAD = Number(
  capturar(
    reglaSup,
    /translateY\(\s*calc\(\s*-([\d.]+)px\s*\*/,
    'el `translateY` de `.sup`',
  ),
);

// Geometría de la tecla, leída del componente para que mover una constante allí
// rompa este test en vez de romper el teclado en silencio.
const U = Number(capturar(teclado, /const U = (\d+)/, 'el ancho de tecla `U`'));
const GAP = Number(capturar(teclado, /const GAP = (\d+)/, 'la separación `GAP`'));
const H = Number(capturar(teclado, /const H = (\d+)/, 'el alto de tecla `H`'));

/**
 * Línea base de la etiqueta de Mayús: `y={k.y + 19}`. Se localiza por el bloque
 * `{#if k.shift}` y no por la clase, para que quitar la clase falle en su
 * propio test —con un mensaje que se entienda— y no aquí al leer el fichero.
 */
const BASE_SUP = Number(
  capturar(
    teclado,
    /\{#if k\.shift\}\s*<text[^>]*y=\{k\.y \+ (\d+)\}/,
    'la línea base de la etiqueta de Mayús',
  ),
);
/** Línea base de la letra principal: `y={k.y + H - 17}`. */
const BASE_MAIN =
  H - Number(capturar(teclado, /y=\{k\.y \+ H - (\d+)\} class="lbl main"/, 'la línea base de `.main`'));
/** Borde superior de la barra de color del dedo: `y={k.y + H - 7}`. */
const BARRA_DEDO =
  H - Number(capturar(teclado, /y=\{k\.y \+ H - (\d+)\} width=\{k\.w - 10\}/, 'la barra del dedo'));

/** Tamaños de fuente base, en unidades del viewBox, antes de aplicar el factor. */
const PX_MAIN = Number(capturar(tokens, /--text-key-main:\s*calc\(([\d.]+)px/, '`--text-key-main`'));
const PX_SMALL = Number(capturar(tokens, /--text-key-small:\s*calc\(([\d.]+)px/, '`--text-key-small`'));
const PX_TINY = Number(capturar(tokens, /--text-key-tiny:\s*calc\(([\d.]+)px/, '`--text-key-tiny`'));

// --- El cálculo del presupuesto ---------------------------------------------

/** Cuánto se sube la etiqueta de Mayús para un factor dado. */
const subida = (factor: number) => SUBIDA_POR_UNIDAD * (factor - 1);

/** Borde superior del bbox de la etiqueta de Mayús, relativo a la tecla. */
const supArriba = (f: number) => BASE_SUP - subida(f) - ASCENDENTE_EM * PX_TINY * f;
/** Borde inferior del bbox de la etiqueta de Mayús. */
const supAbajo = (f: number) => BASE_SUP - subida(f) + DESCENDENTE_EM * PX_TINY * f;
/** Borde superior del bbox de la letra principal. */
const mainArriba = (f: number) => BASE_MAIN - ASCENDENTE_EM * PX_MAIN * f;
/** Borde inferior del bbox de la letra principal. */
const mainAbajo = (f: number) => BASE_MAIN + DESCENDENTE_EM * PX_MAIN * f;

/**
 * El factor más alto que aún cabe. Se busca numéricamente en vez de despejarlo
 * a mano para que siga valiendo si alguien cambia la subida o la geometría: lo
 * que manda es la definición de arriba, no un despeje escrito una vez.
 */
function factorMaximo(): number {
  let f = 1;
  for (let p = 1; p <= 4; p++) {
    const paso = 10 ** -p;
    while (
      supArriba(f + paso) > 0 &&
      mainArriba(f + paso) > supAbajo(f + paso) &&
      mainAbajo(f + paso) < BARRA_DEDO
    ) {
      f += paso;
    }
  }
  return f;
}

describe('presupuesto geométrico de las etiquetas del teclado', () => {
  it('a escala 1 el factor vale exactamente 1: el 100% no cambia', () => {
    // Si esto falla, subir la letra de la interfaz deja de ser gratis para quien
    // no lo ha pedido: cambiaría el teclado de todo el mundo.
    expect(Math.min(TOPE, BASE + PENDIENTE * 1)).toBeCloseTo(1, 10);
    expect(subida(Math.min(TOPE, BASE + PENDIENTE * 1))).toBeCloseTo(0, 10);
  });

  it('el factor está topado y el tope es menor que el presupuesto geométrico', () => {
    const maximo = factorMaximo();
    // Con la geometría de hoy (tecla de 58, Mayús en y+19, principal en y+41,
    // barra del dedo en y+51) y una subida de 20u por unidad de factor, el
    // máximo sale 1,276 y lo que ata es el BORDE SUPERIOR de la tecla: la
    // etiqueta de Mayús se sale por arriba antes de chocar con la principal,
    // precisamente porque `.sup` la va subiendo. Con el tope en 1,25 el cálculo
    // deja 0,80u contra el borde y 0,63u contra la principal; medido en Chrome
    // son 0,91u y 1,52u (las constantes de arriba son a propósito pesimistas).
    expect(TOPE).toBeLessThanOrEqual(maximo);
    expect(TOPE).toBeGreaterThan(1); // si no, la palanca no hace nada
  });

  it('al tope, la etiqueta de Mayús no se sale de la tecla por arriba', () => {
    expect(supArriba(TOPE)).toBeGreaterThan(0);
  });

  it('al tope, Mayús y la letra principal no se pisan', () => {
    expect(mainArriba(TOPE) - supAbajo(TOPE)).toBeGreaterThan(0);
  });

  it('al tope, la letra principal no invade la barra de color del dedo', () => {
    expect(mainAbajo(TOPE)).toBeLessThan(BARRA_DEDO);
  });

  it('el factor sube con la escala y llega al tope dentro del rango 100–200%', () => {
    // El rango de --ui-scale es 100–200% (preferencias.ts). Si la rampa fuera
    // tan lenta que no llegase al tope, el 200% no aprovecharía el presupuesto.
    expect(BASE + PENDIENTE * 1).toBeCloseTo(1, 10);
    expect(BASE + PENDIENTE * 2).toBeGreaterThanOrEqual(TOPE);
  });

  it('al tope, ninguna etiqueta larga desborda su tecla', () => {
    for (const layout of Object.values(LAYOUTS)) {
      for (const fila of layout.rows) {
        for (const k of fila) {
          if (!k.label) continue;
          const ancho = (k.width ?? 1) * U + ((k.width ?? 1) - 1) * GAP;
          const texto = k.label.length * AVANCE_EM * PX_SMALL * TOPE;
          const holgura = (ancho - texto) / 2;
          expect(
            holgura,
            `«${k.label}» (${layout.id}) mide ${texto.toFixed(1)}u en una tecla de ${ancho}u`,
          ).toBeGreaterThan(HOLGURA_HORIZONTAL_MIN);
        }
      }
    }
  });
});

describe('las dos palancas siguen enchufadas', () => {
  it('los tres tamaños de letra del teclado salen del factor', () => {
    // Si alguno vuelve a `var(--ui-scale)` a pelo, se lleva por delante el tope
    // y vuelven las etiquetas superpuestas de la primera implementación.
    for (const token of ['--text-key-main', '--text-key-small', '--text-key-tiny']) {
      const valor = capturar(tokens, new RegExp(`${token}:\\s*([^;]+);`), token);
      expect(valor, `${token} tiene que multiplicar por var(--factor-tecla)`).toContain(
        'var(--factor-tecla)',
      );
      expect(valor).not.toContain('var(--ui-scale)');
    }
  });

  it('la subida de la etiqueta de Mayús va ligada al factor, no a la escala', () => {
    // Tienen que moverse juntas: la subida existe únicamente para hacer sitio a
    // lo que ha crecido la fuente. Atarla a --ui-scale la haría seguir subiendo
    // después de que la fuente haya llegado al tope, y la etiqueta se saldría.
    expect(reglaSup).toContain('var(--factor-tecla)');
    expect(reglaSup).not.toContain('var(--ui-scale)');
    expect(SUBIDA_POR_UNIDAD).toBeGreaterThan(0);
  });

  it('la etiqueta de Mayús lleva la clase que la sube', () => {
    // El `.sup` del CSS no sirve de nada si el marcado no lo lleva.
    expect(teclado).toMatch(/class="lbl tiny sup"/);
  });

  it('el suelo del teclado multiplica el min() entero, no una de sus ramas', () => {
    // `min(34vh, calc(230px * var(--ui-scale)))` —lo que proponía la issue— NO
    // funciona: min() coge el menor, y a 771px de alto el menor sigue siendo
    // 34vh. Medido: da 15,2px al 200% en vez de 33,4px.
    const suelo = capturar(drill, /\.teclado\s*\{[^}]*min-height:\s*([^;]+);/, 'el suelo de `.teclado`');
    expect(suelo).toContain('var(--ui-scale)');
    expect(suelo.replace(/\s+/g, '')).toBe('calc(min(34vh,230px)*var(--ui-scale))');
  });
});
