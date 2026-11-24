import { describe, it, expect, afterEach } from 'vitest';
import { flushSync, mount, unmount, type ComponentProps } from 'svelte';
import { readFileSync } from 'node:fs';
import PistaDedo from './PistaDedo.svelte';
import pistaSvelte from './PistaDedo.svelte?raw';
import { buildIndex, ES_ISO, type KeyStep } from '../keyboard/layouts';

let componente: ReturnType<typeof PistaDedo> | undefined;

afterEach(async () => {
  if (componente) await unmount(componente);
  componente = undefined;
  document.body.replaceChildren();
});

function montar(props: ComponentProps<typeof PistaDedo>) {
  componente = mount(PistaDedo, { target: document.body, props });
  flushSync();
  return document.querySelector('.pista') as HTMLElement;
}

const indice = buildIndex(ES_ISO);
const paso = (ch: string, n = 0): KeyStep => indice.get(ch)![n];

describe('PistaDedo.svelte', () => {
  it('es decorativa: lo mismo ya lo anuncia la región viva de Drill', () => {
    const raiz = montar({ paso: paso('f') });
    expect(raiz.getAttribute('aria-hidden')).toBe('true');
  });

  it('pinta la teja del color del dedo que toca, con la tecla y el dedo en texto', () => {
    montar({ paso: paso('f') });
    const teja = document.querySelector<HTMLElement>('.teja')!;
    expect(teja.textContent).toBe('f');
    expect(teja.style.getPropertyValue('--dedo')).toBe('var(--finger-l-index)');
    // El color nunca va solo: el título nombra el dedo.
    expect(document.querySelector('.titulo')?.textContent).toBe('«f» con el índice izquierdo');
    expect(document.querySelector('.descripcion')).toBeNull();
  });

  it('en la tarjeta de manos resalta solo la barra del dedo activo', () => {
    montar({ paso: paso('l') });
    const barras = [...document.querySelectorAll<HTMLElement>('.barra')];
    expect(barras).toHaveLength(9);
    const activas = barras.filter((b) => b.classList.contains('activa'));
    expect(activas.map((b) => b.dataset.dedo)).toEqual(['r-ring']);
    // Izquierda a derecha, con el pulgar en medio.
    expect(barras.map((b) => b.dataset.dedo)).toEqual([
      'l-pinky', 'l-ring', 'l-middle', 'l-index', 'thumb',
      'r-index', 'r-middle', 'r-ring', 'r-pinky',
    ]);
    expect(document.querySelector('.leyenda')?.textContent).toBe('IzquierdaDerecha');
  });

  it('la barra activa no se distingue solo por el color: lleva contorno', () => {
    expect(pistaSvelte).toMatch(/\.barra\.activa\s*\{[^}]*outline:\s*3px solid var\(--fg\)/);
    expect(pistaSvelte).toMatch(/\.barra\s*\{[^}]*opacity:\s*0\.28/);
  });

  it('tecla muerta: acento, flecha y la vocal que sigue en una teja discontinua', () => {
    const [acento, vocal] = indice.get('á')!;
    montar({ paso: acento, despues: vocal });
    const tejas = [...document.querySelectorAll<HTMLElement>('.teja')];
    expect(tejas.map((t) => t.textContent)).toEqual(['´', 'a']);
    expect(tejas[1].classList.contains('despues')).toBe(true);
    expect(tejas[1].style.getPropertyValue('--dedo')).toBe('var(--finger-l-pinky)');
    expect(document.querySelector('.flecha')?.textContent).toBe('→');
    expect(document.querySelector('.titulo')?.textContent).toBe('Acento con el meñique derecho');
    expect(document.querySelector('.descripcion')?.textContent)
      .toBe('Es un acento: no se verá nada hasta que pulses la a.');
    expect(pistaSvelte).toMatch(/\.teja\.despues\s*\{[^}]*border:\s*2px dashed var\(--dedo\)/);
  });

  it('con la composición a medias ya pide la vocal, sin flecha', () => {
    montar({ paso: paso('á', 1) });
    expect([...document.querySelectorAll('.teja')].map((t) => t.textContent)).toEqual(['a']);
    expect(document.querySelector('.flecha')).toBeNull();
  });

  it('dice qué modificador hay que mantener', async () => {
    montar({ paso: paso('A') });
    expect(document.querySelector('.descripcion')?.textContent).toBe('Con Mayús pulsada.');
    if (componente) await unmount(componente);
    document.body.replaceChildren();
    montar({ paso: paso('@') });
    expect(document.querySelector('.descripcion')?.textContent).toBe('Con AltGr pulsada.');
  });

  it('el espacio se rotula con su nombre y se asigna al pulgar', () => {
    montar({ paso: paso(' ') });
    expect(document.querySelector('.teja')?.textContent).toBe('Espacio');
    expect(document.querySelector('.titulo')?.textContent).toBe('Espacio con el pulgar');
  });

  it('al terminar la lección lo dice, sin teja', () => {
    montar({ paso: null });
    expect(document.querySelector('.teja')).toBeNull();
    expect(document.querySelector('.fin')?.textContent).toBe('Lección terminada.');
  });

  it('compacta pliega lo primero la tarjeta de manos', () => {
    const raiz = montar({ paso: paso('f'), compacta: true });
    expect(raiz.classList.contains('compacta')).toBe(true);
    expect(pistaSvelte).toMatch(/\.compacta \.manos\s*\{\s*display:\s*none/);
  });

  it('todos los tamaños escalan con --ui-scale: nada de px sueltos en el texto', () => {
    const css = pistaSvelte.slice(pistaSvelte.indexOf('<style>'));
    for (const m of css.matchAll(/(?:^|[\s;{])(?:font-size|(?:min-)?width|height|--lado):\s*([^;]+);/gm)) {
      expect(m[1], m[0]).toMatch(/var\(--|%|^0$/);
    }
  });
});

/**
 * La letra de la teja va en `--on-finger` sobre el color del dedo. La maqueta
 * ponía blanco, y en oscuro (dedos claros) o con el amarillo del índice derecho
 * en claro no llega a 4,5:1. El token lo define tokens.css por tema; aquí se
 * mide lo que hay de verdad.
 */
describe('contraste del texto sobre la teja (--on-finger)', () => {
  const tokensCss = readFileSync('src/styles/tokens.css', 'utf8');

  it('la teja y la tecla siguiente escriben en --on-finger sobre el color del dedo', () => {
    expect(pistaSvelte).toMatch(/\.teja\s*\{[^}]*background:\s*var\(--dedo\);[^}]*color:\s*var\(--on-finger\)/);
  });

  const lum = (hex: string) => {
    const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
      .map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
    return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
  };
  const contraste = (a: string, b: string) => {
    const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
    return (x + 0.05) / (y + 0.05);
  };

  /** Valor hex de un token en el primer bloque que lo define desde `desde`. */
  function valor(nombre: string, desde: string): string | null {
    const i = tokensCss.indexOf(desde);
    if (i < 0) return null;
    const m = tokensCss.slice(i).match(new RegExp(`${nombre}:\\s*(#[0-9a-fA-F]{6});`));
    return m ? m[1] : null;
  }

  const temas = {
    claro: ':root {',
    'oscuro del sistema': '@media (prefers-color-scheme: dark)',
    'oscuro elegido': ':root[data-theme="dark"] {',
  };
  const dedos = ['l-pinky', 'l-ring', 'l-middle', 'l-index', 'thumb',
    'r-index', 'r-middle', 'r-ring', 'r-pinky'];
  // Lo define Fundamentos en tokens.css (dirección visual 1a). Mientras no
  // exista, este bloque no tiene qué medir; en cuanto exista, mide todos los
  // dedos de todos los temas.
  const definido = /--on-finger:\s*#/.test(tokensCss);

  for (const [tema, desde] of Object.entries(temas)) {
    it.skipIf(!definido)(`${tema}: --on-finger llega a 4,5:1 sobre cada dedo`, () => {
      const tinta = valor('--on-finger', desde)!;
      expect(tinta, `${tema}: falta --on-finger`).toMatch(/^#/);
      for (const d of dedos) {
        const fondo = valor(`--finger-${d}`, desde)!;
        expect(contraste(tinta, fondo), `${tema}: --on-finger sobre --finger-${d}`)
          .toBeGreaterThanOrEqual(4.5);
      }
    });
  }
});
