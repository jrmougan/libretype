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

/** Lo que hay que teclear ahora, sea el texto de la lección o uno generado. */
const textoMostrado = (): string =>
  document.getElementById(campo().getAttribute('aria-describedby')!)!.textContent!.replace(/^Texto: /, '');

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
    await teclear(textoMostrado());
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

describe('Esc para pausar desde el campo', () => {
  const esc = (): KeyboardEvent => new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true });

  it('pausa, deja el foco en «Reanudar» y al reanudar vuelve al campo', async () => {
    await abrir();
    const principio = textoMostrado().slice(0, 3);
    await teclear(principio);
    campo().dispatchEvent(esc());
    await tick();
    await tick();
    expect(document.querySelector('.pausa-cartel')?.textContent).toContain('Ejercicio pausado');
    expect(campo().disabled).toBe(true);
    const reanudar = document.querySelector<HTMLButtonElement>('.pausa-cartel button')!;
    expect(document.activeElement).toBe(reanudar);
    reanudar.click();
    await tick();
    await tick();
    expect(document.querySelector('.pausa-cartel')).toBeNull();
    expect(document.activeElement).toBe(campo());
    // Lo tecleado sigue ahí: pausar no es reiniciar.
    expect(campo().value).toBe(principio);
  });

  it('Esc fuera del campo no pausa: no hay manejador global de teclas', async () => {
    await abrir();
    window.dispatchEvent(esc());
    document.body.dispatchEvent(esc());
    await tick();
    expect(document.querySelector('.pausa-cartel')).toBeNull();
  });
});

describe('texto nuevo a partir del segundo intento', () => {
  const OTRA = { ...SESION, leccion: 'practica-continua' };
  const alfabeto = catalogo.alfabetoHasta(catalogo.primera.id);

  it('el primer contacto con una lección es su texto revisado a mano', async () => {
    await abrir({}, [OTRA]);
    expect(textoMostrado()).toBe(catalogo.primera.text);
  });

  it('una lección ya practicada se abre con un texto distinto, solo con teclas enseñadas', async () => {
    await abrir();
    const texto = textoMostrado();
    expect(texto).not.toBe(catalogo.primera.text);
    expect([...texto].filter((ch) => ch !== ' ' && !alfabeto.has(ch))).toEqual([]);
    for (const ch of catalogo.primera.nuevas) expect(texto).toContain(ch);
  });

  it('repetir tras terminar trae otro texto, y la sesión se guarda con el mismo identificador', async () => {
    await abrir({}, [OTRA]);
    await teclear(textoMostrado());
    boton('Repetir').click();
    await tick();
    await tick();
    const segundo = textoMostrado();
    expect(segundo).not.toBe(catalogo.primera.text);
    expect(document.activeElement).toBe(campo());
    await teclear(segundo);
    boton('Repetir').click();
    await tick();
    await tick();
    expect(textoMostrado()).not.toBe(segundo);
    const guardadas = JSON.parse(localStorage.getItem('libretype.sesiones')!) as { leccion: string }[];
    expect(guardadas.map((s) => s.leccion)).toEqual(['practica-continua', catalogo.primera.id, catalogo.primera.id]);
  });

  it('reiniciar a medias no cambia el texto: sigue siendo el mismo intento', async () => {
    await abrir();
    const texto = textoMostrado();
    await teclear(texto.slice(0, 4));
    document.querySelector<HTMLButtonElement>('button[aria-label="Reiniciar esta lección"]')!.click();
    await tick();
    await tick();
    expect(textoMostrado()).toBe(texto);
    expect(campo().value).toBe('');
  });

  it('los textos largos alargan los intentos generados', async () => {
    await abrir({ longitudTexto: 'largo' });
    expect(textoMostrado().length).toBeGreaterThan(catalogo.primera.text.length * 1.5);
  });
});

describe('las teclas que más costaron en el intento', () => {
  const dialogo = (): string => document.querySelector('#dialogo-resultado')?.textContent ?? '';

  /** Teclea el texto, pero poniendo una x donde tocaba cada una de esas letras. */
  async function teclearFallando(letras: string): Promise<void> {
    await teclear([...textoMostrado()].map((ch) => (letras.includes(ch) ? 'x' : ch)).join(''));
  }

  it('un intento limpio no dice nada de teclas', async () => {
    await abrir();
    await teclear(textoMostrado());
    expect(dialogo()).not.toContain('costaron');
    expect(boton('Practicar estas teclas')).toBeUndefined();
  });

  it('nombra las teclas falladas, sin reprender, y ofrece practicarlas', async () => {
    await abrir();
    await teclearFallando('lf');
    expect(dialogo()).toContain('Las teclas que más costaron esta vez:');
    expect(dialogo()).toMatch(/la L y la F|la F y la L/);
    expect(dialogo()).toContain('Es normal; se asientan practicando.');

    boton('Practicar estas teclas').click();
    await tick();
    await tick();
    expect(document.querySelector('#dialogo-resultado')).toBeNull();
    expect(document.querySelector('.drill h2')?.textContent).toMatch(/^Refuerzo de teclas \((L, F|F, L)\)$/);
    // Solo con lo ya enseñado: está en la primera lección.
    const alfabeto = catalogo.alfabetoHasta(catalogo.primera.id);
    expect([...textoMostrado()].filter((ch) => ch !== ' ' && !alfabeto.has(ch))).toEqual([]);
    expect(textoMostrado()).toMatch(/l/);
    expect(textoMostrado()).toMatch(/f/);
    expect(document.activeElement).toBe(campo());
  });

  it('lo fallado en un intento no se arrastra al siguiente', async () => {
    await abrir();
    await teclearFallando('lf');
    boton('Repetir').click();
    await tick();
    await tick();
    await teclear(textoMostrado());
    expect(dialogo()).not.toContain('costaron');
  });
});
