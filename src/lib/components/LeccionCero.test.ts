import { afterEach, describe, expect, it, vi } from 'vitest';
import { flushSync, mount, tick, unmount } from 'svelte';
import LeccionCero from './LeccionCero.svelte';
import { ES_ISO } from '../keyboard/layouts';

let componente: ReturnType<typeof LeccionCero> | undefined;

afterEach(async () => {
  if (componente) await unmount(componente);
  componente = undefined;
  document.body.replaceChildren();
  vi.restoreAllMocks();
});

describe('LeccionCero: limpieza de teclas retenidas en blur (issue #10)', () => {
  it('limpia las teclas pulsadas al perder el foco el campo', async () => {
    componente = mount(LeccionCero, {
      target: document.body,
      props: { layout: ES_ISO },
    });
    flushSync();

    // Avanzamos al paso 3 (índice 2), que incluye textarea interactivo
    const botones = document.querySelectorAll('button');
    const siguiente = [...botones].find((b) => b.textContent?.trim() === 'Siguiente')!;
    siguiente.click();
    await tick();
    flushSync();
    siguiente.click();
    await tick();
    flushSync();

    const campo = document.querySelector('textarea.captura') as HTMLTextAreaElement;
    expect(campo).not.toBeNull();

    // Pulsamos la tecla F
    campo.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyF', bubbles: true, cancelable: true }));
    flushSync();

    let teclasPulsadas = document.querySelectorAll('.key.pressed');
    expect(teclasPulsadas.length).toBeGreaterThan(0);

    // Evento blur en el campo
    campo.dispatchEvent(new FocusEvent('blur', { bubbles: true }));
    flushSync();

    teclasPulsadas = document.querySelectorAll('.key.pressed');
    expect(teclasPulsadas.length).toBe(0);
  });

  it('limpia las teclas pulsadas al perder el foco la ventana', async () => {
    componente = mount(LeccionCero, {
      target: document.body,
      props: { layout: ES_ISO },
    });
    flushSync();

    const botones = document.querySelectorAll('button');
    const siguiente = [...botones].find((b) => b.textContent?.trim() === 'Siguiente')!;
    siguiente.click();
    await tick();
    flushSync();
    siguiente.click();
    await tick();
    flushSync();

    const campo = document.querySelector('textarea.captura') as HTMLTextAreaElement;
    campo.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyF', bubbles: true, cancelable: true }));
    flushSync();

    let teclasPulsadas = document.querySelectorAll('.key.pressed');
    expect(teclasPulsadas.length).toBeGreaterThan(0);

    // Evento blur en window
    window.dispatchEvent(new Event('blur'));
    flushSync();

    teclasPulsadas = document.querySelectorAll('.key.pressed');
    expect(teclasPulsadas.length).toBe(0);
  });
});

describe('LeccionCero: la pantalla de colocación', () => {
  async function irAlPaso3(): Promise<void> {
    componente = mount(LeccionCero, { target: document.body, props: { layout: ES_ISO } });
    flushSync();
    for (let n = 0; n < 2; n++) {
      const siguiente = [...document.querySelectorAll('button')].find((b) => b.textContent?.trim() === 'Siguiente')!;
      siguiente.click();
      await tick();
      flushSync();
    }
  }

  it('dice en qué paso está con texto, no solo con los puntos', async () => {
    await irAlPaso3();
    expect(document.querySelector('.etapa')?.textContent).toBe('Antes de empezar · paso 3 de 5');
    expect(document.querySelector('.cuenta')?.textContent).toBe('paso 3 de 5');

    // Hechos, actual y pendientes se distinguen por clase (forma), no solo color.
    const puntos = [...document.querySelectorAll('.puntos li')];
    const estados = puntos.map((p) => (p.classList.contains('hecho') ? 'h' : p.classList.contains('actual') ? 'a' : '-'));
    expect(estados.join('')).toBe('hha--');
  });

  it('enseña cada tecla pedida en una teja del color de su dedo, con el dedo escrito', async () => {
    await irAlPaso3();
    const tejas = [...document.querySelectorAll<HTMLElement>('.prueba .teja')];
    expect(tejas.map((t) => t.textContent)).toEqual(['F', 'J']);
    expect(tejas[0].style.getPropertyValue('--dedo')).toBe('var(--finger-l-index)');
    expect(tejas[1].style.getPropertyValue('--dedo')).toBe('var(--finger-r-index)');
    expect(document.querySelector('.prueba')?.textContent).toContain('índice');
  });

  it('ofrece saltar la comprobación hasta que se completa', async () => {
    await irAlPaso3();
    const saltar = () =>
      [...document.querySelectorAll('button')].find((b) => b.textContent?.trim() === 'Saltar esta comprobación');
    expect(saltar()).toBeDefined();

    const campo = document.querySelector('textarea.captura') as HTMLTextAreaElement;
    for (const code of ['KeyF', 'KeyJ']) {
      campo.dispatchEvent(new KeyboardEvent('keydown', { code, bubbles: true, cancelable: true }));
      flushSync();
    }
    expect(document.querySelector('.prueba.completa')).not.toBeNull();
    expect(saltar()).toBeUndefined();
  });
});
