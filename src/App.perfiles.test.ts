import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, tick, unmount } from 'svelte';
import App from './App.svelte';
import { LESSONS } from './lib/lessons';
import { guardar, POR_DEFECTO } from './lib/preferencias';
import type { Sesion } from './lib/storage/progreso';

let app: ReturnType<typeof App> | undefined;

const sesion = (leccion: string, dia: number): Sesion => ({
  leccion, ppm: 12, pctAcierto: 96, aciertos: 96, escritos: 100, ms: 60000,
  terminadaEn: `2026-09-0${dia}T10:00:00.000Z`,
});

beforeEach(() => {
  localStorage.clear();
  guardar({ ...POR_DEFECTO, tono: 'sobrio', ultimaLeccion: LESSONS[1].id });
  Object.defineProperties(HTMLDialogElement.prototype, {
    showModal: { configurable: true, value: vi.fn(function (this: HTMLDialogElement) { this.open = true; }) },
    close: { configurable: true, value: vi.fn(function (this: HTMLDialogElement) { this.open = false; }) },
  });
});

afterEach(async () => {
  if (app) await unmount(app);
  app = undefined;
  document.body.replaceChildren();
  localStorage.clear();
  Reflect.deleteProperty(HTMLDialogElement.prototype, 'showModal');
  Reflect.deleteProperty(HTMLDialogElement.prototype, 'close');
  vi.restoreAllMocks();
});

const boton = (texto: string) =>
  [...document.querySelectorAll('button')].find((b) => b.textContent?.replace(/\s+/g, ' ').trim() === texto);

describe('perfiles en la aplicación (3.2)', () => {
  it('con un solo perfil no pregunta quién practica', async () => {
    app = mount(App, { target: document.body });
    await vi.waitFor(() => expect(document.querySelector('.cero')).not.toBeNull());
    expect(document.getElementById('quien-tit')).toBeNull();
  });

  it('con dos perfiles pregunta al abrir, sin pedir edad, y carga el progreso del elegido', async () => {
    // El principal no ha practicado; Ana superó la primera lección.
    localStorage.setItem('libretype.perfiles', JSON.stringify([
      { id: 1, alias: 'Principal', creadoEn: '' },
      { id: 2, alias: 'Ana', creadoEn: '' },
    ]));
    localStorage.setItem('libretype.perfil.2.sesiones', JSON.stringify([sesion(LESSONS[0].id, 1)]));

    app = mount(App, { target: document.body });
    await vi.waitFor(() => expect(document.getElementById('quien-tit')?.textContent).toBe('¿Quién practica?'));

    const texto = document.querySelector('.quien')!.textContent!.toLowerCase();
    expect(texto).not.toMatch(/edad|años|niñ|mayor/);
    expect(texto).toContain('no tienen contraseña');
    // El teclado empieza sobre el primer nombre.
    expect(document.activeElement?.textContent).toBe('Principal');

    boton('Ana')!.click();
    await vi.waitFor(() => expect(document.querySelector('h2')?.textContent).toBe(LESSONS[1].title));
  });

  it('se puede añadir a alguien desde «¿Quién practica?» y empieza por la colocación de manos', async () => {
    localStorage.setItem('libretype.perfiles', JSON.stringify([
      { id: 1, alias: 'Principal', creadoEn: '' },
      { id: 2, alias: 'Ana', creadoEn: '' },
    ]));
    app = mount(App, { target: document.body });
    await vi.waitFor(() => expect(boton('No estoy en la lista')).toBeDefined());
    boton('No estoy en la lista')!.click();
    await tick();

    const campo = document.getElementById('alias-nuevo') as HTMLInputElement;
    await vi.waitFor(() => expect(document.activeElement).toBe(campo));
    campo.value = 'ana';
    campo.dispatchEvent(new Event('input', { bubbles: true }));
    boton('Empezar')!.click();
    await vi.waitFor(() => expect(document.querySelector('[role="alert"]')?.textContent).toContain('Ya hay un perfil'));

    campo.value = 'Luis';
    campo.dispatchEvent(new Event('input', { bubbles: true }));
    boton('Empezar')!.click();
    await vi.waitFor(() => expect(document.querySelector('.cero')).not.toBeNull());
    expect(JSON.parse(localStorage.getItem('libretype.perfiles')!).map((p: { alias: string }) => p.alias))
      .toContain('Luis');
  });

  it('desde el panel se cambia de perfil y se borra uno pidiendo confirmación', async () => {
    localStorage.setItem('libretype.sesiones', JSON.stringify([sesion(LESSONS[0].id, 1)]));
    app = mount(App, { target: document.body });
    await vi.waitFor(() => expect(document.querySelector('h2')?.textContent).toBe(LESSONS[1].title));

    boton('Progreso')!.click();
    await tick();
    const campo = document.getElementById('alias-nuevo-perfil') as HTMLInputElement;
    campo.value = 'Marta';
    campo.dispatchEvent(new Event('input', { bubbles: true }));
    boton('Añadir perfil')!.click();
    await vi.waitFor(() => expect(document.querySelector('[data-perfil="2"]')).not.toBeNull());

    // Borrar pide confirmación con el nombre y lo que se pierde.
    boton('Borrar el perfil de Marta')!.click();
    await tick();
    const confirmar = document.querySelector('.confirmar-borrado')!;
    expect(confirmar.textContent).toContain('«Marta»');
    expect(confirmar.textContent).toContain('no se puede deshacer');
    await vi.waitFor(() => expect(document.activeElement?.textContent?.trim()).toBe('Cancelar'));
    boton('Cancelar')!.click();
    await tick();
    expect(document.querySelector('[data-perfil="2"]')).not.toBeNull();

    // Practicar como Marta: no ha hecho nada, así que va a la colocación de manos.
    boton('Practicar como Marta')!.click();
    await vi.waitFor(() => expect(document.querySelector('.cero')).not.toBeNull());

    boton('Progreso')!.click();
    await tick();
    expect(document.querySelector('.panel-cab h2')?.textContent).toContain('Marta');
    boton('Borrar el perfil de Marta')!.click();
    await tick();
    boton('Sí, borrar el perfil de Marta')!.click();
    // Era el perfil activo: se vuelve al principal, que sí tenía progreso.
    await vi.waitFor(() => expect(document.querySelector('h2')?.textContent).toBe(LESSONS[1].title));
    boton('Progreso')!.click();
    await tick();
    expect(document.querySelector('[data-perfil="2"]')).toBeNull();
    expect(document.querySelector('[data-perfil="1"]')?.textContent).toContain('practicando ahora');
    expect(localStorage.getItem('libretype.sesiones')).not.toBeNull();
  });

  it('con un perfil por defecto en la política del equipo entra directo con él (3.4)', async () => {
    localStorage.setItem('libretype.perfiles', JSON.stringify([
      { id: 1, alias: 'Principal', creadoEn: '' },
      { id: 2, alias: 'Ana', creadoEn: '' },
    ]));
    vi.resetModules();
    vi.doMock('./lib/politica', () => ({
      leerPolitica: async () => ({ actualizaciones: true, perfilPorDefecto: 'Biblioteca' }),
    }));
    const svelte = await import('svelte');
    const { default: AppGestionada } = await import('./App.svelte');
    const montada = svelte.mount(AppGestionada, { target: document.body });
    try {
      await vi.waitFor(() => expect(document.querySelector('.cero')).not.toBeNull());
      expect(document.getElementById('quien-tit')).toBeNull();
      const perfiles = JSON.parse(localStorage.getItem('libretype.perfiles')!) as { alias: string }[];
      expect(perfiles.map((p) => p.alias)).toEqual(['Principal', 'Ana', 'Biblioteca']);
    } finally {
      await svelte.unmount(montada);
      vi.doUnmock('./lib/politica');
      vi.resetModules();
    }
  });
});
