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
    expect(boton(nombre).getAttribute('aria-controls')).toBe('panel-dialogo');
    const captura = campo();
    captura.value = 'a';
    captura.dispatchEvent(new InputEvent('input', { bubbles: true }));
    boton(nombre).click();
    await tick();
    const dialogo = document.querySelector('dialog')!;
    expect(dialogo.open).toBe(true);
    expect(dialogo.id).toBe('panel-dialogo');
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
    expect(dialogo.getAttribute('aria-describedby')).toBe('resultado-desc');
    expect(dialogo.getAttribute('aria-live')).toBe('polite');
    expect(dialogo.querySelector('#resultado-desc')).not.toBeNull();
    expect(dialogo.querySelector('.resultado')?.getAttribute('aria-live')).toBe('polite');
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
  it('preserva el estado de dominio al abandonar la lección antes de terminar (issue #9)', async () => {
    const captura = campo();
    captura.value = 'a';
    captura.dispatchEvent(new InputEvent('input', { bubbles: true }));
    await tick();

    // Cambia de lección sin haber completado la actual
    const selector = document.querySelector('select')!;
    selector.value = '1';
    selector.dispatchEvent(new Event('change', { bubbles: true }));
    await tick();

    // La lección se ha reiniciado sin persistir intentos incompletos
    expect(campo().value).toBe('');
    expect(document.querySelector('h2')?.textContent).toBe(LESSONS[1].title);
  });
  it('permite acceder al modo de práctica continua (Issue #19)', async () => {
    const selector = document.querySelector('select')!;
    selector.value = 'continua';
    selector.dispatchEvent(new Event('change', { bubbles: true }));
    await tick();

    expect(document.querySelector('h2')?.textContent).toBe('Práctica continua');
    expect(campo()).not.toBeNull();
  });

  it('permite introducir texto propio para práctica libre (Issue #19)', async () => {
    const selector = document.querySelector('select')!;
    selector.value = 'propio';
    selector.dispatchEvent(new Event('change', { bubbles: true }));
    await tick();

    expect(document.querySelector('h2')?.textContent).toContain('texto propio');
    const inputTexto = document.querySelector('textarea.input-texto-propio') as HTMLTextAreaElement;
    expect(inputTexto).not.toBeNull();
    inputTexto.value = 'hola mundo';
    inputTexto.dispatchEvent(new Event('input', { bubbles: true }));

    boton('Empezar a teclear').click();
    await tick();

    expect(document.querySelector('h2')?.textContent).toBe('Texto propio');
    expect(campo()).not.toBeNull();
  });

  it('persiste la distribución seleccionada en preferencias (Issue #25)', async () => {
    boton('Ajustes').click();
    await tick();

    const selectorLayout = document.querySelector('select#layout') as HTMLSelectElement;
    expect(selectorLayout).not.toBeNull();
    selectorLayout.value = 'es-iso';
    selectorLayout.dispatchEvent(new Event('change', { bubbles: true }));
    await tick();

    const raw = localStorage.getItem('libretype.preferencias');
    expect(raw).not.toBeNull();
    const parsed = JSON.parse(raw!);
    expect(parsed.layout).toBe('es-iso');
  });
});

describe('experiencia de producto (#21, #23, #24)', () => {
  it('actualiza la ultimaLeccion en preferencias al cambiar de lección (#21)', async () => {
    const selector = document.querySelector('select')!;
    selector.value = '2';
    selector.dispatchEvent(new Event('change', { bubbles: true }));
    await tick();

    const guardado = JSON.parse(localStorage.getItem('libretype.preferencias')!);
    expect(guardado.ultimaLeccion).toBe(LESSONS[2].id);
  });

  it('criterio de superación dinámico: accuracy < 90% hace que Repetir sea primario (#23)', async () => {
    // Escribimos texto con muchos fallos
    const target = LESSONS[0].text;
    let err = '';
    for (let i = 0; i < target.length; i++) {
      err += i % 2 === 0 ? 'x' : target[i];
    }
    campo().value = err;
    campo().dispatchEvent(new InputEvent('input', { bubbles: true }));
    flushSync();
    await tick();

    const dialogo = document.querySelector('dialog#dialogo-resultado');
    expect(dialogo).not.toBeNull();
    const btnPrimario = dialogo?.querySelector('button.primario');
    expect(btnPrimario?.textContent).toContain('Repetir');
  });

  it('criterio de superación dinámico: accuracy >= 90% hace que Siguiente sea primario (#23)', async () => {
    completar();
    await tick();

    const dialogo = document.querySelector('dialog#dialogo-resultado');
    expect(dialogo).not.toBeNull();
    const btnPrimario = dialogo?.querySelector('button.primario');
    expect(btnPrimario?.textContent).toContain('Siguiente');
  });

  it('permite reiniciar el intento en marcha desde la barra superior (#24)', async () => {
    campo().value = 'la';
    campo().dispatchEvent(new InputEvent('input', { bubbles: true }));
    flushSync();
    expect(campo().value).toBe('la');

    boton('Reiniciar').click();
    await tick();

    expect(campo().value).toBe('');
  });

  it('permite pausar y reanudar el ejercicio (#24)', async () => {
    boton('Pausar').click();
    await tick();

    expect(campo().disabled).toBe(true);
    expect(document.querySelector('.pausa-cartel')).not.toBeNull();

    boton('Reanudar').click();
    await tick();

    expect(campo().disabled).toBe(false);
    expect(document.querySelector('.pausa-cartel')).toBeNull();
  });
});
