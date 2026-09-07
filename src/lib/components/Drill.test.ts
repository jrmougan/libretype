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
