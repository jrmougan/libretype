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

function montar(props: { minutos: number; practicando: boolean }) {
  const estado = $state({ ...props });
  componente = mount(RecordatorioPausa, {
    target: document.body,
    props: {
      get minutos() { return estado.minutos; },
      get practicando() { return estado.practicando; },
    },
  });
  flushSync();
  return estado;
}

const aviso = () => document.querySelector('.recordatorio');

describe('recordatorio de pausa (2.7)', () => {
  it('aparece tras los minutos elegidos de práctica, sin llevarse el foco', () => {
    const campo = document.createElement('textarea');
    document.body.append(campo);
    campo.focus();
    montar({ minutos: 20, practicando: true });
    vi.advanceTimersByTime(19 * 60000);
    flushSync();
    expect(aviso()).toBeNull();
    vi.advanceTimersByTime(60000);
    flushSync();
    expect(aviso()?.getAttribute('role')).toBe('status');
    expect(document.activeElement).toBe(campo);
    // Ni una cifra de tiempo: es una sugerencia, no un control de uso.
    expect(aviso()?.textContent).not.toMatch(/\d/);
  });

  it('no cuenta el tiempo en pausa ni con un panel abierto', () => {
    const estado = montar({ minutos: 15, practicando: false });
    vi.advanceTimersByTime(60 * 60000);
    flushSync();
    expect(aviso()).toBeNull();
    estado.practicando = true;
    flushSync();
    vi.advanceTimersByTime(15 * 60000);
    flushSync();
    expect(aviso()).not.toBeNull();
  });

  it('se cierra con un botón y vuelve a contar desde cero', () => {
    montar({ minutos: 15, practicando: true });
    vi.advanceTimersByTime(15 * 60000);
    flushSync();
    document.querySelector<HTMLButtonElement>('.recordatorio button')!.click();
    flushSync();
    expect(aviso()).toBeNull();
    vi.advanceTimersByTime(14 * 60000);
    flushSync();
    expect(aviso()).toBeNull();
  });

  it('con 0 minutos no avisa nunca', () => {
    montar({ minutos: 0, practicando: true });
    vi.advanceTimersByTime(5 * 3600000);
    flushSync();
    expect(aviso()).toBeNull();
  });
});
