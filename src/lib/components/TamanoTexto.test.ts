import { afterEach, describe, expect, it, vi } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';
import TamanoTexto from './TamanoTexto.svelte';

let componente: ReturnType<typeof TamanoTexto> | undefined;

afterEach(async () => {
  if (componente) await unmount(componente);
  componente = undefined;
  document.body.replaceChildren();
});

function montar(props: { escala: number; conDeslizador?: boolean }) {
  const onCambiar = vi.fn();
  componente = mount(TamanoTexto, { target: document.body, props: { ...props, onCambiar } });
  flushSync();
  return onCambiar;
}

describe('TamanoTexto.svelte (2.1)', () => {
  it('ofrece cuatro valores fijos en un grupo con nombre y marca el elegido', () => {
    montar({ escala: 1.5 });
    const grupo = document.querySelector('[role="group"]')!;
    expect(document.getElementById(grupo.getAttribute('aria-labelledby')!)?.textContent)
      .toContain('150%');
    const botones = [...grupo.querySelectorAll('button')];
    expect(botones.map((b) => b.getAttribute('aria-label')))
      .toEqual(['Texto al 100%', 'Texto al 125%', 'Texto al 150%', 'Texto al 200%']);
    expect(botones.map((b) => b.getAttribute('aria-pressed')))
      .toEqual(['false', 'false', 'true', 'false']);
  });

  it('un clic fija el valor exacto, sin tener que acertar con el deslizador', () => {
    const onCambiar = montar({ escala: 1 });
    document.querySelector<HTMLButtonElement>('[aria-label="Texto al 200%"]')!.click();
    expect(onCambiar).toHaveBeenCalledWith(2);
  });

  it('el deslizador solo aparece donde se pide y admite el 125%', async () => {
    montar({ escala: 1 });
    expect(document.querySelector('input[type="range"]')).toBeNull();
    await unmount(componente!);
    document.body.replaceChildren();

    const onCambiar = montar({ escala: 1, conDeslizador: true });
    const rango = document.querySelector<HTMLInputElement>('input[type="range"]')!;
    expect(rango.step).toBe('0.05');
    rango.value = '1.25';
    rango.dispatchEvent(new Event('input', { bubbles: true }));
    expect(onCambiar).toHaveBeenCalledWith(1.25);
  });
});
