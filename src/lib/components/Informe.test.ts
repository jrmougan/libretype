import { afterEach, describe, expect, it, vi } from 'vitest';
import { flushSync, mount, tick, unmount } from 'svelte';
import Informe from './Informe.svelte';
import { LESSONS } from '../lessons';
import type { Sesion } from '../storage/progreso';

let componente: ReturnType<typeof Informe> | undefined;

afterEach(async () => {
  if (componente) await unmount(componente);
  componente = undefined;
  document.body.replaceChildren();
  vi.restoreAllMocks();
});

const sesion = (p: Partial<Sesion> = {}): Sesion => ({
  leccion: LESSONS[0].id, ppm: 33, pctAcierto: 95, aciertos: 95, escritos: 100, ms: 60000,
  terminadaEn: '2026-09-07T10:00:00.000Z', ...p,
});

function montar() {
  componente = mount(Informe, {
    target: document.body,
    props: {
      alias: 'Ana',
      sesiones: [sesion()],
      teclas: new Map([['KeyF', { intentos: 40, aciertos: 40, msTotal: 10000 }]]),
    },
  });
  flushSync();
}

const boton = (texto: string) =>
  [...document.querySelectorAll('button')].find((b) => b.textContent?.replace(/\s+/g, ' ').trim() === texto);

describe('Informe.svelte (3.3)', () => {
  it('enseña el informe del perfil activo y lo imprime solo a él', async () => {
    montar();
    boton('Informe de Ana para imprimir')!.click();
    await tick();

    const informe = document.querySelector('.informe')!;
    expect(informe.querySelector('h2')?.textContent).toBe('Informe de práctica de Ana');
    expect(informe.textContent).toContain('1 de');
    expect(informe.textContent).toContain('sin velocidad mínima'.replace('sin', 'Sin'));
    await vi.waitFor(() => expect(document.activeElement).toBe(informe.querySelector('h2')));

    const imprimir = vi.fn();
    window.print = imprimir;
    boton('Imprimir')!.click();
    expect(imprimir).toHaveBeenCalledOnce();
    const hoja = document.querySelector('body > .hoja-impresion')!;
    expect(hoja.querySelector('h2')?.textContent).toBe('Informe de práctica de Ana');
    window.dispatchEvent(new Event('afterprint'));
    expect(document.querySelector('body > .hoja-impresion')).toBeNull();
  });

  it('guarda el informe como una página que se abre en cualquier navegador', async () => {
    montar();
    boton('Informe de Ana para imprimir')!.click();
    await tick();
    let blob: Blob | undefined;
    URL.createObjectURL = vi.fn((b: Blob) => { blob = b; return 'blob:x'; });
    URL.revokeObjectURL = vi.fn();
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});

    boton('Guardar como página')!.click();
    await vi.waitFor(() => expect(blob).toBeDefined());
    const html = await blob!.text();
    expect(html).toMatch(/^<!doctype html>/);
    expect(html).toContain('<title>Informe de práctica de Ana</title>');
    expect(html).toContain('Informe de práctica de Ana</h2>');
  });

  it('junta varias copias en una tabla alfabética sin velocidad ni clasificación', async () => {
    montar();
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    const fichero = (nombre: string, alias: string, ppm: number) =>
      new File([JSON.stringify({ version: 2, perfil: { alias }, sesiones: [sesion({ ppm })], teclas: {} })], nombre);
    Object.defineProperty(input, 'files', {
      configurable: true,
      value: [fichero('z.json', 'Zoe', 80), fichero('b.json', 'Bea', 10), new File(['{roto'], 'mal.json')],
    });
    input.dispatchEvent(new Event('change', { bubbles: true }));

    await vi.waitFor(() => expect(document.querySelectorAll('tbody tr')).toHaveLength(2));
    const filas = [...document.querySelectorAll('tbody tr th')].map((th) => th.textContent?.trim());
    expect(filas).toEqual(['Bea', 'Zoe']);
    const tabla = document.querySelector('table')!.textContent!;
    expect(tabla).not.toMatch(/ppm|velocidad|puesto|ranking/i);
    expect(document.querySelector('[role="alert"]')?.textContent).toContain('mal.json');

    boton('Ver el informe de Zoe')!.click();
    await tick();
    expect(document.querySelector('.informe h2')?.textContent).toBe('Informe de práctica de Zoe');
  });
});
