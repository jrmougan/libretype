/**
 * Con SQLite caído en el escritorio se practica en el respaldo. Los perfiles de
 * verdad están en la base de datos que no se ha podido abrir, así que no se
 * pregunta ni se gestionan: se sigue con el último que practicó aquí.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushSync, mount, tick, unmount } from 'svelte';
import App from './App.svelte';
import { catalogo } from './lib/lecciones/catalogo';
import { guardar, POR_DEFECTO } from './lib/preferencias';

vi.mock('./lib/storage/almacen', async (original) => {
  const real = await original<typeof import('./lib/storage/almacen')>();
  return { ...real, abrirAlmacen: async () => new real.AlmacenLocal(true) };
});

const LECCIONES = catalogo.principal.lecciones;
let app: ReturnType<typeof App> | null = null;

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
  Reflect.deleteProperty(HTMLDialogElement.prototype, 'showModal');
  Reflect.deleteProperty(HTMLDialogElement.prototype, 'close');
});

describe('practicando en el respaldo', () => {
  it('no pregunta quién practica y lo nuevo se guarda con el último perfil usado', async () => {
    guardar({ ...POR_DEFECTO, tono: 'sobrio', perfil: 3 });
    app = mount(App, { target: document.body });
    await vi.waitFor(() => expect(document.querySelector('.escena > .note')).toBeNull());
    await tick();
    expect(document.querySelector('.quien')).toBeNull();
    // Sin sesiones en el respaldo: colocación de manos, y de ahí a la primera lección.
    expect(document.querySelector('.cero')).not.toBeNull();
    const selector = document.querySelector<HTMLSelectElement>('.barra select')!;
    selector.value = LECCIONES[0].id;
    selector.dispatchEvent(new Event('change', { bubbles: true }));
    await tick();
    await tick();

    const campo = document.querySelector<HTMLTextAreaElement>('textarea.capture')!;
    campo.value = LECCIONES[0].text;
    campo.dispatchEvent(new InputEvent('input', { bubbles: true }));
    flushSync();
    // Con las claves del perfil 3: así el traspaso a SQLite sabrá de quién es.
    await vi.waitFor(() => expect(JSON.parse(localStorage.getItem('libretype.perfil.3.sesiones') ?? '[]')).toHaveLength(1));
    expect(localStorage.getItem('libretype.sesiones')).toBeNull();
  });

  it('el panel de progreso avisa del respaldo y no ofrece gestionar perfiles', async () => {
    guardar({ ...POR_DEFECTO, tono: 'sobrio' });
    localStorage.setItem('libretype.sesiones', JSON.stringify([{
      leccion: LECCIONES[0].id, pctAcierto: 95, ppm: 20, aciertos: 95, escritos: 100, ms: 60000,
      terminadaEn: '2026-11-01T10:00:00.000Z',
    }]));
    app = mount(App, { target: document.body });
    await vi.waitFor(() => expect(document.querySelector('textarea.capture')).not.toBeNull());
    [...document.querySelectorAll('button')].find((b) => b.textContent?.trim() === 'Progreso')!.click();
    await tick();
    const panel = document.querySelector('#panel-dialogo')!;
    expect(panel.querySelector('[role="alert"]')?.textContent).toContain('No se ha podido abrir la base de datos');
    expect(panel.querySelector('.perfiles')).toBeNull();
  });
});
