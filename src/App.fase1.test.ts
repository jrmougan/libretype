/**
 * Lo de la fase 1 del roadmap montado en la aplicación entera: texto nuevo en
 * cada intento, qué teclas costaron, el refuerzo en el diálogo de resultado,
 * métricas ocultables y sonido opcional. Va en su propio fichero para no
 * mezclarse con los flujos de `App.test.ts`.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { flushSync, mount, tick, unmount } from 'svelte';
import App from './App.svelte';
import { alfabetoHasta, LESSONS } from './lib/lessons';
import { guardar, POR_DEFECTO, type Preferencias } from './lib/preferencias';
import { VOCES } from './lib/voz';

let app: ReturnType<typeof App> | null = null;

async function montar(prefs: Partial<Preferencias> = {}, sesiones: unknown[] = [], teclas: [string, unknown][] = []) {
  localStorage.clear();
  guardar({ ...POR_DEFECTO, tono: 'sobrio', ...prefs });
  if (sesiones.length) localStorage.setItem('libretype.sesiones', JSON.stringify(sesiones));
  if (teclas.length) localStorage.setItem('libretype.teclas', JSON.stringify(teclas));
  Object.defineProperties(HTMLDialogElement.prototype, {
    showModal: { configurable: true, value: vi.fn(function (this: HTMLDialogElement) { this.open = true; }) },
    close: { configurable: true, value: vi.fn(function (this: HTMLDialogElement) { this.open = false; }) },
  });
  app = mount(App, { target: document.body });
  await vi.waitFor(() => expect(document.querySelector('header select')?.hasAttribute('disabled')).toBe(false));
  const selector = document.querySelector<HTMLSelectElement>('header select')!;
  selector.value = '0';
  selector.dispatchEvent(new Event('change', { bubbles: true }));
  await tick();
}

afterEach(async () => {
  if (app) await unmount(app);
  app = null;
  document.body.replaceChildren();
  localStorage.clear();
  Reflect.deleteProperty(HTMLDialogElement.prototype, 'showModal');
  Reflect.deleteProperty(HTMLDialogElement.prototype, 'close');
  Reflect.deleteProperty(globalThis, 'AudioContext');
});

const campo = () => document.querySelector<HTMLTextAreaElement>('textarea.capture')!;
const boton = (texto: string) =>
  [...document.querySelectorAll('button')].find((b) => b.textContent?.trim() === texto);
const textoEnPantalla = () => [...document.querySelectorAll('.drill .ch')]
  .map((s) => s.textContent ?? '').join('').replace(/ /g, ' ');

async function escribir(valor: string): Promise<void> {
  campo().value = valor;
  campo().dispatchEvent(new InputEvent('input', { bubbles: true }));
  flushSync();
  await tick();
}

/** Escribe el texto en pantalla fallando uno de cada dos caracteres. */
const conFallos = (t: string) => [...t].map((c, i) => (i % 2 === 0 ? 'x' : c)).join('');

const sesion = (leccion: string, pct = 95) => ({
  leccion, pctAcierto: pct, ppm: 10, aciertos: 95, escritos: 100, ms: 60000,
  terminadaEn: new Date().toISOString(),
});

describe('texto nuevo en cada intento (1.1)', () => {
  it('el primer intento usa el texto revisado y al repetir llega uno nuevo', async () => {
    await montar();
    expect(textoEnPantalla()).toBe(LESSONS[0].text);
    await escribir(LESSONS[0].text);
    boton('Repetir')!.click();
    await tick();
    const nuevo = textoEnPantalla();
    expect(nuevo).not.toBe(LESSONS[0].text);
    const permitidas = alfabetoHasta(0);
    expect([...nuevo].filter((c) => c !== ' ' && !permitidas.has(c))).toEqual([]);
    // Las métricas de la barra miden contra el texto nuevo, no contra el fijo.
    expect(document.querySelector('dl.metricas')?.textContent).toContain(`0/${nuevo.length}`);
  });

  it('reiniciar a medias también trae texto nuevo en una lección ya practicada', async () => {
    await montar({}, [sesion('reposo')]);
    const antes = textoEnPantalla();
    await escribir('la');
    boton('Reiniciar')!.click();
    await tick();
    expect(campo().value).toBe('');
    expect(textoEnPantalla()).not.toBe(antes);
  });

  it('la marca y el desbloqueo siguen yendo por el id de la lección', async () => {
    await montar({}, [sesion('reposo')]);
    await escribir(textoEnPantalla());
    const guardadas = JSON.parse(localStorage.getItem('libretype.sesiones')!);
    expect(guardadas.at(-1).leccion).toBe('reposo');
  });
});

describe('al terminar: qué costó, horizonte y refuerzo (1.3, 1.4, 1.9)', () => {
  it('dice las teclas que más costaron sin reprender', async () => {
    await montar();
    await escribir(conFallos(textoEnPantalla()));
    const nota = document.querySelector('#dialogo-resultado p.costaron');
    expect(nota?.textContent).toContain(VOCES.sobrio.costaron);
    expect(nota?.textContent).toContain(VOCES.sobrio.costaronAnimo);
    expect(nota?.textContent).toMatch(/la [A-ZÑ]|el espacio/);
    expect(nota?.textContent?.toLowerCase()).not.toMatch(/\bmal\b|error|fallaste/);
  });

  it('un intento limpio no saca la lista', async () => {
    await montar();
    await escribir(textoEnPantalla());
    expect(document.querySelector('#dialogo-resultado p.costaron')).toBeNull();
  });

  it('cuenta solo el intento que termina, no los anteriores', async () => {
    await montar();
    await escribir(conFallos(textoEnPantalla()));
    boton('Repetir')!.click();
    await tick();
    await escribir(textoEnPantalla());
    expect(document.querySelector('#dialogo-resultado p.costaron')).toBeNull();
  });

  it('por debajo del objetivo recuerda que esto lleva semanas', async () => {
    await montar();
    await escribir(conFallos(textoEnPantalla()));
    expect(document.querySelector('#dialogo-resultado')?.textContent).toContain(VOCES.sobrio.horizonte);
  });

  it('ofrece practicar las teclas flojas junto al resultado', async () => {
    // La A le cuesta (60% en 20 intentos) y la P también, pero la P no se ha
    // enseñado todavía: el refuerzo solo puede ser de la A.
    await montar({}, [], [
      ['KeyA', { intentos: 20, aciertos: 12, msTotal: 20000 }],
      ['KeyP', { intentos: 20, aciertos: 10, msTotal: 20000 }],
    ]);
    await escribir(textoEnPantalla());
    const ofrecer = boton('Practicar las teclas que más cuestan');
    expect(ofrecer).toBeDefined();
    expect(document.querySelector('#dialogo-resultado')?.textContent).toContain(VOCES.sobrio.refuerzo);
    ofrecer!.click();
    await vi.waitFor(() => expect(document.querySelector('#dialogo-resultado')).toBeNull());
    expect(document.querySelector('.drill h2')?.textContent).toContain('Refuerzo');
    expect(document.querySelector('.drill h2')?.textContent).not.toContain('P');
    expect(textoEnPantalla()).not.toMatch(/p/);
    expect(campo().disabled).toBe(false);
  });

  it('sin teclas flojas no ofrece refuerzo', async () => {
    await montar();
    await escribir(textoEnPantalla());
    expect(boton('Practicar las teclas que más cuestan')).toBeUndefined();
  });
});

describe('métricas y ppm (1.8)', () => {
  it('se ven por defecto, con las ppm explicadas para el lector de pantalla', async () => {
    await montar();
    const dl = document.querySelector('dl.metricas');
    expect(dl).not.toBeNull();
    expect(dl?.textContent).toContain('palabras por minuto');
    expect(dl?.querySelector('[title]')?.getAttribute('title')).toMatch(/palabras por minuto/);
  });

  it('se pueden ocultar mientras se practica y el resultado se sigue viendo', async () => {
    await montar({ ocultarMetricas: true });
    expect(document.querySelector('dl.metricas')).toBeNull();
    await escribir(textoEnPantalla());
    expect(document.querySelector('#resultado-desc')?.textContent).toContain('palabras por minuto');
  });

  it('el ajuste está en el panel y se guarda', async () => {
    await montar();
    boton('Ajustes')!.click();
    await tick();
    boton('Ocultarlas')!.click();
    await tick();
    expect(document.querySelector('dl.metricas')).toBeNull();
    expect(JSON.parse(localStorage.getItem('libretype.preferencias')!).ocultarMetricas).toBe(true);
  });
});

describe('sonido opcional (1.7)', () => {
  function audioFalso() {
    const creados = vi.fn();
    class Falso {
      currentTime = 0;
      destination = {};
      state = 'running';
      constructor() { creados(); }
      createOscillator() {
        return { type: '', frequency: { setValueAtTime() {} }, connect() {}, start() {}, stop() {} };
      }
      createGain() {
        return {
          gain: { setValueAtTime() {}, linearRampToValueAtTime() {}, exponentialRampToValueAtTime() {} },
          connect() {},
        };
      }
    }
    Object.defineProperty(globalThis, 'AudioContext', { configurable: true, value: Falso });
    return creados;
  }

  it('por defecto no suena nada', async () => {
    const creados = audioFalso();
    await montar();
    await escribir(conFallos(textoEnPantalla()));
    expect(creados).not.toHaveBeenCalled();
  });

  it('activado, suena al teclear y al terminar', async () => {
    const creados = audioFalso();
    await montar({ sonido: true });
    await escribir(textoEnPantalla());
    expect(creados).toHaveBeenCalledTimes(1);
  });
});
