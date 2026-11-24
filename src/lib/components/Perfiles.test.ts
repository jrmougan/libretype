import { afterEach, describe, expect, it, vi } from 'vitest';
import { flushSync, mount, tick, unmount } from 'svelte';
import Perfiles from './Perfiles.svelte';
import QuienPractica from './QuienPractica.svelte';
import type { Perfil } from '../storage/almacen';

let componente: Record<string, unknown> | undefined;

afterEach(async () => {
  if (componente) await unmount(componente);
  componente = undefined;
  document.body.replaceChildren();
});

const PERFILES: Perfil[] = [
  { id: 1, alias: 'Principal', creadoEn: '2026-09-01T10:00:00.000Z' },
  { id: 2, alias: 'Ana', creadoEn: '2026-09-02T10:00:00.000Z' },
];
const boton = (texto: string, raiz: ParentNode = document): HTMLButtonElement =>
  [...raiz.querySelectorAll('button')].find((b) => b.textContent?.replace(/\s+/g, ' ').trim().startsWith(texto))!;
const fila = (id: number): HTMLElement => document.querySelector(`[data-perfil="${id}"]`)!;
function escribir(input: HTMLInputElement, valor: string): void {
  input.value = valor;
  input.dispatchEvent(new Event('input', { bubbles: true }));
  flushSync();
}
const enviar = (form: HTMLFormElement): void => {
  form.dispatchEvent(new SubmitEvent('submit', { bubbles: true, cancelable: true }));
};

describe('Perfiles.svelte', () => {
  function montar(extra: Record<string, unknown> = {}) {
    const props = {
      perfiles: PERFILES, activo: 2,
      onCambiar: vi.fn(), onCrear: vi.fn(async () => {}), onRenombrar: vi.fn(async () => {}), onBorrar: vi.fn(async () => {}),
      ...extra,
    };
    componente = mount(Perfiles, { target: document.body, props });
    flushSync();
    return props;
  }

  it('marca el activo con texto, no solo con color, y no ofrece borrar el principal', () => {
    montar();
    expect(fila(2).textContent).toContain('practicando ahora');
    expect(fila(1).textContent).not.toContain('practicando ahora');
    expect(boton('Borrar', fila(1))).toBeUndefined();
    expect(boton('Borrar', fila(2))).toBeDefined();
    // Al activo no se le ofrece «practicar»: ya lo está haciendo.
    expect(boton('Practicar', fila(2))).toBeUndefined();
    expect(boton('Practicar', fila(1))).toBeDefined();
  });

  it('dice sin rodeos que los perfiles no son privados', () => {
    montar();
    expect(document.querySelector('.perfiles .nota')?.textContent).toMatch(/No tienen\s+contraseña/);
  });

  it('cada botón dice de quién es, también para quien no ve la fila', () => {
    montar();
    expect(boton('Practicar', fila(1)).textContent?.replace(/\s+/g, ' ').trim()).toBe('Practicar como Principal');
    expect(boton('Borrar', fila(2)).textContent?.replace(/\s+/g, ' ').trim()).toBe('Borrar el perfil de Ana');
  });

  it('practicar como otro llama con su identificador', () => {
    const { onCambiar } = montar();
    boton('Practicar', fila(1)).click();
    expect(onCambiar).toHaveBeenCalledWith(1);
  });

  it('cambia el nombre en el sitio y enseña el error si el nombre ya existe', async () => {
    const onRenombrar = vi.fn(async (_id: number, alias: string) => {
      if (alias === 'Principal') throw new Error('Ya hay un perfil que se llama «Principal». Elige otro nombre.');
    });
    montar({ onRenombrar });
    boton('Cambiar nombre', fila(2)).click();
    await vi.waitFor(() => expect(document.activeElement?.id).toBe('alias-editado'));
    const campo = document.querySelector<HTMLInputElement>('#alias-editado')!;
    expect(campo.value).toBe('Ana');

    escribir(campo, 'Principal');
    enviar(campo.form!);
    await vi.waitFor(() => expect(document.querySelector('[role="alert"]')?.textContent).toContain('Ya hay un perfil'));
    // Lo escrito no se pierde por el error.
    expect(document.querySelector<HTMLInputElement>('#alias-editado')?.value).toBe('Principal');

    escribir(campo, 'Ana María');
    enviar(campo.form!);
    await vi.waitFor(() => expect(document.querySelector('#alias-editado')).toBeNull());
    expect(onRenombrar).toHaveBeenLastCalledWith(2, 'Ana María');
    expect(document.querySelector('[role="alert"]')).toBeNull();
  });

  it('borrar pide confirmación diciendo qué se pierde, y el foco va a la salida segura', async () => {
    const { onBorrar } = montar();
    boton('Borrar', fila(2)).click();
    await tick();
    const confirmacion = document.querySelector('.confirmar-borrado')!;
    expect(confirmacion.textContent).toMatch(/sesiones, sus teclas aprendidas y sus lecciones/);
    expect(confirmacion.textContent).toContain('no se puede deshacer');
    await vi.waitFor(() => expect(document.activeElement).toBe(boton('Cancelar', confirmacion)));
    expect(onBorrar).not.toHaveBeenCalled();

    boton('Cancelar', confirmacion).click();
    await vi.waitFor(() => expect(document.activeElement).toBe(boton('Borrar', fila(2))));
    expect(document.querySelector('.confirmar-borrado')).toBeNull();

    boton('Borrar', fila(2)).click();
    await tick();
    boton('Sí, borrar el perfil de Ana').click();
    await vi.waitFor(() => expect(onBorrar).toHaveBeenCalledWith(2));
  });

  it('crea un perfil nuevo desde el formulario y lo anuncia', async () => {
    const { onCrear } = montar();
    const campo = document.querySelector<HTMLInputElement>('#alias-nuevo-perfil')!;
    escribir(campo, 'Luis');
    enviar(campo.form!);
    await vi.waitFor(() => expect(document.querySelector('[role="status"]')?.textContent).toBe('Perfil «Luis» creado.'));
    expect(onCrear).toHaveBeenCalledWith('Luis');
    expect(document.querySelector<HTMLInputElement>('#alias-nuevo-perfil')?.value).toBe('');
  });

  it('si crear falla, lo dice y deja lo escrito', async () => {
    montar({ onCrear: vi.fn(async () => { throw new Error('Escribe un nombre o un alias para el perfil.'); }) });
    const campo = document.querySelector<HTMLInputElement>('#alias-nuevo-perfil')!;
    escribir(campo, '   ');
    enviar(campo.form!);
    await vi.waitFor(() => expect(document.querySelector('[role="alert"]')?.textContent).toContain('Escribe un nombre'));
  });
});

describe('QuienPractica.svelte', () => {
  function montar(extra: Record<string, unknown> = {}) {
    const props = { perfiles: PERFILES, onElegir: vi.fn(), onCrear: vi.fn(async () => {}), ...extra };
    componente = mount(QuienPractica, { target: document.body, props });
    flushSync();
    return props;
  }

  it('enseña un botón grande por perfil y el foco empieza en el primero', () => {
    montar();
    const botones = [...document.querySelectorAll<HTMLButtonElement>('button.perfil')];
    expect(botones.map((b) => b.textContent)).toEqual(['Principal', 'Ana']);
    expect(document.activeElement).toBe(botones[0]);
  });

  it('no pide edad ni contraseña, y dice que los perfiles no son privados', () => {
    montar();
    const texto = document.querySelector('.quien')!.textContent!;
    expect(texto).not.toMatch(/edad|años|curso|nacimiento/i);
    expect(document.querySelector('input[type="password"]')).toBeNull();
    expect(texto).toMatch(/no tienen contraseña/);
  });

  it('elegir un nombre entra con ese perfil', () => {
    const { onElegir } = montar();
    boton('Ana').click();
    expect(onElegir).toHaveBeenCalledWith(2);
  });

  it('quien no está en la lista puede añadirse, y un nombre que no vale se explica', async () => {
    const onCrear = vi.fn(async (alias: string) => {
      if (!alias.trim()) throw new Error('Escribe un nombre o un alias para el perfil.');
    });
    montar({ onCrear });
    boton('No estoy en la lista').click();
    await vi.waitFor(() => expect(document.activeElement?.id).toBe('alias-nuevo'));
    const campo = document.querySelector<HTMLInputElement>('#alias-nuevo')!;

    enviar(campo.form!);
    await vi.waitFor(() => expect(document.querySelector('[role="alert"]')?.textContent).toContain('Escribe un nombre'));
    expect(campo.getAttribute('aria-invalid')).toBe('true');
    expect(campo.getAttribute('aria-describedby')).toBe('alias-error');

    escribir(campo, 'Luis');
    enviar(campo.form!);
    await vi.waitFor(() => expect(onCrear).toHaveBeenLastCalledWith('Luis'));
  });
});
