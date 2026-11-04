/**
 * Las lecciones personalizadas con la aplicación entera montada: lo que importa
 * es lo que pasa entre el panel, la práctica, el histórico y las preferencias.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushSync, mount, tick, unmount } from 'svelte';
import App from './App.svelte';
import { catalogo } from './lib/lecciones/catalogo';
import { crearLeccion, lapidaDe, type LeccionPropia } from './lib/lecciones/personalizadas';
import { guardar, POR_DEFECTO } from './lib/preferencias';

const AHORA = '2026-11-04T10:00:00.000Z';
const TEXTO = 'una frase para practicar';
const propia = (id = 'propia:mia', titulo = 'Mi lección'): LeccionPropia =>
  crearLeccion({ titulo, descripcion: 'Qué practico', texto: TEXTO }, AHORA, id);

/** Con una sesión previa para no pasar por la lección cero. */
const SESION = {
  leccion: catalogo.primera.id, pctAcierto: 50, ppm: 10, aciertos: 50, escritos: 100, ms: 60000,
  terminadaEn: '2026-11-01T10:00:00.000Z',
};

let app: ReturnType<typeof App> | null = null;

async function abrir(lecciones: LeccionPropia[] = [], ultimaLeccion?: string, previas: unknown[] = [SESION]): Promise<void> {
  localStorage.setItem('libretype.lecciones', JSON.stringify(lecciones));
  localStorage.setItem('libretype.sesiones', JSON.stringify(previas));
  guardar({ ...POR_DEFECTO, tono: 'sobrio', ultimaLeccion });
  app = mount(App, { target: document.body });
  await vi.waitFor(() => expect(selector().disabled).toBe(false));
}

const selector = (): HTMLSelectElement => document.querySelector('header select')!;
const titulo = (): string | null | undefined => document.querySelector('main h2')?.textContent;
const boton = (texto: string): HTMLButtonElement =>
  [...document.querySelectorAll('button')].find((b) => b.textContent?.trim() === texto)!;
const porEtiqueta = (e: string): HTMLButtonElement => document.querySelector(`button[aria-label="${e}"]`)!;
const prefs = () => JSON.parse(localStorage.getItem('libretype.preferencias')!);
const sesiones = () => JSON.parse(localStorage.getItem('libretype.sesiones') ?? '[]');
const teclas = () => JSON.parse(localStorage.getItem('libretype.teclas') ?? '[]');

async function elegir(valor: string): Promise<void> {
  selector().value = valor;
  selector().dispatchEvent(new Event('change', { bubbles: true }));
  await tick();
}

async function teclear(texto: string): Promise<void> {
  const campo = document.querySelector<HTMLTextAreaElement>('textarea.capture')!;
  campo.value = texto;
  campo.dispatchEvent(new InputEvent('input', { bubbles: true }));
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
  Reflect.deleteProperty(HTMLDialogElement.prototype, 'showModal');
  Reflect.deleteProperty(HTMLDialogElement.prototype, 'close');
});

describe('el selector', () => {
  it('agrupa: cada curso, la práctica libre y tus lecciones', async () => {
    await abrir([propia()]);
    const grupos = [...selector().querySelectorAll('optgroup')].map((g) => g.label);
    expect(grupos).toEqual([...catalogo.cursos.map((c) => c.titulo), 'Práctica libre', 'Tus lecciones']);
    const tuyas = selector().querySelector('optgroup[label="Tus lecciones"]')!;
    expect(tuyas.querySelector('option[value="propia:mia"]')?.textContent).toContain('Mi lección');
    expect(tuyas.querySelector('option[value="gestionar"]')).not.toBeNull();
  });

  it('gestionar abre el panel sin cambiar lo que se practica ni mover la vista', async () => {
    await abrir();
    const antes = titulo();
    await elegir('gestionar');
    expect(document.querySelector('dialog#panel-dialogo')?.getAttribute('aria-label')).toBe('Tus lecciones');
    expect(titulo()).toBe(antes);
    expect(selector().value).toBe(catalogo.primera.id);
  });

  it('una lápida no sale en el selector', async () => {
    await abrir([lapidaDe(propia(), AHORA)]);
    expect(selector().querySelector('option[value="propia:mia"]')).toBeNull();
  });
});

describe('practicar', () => {
  it('se elige, se teclea y guarda con su identificador', async () => {
    await abrir([propia()]);
    await elegir('propia:mia');
    expect(titulo()).toBe('Mi lección');
    expect(prefs().ultimaLeccion).toBe('propia:mia');
    await teclear(TEXTO);
    await vi.waitFor(() => expect(sesiones().at(-1).leccion).toBe('propia:mia'));
    await vi.waitFor(() => expect(document.querySelector('#dialogo-resultado')).not.toBeNull());
  });

  it('no enseña objetivo, no ofrece lección siguiente y no desbloquea nada', async () => {
    await abrir([propia()]);
    await elegir('propia:mia');
    await teclear(TEXTO);
    await vi.waitFor(() => expect(document.querySelector('#dialogo-resultado')).not.toBeNull());
    const dialogo = document.querySelector('#dialogo-resultado')!.textContent!;
    expect(dialogo).not.toContain('Objetivo');
    expect(dialogo).not.toContain('Lección superada');
    const segunda = catalogo.lecciones[1].id;
    expect(selector().querySelector<HTMLOptionElement>(`option[value="${segunda}"]`)?.disabled).toBe(true);
  });

  it('no alimenta el dominio de teclas', async () => {
    await abrir([propia()]);
    await elegir('propia:mia');
    await teclear(TEXTO);
    await vi.waitFor(() => expect(sesiones().at(-1).leccion).toBe('propia:mia'));
    await tick();
    expect(teclas()).toEqual([]);
  });

  it('el temario sigue alimentándolo', async () => {
    await abrir([]);
    await elegir(catalogo.primera.id);
    await teclear(catalogo.primera.text);
    await vi.waitFor(() => expect(teclas().length).toBeGreaterThan(0));
  });

  it('el texto libre tampoco alimenta el dominio, y sigue funcionando', async () => {
    await abrir();
    await elegir('propio');
    const editor = document.querySelector<HTMLTextAreaElement>('textarea.input-texto-propio')!;
    editor.value = 'aaaa aaaa aaaa';
    editor.dispatchEvent(new Event('input', { bubbles: true }));
    boton('Empezar a teclear').click();
    await tick();
    await teclear('aaaa aaaa aaaa');
    await vi.waitFor(() => expect(sesiones().at(-1).leccion).toBe('texto-propio'));
    await tick();
    expect(teclas()).toEqual([]);
  });

  it('el texto libre se puede guardar como lección', async () => {
    await abrir();
    await elegir('propio');
    const editor = document.querySelector<HTMLTextAreaElement>('textarea.input-texto-propio')!;
    editor.value = 'un texto que quiero conservar';
    editor.dispatchEvent(new Event('input', { bubbles: true }));
    boton('Guardar como lección').click();
    await tick();
    expect(document.querySelector<HTMLTextAreaElement>('#propia-texto')?.value).toBe('un texto que quiero conservar');
  });
});

describe('la última lección', () => {
  it('vuelve a la personalizada al abrir', async () => {
    await abrir([propia()], 'propia:mia');
    expect(titulo()).toBe('Mi lección');
    expect(selector().value).toBe('propia:mia');
  });

  it('si se borró, cae a un sitio seguro y lo corrige en disco', async () => {
    await abrir([lapidaDe(propia(), AHORA)], 'propia:mia');
    expect(titulo()).toBe(catalogo.primera.title);
    await vi.waitFor(() => expect(prefs().ultimaLeccion).toBe(catalogo.primera.id));
  });

  it('si nunca existió, también', async () => {
    await abrir([], 'propia:fantasma');
    expect(titulo()).toBe(catalogo.primera.title);
  });
});

describe('cambiarla mientras está abierta', () => {
  it('borrar la que se practica vuelve al temario sin cerrar el panel', async () => {
    await abrir([propia()], 'propia:mia');
    await elegir('gestionar');
    porEtiqueta('Borrar Mi lección').click();
    flushSync();
    boton('Sí, borrar').click();
    await vi.waitFor(() => expect(titulo()).toBe(catalogo.primera.title));
    expect(document.querySelector('dialog#panel-dialogo')).not.toBeNull();
    expect(prefs().ultimaLeccion).toBe(catalogo.primera.id);
    expect(selector().querySelector('option[value="propia:mia"]')).toBeNull();
  });

  it('editar la que se practica cambia lo que se teclea', async () => {
    await abrir([propia()], 'propia:mia');
    await elegir('gestionar');
    porEtiqueta('Editar Mi lección').click();
    await tick();
    const texto = document.querySelector<HTMLTextAreaElement>('#propia-texto')!;
    texto.value = 'un texto distinto del primero';
    texto.dispatchEvent(new Event('input', { bubbles: true }));
    document.querySelector('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await vi.waitFor(() => expect(document.querySelector('dl.metricas')?.textContent).toContain('/29'));
  });

  it('practicar desde el panel lo cierra y abre la lección', async () => {
    await abrir([propia()]);
    await elegir('gestionar');
    porEtiqueta('Practicar Mi lección').click();
    await vi.waitFor(() => expect(titulo()).toBe('Mi lección'));
    expect(document.querySelector('dialog#panel-dialogo')).toBeNull();
  });

  it('un identificador sin lección no se abre aunque llegue por el selector', async () => {
    await abrir();
    await elegir('propia:fantasma');
    expect(titulo()).toBe(catalogo.primera.title);
  });
});

describe('borrar el progreso', () => {
  it('conserva las lecciones vivas', async () => {
    await abrir([propia()]);
    boton('Progreso').click();
    await tick();
    boton('Borrar progreso').click();
    flushSync();
    expect(document.body.textContent).toContain('Tus lecciones se conservan');
    boton('Sí, borrar').click();
    await vi.waitFor(() => expect(sesiones()).toEqual([]));
    expect(JSON.parse(localStorage.getItem('libretype.lecciones')!).map((l: LeccionPropia) => l.id)).toEqual(['propia:mia']);
    await vi.waitFor(() => expect(selector().querySelector('option[value="propia:mia"]')).not.toBeNull());
  });
});

describe('restaurar una copia con la aplicación entera', () => {
  async function restaurar(): Promise<void> {
    boton('Progreso').click();
    await tick();
    const copia = JSON.stringify({
      version: 1, creadaEn: AHORA, sesiones: [{ ...SESION, ppm: 77 }], teclas: {},
    });
    const input = document.querySelector<HTMLInputElement>('input[type="file"]')!;
    Object.defineProperty(input, 'files', { configurable: true, value: [new File([copia], 'c.json')] });
    input.dispatchEvent(new Event('change', { bubbles: true }));
    await vi.waitFor(() => expect(boton('Sí, importar')).toBeDefined());
    boton('Sí, importar').click();
  }

  it('el panel sigue abierto y dice que ha ido bien', async () => {
    await abrir();
    await restaurar();
    await vi.waitFor(() => expect(document.querySelector('.progreso')?.textContent).toContain('importada con éxito'));
    expect(document.querySelector<HTMLDialogElement>('#panel-dialogo')?.open).toBe(true);
    expect(sesiones()[0].ppm).toBe(77);
  });

  it('mientras dura no se puede cerrar: el resultado se dice en ese panel', async () => {
    await abrir();
    await restaurar();
    flushSync();
    expect(boton('Cerrar').disabled).toBe(true);
    const dialogo = document.querySelector<HTMLDialogElement>('#panel-dialogo')!;
    dialogo.dispatchEvent(new Event('cancel', { cancelable: true }));
    flushSync();
    expect(dialogo.open).toBe(true);
    await vi.waitFor(() => expect(document.querySelector('.progreso')?.textContent).toContain('importada con éxito'));
    expect(boton('Cerrar').disabled).toBe(false);
  });

  it('una copia dañada se explica en español y no toca nada', async () => {
    await abrir();
    boton('Progreso').click();
    await tick();
    const input = document.querySelector<HTMLInputElement>('input[type="file"]')!;
    Object.defineProperty(input, 'files', { configurable: true, value: [new File(['{"sesiones":[],"teclas":[1]}'], 'c.json')] });
    input.dispatchEvent(new Event('change', { bubbles: true }));
    await vi.waitFor(() => expect(boton('Sí, importar')).toBeDefined());
    boton('Sí, importar').click();
    await vi.waitFor(() => expect(document.querySelector('[role="alert"].aviso')?.textContent).toContain('dañados'));
    expect(document.querySelector('[role="alert"].aviso')?.textContent).not.toMatch(/iterable/);
    expect(sesiones()).toHaveLength(1);
  });
});

describe('el diálogo se cierra por su cuenta', () => {
  // Es lo que hace Chromium tras varios Escape: `close` sin haber avisado con `cancel`.
  const cierreNativo = async (dialogo: HTMLDialogElement): Promise<void> => {
    dialogo.open = false;
    dialogo.dispatchEvent(new Event('close'));
    await tick();
  };

  it('sin nada que perder, el estado se entera y el panel se va', async () => {
    await abrir();
    boton('Ajustes').click();
    await tick();
    await cierreNativo(document.querySelector<HTMLDialogElement>('#panel-dialogo')!);
    await vi.waitFor(() => expect(document.querySelector('#panel-dialogo')).toBeNull());
  });

  it('con un texto a medias, vuelve a ser modal y pregunta', async () => {
    await abrir();
    await elegir('gestionar');
    boton('Nueva lección').click();
    await tick();
    const nombre = document.querySelector<HTMLInputElement>('#propia-titulo')!;
    nombre.value = 'A medias';
    nombre.dispatchEvent(new Event('input', { bubbles: true }));
    await tick();
    const dialogo = document.querySelector<HTMLDialogElement>('#panel-dialogo')!;
    await cierreNativo(dialogo);
    expect(dialogo.open).toBe(true);
    expect(document.querySelector('.aviso-cierre')).not.toBeNull();
    expect(document.querySelector<HTMLInputElement>('#propia-titulo')?.value).toBe('A medias');
  });

  it('un cierre nuestro no se confunde con eso', async () => {
    await abrir();
    boton('Ajustes').click();
    await tick();
    const dialogo = document.querySelector<HTMLDialogElement>('#panel-dialogo')!;
    boton('Cerrar').click();
    await tick();
    dialogo.dispatchEvent(new Event('close'));
    await tick();
    expect(document.querySelector('#panel-dialogo')).toBeNull();
  });
});

describe('reiniciar', () => {
  const totalIntentos = (): number =>
    teclas().reduce((n: number, [, e]: [string, { intentos: number }]) => n + e.intentos, 0);

  async function completarPrimera(): Promise<number> {
    const antes = sesiones().length;
    await teclear(catalogo.primera.text);
    await vi.waitFor(() => expect(sesiones()).toHaveLength(antes + 1));
    await vi.waitFor(() => expect(teclas().length).toBeGreaterThan(0));
    return totalIntentos();
  }

  it('lo abandonado no suma al dominio: da igual reiniciar que no', async () => {
    await abrir();
    const limpio = await completarPrimera();
    await unmount(app!);
    app = null;
    document.body.replaceChildren();
    localStorage.removeItem('libretype.teclas');

    await abrir();
    // Los intentos van a la tecla del carácter objetivo, no a la `q` pulsada.
    await teclear('qqqq');
    expect(totalIntentos()).toBe(0); // Todavía nada en disco: el dominio se guarda al terminar.
    porEtiqueta('Reiniciar esta lección').click();
    await tick();
    expect(await completarPrimera()).toBe(limpio);
  });
});

describe('texto propio', () => {
  async function empezarCon(texto: string): Promise<void> {
    await elegir('propio');
    const campo = document.querySelector<HTMLTextAreaElement>('#texto-propio-input')!;
    campo.value = texto;
    campo.dispatchEvent(new Event('input', { bubbles: true }));
    await tick();
    boton('Empezar a teclear').click();
    await tick();
  }

  it('solo con caracteres que no se teclean, lo dice en vez de pedir un espacio', async () => {
    await abrir();
    await empezarCon('😀 😀');
    expect(document.querySelector('.aviso-error')?.textContent).toContain('ningún carácter');
  });

  it('demasiado largo no llega a montarse', async () => {
    await abrir();
    await empezarCon('a '.repeat(10_000));
    expect(document.querySelector('.aviso-error')?.textContent).toContain('caben');
    expect(document.querySelectorAll('.ch')).toHaveLength(0);
  });

  it('cambiar de texto con la práctica en pausa no deja el texto nuevo en pausa', async () => {
    await abrir();
    await empezarCon('hola mundo');
    await teclear('ho');
    porEtiqueta('Pausar lección').click();
    await tick();
    boton('Cambiar texto').click();
    await tick();
    const editor = document.querySelector<HTMLTextAreaElement>('#texto-propio-input')!;
    editor.value = 'otro texto';
    editor.dispatchEvent(new Event('input', { bubbles: true }));
    await tick();
    boton('Empezar a teclear').click();
    await vi.waitFor(() => expect(document.querySelector('textarea.capture')).not.toBeNull());
    await tick();
    const campo = document.querySelector<HTMLTextAreaElement>('textarea.capture')!;
    expect(campo.disabled).toBe(false);
    expect(document.activeElement).toBe(campo);
    expect(porEtiqueta('Pausar lección')).not.toBeNull();
  });
});

describe('el vocabulario de la práctica continua', () => {
  const nivel = (): HTMLSelectElement => document.querySelector('#selector-nivel-practica')!;
  const campo = (): HTMLTextAreaElement => document.querySelector('textarea.capture')!;
  const SUPERADA = { ...SESION, pctAcierto: 100, aciertos: 100 };

  async function abrirContinua(): Promise<{ otra: string }> {
    await abrir([], undefined, [SUPERADA]);
    await elegir('continua');
    await vi.waitFor(() => expect(nivel()).not.toBeNull());
    const otra = [...nivel().options].find((o) => o.value !== nivel().value);
    expect(otra).toBeDefined();
    await teclear('xy');
    return { otra: otra!.value };
  }

  /** Lo que hace el motor con la lista cerrada: `change` en el turno del `keydown`. */
  function flecha(s: HTMLSelectElement, opcion: string): void {
    s.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true, cancelable: true }));
    s.value = opcion;
    s.dispatchEvent(new Event('change', { bubbles: true }));
    flushSync();
  }

  it('recorrerlo con flechas no tira el intento ni se lleva el foco (WCAG 3.2.2)', async () => {
    const { otra } = await abrirContinua();
    const antes = document.querySelector('.drill')?.textContent;
    nivel().focus();
    flecha(nivel(), otra);
    await tick();
    expect(document.activeElement).toBe(nivel());
    expect(campo().value).toBe('xy');
    expect(document.querySelector('.drill')?.textContent).toBe(antes);
    expect(nivel().parentElement?.querySelector('.pista')?.textContent).toContain('Intro');
  });

  it('Intro lo confirma: otro texto, intento nuevo y foco en la captura', async () => {
    const { otra } = await abrirContinua();
    nivel().focus();
    flecha(nivel(), otra);
    nivel().dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
    await vi.waitFor(() => expect(document.activeElement).toBe(campo()));
    expect(nivel().value).toBe(otra);
    expect(campo().value).toBe('');
  });

  it('con el ratón, elegir es elegir', async () => {
    const { otra } = await abrirContinua();
    nivel().value = otra;
    nivel().dispatchEvent(new Event('change', { bubbles: true }));
    await vi.waitFor(() => expect(campo().value).toBe(''));
    expect(nivel().value).toBe(otra);
  });
});

describe('repasar «Antes de empezar»', () => {
  it('devuelve a la lección por la que se iba, sin pisar el punto de retorno', async () => {
    await abrir([propia()], 'propia:mia');
    await elegir('cero');
    let siguiente = boton('Siguiente') ?? boton('Saltar esta comprobación');
    while (siguiente) {
      siguiente.click();
      await tick();
      siguiente = boton('Siguiente') ?? boton('Saltar esta comprobación');
    }
    expect(boton('Ir a la primera lección')).toBeUndefined();
    boton('Volver a tu lección').click();
    await vi.waitFor(() => expect(titulo()).toBe('Mi lección'));
    expect(prefs().ultimaLeccion).toBe('propia:mia');
  });
});

describe('datos dañados en disco', () => {
  it.each([
    ['libretype.sesiones', '[null]'],
    ['libretype.sesiones', '{}'],
    ['libretype.sesiones', '[{}]'],
    ['libretype.teclas', '[["KeyA",null]]'],
  ])('%s = %s: arranca y Progreso se abre', async (clave, valor) => {
    guardar({ ...POR_DEFECTO, tono: 'sobrio' });
    localStorage.setItem(clave, valor);
    app = mount(App, { target: document.body });
    await vi.waitFor(() => expect(selector().disabled).toBe(false));
    boton('Progreso').click();
    await tick();
    expect(document.querySelector('.progreso')).not.toBeNull();
  });
});

describe('«Gestionar» desde Progreso', () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => { if (app) { void unmount(app); app = null; } });

  it('el foco va al título del panel nuevo en vez de caer al documento', async () => {
    localStorage.setItem('libretype.sesiones', JSON.stringify([SESION, { ...SESION, leccion: 'propia:mia' }]));
    localStorage.setItem('libretype.lecciones', JSON.stringify([propia()]));
    guardar({ ...POR_DEFECTO, tono: 'sobrio' });
    app = mount(App, { target: document.body });
    await vi.waitFor(() => expect(selector().disabled).toBe(false));
    boton('Progreso').click();
    flushSync();
    await vi.waitFor(() => expect(boton('Gestionar')).toBeTruthy());

    boton('Gestionar').click();
    await vi.waitFor(() => expect(document.activeElement?.textContent).toBe('Tus lecciones'));
    expect(document.activeElement?.tagName).toBe('H2');
    expect(boton('Nueva lección')).toBeTruthy();
  });
});

describe('refuerzo abandonado', () => {
  it('al pasar a otro modo desaparece del selector en vez de quedar como opción muerta', async () => {
    localStorage.setItem('libretype.teclas', JSON.stringify([
      ['KeyA', { intentos: 30, aciertos: 10, msTotal: 30000 }],
      ['KeyS', { intentos: 30, aciertos: 12, msTotal: 30000 }],
    ]));
    await abrir();
    boton('Progreso').click();
    await vi.waitFor(() => expect(boton('Practicar las teclas que más cuestan')).toBeTruthy());
    boton('Practicar las teclas que más cuestan').click();
    const opcion = (): Element | null => selector().querySelector('option[value="refuerzo"]');
    await vi.waitFor(() => expect(opcion()).not.toBeNull());

    await elegir('continua');
    await vi.waitFor(() => expect(opcion()).toBeNull());
  });
});
