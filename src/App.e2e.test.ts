import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushSync, mount, tick, unmount } from 'svelte';
import App from './App.svelte';
import { LESSONS } from './lib/lessons';
import { abrirAlmacen } from './lib/storage/almacen';

let app: ReturnType<typeof App>;

beforeEach(() => {
  localStorage.clear();
  Object.defineProperties(HTMLDialogElement.prototype, {
    showModal: {
      configurable: true,
      value: vi.fn(function (this: HTMLDialogElement) {
        this.open = true;
      }),
    },
    close: {
      configurable: true,
      value: vi.fn(function (this: HTMLDialogElement) {
        this.open = false;
      }),
    },
  });
});

afterEach(async () => {
  if (app) await unmount(app);
  document.body.replaceChildren();
  localStorage.clear();
  Reflect.deleteProperty(HTMLDialogElement.prototype, 'showModal');
  Reflect.deleteProperty(HTMLDialogElement.prototype, 'close');
  vi.restoreAllMocks();
});

function campoCaptura(): HTMLTextAreaElement {
  return document.querySelector('textarea.capture')!;
}

function botonPorTexto(texto: string): HTMLButtonElement | undefined {
  return Array.from(document.querySelectorAll('button')).find(
    (b) => b.textContent?.trim() === texto || b.textContent?.includes(texto),
  );
}

describe('Prueba end-to-end / integración de la aplicación real (Issue #42)', () => {
  it('ejecuta el flujo completo de onboarding, tecleo de lección, diálogo de resultados y transición a la siguiente lección', async () => {
    // 1. Montaje inicial sin preferencias guardadas: debe mostrar la selección de tono
    app = mount(App, { target: document.body });
    await vi.waitFor(() => expect(document.getElementById('tono-tit')).not.toBeNull());

    const tituloTono = document.getElementById('tono-tit');
    expect(tituloTono?.textContent).toBe('¿Cómo prefieres que sea la aplicación?');

    // 2. Elección de tono con celebración ('juego')
    const botonJuego = botonPorTexto('Con celebración');
    expect(botonJuego).not.toBeUndefined();
    botonJuego?.click();
    await tick();
    flushSync();

    // 3. Como no hay sesiones previas, la aplicación transiciona a la lección cero
    await vi.waitFor(() => expect(document.querySelector('.cero')).not.toBeNull());
    expect(document.querySelector('.cero h2')?.textContent).toBeTruthy();

    // 4. Desde la lección cero, el usuario pasa al ejercicio usando el selector superior
    const selectorLeccion = document.querySelector('header select') as HTMLSelectElement;
    expect(selectorLeccion).not.toBeNull();
    selectorLeccion.value = '0';
    selectorLeccion.dispatchEvent(new Event('change', { bubbles: true }));
    await tick();
    flushSync();

    // 5. Verifica que la primera lección está activa y lista para teclear
    await vi.waitFor(() => expect(document.querySelector('.drill')).not.toBeNull());
    expect(document.querySelector('h2')?.textContent).toBe(LESSONS[0].title);

    const campo = campoCaptura();
    expect(campo).not.toBeNull();
    expect(campo.disabled).toBe(false);
    expect(document.activeElement).toBe(campo);

    // 6. Simula tecleo incremental en el campo
    const target = LESSONS[0].text;
    const mitad = Math.floor(target.length / 2);

    // Teclea primera mitad
    campo.value = target.slice(0, mitad);
    campo.dispatchEvent(new InputEvent('input', { bubbles: true }));
    flushSync();
    await tick();

    // Métricas en vivo actualizadas
    const dlMetricas = document.querySelector('dl.metricas');
    expect(dlMetricas).not.toBeNull();
    expect(dlMetricas?.textContent).toContain(`${mitad}/${target.length}`);

    // Teclea hasta completar la lección
    campo.value = target;
    campo.dispatchEvent(new InputEvent('input', { bubbles: true }));
    flushSync();
    await tick();

    // 7. Aparición del diálogo de resultado
    await vi.waitFor(() => {
      const dialogo = document.querySelector('#dialogo-resultado') as HTMLDialogElement;
      expect(dialogo).not.toBeNull();
      expect(dialogo.open).toBe(true);
    });

    const resultadoTitulo = document.getElementById('resultado-titulo');
    expect(resultadoTitulo?.textContent).toBeTruthy();
    // En tono 'juego' debe incluir felicitación y la estrella de récord
    expect(resultadoTitulo?.textContent).toContain('★');
    expect(resultadoTitulo?.textContent).toContain('¡Nunca habías ido tan rápido en esta lección!');

    const resultadoDesc = document.getElementById('resultado-desc');
    expect(resultadoDesc?.textContent).toContain('palabras por minuto');
    expect(resultadoDesc?.textContent).toContain('100% de precisión');

    // 8. Verificación de persistencia en el almacén
    const almacen = await abrirAlmacen();
    const sesionesGuardadas = await almacen.leerTodas();
    expect(sesionesGuardadas).toHaveLength(1);
    expect(sesionesGuardadas[0].leccion).toBe(LESSONS[0].id);
    expect(sesionesGuardadas[0].pctAcierto).toBe(100);

    const teclasGuardadas = await almacen.leerTeclas();
    expect(teclasGuardadas.size).toBeGreaterThan(0);

    // 9. Transición a la siguiente lección pulsando el botón primario
    const botonSiguiente = document.querySelector('#dialogo-resultado button.primario') as HTMLButtonElement;
    expect(botonSiguiente).not.toBeNull();
    botonSiguiente.click();
    await tick();
    flushSync();

    // 10. Verifica que el resultado se ha cerrado y la lección 2 está activa
    expect(document.querySelector('#dialogo-resultado')).toBeNull();
    expect(selectorLeccion.value).toBe('1');
    expect(document.querySelector('h2')?.textContent).toBe(LESSONS[1].title);

    const campoNuevo = campoCaptura();
    expect(campoNuevo).not.toBeNull();
    expect(campoNuevo.value).toBe('');
    expect(campoNuevo.disabled).toBe(false);
    expect(document.activeElement).toBe(campoNuevo);

    // 11. Teclea en la nueva lección para verificar interactividad de punta a punta
    campoNuevo.value = 'de ';
    campoNuevo.dispatchEvent(new InputEvent('input', { bubbles: true }));
    flushSync();
    await tick();
    expect(document.querySelector('dl.metricas')?.textContent).toContain(`3/${LESSONS[1].text.length}`);
  });

  it('permite repetir la lección terminada reiniciando el campo y las métricas', async () => {
    // Monta la app con tono sobrio prefijado para ir directo a la lección
    localStorage.setItem('libretype.preferencias', JSON.stringify({ tono: 'sobrio' }));
    app = mount(App, { target: document.body });

    await vi.waitFor(() => expect(document.querySelector('select')).not.toBeNull());
    const selector = document.querySelector('select')!;
    selector.value = '0';
    selector.dispatchEvent(new Event('change', { bubbles: true }));
    await tick();
    flushSync();

    const campo = campoCaptura();
    campo.value = LESSONS[0].text;
    campo.dispatchEvent(new InputEvent('input', { bubbles: true }));
    flushSync();
    await tick();

    await vi.waitFor(() => {
      expect(document.querySelector('#dialogo-resultado')).not.toBeNull();
    });

    const botonRepetir = Array.from(document.querySelectorAll<HTMLButtonElement>('#dialogo-resultado button')).find(
      (b) => b.textContent?.includes('Repetir'),
    );
    expect(botonRepetir).not.toBeUndefined();
    botonRepetir?.click();
    await tick();
    flushSync();

    expect(document.querySelector('#dialogo-resultado')).toBeNull();
    expect(document.querySelector('h2')?.textContent).toBe(LESSONS[0].title);
    expect(campoCaptura().value).toBe('');
    expect(document.activeElement).toBe(campoCaptura());
  });

  it('el panel de progreso refleja de inmediato la lección completada', async () => {
    localStorage.setItem('libretype.preferencias', JSON.stringify({ tono: 'sobrio' }));
    app = mount(App, { target: document.body });

    await vi.waitFor(() => expect(document.querySelector('select')).not.toBeNull());
    const selector = document.querySelector('select')!;
    selector.value = '0';
    selector.dispatchEvent(new Event('change', { bubbles: true }));
    await tick();
    flushSync();

    // Completa la lección
    campoCaptura().value = LESSONS[0].text;
    campoCaptura().dispatchEvent(new InputEvent('input', { bubbles: true }));
    flushSync();
    await tick();

    // Cierra el resultado pasando a la siguiente o con cancel
    const dialogoResultado = document.querySelector('#dialogo-resultado')!;
    dialogoResultado.dispatchEvent(new Event('cancel', { cancelable: true }));
    await tick();
    flushSync();

    // Abre el panel de progreso
    const botonProgreso = botonPorTexto('Progreso')!;
    botonProgreso.click();
    await tick();
    flushSync();

    const dialogoProgreso = document.querySelector('dialog#panel-dialogo');
    expect(dialogoProgreso).not.toBeNull();
    expect(dialogoProgreso?.textContent).toContain(LESSONS[0].title);
    expect(dialogoProgreso?.textContent).toContain('Sesiones');
    expect(dialogoProgreso?.textContent).toContain('1 de 9');

    // Cierra el panel de progreso
    const botonCerrar = botonPorTexto('Cerrar')!;
    botonCerrar.click();
    await tick();
    flushSync();

    expect(document.querySelector('dialog#panel-dialogo')).toBeNull();
    expect(document.activeElement).toBe(campoCaptura());
  });
});
