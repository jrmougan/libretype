import { afterEach, describe, expect, it, vi } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';
import Perfiles from './Perfiles.svelte';
import type { Perfil } from '../storage/almacen';

let componente: ReturnType<typeof Perfiles> | undefined;

afterEach(async () => {
  if (componente) await unmount(componente);
  componente = undefined;
  document.body.replaceChildren();
});

const perfiles: Perfil[] = [
  { id: 1, alias: 'Principal', creadoEn: '' },
  { id: 2, alias: 'Ana', creadoEn: '' },
];

function montar(onRenombrar = vi.fn(async (_id: number, _alias: string) => {})) {
  const llamadas = {
    onCambiar: vi.fn(),
    onCrear: vi.fn(async (_alias: string) => {}),
    onRenombrar,
    onBorrar: vi.fn(async (_id: number) => {}),
  };
  componente = mount(Perfiles, {
    target: document.body,
    props: { perfiles, activo: 1, ...llamadas },
  });
  flushSync();
  return llamadas;
}

const boton = (texto: string) =>
  [...document.querySelectorAll('button')].find((b) => b.textContent?.replace(/\s+/g, ' ').trim() === texto);

describe('Perfiles.svelte (3.2)', () => {
  it('marca el activo con texto, no solo con color, y no ofrece borrar el principal', () => {
    montar();
    expect(document.querySelector('[data-perfil="1"]')?.textContent).toContain('practicando ahora');
    expect(boton('Borrar el perfil de Principal')).toBeUndefined();
    expect(boton('Borrar el perfil de Ana')).toBeDefined();
    expect(boton('Practicar como Principal')).toBeUndefined();
    expect(document.querySelector('.perfiles')?.textContent?.replace(/\s+/g, ' ')).toContain('No tienen contraseña');
  });

  it('cambia el nombre en el sitio y enseña el error si el nombre ya existe', async () => {
    const llamadas = montar(vi.fn(async (_id: number, alias: string) => {
      if (alias === 'Principal') throw new Error('Ya hay un perfil que se llama «Principal».');
    }));
    boton('Cambiar nombre de Ana')!.click();
    flushSync();
    const campo = document.getElementById('alias-editado') as HTMLInputElement;
    await vi.waitFor(() => expect(document.activeElement).toBe(campo));
    expect(campo.value).toBe('Ana');

    campo.value = 'Principal';
    campo.dispatchEvent(new Event('input', { bubbles: true }));
    boton('Guardar')!.click();
    await vi.waitFor(() => expect(document.querySelector('[role="alert"]')?.textContent).toContain('Ya hay un perfil'));

    campo.value = 'Ana B.';
    campo.dispatchEvent(new Event('input', { bubbles: true }));
    boton('Guardar')!.click();
    await vi.waitFor(() => expect(document.getElementById('alias-editado')).toBeNull());
    expect(llamadas.onRenombrar).toHaveBeenLastCalledWith(2, 'Ana B.');
  });

  it('crea un perfil nuevo desde el formulario', async () => {
    const llamadas = montar();
    const campo = document.getElementById('alias-nuevo-perfil') as HTMLInputElement;
    campo.value = 'Luis';
    campo.dispatchEvent(new Event('input', { bubbles: true }));
    boton('Añadir perfil')!.click();
    await vi.waitFor(() => expect(llamadas.onCrear).toHaveBeenCalledWith('Luis'));
    await vi.waitFor(() => expect(campo.value).toBe(''));
  });
});
