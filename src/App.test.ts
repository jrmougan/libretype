import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushSync, mount, tick, unmount } from 'svelte';
import App from './App.svelte';
import { LESSONS } from './lib/lessons';
import { guardar, POR_DEFECTO } from './lib/preferencias';

let app: ReturnType<typeof App>;

beforeEach(async () => {
  localStorage.clear();
  guardar({ ...POR_DEFECTO, tono: 'sobrio' });
  // jsdom no implementa los diálogos. Este doble solo permite montar la app;
  // el foco modal y el recorrido real de Tab se comprueban en navegador.
  Object.defineProperties(HTMLDialogElement.prototype, {
    showModal: { configurable: true, value: vi.fn(function (this: HTMLDialogElement) {
      this.open = true;
    }) },
    close: { configurable: true, value: vi.fn(function (this: HTMLDialogElement) {
      this.open = false;
    }) },
  });
  app = mount(App, { target: document.body });
  await vi.waitFor(() => expect(document.querySelector('.cero')).not.toBeNull());
  const selector = document.querySelector('select')!;
  selector.value = '0';
  selector.dispatchEvent(new Event('change', { bubbles: true }));
  await tick();
});

afterEach(async () => {
  await unmount(app);
  document.body.replaceChildren();
  localStorage.clear();
  Reflect.deleteProperty(HTMLDialogElement.prototype, 'showModal');
  Reflect.deleteProperty(HTMLDialogElement.prototype, 'close');
});

function boton(texto: string): HTMLButtonElement {
  return [...document.querySelectorAll('button')].find(b => b.textContent?.trim() === texto)!;
}

function campo(): HTMLTextAreaElement {
  return document.querySelector('textarea.capture')!;
}

function completar(): void {
  campo().value = LESSONS[0].text;
  campo().dispatchEvent(new InputEvent('input', { bubbles: true }));
  flushSync();
}

describe('captura y paneles', () => {
  it.each(['Ajustes', 'Progreso'])('suspende la captura en %s y la restaura al cerrar', async (nombre) => {
    const captura = campo();
    captura.value = 'a';
    captura.dispatchEvent(new InputEvent('input', { bubbles: true }));
    boton(nombre).click();
    await tick();
    const dialogo = document.querySelector('dialog')!;
    expect(dialogo.open).toBe(true);
    expect(captura.disabled).toBe(true);
    expect(HTMLDialogElement.prototype.showModal).toHaveBeenCalled();

    // Una acción explícita tampoco puede robarle el foco al panel abierto.
    boton('Cerrar').focus();
    captura.closest('label')!.click();
    expect(document.activeElement).toBe(boton('Cerrar'));
    dialogo.dispatchEvent(new Event('cancel', { cancelable: true }));
    await tick();
    expect(document.querySelector('dialog')).toBeNull();
    expect(captura.disabled).toBe(false);
    expect(document.activeElement).toBe(captura);
    expect(captura.value).toBe('a');
  });

  it('el botón Cerrar devuelve el foco a la captura', async () => {
    boton('Ajustes').click();
    await tick();
    boton('Cerrar').click();
    await tick();
    expect(document.activeElement).toBe(campo());
    expect(document.querySelector('dialog')).toBeNull();
  });

  it.each(['Repetir', 'Siguiente lección'])('abre el resultado como diálogo y permite %s', async (accion) => {
    completar();
    const dialogo = document.querySelector('dialog')!;
    expect(dialogo.open).toBe(true);
    expect(dialogo.getAttribute('aria-labelledby')).toBe('resultado-titulo');
    expect(campo().disabled).toBe(true);
    boton(accion).click();
    await tick();
    expect(document.querySelector('dialog')).toBeNull();
    expect(document.activeElement).toBe(campo());
    expect(campo().value).toBe('');
    expect(document.querySelector('h2')?.textContent).toBe(
      LESSONS[accion === 'Repetir' ? 0 : 1].title,
    );
  });

  it('Escape en el resultado deja la misma lección lista para practicar otra vez', async () => {
    completar();
    document.querySelector('dialog')!.dispatchEvent(new Event('cancel', { cancelable: true }));
    await tick();
    expect(document.querySelector('dialog')).toBeNull();
    expect(document.activeElement).toBe(campo());
    expect(campo().value).toBe('');
    expect(document.querySelector('h2')?.textContent).toBe(LESSONS[0].title);
  });

  it('cierra el resultado antes de sustituir el campo al pasar a Siguiente', async () => {
    completar();
    const anterior = campo();
    let cerradoAntesDeSustituir = false;
    vi.mocked(HTMLDialogElement.prototype.close).mockImplementation(function (this: HTMLDialogElement) {
      if (this.open) cerradoAntesDeSustituir = anterior.isConnected && campo() === anterior;
      this.open = false;
    });

    boton('Siguiente lección').click();
    await tick();

    // En WKWebView, retirar primero el campo hace que la restauración nativa
    // del diálogo termine quitándole el foco a la captura de la nueva lección.
    expect(cerradoAntesDeSustituir).toBe(true);
    expect(campo()).not.toBe(anterior);
    expect(document.activeElement).toBe(campo());
  });
});
