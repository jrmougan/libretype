/**
 * Regresiones de interfaz encontradas mirando la aplicación de verdad en un
 * navegador. Lo que depende del pintado no se puede comprobar en jsdom y se
 * remedió con capturas: aquí queda lo que sí se puede fijar, que es la estructura
 * y las reglas de CSS de las que depende.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushSync, mount, tick, unmount } from 'svelte';
import App from './App.svelte';
import appSvelte from './App.svelte?raw';
import leccionCeroSvelte from './lib/components/LeccionCero.svelte?raw';
import progresoSvelte from './lib/components/Progreso.svelte?raw';
import { catalogo } from './lib/lecciones/catalogo';
import { crearLeccion } from './lib/lecciones/personalizadas';
import { guardar, POR_DEFECTO, type Preferencias } from './lib/preferencias';

const AHORA = '2026-11-04T10:00:00.000Z';
const TEXTO = 'una frase para practicar';
const SESION = {
  leccion: catalogo.primera.id, pctAcierto: 50, ppm: 10, aciertos: 50, escritos: 100, ms: 60000,
  terminadaEn: '2026-11-01T10:00:00.000Z',
};

let app: ReturnType<typeof App> | null = null;

async function abrir(prefs: Partial<Preferencias> = {}, sesiones: unknown[] = [SESION]): Promise<void> {
  localStorage.setItem('libretype.lecciones', JSON.stringify([
    crearLeccion({ titulo: 'Mía', descripcion: '', texto: TEXTO }, AHORA, 'propia:mia'),
  ]));
  localStorage.setItem('libretype.sesiones', JSON.stringify(sesiones));
  guardar({ ...POR_DEFECTO, tono: 'sobrio', ...prefs });
  app = mount(App, { target: document.body });
  await vi.waitFor(() => expect(document.querySelector('.escena > .note')).toBeNull());
  await tick();
}

const boton = (texto: string): HTMLButtonElement =>
  [...document.querySelectorAll('button')].find((b) => b.textContent?.trim() === texto)!;
const campo = (): HTMLTextAreaElement => document.querySelector('textarea.capture')!;

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
  Reflect.deleteProperty(HTMLDialogElement.prototype, 'showModal');
  Reflect.deleteProperty(HTMLDialogElement.prototype, 'close');
});

describe('lo que dejaba la pantalla rota', () => {
  it('la aplicación no se puede desplazar por programa', () => {
    // Con `hidden`, enfocar un campo de captura fuera de vista movía `.app` entera:
    // la barra se iba, y en la lección cero al 200% quedaba una pantalla en blanco.
    expect(appSvelte).toMatch(/\.app\s*\{[^}]*overflow:\s*clip;/);
    // Y la zona de prueba es la referencia de su campo, que se desplaza con ella.
    expect(leccionCeroSvelte).toMatch(/\.prueba\s*\{[^}]*position:\s*relative;/);
  });

  it('la zona de prueba no se encoge por debajo de su texto', () => {
    expect(leccionCeroSvelte).toMatch(/\.texto\s*\{[^}]*grid-auto-rows:\s*max-content;/);
  });

  it('la pausa tapa solo el texto y deja la barra operable', async () => {
    await abrir();
    boton('Pausar').click();
    await tick();
    const cartel = document.querySelector('.pausa-cartel')!;
    // Un botón dentro de un <label> es inválido, y esta caja sin referencia cubría
    // toda la aplicación.
    expect(cartel.closest('label')).toBeNull();
    expect(cartel.closest('.drill')).not.toBeNull();
    boton('Reanudar').click();
    await tick();
    expect(document.querySelector('.pausa-cartel')).toBeNull();
    expect(campo().disabled).toBe(false);
  });

  it('el selector no aparece vacío mientras se elige el tono', async () => {
    await abrir({ tono: null });
    expect(document.querySelector('header select')).toBeNull();
    (document.querySelector('button.opcion') as HTMLButtonElement).click();
    await tick();
    expect(document.querySelector<HTMLSelectElement>('header select')?.value).toBeTruthy();
  });

  it('el ancho de los paneles crece con la letra', () => {
    expect(appSvelte).toMatch(/\.panel\s*\{[^}]*width:\s*min\(calc\(36rem \* var\(--ui-scale\)\), 100%\)/);
  });
});

describe('controles de la lección', () => {
  it('reiniciar existe una sola vez y su nombre accesible contiene lo que se lee', async () => {
    await abrir();
    const reiniciar = [...document.querySelectorAll('button')]
      .filter((b) => /reiniciar|empezar de nuevo/i.test(`${b.textContent} ${b.getAttribute('aria-label')}`));
    expect(reiniciar).toHaveLength(1);
    // WCAG 2.5.3: quien usa control por voz dice lo que ve.
    expect(reiniciar[0].getAttribute('aria-label')).toContain(reiniciar[0].textContent?.trim());
  });

  it('la letra grande activa el modo compacto de barra y lección', async () => {
    await abrir({ escala: 2 });
    expect(document.querySelector('.app.compacta')).not.toBeNull();
    expect(document.querySelector('.drill.compacta')).not.toBeNull();
    // El título se aparta de la vista pero sigue en el árbol de accesibilidad.
    expect(document.querySelector('main h2')?.textContent).toBe(catalogo.primera.title);
  });

  it('al 100% no se aprieta nada', async () => {
    await abrir();
    expect(document.querySelector('.app.compacta')).toBeNull();
  });

  it('el texto de un solo uso enfoca el campo al abrirse', async () => {
    await abrir();
    const selector = document.querySelector<HTMLSelectElement>('header select')!;
    selector.value = 'propio';
    selector.dispatchEvent(new Event('change', { bubbles: true }));
    await tick();
    expect(document.activeElement).toBe(document.querySelector('#texto-propio-input'));
  });

  it('un texto de un solo uso vacío lo dice en vez de no hacer nada', async () => {
    await abrir();
    const selector = document.querySelector<HTMLSelectElement>('header select')!;
    selector.value = 'propio';
    selector.dispatchEvent(new Event('change', { bubbles: true }));
    await tick();
    boton('Empezar a teclear').click();
    await tick();
    expect(document.querySelector('[role="alert"]')?.textContent).toContain('Todavía no hay nada');
  });
});

describe('después de terminar', () => {
  const botones = () => [...document.querySelectorAll('#dialogo-resultado button')].map((b) => b.textContent?.trim());

  it('en una lección propia ofrece volver a tus lecciones, con la práctica lista', async () => {
    await abrir({ ultimaLeccion: 'propia:mia' });
    await teclear(TEXTO);
    expect(botones()).toEqual(['Tus lecciones', 'Repetir']);
    expect(document.activeElement?.textContent?.trim()).toBe('Tus lecciones');

    boton('Tus lecciones').click();
    await tick();
    expect(document.querySelector('#dialogo-resultado')).toBeNull();
    expect(document.querySelector('#panel-dialogo')?.getAttribute('aria-label')).toBe('Tus lecciones');
    // Al cerrar no puede quedar una lección ya terminada y sin nada que hacer.
    boton('Cerrar').click();
    await tick();
    expect(campo().value).toBe('');
  });

  it('con el temario terminado ofrece ver el progreso: nunca un callejón', async () => {
    const ultima = catalogo.lecciones[catalogo.lecciones.length - 1];
    const sesiones = catalogo.lecciones.map((l) => ({ ...SESION, leccion: l.id, pctAcierto: 95 }));
    await abrir({ ultimaLeccion: ultima.id }, sesiones);
    await teclear(ultima.text);
    expect(botones()).toEqual(['Ver tu progreso', 'Repetir']);
  });

  it('por debajo del objetivo lo primero es repetir, sin regañar', async () => {
    await abrir({ ultimaLeccion: 'propia:mia' });
    await teclear('x'.repeat(TEXTO.length));
    expect(botones()).toEqual(['Repetir', 'Tus lecciones']);
    expect(document.querySelector('#dialogo-resultado .primario')?.textContent?.trim()).toBe('Repetir');
  });
});

describe('el panel no tira lo escrito', () => {
  const abrirFormulario = async (): Promise<void> => {
    await abrir();
    const selector = document.querySelector<HTMLSelectElement>('header select')!;
    selector.value = 'gestionar';
    selector.dispatchEvent(new Event('change', { bubbles: true }));
    await tick();
    boton('Nueva lección').click();
    await tick();
  };
  const cancelar = async (): Promise<void> => {
    document.querySelector('#panel-dialogo')!.dispatchEvent(new Event('cancel', { cancelable: true }));
    await tick();
  };

  it('sin cambios, Escape cierra sin preguntar', async () => {
    await abrirFormulario();
    await cancelar();
    expect(document.querySelector('#panel-dialogo')).toBeNull();
  });

  it('con cambios, Escape pregunta y deja seguir o descartar', async () => {
    await abrirFormulario();
    const texto = document.querySelector<HTMLTextAreaElement>('#propia-texto')!;
    texto.value = 'un texto largo que no quiero perder';
    texto.dispatchEvent(new Event('input', { bubbles: true }));
    await tick();

    await cancelar();
    expect(document.querySelector('#panel-dialogo')).not.toBeNull();
    expect(document.querySelector('[role="alert"]')?.textContent).toContain('cambios sin guardar');
    expect(document.activeElement).toBe(boton('Seguir escribiendo'));

    boton('Seguir escribiendo').click();
    await tick();
    expect(document.querySelector('[role="alert"]')).toBeNull();
    expect(texto.value).toContain('no quiero perder');

    boton('Cerrar').click();
    await tick();
    boton('Cerrar sin guardar').click();
    await tick();
    expect(document.querySelector('#panel-dialogo')).toBeNull();
  });
});

describe('progreso', () => {
  it('no repite título ni pega la etiqueta al nombre de la lección', async () => {
    await abrir();
    boton('Progreso').click();
    await tick();
    const titulos = [...document.querySelectorAll('#panel-dialogo h2')].map((h) => h.textContent);
    expect(titulos).toEqual(['Tu progreso']);
    expect(progresoSvelte).toMatch(/tbody th small\s*\{[^}]*display:\s*block/);
  });

  it('las tablas se pueden desplazar con el teclado', async () => {
    await abrir();
    boton('Progreso').click();
    await tick();
    const tablas = [...document.querySelectorAll('.tabla')];
    expect(tablas.length).toBeGreaterThan(0);
    for (const t of tablas) {
      expect(t.getAttribute('tabindex')).toBe('0');
      expect(t.getAttribute('role')).toBe('region');
      expect(t.getAttribute('aria-label')).toBeTruthy();
    }
  });

  it('el estado vacío tiene salida y confirmar deja el foco en lo seguro', async () => {
    await abrir({}, []);
    boton('Progreso').click();
    await tick();
    expect(boton('Ir a practicar')).toBeDefined();
    boton('Ir a practicar').click();
    await tick();
    expect(document.querySelector('#panel-dialogo')).toBeNull();
  });

  it('pedir borrar el progreso lleva el foco a Cancelar y cancelar lo devuelve', async () => {
    await abrir();
    boton('Progreso').click();
    await tick();
    boton('Borrar progreso').click();
    await tick();
    await tick();
    expect(document.activeElement).toBe(boton('Cancelar'));
    boton('Cancelar').click();
    await tick();
    await tick();
    expect(document.activeElement).toBe(boton('Borrar progreso'));
  });
});

describe('ajustes', () => {
  it('el control de tamaño dice el porcentaje, y lo elegido se marca con algo más que color', async () => {
    await abrir({ escala: 1.5 });
    boton('Ajustes').click();
    await tick();
    expect(document.querySelector('#scale')?.getAttribute('aria-valuetext')).toBe('150%');
    expect(document.querySelector('#panel-dialogo button[aria-pressed="true"]')).not.toBeNull();
  });

  it('cambiar la distribución sigue aplicándose y guardándose', async () => {
    await abrir();
    boton('Ajustes').click();
    await tick();
    const layout = document.querySelector<HTMLSelectElement>('select#layout')!;
    layout.value = layout.options[0].value;
    layout.dispatchEvent(new Event('change', { bubbles: true }));
    await tick();
    expect(JSON.parse(localStorage.getItem('libretype.preferencias')!).layout).toBe(layout.value);
  });
});
