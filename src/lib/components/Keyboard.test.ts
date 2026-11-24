import { describe, it, expect, vi, afterEach } from 'vitest';
import { flushSync, mount, unmount, type ComponentProps } from 'svelte';
import Keyboard from './Keyboard.svelte';
import { ES_ISO, type KeyStep } from '../keyboard/layouts';

let componente: ReturnType<typeof Keyboard> | undefined;

afterEach(async () => {
  if (componente) await unmount(componente);
  componente = undefined;
  document.body.replaceChildren();
  vi.restoreAllMocks();
});

function montar(props: Partial<ComponentProps<typeof Keyboard>> = {}) {
  componente = mount(Keyboard, {
    target: document.body,
    props: {
      layout: ES_ISO,
      held: new Set<string>(),
      ...props,
    },
  });
  flushSync();
  return document.querySelector('svg.keyboard') as SVGSVGElement;
}

describe('Keyboard.svelte (Issue #36)', () => {
  describe('estructura SVG y accesibilidad', () => {
    it('renderiza un elemento SVG con role="img" y viewBox adecuado', () => {
      const svg = montar();
      expect(svg).not.toBeNull();
      expect(svg.getAttribute('role')).toBe('img');
      // Margen arriba (triángulo y anillo de la tecla siguiente) y a los lados
      // (el anillo sobresale de la tecla): dentro del viewBox, para que escalen.
      expect(svg.getAttribute('viewBox')).toMatch(/^-\d+ -\d+ \d+ \d+$/);
      expect(svg.getAttribute('preserveAspectRatio')).toBe('xMidYMid meet');
    });

    it('etiqueta por defecto sin tecla activa', () => {
      const svg = montar({ next: null });
      expect(svg.getAttribute('aria-label')).toBe('Teclado en pantalla.');
    });

    it('etiqueta accesible cuando hay siguiente tecla', () => {
      const pasoA: KeyStep = {
        code: 'KeyA',
        char: 'a',
        finger: 'l-pinky',
        shift: false,
        altgr: false,
        dead: false,
      };
      const svg = montar({ next: pasoA });
      expect(svg.getAttribute('aria-label')).toBe(
        'Teclado en pantalla. Siguiente tecla: a, con el meñique izquierdo',
      );
    });

    it('etiqueta accesible para la barra espaciadora', () => {
      const pasoEspacio: KeyStep = {
        code: 'Space',
        char: ' ',
        finger: 'thumb',
        shift: false,
        altgr: false,
        dead: false,
      };
      const svg = montar({ next: pasoEspacio });
      expect(svg.getAttribute('aria-label')).toBe(
        'Teclado en pantalla. Siguiente tecla: espacio, con el pulgar',
      );
    });

    it('etiqueta accesible para tecla muerta (acento)', () => {
      const pasoAcento: KeyStep = {
        code: 'Quote',
        char: '´',
        finger: 'r-pinky',
        shift: false,
        altgr: false,
        dead: true,
      };
      const svg = montar({ next: pasoAcento });
      expect(svg.getAttribute('aria-label')).toBe(
        'Teclado en pantalla. Siguiente tecla: ´, con el meñique derecho. Es un acento: no aparecerá nada hasta la letra siguiente.',
      );
    });

    it('permite sobrescribir la etiqueta accesible mediante la prop etiqueta', () => {
      const svg = montar({ etiqueta: 'Colocación de manos: fila de reposo' });
      expect(svg.getAttribute('aria-label')).toBe('Colocación de manos: fila de reposo');
    });
  });

  describe('estados de las teclas (idle, next, pressed, error)', () => {
    it('muestra la tecla objetivo (next) rellena del dedo, con anillo y triángulo', () => {
      const pasoF: KeyStep = {
        code: 'KeyF',
        char: 'f',
        finger: 'l-index',
        shift: false,
        altgr: false,
        dead: false,
      };
      montar({ next: pasoF });

      const grupoF = document.querySelector('g.key.next');
      expect(grupoF).not.toBeNull();
      const texto = grupoF?.querySelector('text.main');
      expect(texto?.textContent).toBe('f');

      // Rellena del color del dedo y con la letra en el token que contrasta.
      expect(grupoF?.querySelector('rect.cap')?.getAttribute('fill')).toBe('var(--finger-l-index)');
      expect(texto?.getAttribute('fill')).toBe('var(--on-finger)');

      // No depende solo del color: lleva anillo y triángulo (señales de forma).
      const anillo = grupoF?.querySelector('rect.anillo');
      expect(anillo?.getAttribute('fill')).toBe('none');
      expect(anillo?.getAttribute('stroke')).toBe('var(--finger-l-index)');
      const triangulo = grupoF?.querySelector('path');
      expect(triangulo).not.toBeNull();
      expect(triangulo?.getAttribute('fill')).toBe('var(--on-finger)');
    });

    it('dibuja la tecla siguiente la última, para que su anillo quede encima', () => {
      const pasoF: KeyStep = {
        code: 'KeyF', char: 'f', finger: 'l-index', shift: false, altgr: false, dead: false,
      };
      montar({ next: pasoF });
      const grupos = document.querySelectorAll('g.key');
      expect(grupos[grupos.length - 1].classList.contains('next')).toBe(true);
    });

    it('marca la tecla como pressed cuando está en held', () => {
      montar({ held: new Set(['KeyJ']) });
      const grupoJ = document.querySelector('g.key.pressed');
      expect(grupoJ).not.toBeNull();
      expect(grupoJ?.querySelector('text.main')?.textContent).toBe('j');

      const rect = grupoJ?.querySelector('rect.cap');
      expect(rect?.getAttribute('fill')).toBe('var(--accent)');
      expect(grupoJ?.classList.contains('wrong')).toBe(false);
    });

    it('marca la tecla con error visual si lastWrong es true', () => {
      montar({ held: new Set(['KeyJ']), lastWrong: true });
      const grupoJ = document.querySelector('g.key.pressed.wrong');
      expect(grupoJ).not.toBeNull();

      const rect = grupoJ?.querySelector('rect.cap');
      expect(rect?.getAttribute('fill')).toBe('var(--error-bg)');
      expect(rect?.getAttribute('stroke')).toBe('var(--error)');
    });
  });

  describe('modificadores (Shift y AltGr)', () => {
    it('resalta las dos teclas Shift cuando next requiere shift', () => {
      const pasoMayusA: KeyStep = {
        code: 'KeyA',
        char: 'A',
        finger: 'l-pinky',
        shift: true,
        altgr: false,
        dead: false,
      };
      montar({ next: pasoMayusA });

      const gruposMod = document.querySelectorAll('g.key.mod');
      expect(gruposMod.length).toBeGreaterThanOrEqual(2);

      const modCodes = Array.from(gruposMod).map((g) => g.querySelector('text')?.textContent);
      expect(modCodes).toContain('Mayús');

      // Las teclas modificadoras inactivas llevan borde discontinuo
      const rectMod = gruposMod[0].querySelector('rect.cap');
      expect(rectMod?.getAttribute('stroke-dasharray')).toBe('7 4');
    });

    it('resalta AltRight cuando next requiere altgr', () => {
      const pasoArroba: KeyStep = {
        code: 'Digit2',
        char: '@',
        finger: 'l-ring',
        shift: false,
        altgr: true,
        dead: false,
      };
      montar({ next: pasoArroba });

      const grupoAltGr = document.querySelector('g.key.mod');
      expect(['AltGr', 'Opción']).toContain(grupoAltGr?.querySelector('text')?.textContent);
    });
  });

  describe('teclas de la fila de reposo y colores por dedo', () => {
    it('lleva la muesca del relieve en la F y la J, y solo en ellas', () => {
      montar();
      // Como en el teclado de verdad: el relieve es lo que permite volver a la
      // fila de reposo sin mirar, y por eso solo lo llevan los dos índices.
      const conMuesca = Array.from(document.querySelectorAll('g.key'))
        .filter((g) => g.querySelector('rect.muesca'))
        .map((g) => g.querySelector('text.main')?.textContent);
      expect(conMuesca.sort()).toEqual(['f', 'j']);
    });

    it('las teclas de control van hundidas y con el rótulo centrado', () => {
      montar();
      const tab = Array.from(document.querySelectorAll('g.key.control')).find(
        (g) => g.querySelector('text')?.textContent?.trim() === 'Intro',
      );
      expect(tab?.querySelector('rect.cap')?.getAttribute('fill')).toBe('var(--surface-sunken)');
      expect(tab?.querySelector('text')?.classList.contains('small')).toBe(true);
    });

    it('las teclas de carácter se perfilan con el contorno de control (3:1)', () => {
      montar();
      const a = Array.from(document.querySelectorAll('g.key')).find(
        (g) => g.querySelector('text.main')?.textContent === 'a',
      );
      expect(a?.querySelector('rect.cap')?.getAttribute('fill')).toBe('var(--surface)');
      expect(a?.querySelector('rect.cap')?.getAttribute('stroke')).toBe('var(--border-strong)');
    });

    it('incluye barras de color del dedo en las teclas', () => {
      montar();
      const grupoA = Array.from(document.querySelectorAll('g.key')).find(
        (g) => g.querySelector('text.main')?.textContent === 'a',
      );
      expect(grupoA).not.toBeUndefined();
      const rectDedo = Array.from(grupoA!.querySelectorAll('rect')).find((r) =>
        r.getAttribute('fill')?.includes('var(--finger-'),
      );
      expect(rectDedo).not.toBeUndefined();
      expect(rectDedo?.getAttribute('fill')).toBe('var(--finger-l-pinky)');
    });
  });

  describe('teclas guía (guia) para lección cero', () => {
    it('resalta el grupo de teclas indicado en guia', () => {
      const guia = new Set(['KeyA', 'KeyS', 'KeyD', 'KeyF']);
      montar({ guia });

      // Las teclas en guía se renderizan con borde y fondo activos
      const grupos = Array.from(document.querySelectorAll('g.key'));
      const teclasResaltadas = grupos.filter((g) => {
        const main = g.querySelector('text.main')?.textContent;
        return main && ['a', 's', 'd', 'f'].includes(main);
      });

      expect(teclasResaltadas).toHaveLength(4);
      for (const g of teclasResaltadas) {
        const rect = g.querySelector('rect.cap');
        expect(rect?.getAttribute('stroke')).toBe('var(--accent)');
      }
    });

    it('variante reposo: fondo suave y borde del dedo, letras centradas en mayúscula', () => {
      const guia = new Set(['KeyA', 'KeyS', 'KeyD', 'KeyF', 'KeyJ', 'KeyK', 'KeyL', 'Semicolon']);
      montar({ guia, variante: 'reposo' });

      const s = Array.from(document.querySelectorAll('g.key.guia')).find(
        (g) => g.querySelector('text.main')?.textContent === 'S',
      );
      expect(s).not.toBeUndefined();
      const cap = s!.querySelector('rect.cap')!;
      expect(cap.getAttribute('stroke')).toBe('var(--finger-l-ring)');
      expect(cap.getAttribute('fill')).toBe('color-mix(in srgb, var(--finger-l-ring) 18%, var(--surface))');
      expect(s!.querySelector('text.main')?.classList.contains('centro')).toBe(true);
      // Sin las etiquetas pequeñas de Mayús y AltGr.
      expect(document.querySelector('text.sup')).toBeNull();
    });

    it('variante reposo: la F y la J se dibujan como la tecla siguiente', () => {
      const guia = new Set(['KeyA', 'KeyS', 'KeyD', 'KeyF', 'KeyJ', 'KeyK', 'KeyL', 'Semicolon']);
      montar({ guia, variante: 'reposo' });
      const siguientes = Array.from(document.querySelectorAll('g.key.next'))
        .map((g) => g.querySelector('text.main')?.textContent);
      expect(siguientes.sort()).toEqual(['F', 'J']);
      expect(document.querySelectorAll('g.key.next path')).toHaveLength(2);
    });

    it('variante reposo: objetivos explícitos mandan sobre los de por defecto', () => {
      montar({ guia: new Set(['Space']), variante: 'reposo', objetivos: new Set(['Space']) });
      const siguientes = document.querySelectorAll('g.key.next');
      expect(siguientes).toHaveLength(1);
      expect(siguientes[0].querySelector('text')?.textContent?.trim()).toBe('Espacio');
    });

    it('sin variante, la guía no marca ninguna tecla como siguiente', () => {
      montar({ guia: new Set(['KeyF', 'KeyJ']) });
      expect(document.querySelector('g.key.next')).toBeNull();
    });
  });

  describe('retirada progresiva de ayuda visual (dominio)', () => {
    it('muestra letra completa con opacidad 1 cuando el dominio es 0', () => {
      montar();
      const textoA = Array.from(document.querySelectorAll('text.main')).find(
        (t) => t.textContent === 'a',
      );
      expect(textoA?.getAttribute('opacity')).toBe('1');
    });

    it('sustituye la letra por un punto cuando la tecla está dominada (opacidad 0)', () => {
      // dominio = 1.0 -> opacidad 0 según opacidadEtiqueta
      const dominios = new Map([['KeyA', 1.0]]);
      montar({ dominios });

      const grupoA = Array.from(document.querySelectorAll('g.key')).find(
        (g) => g.querySelector('text.main')?.textContent === 'a',
      );
      expect(grupoA).not.toBeUndefined();

      const textoA = grupoA?.querySelector('text.main');
      expect(textoA?.getAttribute('opacity')).toBe('0');

      // Comprueba el círculo en vez de dejar la tecla vacía
      const punto = grupoA?.querySelector('circle');
      expect(punto).not.toBeNull();
      expect(punto?.getAttribute('r')).toBe('3.5');
      expect(punto?.getAttribute('fill')).toBe('var(--fg-muted)');
    });

    it('casi dominada: se atenúa pero no baja de 0,65 y sigue con letra', () => {
      montar({ dominios: new Map([['KeyA', 0.84]]) });
      const textoA = Array.from(document.querySelectorAll('text.main')).find(
        (t) => t.textContent === 'a',
      );
      expect(Number(textoA?.getAttribute('opacity'))).toBeGreaterThanOrEqual(0.65);
      expect(Number(textoA?.getAttribute('opacity'))).toBeLessThan(1);
    });
  });
});
