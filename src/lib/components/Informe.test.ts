import { afterEach, describe, expect, it, vi } from 'vitest';
import { flushSync, mount, tick, unmount } from 'svelte';
import Informe from './Informe.svelte';
import type { EstadoTecla } from '../keyboard/dominio';
import { catalogo } from '../lecciones/catalogo';
import { PCT_OBJETIVO } from '../storage/objetivos';
import type { Sesion } from '../storage/progreso';

let componente: Record<string, unknown> | undefined;

afterEach(async () => {
  if (componente) await unmount(componente);
  componente = undefined;
  document.body.replaceChildren();
  vi.restoreAllMocks();
});

const LECCIONES = catalogo.principal.lecciones;
const sesion = (dia: string, extra: Partial<Sesion> = {}): Sesion => ({
  leccion: LECCIONES[0].id, ppm: 20, pctAcierto: 95, aciertos: 95, escritos: 100, ms: 60000,
  terminadaEn: `${dia}T10:00:00.000Z`, ...extra,
});
const dominada: EstadoTecla = { intentos: 20, aciertos: 20, msTotal: 20 * 250 };
const copia = (alias: string, sesiones: Sesion[]): string => JSON.stringify({ version: 1, sesiones, teclas: {}, alias });

function montar(): void {
  componente = mount(Informe, {
    target: document.body,
    props: { alias: 'Ana', sesiones: [sesion('2026-09-07'), sesion('2026-09-08', { leccion: 'propia:x', ppm: 90 })], teclas: new Map([['KeyA', dominada]]) },
  });
  flushSync();
}
const boton = (texto: string): HTMLButtonElement =>
  [...document.querySelectorAll('button')].find((b) => b.textContent?.replace(/\s+/g, ' ').trim().startsWith(texto))!;

async function abrirCopias(archivos: File[]): Promise<void> {
  const input = document.querySelector<HTMLInputElement>('.docente input[type="file"]')!;
  Object.defineProperty(input, 'files', { configurable: true, value: archivos });
  input.dispatchEvent(new Event('change', { bubbles: true }));
  await vi.waitFor(() => expect(document.querySelector('.docente [role="status"]')?.textContent).toMatch(/en la tabla/));
}

describe('Informe.svelte', () => {
  it('enseña el informe del perfil activo, con el foco en su título, y vuelve', async () => {
    montar();
    boton('Informe de Ana para imprimir').click();
    await vi.waitFor(() => expect(document.activeElement?.textContent).toBe('Informe de práctica de Ana'));
    const hoja = document.querySelector('.informe')!;
    expect(hoja.textContent).toContain('2 días de práctica');
    expect(hoja.textContent).toMatch(/1 de \d+ lecciones superadas/);
    // El umbral va en su frase, nunca como cifra suelta.
    expect(hoja.textContent).toContain('Sin velocidad mínima');
    expect(hoja.textContent).not.toContain(`${PCT_OBJETIVO} %`);

    boton('Volver').click();
    await vi.waitFor(() => expect(document.activeElement).toBe(boton('Informe de Ana para imprimir')));
    expect(document.querySelector('.informe')).toBeNull();
  });

  it('imprime solo el informe: una hoja aparte colgada de <body>, que se retira después', async () => {
    montar();
    const imprimir = vi.spyOn(window, 'print').mockImplementation(() => {});
    boton('Informe de Ana para imprimir').click();
    await tick();
    boton('Imprimir').click();
    expect(imprimir).toHaveBeenCalledOnce();
    const hoja = document.querySelector('body > .hoja-impresion')!;
    expect(hoja.querySelector('.informe h2')?.textContent).toBe('Informe de práctica de Ana');
    // Con sus propios estilos: en papel no existen los tokens de la aplicación.
    expect(hoja.querySelector('style')?.textContent).not.toContain('var(--');
    window.dispatchEvent(new Event('afterprint'));
    expect(document.querySelector('body > .hoja-impresion')).toBeNull();
  });

  it('guarda el informe como una página que se abre en cualquier navegador', async () => {
    montar();
    let nombre = '';
    let contenido: Blob | null = null;
    Object.assign(URL, { createObjectURL: vi.fn((b: Blob) => { contenido = b; return 'blob:x'; }), revokeObjectURL: vi.fn() });
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) { nombre = this.download; });
    boton('Informe de Ana para imprimir').click();
    await tick();
    boton('Guardar como página').click();
    await vi.waitFor(() => expect(nombre).toMatch(/^informe-ana-\d{4}-\d{2}-\d{2}\.html$/));
    const html = await (contenido as unknown as Blob).text();
    expect(html.startsWith('<!doctype html><html lang="es">')).toBe(true);
    expect(html).toContain('<title>Informe de práctica de Ana</title>');
    expect(html).toContain('Informe de práctica de Ana</h2>');
    // Autocontenida y sin nada que se ejecute.
    expect(html).not.toMatch(/<script|var\(--|src=|href=/);
    await vi.waitFor(() => expect(document.querySelector('.docente [role="status"]')?.textContent).toBe('Informe guardado.'));
  });

  it('un alias con signos no se cuela como HTML en la página guardada', async () => {
    componente = mount(Informe, { target: document.body, props: { alias: '<b>Ana</b> & "co"', sesiones: [], teclas: new Map() } });
    flushSync();
    let contenido: Blob | null = null;
    Object.assign(URL, { createObjectURL: vi.fn((b: Blob) => { contenido = b; return 'blob:x'; }), revokeObjectURL: vi.fn() });
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    boton('Informe de').click();
    await tick();
    boton('Guardar como página').click();
    await vi.waitFor(() => expect(contenido).not.toBeNull());
    const html = await (contenido as unknown as Blob).text();
    expect(html).not.toContain('<b>Ana</b>');
    expect(html).toContain('&lt;b&gt;Ana&lt;/b&gt;');
  });

  it('junta varias copias en una tabla alfabética, sin velocidad ni forma de ordenarla', async () => {
    montar();
    await abrirCopias([
      new File([copia('Zoe', [sesion('2026-09-07', { ppm: 99 })])], 'zoe.json'),
      new File([copia('Ana', [sesion('2026-09-07', { ppm: 5 }), sesion('2026-09-08', { leccion: LECCIONES[1].id })])], 'ana-aula.json'),
      new File([copia('ana', [sesion('2026-09-07', { ppm: 5 }), sesion('2026-09-10')])], 'ana-casa.json'),
      new File(['{no es json'], 'rota.json'),
    ]);
    const filas = [...document.querySelectorAll('.docente tbody tr')];
    expect(filas.map((f) => f.querySelector('th')?.childNodes[0].textContent?.trim())).toEqual(['Ana', 'Zoe']);
    expect(filas[0].querySelector('th small')?.textContent).toBe('2 copias juntas');
    expect(filas[0].textContent).toMatch(new RegExp(`2 de ${catalogo.lecciones.length}`));

    const cabeceras = [...document.querySelectorAll('.docente thead th')].map((th) => th.textContent?.trim());
    expect(cabeceras.join(' ')).not.toMatch(/velocidad|ppm|marca|puesto/i);
    expect(document.querySelector('.docente tbody')?.textContent).not.toMatch(/ppm|99/);
    expect(document.querySelector('.docente thead button')).toBeNull();
    expect(document.querySelector('.docente caption')?.textContent).toMatch(/no clasifica a nadie/);

    const errores = document.querySelector('.docente [role="alert"]')!;
    expect(errores.textContent).toContain('rota.json');
    expect(errores.textContent).toMatch(/no es una copia de seguridad/);
  });

  it('desde la tabla se abre el informe de cada alumno', async () => {
    montar();
    await abrirCopias([new File([copia('Zoe', [sesion('2026-09-07')])], 'zoe.json')]);
    boton('Ver').click();
    await vi.waitFor(() => expect(document.activeElement?.textContent).toBe('Informe de práctica de Zoe'));
  });

  it('abrir copias no escribe nada en este equipo: solo se leen', async () => {
    localStorage.clear();
    montar();
    await abrirCopias([new File([copia('Zoe', [sesion('2026-09-07')])], 'zoe.json')]);
    expect(localStorage.length).toBe(0);
  });
});
