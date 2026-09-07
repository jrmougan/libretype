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
