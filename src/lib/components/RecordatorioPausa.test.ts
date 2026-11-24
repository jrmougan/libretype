import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';
import RecordatorioPausa from './RecordatorioPausa.svelte';

let componente: ReturnType<typeof RecordatorioPausa> | undefined;

beforeEach(() => { vi.useFakeTimers(); });

afterEach(async () => {
  if (componente) await unmount(componente);
  componente = undefined;
  document.body.replaceChildren();
  vi.useRealTimers();
});

function montar(props: { minutos: number; practicando: boolean }): void {
  componente = mount(RecordatorioPausa, { target: document.body, props: { ...props, pasoMs: 1000 } });
  flushSync();
}

const aviso = (): HTMLElement | null => document.querySelector('.recordatorio');
function pasar(ms: number): void {
  vi.advanceTimersByTime(ms);
  flushSync();
}

describe('RecordatorioPausa.svelte', () => {
  it('avisa al llegar a los minutos elegidos, sin diálogo ni robar el foco', () => {
    const campo = document.createElement('textarea');
    document.body.append(campo);
    campo.focus();
    montar({ minutos: 15, practicando: true });
    pasar(15 * 60000 - 1000);
    expect(aviso()).toBeNull();
    pasar(1000);
    expect(aviso()?.getAttribute('role')).toBe('status');
    expect(aviso()?.textContent).toContain('pausa');
    expect(document.activeElement).toBe(campo);
    expect(document.querySelector('dialog')).toBeNull();
  });

  it('no dice cuánto tiempo lleva: es una sugerencia, no un control de uso', () => {
    montar({ minutos: 15, practicando: true });
    pasar(15 * 60000);
    expect(aviso()?.textContent).not.toMatch(/\d/);
  });

  it('no cuenta el tiempo sin practicar', () => {
    montar({ minutos: 15, practicando: false });
    pasar(60 * 60000);
    expect(aviso()).toBeNull();
  });

  it('con 0 minutos no avisa nunca', () => {
    montar({ minutos: 0, practicando: true });
    pasar(120 * 60000);
    expect(aviso()).toBeNull();
  });

  it('«Vale» lo cierra y la cuenta empieza de nuevo', () => {
    montar({ minutos: 15, practicando: true });
    pasar(15 * 60000);
    aviso()!.querySelector('button')!.click();
    flushSync();
    expect(aviso()).toBeNull();
    pasar(15 * 60000 - 1000);
    expect(aviso()).toBeNull();
    pasar(1000);
    expect(aviso()).not.toBeNull();
  });
});
