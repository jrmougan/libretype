/**
 * Integración de lo que entró con el roadmap de fases 0 a 3: cada bloque
 * comprueba que la pieza está conectada en la aplicación montada, no solo que
 * su módulo funciona por separado.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushSync, mount, tick, unmount } from 'svelte';
import App from './App.svelte';
import { catalogo } from './lib/lecciones/catalogo';
import { guardar, POR_DEFECTO, type Preferencias } from './lib/preferencias';

const SESION = {
  leccion: catalogo.primera.id, pctAcierto: 50, ppm: 10, aciertos: 50, escritos: 100, ms: 60000,
  terminadaEn: '2026-11-01T10:00:00.000Z',
};

let app: ReturnType<typeof App> | null = null;

async function abrir(prefs: Partial<Preferencias> = {}, sesiones: unknown[] = [SESION]): Promise<void> {
  localStorage.setItem('libretype.sesiones', JSON.stringify(sesiones));
  guardar({ ...POR_DEFECTO, tono: 'sobrio', ...prefs });
  app = mount(App, { target: document.body });
  await vi.waitFor(() => expect(document.querySelector('.escena > .note')).toBeNull());
  await tick();
}

const boton = (texto: string): HTMLButtonElement =>
  [...document.querySelectorAll('button')].find((b) => b.textContent?.trim() === texto)!;
const campo = (): HTMLTextAreaElement => document.querySelector('textarea.capture')!;
const prefsGuardadas = (): Preferencias => JSON.parse(localStorage.getItem('libretype.preferencias')!);

async function teclear(texto: string): Promise<void> {
  campo().value = texto;
  campo().dispatchEvent(new InputEvent('input', { bubbles: true }));
  flushSync();
  await tick();
}

beforeEach(() => {
  localStorage.clear();
  Object.defineProperties(HTMLDialogElement.prototype, {
    showModal: { configurable: true, value: vi.fn(function (this: HTMLDialogElement) { this.open = true; }) },
    close: { configurable: true, value: vi.fn(function (this: HTMLDialogElement) { this.open = false; }) },
  });
});

afterEach(async () => {
  if (app) await unmount(app);
  app = null;
  document.body.replaceChildren();
  localStorage.clear();
  document.documentElement.removeAttribute('style');
  Reflect.deleteProperty(HTMLDialogElement.prototype, 'showModal');
  Reflect.deleteProperty(HTMLDialogElement.prototype, 'close');
});

describe('tamaño del texto', () => {
  it('se puede agrandar ya en la primera pantalla, antes de elegir nada', async () => {
    await abrir({ tono: null }, []);
    const grande = document.querySelector<HTMLButtonElement>('[aria-label="Texto al 200%"]')!;
    expect(grande).not.toBeNull();
    grande.click();
    await tick();
    expect(document.documentElement.style.getPropertyValue('--ui-scale')).toBe('2');
    expect(prefsGuardadas().escala).toBe(2);
  });

  it('Ctrl y + sube la escala de la interfaz, y Ctrl y 0 la devuelve al 100%', async () => {
    await abrir();
    window.dispatchEvent(new KeyboardEvent('keydown', { key: '+', ctrlKey: true, cancelable: true }));
    await tick();
    expect(prefsGuardadas().escala).toBe(1.1);
    window.dispatchEvent(new KeyboardEvent('keydown', { key: '0', ctrlKey: true, cancelable: true }));
    await tick();
    expect(prefsGuardadas().escala).toBe(1);
  });
});

describe('ocultar las métricas', () => {
  it('quita velocidad, precisión y avance de la barra, pero el resultado se enseña igual', async () => {
    await abrir({ ocultarMetricas: true });
    expect(document.querySelector('.metricas')).toBeNull();
    await teclear(catalogo.primera.text);
    expect(document.querySelector('#resultado-desc')?.textContent).toMatch(/palabras por minuto/);
  });

  it('por defecto se ven, y Ajustes explica qué son las ppm', async () => {
    await abrir();
    expect(document.querySelector('.metricas')).not.toBeNull();
    boton('Ajustes').click();
    await tick();
    expect(document.querySelector('#panel-dialogo')?.textContent).toContain('ppm son palabras por minuto');
    boton('Ocultarlas').click();
    await tick();
    expect(prefsGuardadas().ocultarMetricas).toBe(true);
    expect(document.querySelector('.metricas')).toBeNull();
  });
});

describe('longitud de los textos de práctica', () => {
  const palabras = (): number => (document.querySelector('.text [aria-hidden="true"]')?.textContent ?? '')
    .split('\u00a0').filter(Boolean).length;

  it('la práctica continua genera textos cortos o largos según la preferencia', async () => {
    await abrir({ longitudTexto: 'corto' });
    const selector = document.querySelector<HTMLSelectElement>('.barra select')!;
    selector.value = 'continua';
    selector.dispatchEvent(new Event('change', { bubbles: true }));
    await tick();
    await tick();
    expect(document.querySelector('.drill h2')?.textContent).toBe('Práctica continua');
    expect(palabras()).toBe(10);
  });
});
