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
      expect(svg.getAttribute('viewBox')).toMatch(/^0 -16 \d+ \d+$/);
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
    it('muestra la tecla objetivo (next) con el triángulo y clase next', () => {
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

      // Comprueba el triángulo señalizador encima de la tecla
      const triangulo = grupoF?.querySelector('path');
      expect(triangulo).not.toBeNull();
      expect(triangulo?.getAttribute('fill')).toBe('var(--accent)');
    });

    it('marca la tecla como pressed cuando está en held', () => {
      montar({ held: new Set(['KeyJ']) });
      const grupoJ = document.querySelector('g.key.pressed');
      expect(grupoJ).not.toBeNull();
      expect(grupoJ?.querySelector('text.main')?.textContent).toBe('j');

      const rect = grupoJ?.querySelector('rect');
      expect(rect?.getAttribute('fill')).toBe('var(--accent)');
      expect(grupoJ?.classList.contains('wrong')).toBe(false);
    });

    it('marca la tecla con error visual si lastWrong es true', () => {
      montar({ held: new Set(['KeyJ']), lastWrong: true });
      const grupoJ = document.querySelector('g.key.pressed.wrong');
      expect(grupoJ).not.toBeNull();

      const rect = grupoJ?.querySelector('rect');
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
      const rectMod = gruposMod[0].querySelector('rect');
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
      expect(grupoAltGr).not.toBeNull();
      expect(grupoAltGr?.querySelector('text')?.textContent).toBe('AltGr');
    });
  });

  describe('teclas de la fila de reposo y colores por dedo', () => {
    it('muestra las marcas de la fila de reposo en las teclas base', () => {
      montar();
      // Las teclas con home: true renderizan un rect adicional con opacity 0.75 y fill var(--fg-muted)
      const grupos = document.querySelectorAll('g.key');
      let muescas = 0;
      for (const g of grupos) {
        const rectMuesca = Array.from(g.querySelectorAll('rect')).find(
          (r) => r.getAttribute('opacity') === '0.75',
        );
        if (rectMuesca) muescas++;
      }
      // En la fila de reposo hay 8 teclas con muesca: asdf jklñ
      expect(muescas).toBe(8);
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
        const rect = g.querySelector('rect');
        expect(rect?.getAttribute('stroke')).toBe('var(--accent)');
      }
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
      expect(punto?.getAttribute('r')).toBe('3');
      expect(punto?.getAttribute('fill')).toBe('var(--fg-muted)');
    });
  });
});
