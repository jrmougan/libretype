import { afterEach, describe, expect, it, vi } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';
import Temario from './Temario.svelte';
import { LESSONS } from '../lessons';
import type { Sesion } from '../storage/progreso';
import { PCT_OBJETIVO, SIN_PRESION } from '../storage/objetivos';

let componente: ReturnType<typeof Temario> | undefined;

afterEach(async () => {
  if (componente) await unmount(componente);
  componente = undefined;
  document.body.replaceChildren();
});

const superada = (leccion: string): Sesion => ({
  leccion, ppm: 10, pctAcierto: 95, aciertos: 95, escritos: 100, ms: 60000,
  terminadaEn: '2026-09-01T10:00:00Z',
});

function montar(sesiones: Sesion[] = [], extra: Record<string, unknown> = {}) {
  const onLeccion = vi.fn();
  const onModo = vi.fn();
  componente = mount(Temario, {
    target: document.body,
    props: { lecciones: LESSONS, sesiones, modo: 'leccion', leccionActual: 0, onLeccion, onModo, ...extra },
  });
  flushSync();
  return { onLeccion, onModo };
}

const tarjeta = (i: number) => document.querySelector<HTMLButtonElement>(`[data-leccion="${i}"]`)!;

describe('Temario.svelte (0.3 y 2.3)', () => {
  it('cada lección es un botón: recorrer con Tab o enfocar no cambia nada', () => {
    const { onLeccion, onModo } = montar();
    const tarjetas = [...document.querySelectorAll<HTMLButtonElement>('[data-leccion]')];
    expect(tarjetas).toHaveLength(LESSONS.length);
    for (const t of tarjetas) {
      expect(t.tagName).toBe('BUTTON');
      t.focus();
      t.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
    }
    // A diferencia del <select>, moverse por la lista no elige nada (WCAG 3.2.2).
    expect(onLeccion).not.toHaveBeenCalled();
    expect(onModo).not.toHaveBeenCalled();
  });

  it('las cerradas siguen siendo enfocables y dicen por qué, sin cifra', () => {
    const { onLeccion } = montar([superada('reposo')]);
    expect(tarjeta(1).hasAttribute('aria-disabled')).toBe(false);
    const cerrada = tarjeta(2);
    expect(cerrada.getAttribute('aria-disabled')).toBe('true');
    expect(cerrada.disabled).toBe(false);
    const estado = cerrada.querySelector('.estado')!.textContent!;
    expect(estado).toContain(`«${LESSONS[1].title}»`);
    expect(estado).toMatch(new RegExp(SIN_PRESION.join('|'), 'i'));
    expect(estado).not.toMatch(/\d/);
    cerrada.click();
    expect(onLeccion).not.toHaveBeenCalled();
    tarjeta(1).click();
    expect(onLeccion).toHaveBeenCalledWith(1);
  });

  it('el umbral solo sale una vez, en la nota de arriba y con su frase', () => {
    montar();
    const conCifra = [...document.querySelectorAll<HTMLElement>('.temario *')]
      .filter((el) => el.children.length === 0 && el.textContent!.includes(`${PCT_OBJETIVO}%`));
    expect(conCifra).toHaveLength(1);
    expect(conCifra[0].textContent).toMatch(/sin velocidad mínima/i);
  });

  it('marca lo superado y dónde estás con texto, no solo con color', () => {
    montar([superada('reposo')], { leccionActual: 1 });
    expect(tarjeta(0).textContent).toContain('Superada');
    expect(tarjeta(1).getAttribute('aria-current')).toBe('true');
    expect(tarjeta(1).textContent).toContain('Estás aquí');
    expect(tarjeta(0).hasAttribute('aria-current')).toBe(false);
  });

  it('la insignia de estado acompaña al texto, no lo sustituye', () => {
    montar([superada('reposo')], { leccionActual: 1 });
    const insignia = (i: number) => tarjeta(i).querySelector('.insignia')!;
    // Oculta al lector: el estado ya se lee escrito en la tarjeta.
    expect(insignia(0).getAttribute('aria-hidden')).toBe('true');
    expect(insignia(0).textContent).toBe('✓');
    expect(insignia(1).textContent).toBe('›');
    expect(insignia(2).textContent).toBe('');
    expect(tarjeta(2).querySelector('.estado')?.textContent).toContain('Cerrada');
  });

  it('lleva a la lección cero y a la práctica libre', () => {
    const { onModo } = montar();
    document.querySelector<HTMLButtonElement>('[data-modo="cero"]')!.click();
    document.querySelector<HTMLButtonElement>('[data-modo="continua"]')!.click();
    document.querySelector<HTMLButtonElement>('[data-modo="propio"]')!.click();
    expect(onModo.mock.calls.map((c) => c[0])).toEqual(['cero', 'continua', 'propio']);
  });
});
