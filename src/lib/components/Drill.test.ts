import { afterEach, describe, expect, it, vi } from 'vitest';
import { flushSync, mount, tick, unmount } from 'svelte';
import Drill from './Drill.svelte';
import { ES_ISO } from '../keyboard/layouts';
import { replay, MACOS_ACUTE_A, LINUX_ACUTE_A } from '../keyboard/traces';

let componente: ReturnType<typeof Drill> | undefined;

afterEach(async () => {
  if (componente) await unmount(componente);
  componente = undefined;
  document.body.replaceChildren();
  vi.restoreAllMocks();
});

function montar() {
  componente = mount(Drill, {
    target: document.body,
    props: { layout: ES_ISO, target: 'ás', titulo: 'Tildes' },
  });
  flushSync();
  return document.querySelector('textarea')!;
}

describe('foco de la lección', () => {
  it('no recupera el foco al salir hacia otro control ni hacia el fondo', () => {
    const campo = montar();
    expect(document.activeElement).toBe(campo);
    const boton = document.createElement('button');
    document.body.append(boton);
    const enfocar = vi.spyOn(campo, 'focus');

    boton.focus();
    campo.dispatchEvent(new FocusEvent('blur', { relatedTarget: boton }));
    campo.dispatchEvent(new FocusEvent('blur', { relatedTarget: null }));

    // jsdom no reproduce la trampa de Chromium/WebKit: hay que comprobar
    // también que el manejador no ha llamado a focus(), no solo el foco final.
    expect(enfocar).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(boton);
  });

  it('permite reanudar explícitamente sin borrar lo que ya se ha escrito', async () => {
    const campo = montar();
    campo.value = 'á';
    campo.dispatchEvent(new InputEvent('input', { bubbles: true }));
    const boton = document.querySelector('button')!;
    boton.focus();
    boton.click();
    await tick();
    expect(document.activeElement).toBe(campo);
    expect(campo.value).toBe('á');
    expect(document.querySelector('.ch.current')?.textContent).toBe('s');
  });

  it.each([MACOS_ACUTE_A, LINUX_ACUTE_A])('conserva la composición: $description', async (traza) => {
    const campo = montar();
    let confirmado = false;
    replay(campo, traza, (paso) => {
      if (paso.type === 'compositionend') confirmado = true;
      flushSync();
      expect(document.querySelector('.ch.current')?.textContent).toBe(confirmado ? 's' : 'á');
    });
    await tick();
    expect(document.querySelector('.ch.correct')?.textContent).toBe('á');
    expect(document.querySelector('.ch.current')?.textContent).toBe('s');
  });
});

describe('accesibilidad de la lección (#15, #16)', () => {
  it('proporciona un aria-label descriptivo con el texto de la lección al textarea', () => {
    const campo = montar();
    expect(campo.getAttribute('aria-label')).toBe('Escribe el texto de la lección: ás');
    const contenedor = campo.closest('label');
    expect(contenedor?.getAttribute('aria-label')).toBe('Texto de la lección: ás');
  });

  it('mantiene elementos decorativos con aria-hidden para no inundar el lector de pantalla', () => {
    montar();
    const pista = document.querySelector('.hint');
    expect(pista?.getAttribute('aria-hidden')).toBe('true');

    const teclado = document.querySelector('.teclado');
    expect(teclado?.getAttribute('aria-hidden')).toBe('true');

    const enVivo = document.querySelector('.sr-only');
    expect(enVivo?.getAttribute('aria-live')).toBe('polite');
  });

  it('permite desactivar animaciones mediante las props de movimiento o animaciones', async () => {
    if (componente) await unmount(componente);
    componente = mount(Drill, {
      target: document.body,
      props: { layout: ES_ISO, target: 'ás', titulo: 'Tildes', animaciones: 'reducidas' },
    });
    flushSync();
    expect(document.querySelector('.drill.sin-animaciones')).not.toBeNull();
  });
});
