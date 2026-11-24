/**
 * Perfiles en la aplicación montada: quién practica al abrir, que cada uno vea lo
 * suyo, y la gestión desde el panel de progreso.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushSync, mount, tick, unmount } from 'svelte';
import App from './App.svelte';
import { catalogo } from './lib/lecciones/catalogo';
import { crearLeccion } from './lib/lecciones/personalizadas';
import { guardar, POR_DEFECTO, type Preferencias } from './lib/preferencias';

const politica = vi.hoisted(() => ({ actual: { actualizaciones: true, perfilPorDefecto: null as string | null } }));
vi.mock('./lib/politica', () => ({ leerPolitica: async () => politica.actual }));

const LECCIONES = catalogo.principal.lecciones;
const sesion = (leccion: string, dia = 1) => ({
  leccion, pctAcierto: 95, ppm: 20, aciertos: 95, escritos: 100, ms: 60000,
  terminadaEn: `2026-11-${String(dia).padStart(2, '0')}T10:00:00.000Z`,
});
const ANA = { id: 2, alias: 'Ana', creadoEn: '2026-11-01T10:00:00.000Z' };
const PRINCIPAL = { id: 1, alias: 'Principal', creadoEn: '2026-10-01T10:00:00.000Z' };

let app: ReturnType<typeof App> | null = null;

/** Deja el almacén local como lo dejaría un equipo con esos perfiles. */
function preparar(o: {
  perfiles?: unknown[]; principal?: unknown[]; ana?: unknown[]; prefs?: Partial<Preferencias>;
} = {}): void {
  if (o.perfiles) localStorage.setItem('libretype.perfiles', JSON.stringify(o.perfiles));
  localStorage.setItem('libretype.sesiones', JSON.stringify(o.principal ?? [sesion(LECCIONES[0].id)]));
  if (o.ana) localStorage.setItem('libretype.perfil.2.sesiones', JSON.stringify(o.ana));
  guardar({ ...POR_DEFECTO, tono: 'sobrio', ...o.prefs });
}

async function abrir(): Promise<void> {
  app = mount(App, { target: document.body });
  await vi.waitFor(() => expect(document.querySelector('.escena > .note')).toBeNull());
  await tick();
}

const boton = (texto: string, raiz: ParentNode = document): HTMLButtonElement =>
  [...raiz.querySelectorAll('button')].find((b) => b.textContent?.replace(/\s+/g, ' ').trim() === texto)!;
const titulo = (): string | null | undefined => document.querySelector('.drill h2')?.textContent;
const prefs = (): Preferencias => JSON.parse(localStorage.getItem('libretype.preferencias')!);
const opcion = (id: string) => document.querySelector<HTMLOptionElement>(`.barra option[value="${id}"]`)!;
const campo = (): HTMLTextAreaElement => document.querySelector('textarea.capture')!;
const textoMostrado = (): string =>
  document.getElementById(campo().getAttribute('aria-describedby')!)!.textContent!.replace(/^Texto: /, '');

async function teclear(texto: string): Promise<void> {
  campo().value = texto;
  campo().dispatchEvent(new InputEvent('input', { bubbles: true }));
  flushSync();
  await tick();
}

async function abrirProgreso(): Promise<HTMLElement> {
  boton('Progreso').click();
  await tick();
  return document.querySelector<HTMLElement>('#panel-dialogo')!;
}

beforeEach(() => {
  localStorage.clear();
  politica.actual = { actualizaciones: true, perfilPorDefecto: null };
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

describe('al abrir', () => {
  it('con un solo perfil no pregunta quién practica', async () => {
    preparar();
    await abrir();
    expect(document.querySelector('.quien')).toBeNull();
    expect(titulo()).toBe(LECCIONES[0].title);
  });

  it('con dos perfiles pregunta, sin pedir edad, y carga el progreso del elegido', async () => {
    preparar({
      perfiles: [PRINCIPAL, ANA],
      principal: [sesion(LECCIONES[0].id)],
      ana: [sesion(LECCIONES[0].id), sesion(LECCIONES[1].id, 2), sesion(LECCIONES[2].id, 3)],
    });
    await abrir();
    const pregunta = document.querySelector('.quien')!;
    expect(pregunta.querySelector('h2')?.textContent).toBe('¿Quién practica?');
    expect(pregunta.textContent).not.toMatch(/edad|años/i);
    // Mientras no se sabe quién es, no hay lección ni progreso que enseñar.
    expect(document.querySelector('textarea.capture')).toBeNull();
    expect(document.querySelector('.barra select')).toBeNull();
    expect(boton('Progreso').disabled).toBe(true);

    boton('Ana', pregunta).click();
    await vi.waitFor(() => expect(document.querySelector('.quien')).toBeNull());
    // Ana tiene superadas tres: la cuarta está abierta, y para el principal no lo estaría.
    expect(opcion(LECCIONES[3].id).disabled).toBe(false);
    expect(titulo()).toBe(LECCIONES[3].title);
    expect(prefs().perfil).toBe(2);
    expect(boton('Progreso').disabled).toBe(false);
  });

  it('lo que se practica se guarda en el perfil elegido, no en el de al lado', async () => {
    preparar({ perfiles: [PRINCIPAL, ANA], ana: [sesion(LECCIONES[0].id)] });
    await abrir();
    boton('Ana').click();
    await vi.waitFor(() => expect(document.querySelector('textarea.capture')).not.toBeNull());
    await teclear(textoMostrado());
    await vi.waitFor(() => expect(JSON.parse(localStorage.getItem('libretype.perfil.2.sesiones')!)).toHaveLength(2));
    expect(JSON.parse(localStorage.getItem('libretype.sesiones')!)).toHaveLength(1);
  });

  it('la última lección recordada es de quien practicó el último: a otro no se le abre', async () => {
    // El principal iba por la cuarta; Ana solo tiene abierta la segunda.
    preparar({
      perfiles: [PRINCIPAL, ANA],
      principal: LECCIONES.slice(0, 3).map((l, i) => sesion(l.id, i + 1)),
      ana: [sesion(LECCIONES[0].id)],
      prefs: { perfil: 1, ultimaLeccion: LECCIONES[0].id },
    });
    await abrir();
    boton('Ana').click();
    await vi.waitFor(() => expect(titulo()).toBe(LECCIONES[1].title));
  });

  it('se puede añadir a alguien desde «¿Quién practica?» y empieza por la colocación de manos', async () => {
    preparar({ perfiles: [PRINCIPAL, ANA] });
    await abrir();
    boton('No estoy en la lista').click();
    await tick();
    const alias = document.querySelector<HTMLInputElement>('#alias-nuevo')!;
    alias.value = 'Luis';
    alias.dispatchEvent(new Event('input', { bubbles: true }));
    alias.form!.dispatchEvent(new SubmitEvent('submit', { bubbles: true, cancelable: true }));
    // Sin sesiones todavía: primero, dónde van las manos.
    await vi.waitFor(() => expect(document.querySelector('.cero')).not.toBeNull());
    const lista = JSON.parse(localStorage.getItem('libretype.perfiles')!) as { alias: string }[];
    expect(lista.map((p) => p.alias)).toEqual(['Principal', 'Ana', 'Luis']);
    expect(prefs().perfil).toBe(3);
  });

  it('la primera pantalla de un equipo compartido también deja agrandar la letra', async () => {
    preparar({ perfiles: [PRINCIPAL, ANA] });
    await abrir();
    document.querySelector<HTMLButtonElement>('[aria-label="Texto al 200%"]')!.click();
    await tick();
    expect(prefs().escala).toBe(2);
  });
});

describe('con la política del equipo', () => {
  it('con un perfil por defecto entra directo con él, sin preguntar', async () => {
    politica.actual = { actualizaciones: true, perfilPorDefecto: 'ana' };
    preparar({ perfiles: [PRINCIPAL, ANA], ana: [sesion(LECCIONES[0].id), sesion(LECCIONES[1].id, 2)] });
    await abrir();
    expect(document.querySelector('.quien')).toBeNull();
    expect(titulo()).toBe(LECCIONES[2].title);
    expect(prefs().perfil).toBe(2);
  });

  it('si ese perfil no existe, lo crea', async () => {
    politica.actual = { actualizaciones: true, perfilPorDefecto: 'Biblioteca' };
    preparar();
    await abrir();
    expect(document.querySelector('.quien')).toBeNull();
    const lista = JSON.parse(localStorage.getItem('libretype.perfiles')!) as { id: number; alias: string }[];
    expect(lista.map((p) => p.alias)).toEqual(['Principal', 'Biblioteca']);
    expect(prefs().perfil).toBe(2);
    // Perfil recién creado, sin sesiones: colocación de manos.
    expect(document.querySelector('.cero')).not.toBeNull();
  });
});

describe('desde el panel de progreso', () => {
  it('con un solo perfil el título no cambia, y se puede añadir a otra persona', async () => {
    preparar();
    await abrir();
    const panel = await abrirProgreso();
    expect(panel.querySelector('.panel-cab h2')?.textContent).toBe('Tu progreso');
    const alias = panel.querySelector<HTMLInputElement>('#alias-nuevo-perfil')!;
    alias.value = 'Ana';
    alias.dispatchEvent(new Event('input', { bubbles: true }));
    alias.form!.dispatchEvent(new SubmitEvent('submit', { bubbles: true, cancelable: true }));
    await vi.waitFor(() => expect(panel.querySelector('[data-perfil="2"]')?.textContent).toContain('Ana'));
    // Crear no cambia de perfil: sigue practicando quien estaba.
    expect(panel.querySelector('[data-perfil="1"]')?.textContent).toContain('practicando ahora');
    expect(panel.querySelector('.panel-cab h2')?.textContent).toBe('Tu progreso · Principal');
  });

  it('cambiar de perfil trae su progreso y sus lecciones, y deja la práctica lista', async () => {
    const propia = crearLeccion({ titulo: 'La de Ana', descripcion: '', texto: 'una frase de ana' }, '2026-11-01T10:00:00.000Z', 'propia:ana');
    preparar({
      perfiles: [PRINCIPAL, ANA],
      ana: [sesion(LECCIONES[0].id), sesion(LECCIONES[1].id, 2)],
      prefs: { perfil: 1 },
    });
    localStorage.setItem('libretype.perfil.2.lecciones', JSON.stringify([propia]));
    politica.actual = { actualizaciones: true, perfilPorDefecto: 'Principal' };
    await abrir();
    expect(opcion('propia:ana')).toBeNull();

    const panel = await abrirProgreso();
    boton('Practicar como Ana', panel).click();
    await vi.waitFor(() => expect(titulo()).toBe(LECCIONES[2].title));
    expect(document.querySelector('#panel-dialogo')).toBeNull();
    expect(opcion('propia:ana')).not.toBeNull();
    expect(prefs().perfil).toBe(2);
    await vi.waitFor(() => expect(document.activeElement).toBe(campo()));

    const otraVez = await abrirProgreso();
    expect(otraVez.querySelector('.panel-cab h2')?.textContent).toBe('Tu progreso · Ana');
    expect(otraVez.querySelector('[data-perfil="2"]')?.textContent).toContain('practicando ahora');
  });

  it('un intento a medias no se le apunta al perfil al que se cambia', async () => {
    preparar({ perfiles: [PRINCIPAL, ANA], ana: [sesion(LECCIONES[0].id)], prefs: { perfil: 1 } });
    politica.actual = { actualizaciones: true, perfilPorDefecto: 'Principal' };
    await abrir();
    await teclear(textoMostrado().slice(0, 5));
    const panel = await abrirProgreso();
    boton('Practicar como Ana', panel).click();
    await vi.waitFor(() => expect(prefs().perfil).toBe(2));
    await tick();
    expect(campo().value).toBe('');
    expect(localStorage.getItem('libretype.perfil.2.teclas')).toBeNull();
    expect(JSON.parse(localStorage.getItem('libretype.perfil.2.sesiones')!)).toHaveLength(1);
  });

  it('borrar el perfil que practica pide confirmación y sigue con el principal', async () => {
    preparar({
      perfiles: [PRINCIPAL, ANA], ana: [sesion(LECCIONES[0].id), sesion(LECCIONES[1].id, 2)],
      prefs: { perfil: 2, ultimaLeccion: LECCIONES[2].id },
    });
    politica.actual = { actualizaciones: true, perfilPorDefecto: 'Ana' };
    await abrir();
    expect(titulo()).toBe(LECCIONES[2].title);

    const panel = await abrirProgreso();
    boton('Borrar el perfil de Ana', panel).click();
    await tick();
    expect(localStorage.getItem('libretype.perfil.2.sesiones')).not.toBeNull();
    boton('Sí, borrar el perfil de Ana', panel).click();
    await vi.waitFor(() => expect(localStorage.getItem('libretype.perfil.2.sesiones')).toBeNull());
    await vi.waitFor(() => expect(prefs().perfil).toBe(1));
    // El principal solo tiene superada la primera: está en la segunda.
    await vi.waitFor(() => expect(titulo()).toBe(LECCIONES[1].title));
    expect(JSON.parse(localStorage.getItem('libretype.sesiones')!)).toHaveLength(1);
  });

  it('la copia de seguridad lleva el alias en el nombre cuando hay varios perfiles', async () => {
    preparar({ perfiles: [PRINCIPAL, { ...ANA, alias: 'Ana María Ñ.' }], ana: [sesion(LECCIONES[0].id)], prefs: { perfil: 2 } });
    politica.actual = { actualizaciones: true, perfilPorDefecto: 'Ana María Ñ.' };
    const descargas: string[] = [];
    const clic = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
      descargas.push(this.download);
    });
    Object.assign(URL, { createObjectURL: vi.fn(() => 'blob:x'), revokeObjectURL: vi.fn() });
    await abrir();
    const panel = await abrirProgreso();
    boton('Exportar copia de seguridad', panel).click();
    await vi.waitFor(() => expect(descargas).toHaveLength(1));
    expect(descargas[0]).toMatch(/^libretype-progreso-ana-maria-n-\d{4}-\d{2}-\d{2}\.json$/);
    clic.mockRestore();
  });
});
