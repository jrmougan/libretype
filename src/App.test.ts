import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushSync, mount, tick, unmount } from 'svelte';
import App from './App.svelte';
import { LESSONS } from './lib/lessons';
import { guardar, POR_DEFECTO } from './lib/preferencias';
import { PCT_OBJETIVO, SIN_PRESION } from './lib/storage/objetivos';

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
  await elegirLeccion(0);
});

/** Abre el temario de la barra, como haría alguien con el ratón o el teclado. */
async function abrirTemario(): Promise<void> {
  const boton = document.querySelector<HTMLButtonElement>('button.btn-temario')!;
  if (boton.getAttribute('aria-expanded') !== 'true') boton.click();
  await tick();
}

async function elegirLeccion(i: number): Promise<void> {
  await abrirTemario();
  document.querySelector<HTMLButtonElement>(`#panel-dialogo [data-leccion="${i}"]`)!.click();
  await tick();
}

async function elegirModo(modo: string): Promise<void> {
  await abrirTemario();
  document.querySelector<HTMLButtonElement>(`#panel-dialogo [data-modo="${modo}"]`)!.click();
  await tick();
}

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

/**
 * El texto del intento en curso, leído de la pantalla. Desde que cada intento
 * trae un texto nuevo, solo el primer contacto con una lección usa `text`.
 */
function textoEnPantalla(): string {
  return [...document.querySelectorAll('.drill .ch')]
    .map((s) => s.textContent ?? '').join('').replace(/\u00a0/g, ' ');
}

function completar(): void {
  campo().value = LESSONS[0].text;
  campo().dispatchEvent(new InputEvent('input', { bubbles: true }));
  flushSync();
}

describe('captura y paneles', () => {
  it.each([true, false])('ofrece repaso accionable solo con lecciones antiguas: %s', async (antigua) => {
    await unmount(app);
    const ahora = Date.now();
    const sesiones = [0, 1, 1, 1].map((indice, i) => ({
      leccion: LESSONS[indice].id, pctAcierto: 95, ppm: 10,
      aciertos: 95, escritos: 100, ms: 60000,
      terminadaEn: new Date(ahora - (i === 0 && antigua ? 20 : 4 - i) * 86400000).toISOString(),
    }));
    localStorage.setItem('libretype.sesiones', JSON.stringify(sesiones));
    guardar({ ...POR_DEFECTO, tono: 'sobrio', ultimaLeccion: LESSONS[1].id });
    app = mount(App, { target: document.body });
    await vi.waitFor(() => expect(document.querySelector('h2')?.textContent).toBe(LESSONS[1].title));
    // Lección ya practicada: el texto es uno generado, no el fijo.
    campo().value = textoEnPantalla();
    campo().dispatchEvent(new InputEvent('input', { bubbles: true }));
    flushSync();
    await tick();
    const repasar = boton('Repasar con práctica continua');
    expect(Boolean(repasar)).toBe(antigua);
    expect(boton('Siguiente lección')).toBeDefined();
    if (antigua) {
      repasar.click();
      await tick();
      expect(document.querySelector('h2')?.textContent).toBe('Práctica continua');
      expect(document.querySelector('#dialogo-resultado')).toBeNull();
      expect(campo().disabled).toBe(false);
      expect(document.querySelector<HTMLSelectElement>('main select')?.value).toBe('2');
    }
  });

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
    expect(dialogo.querySelector('#resultado-desc')).not.toBeNull();
    // Una sola región viva: anidadas, el lector anunciaba lo mismo dos veces (roadmap 0.11).
    expect(dialogo.querySelector('.resultado')?.getAttribute('aria-live')).toBe('polite');
    expect(dialogo.hasAttribute('aria-live')).toBe(false);
    expect(dialogo.querySelectorAll('[aria-live], [role="status"], [role="alert"]')).toHaveLength(1);
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

    // Vuelve a empezar la lección disponible sin haber completado el intento.
    await elegirLeccion(0);

    // La lección se ha reiniciado sin persistir intentos incompletos
    expect(campo().value).toBe('');
    expect(document.querySelector('h2')?.textContent).toBe(LESSONS[0].title);
  });
  it('permite acceder al modo de práctica continua (Issue #19)', async () => {
    await elegirModo('continua');

    expect(document.querySelector('h2')?.textContent).toBe('Práctica continua');
    expect(campo()).not.toBeNull();
  });

  it('permite introducir texto propio para práctica libre (Issue #19)', async () => {
    await elegirModo('propio');

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
  it('impide saltarse una lección bloqueada aunque se pulse su tarjeta', async () => {
    await abrirTemario();
    const cerrada = document.querySelector<HTMLButtonElement>('[data-leccion="1"]')!;
    expect(cerrada.getAttribute('aria-disabled')).toBe('true');
    cerrada.click();
    await tick();
    expect(document.querySelector('#panel-dialogo')).not.toBeNull();
    boton('Cerrar').click();
    await tick();
    expect(document.querySelector('h2')?.textContent).toBe(LESSONS[0].title);
  });

  it('recupera los desbloqueos al abrir de nuevo y limita una preferencia adelantada', async () => {
    completar();
    await vi.waitFor(() => expect(localStorage.getItem('libretype.sesiones')).toContain('reposo'));
    await unmount(app);
    guardar({ ...POR_DEFECTO, tono: 'sobrio', ultimaLeccion: LESSONS[5].id });
    app = mount(App, { target: document.body });
    await vi.waitFor(() => expect(document.querySelector('h2')?.textContent).toBe(LESSONS[1].title));
    await abrirTemario();
    expect(document.querySelector('[data-leccion="1"]')?.hasAttribute('aria-disabled')).toBe(false);
    expect(document.querySelector('[data-leccion="2"]')?.getAttribute('aria-disabled')).toBe('true');
  });

  it('actualiza la ultimaLeccion en preferencias al cambiar de lección (#21)', async () => {
    completar();
    await tick();
    document.querySelector('dialog')!.dispatchEvent(new Event('cancel', { cancelable: true }));
    await tick();
    await elegirLeccion(1);

    const guardado = JSON.parse(localStorage.getItem('libretype.preferencias')!);
    expect(guardado.ultimaLeccion).toBe(LESSONS[1].id);
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
    expect(boton('Siguiente lección')).toBeUndefined();
    boton('Repetir').click();
    await tick();
    await abrirTemario();
    expect(document.querySelector('[data-leccion="1"]')?.getAttribute('aria-disabled')).toBe('true');
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

    boton('Empezar de nuevo').click();
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

describe('el objetivo de precisión nunca es un número aislado (#54)', () => {
  const RE_UMBRAL = new RegExp(`\\b${PCT_OBJETIVO}\\s*%`);
  const RE_SIN_PRESION = new RegExp(SIN_PRESION.join('|'), 'i');

  /**
   * Recorre el DOM montado en vez de mirar solo los sitios conocidos: si una
   * vista nueva habla del objetivo y suelta la cifra, falla aquí. Los
   * porcentajes en vivo de las métricas no cuentan, porque no son el objetivo.
   */
  function ningunaCifraSuelta(): void {
    const menciones = [...document.querySelectorAll<HTMLElement>('body *')]
      .filter((el) => /objetivo/i.test(el.textContent ?? ''));
    expect(menciones.length).toBeGreaterThan(0);
    for (const el of menciones) {
      const texto = el.textContent ?? '';
      if (!RE_UMBRAL.test(texto)) continue;
      expect(texto, `<${el.tagName.toLowerCase()}> enseña el umbral sin quitar presión`)
        .toMatch(RE_SIN_PRESION);
    }
  }

  it('la pista de la lección en curso une el umbral a lo que se practica', () => {
    const pista = document.querySelector('p.focus');
    expect(pista?.textContent).toContain(`${PCT_OBJETIVO}% de precisión`);
    expect(pista?.textContent).toMatch(RE_SIN_PRESION);
    expect(pista?.textContent).toContain(LESSONS[0].focus);
    ningunaCifraSuelta();
  });

  it('tras un intento por debajo del umbral dice cómo seguir, no cuánto falta', async () => {
    const objetivo = LESSONS[0].text;
    let conFallos = '';
    for (let i = 0; i < objetivo.length; i++) conFallos += i % 2 === 0 ? 'x' : objetivo[i];
    campo().value = conFallos;
    campo().dispatchEvent(new InputEvent('input', { bubbles: true }));
    flushSync();
    await tick();

    const nota = document.querySelector('dialog#dialogo-resultado p.note');
    expect(nota?.textContent).toContain(`${PCT_OBJETIVO}% de precisión`);
    expect(nota?.textContent).toMatch(RE_SIN_PRESION);
    expect(nota?.textContent).toContain('desbloquear la siguiente lección');
    ningunaCifraSuelta();
  });
});

async function irAModo(modo: 'continua' | 'propio'): Promise<void> {
  await elegirModo(modo);
  if (modo === 'propio') {
    const entrada = document.querySelector<HTMLTextAreaElement>('textarea.input-texto-propio')!;
    entrada.value = 'hola mundo';
    entrada.dispatchEvent(new Event('input', { bubbles: true }));
    boton('Empezar a teclear').click();
    await tick();
  }
}

describe('el titular del resultado cuenta lo que ha pasado (roadmap 0.1)', () => {
  async function conTonoDeJuego(): Promise<void> {
    await unmount(app);
    guardar({ ...POR_DEFECTO, tono: 'juego' });
    app = mount(App, { target: document.body });
    await vi.waitFor(() => expect(document.querySelector('.cero')).not.toBeNull());
    await elegirLeccion(0);
  }

  it('con el tono lúdico no dice «superada» si el intento no llega al objetivo', async () => {
    await conTonoDeJuego();
    const objetivo = LESSONS[0].text;
    let conFallos = '';
    for (let i = 0; i < objetivo.length; i++) conFallos += i % 2 === 0 ? 'x' : objetivo[i];
    campo().value = conFallos;
    campo().dispatchEvent(new InputEvent('input', { bubbles: true }));
    flushSync();
    await tick();
    const titulo = document.getElementById('resultado-titulo')?.textContent ?? '';
    expect(titulo).toContain('¡Lección terminada!');
    expect(titulo.toLowerCase()).not.toContain('superada');
  });

  it.each(['continua', 'propio'] as const)('en %s no habla de superar ninguna lección', async (modo) => {
    await conTonoDeJuego();
    await irAModo(modo);
    campo().value = textoEnPantalla();
    campo().dispatchEvent(new InputEvent('input', { bubbles: true }));
    flushSync();
    await tick();
    const titulo = document.getElementById('resultado-titulo')?.textContent ?? '';
    expect(titulo.trim().length).toBeGreaterThan(0);
    expect(titulo.toLowerCase()).not.toContain('lección');
  });
});

describe('la pausa funciona en todos los modos (roadmap 0.2)', () => {
  it.each(['continua', 'propio'] as const)('Pausar en %s detiene la captura y Reanudar la devuelve', async (modo) => {
    await irAModo(modo);
    expect(campo().disabled).toBe(false);
    boton('Pausar').click();
    await tick();
    expect(campo().disabled).toBe(true);
    expect(document.querySelector('.pausa-cartel')).not.toBeNull();

    // El botón del cartel, que antes solo existía en las lecciones.
    document.querySelector<HTMLButtonElement>('.btn-reanudar')!.click();
    await tick();
    expect(campo().disabled).toBe(false);
    expect(document.querySelector('.pausa-cartel')).toBeNull();
    expect(document.activeElement).toBe(campo());
  });

  it.each(['leccion', 'continua', 'propio'] as const)('perder el foco de la ventana pausa en %s', async (modo) => {
    if (modo !== 'leccion') await irAModo(modo);
    campo().value = textoEnPantalla().slice(0, 1);
    campo().dispatchEvent(new InputEvent('input', { bubbles: true }));
    flushSync();
    window.dispatchEvent(new Event('blur'));
    await tick();
    expect(document.querySelector('.pausa-cartel')).not.toBeNull();
    expect(campo().disabled).toBe(true);
  });

  it('cambiar de modo no arrastra una pausa anterior', async () => {
    boton('Pausar').click();
    await tick();
    await irAModo('continua');
    expect(document.querySelector('.pausa-cartel')).toBeNull();
    expect(campo().disabled).toBe(false);
  });
});

describe('temario y selectores operables con teclado (0.3)', () => {
  it('el botón del temario dice dónde estás y abre el panel compartido', async () => {
    const temario = document.querySelector<HTMLButtonElement>('button.btn-temario')!;
    expect(temario.textContent).toContain('Temario');
    expect(temario.textContent).toContain(`Lección 1 de ${LESSONS.length}`);
    expect(temario.textContent).toContain(LESSONS[0].title);
    expect(temario.getAttribute('aria-controls')).toBe('panel-dialogo');
    await abrirTemario();
    expect(temario.getAttribute('aria-expanded')).toBe('true');
    expect(document.querySelector('#panel-dialogo')?.getAttribute('aria-label')).toBe('Temario');
    expect(campo().disabled).toBe(true);
  });

  it('la pista de segmentos del temario marca la lección actual, es decorativa y no lleva cifras', async () => {
    const pista = document.querySelector('button.btn-temario .tm-pista')!;
    expect(pista.getAttribute('aria-hidden')).toBe('true');
    const segs = [...pista.querySelectorAll('.seg')];
    expect(segs).toHaveLength(LESSONS.length);
    expect(segs.findIndex((s) => s.classList.contains('actual'))).toBe(0);
    expect(pista.textContent?.trim()).toBe('');
    // En práctica libre no hay lección actual que marcar.
    await elegirModo('continua');
    const temario = document.querySelector('button.btn-temario')!;
    expect(temario.textContent).toContain('Práctica libre');
    expect(temario.querySelectorAll('.seg.actual')).toHaveLength(0);
  });

  it('cambiar el vocabulario de la práctica continua no tira el texto hasta pulsar el botón', async () => {
    await elegirModo('continua');
    const antes = document.querySelector('.drill .text')!.textContent;
    const selector = document.querySelector<HTMLSelectElement>('#selector-nivel-practica')!;
    // Lo que hace una flecha en un <select> cerrado en Chromium/WebView2.
    selector.value = '0';
    selector.dispatchEvent(new Event('change', { bubbles: true }));
    selector.dispatchEvent(new Event('input', { bubbles: true }));
    await tick();
    expect(document.querySelector('.drill .text')!.textContent).toBe(antes);
    boton('Nuevo texto').click();
    await tick();
    expect(document.querySelector<HTMLSelectElement>('#selector-nivel-practica')!.value).toBe('0');
  });
});

describe('pausa y un solo «Empezar de nuevo» (2.6)', () => {
  it.each(['leccion', 'continua'])('Esc en el campo pausa también en %s', async (modo) => {
    if (modo === 'continua') await elegirModo('continua');
    campo().dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
    await tick();
    expect(document.querySelector('.pausa-cartel')).not.toBeNull();
    expect(campo().disabled).toBe(true);
    expect(boton('Reanudar')).toBeDefined();
    document.querySelector<HTMLButtonElement>('.btn-reanudar')!.click();
    await tick();
    expect(campo().disabled).toBe(false);
  });

  it('solo hay un «Empezar de nuevo» en pantalla, también en Texto propio', async () => {
    const cuantos = () => [...document.querySelectorAll('button')]
      .filter((b) => /empezar de nuevo|reiniciar/i.test(b.textContent ?? '')).length;
    expect(cuantos()).toBe(1);
    await elegirModo('propio');
    const entrada = document.querySelector<HTMLTextAreaElement>('textarea.input-texto-propio')!;
    entrada.value = '“Hola” — mundo';
    entrada.dispatchEvent(new Event('input', { bubbles: true }));
    boton('Empezar a teclear').click();
    await tick();
    expect(cuantos()).toBe(1);
    // Y avisa de lo que quitó, en vez de comérselo en silencio.
    const aviso = document.querySelector('.aviso-quitados');
    expect(aviso?.getAttribute('role')).toBe('status');
    expect(aviso?.textContent).toContain('«“» «”» «—»');
  });
});

describe('fase de fluidez (2.5)', () => {
  it('se llega desde el temario y compara la tanda con el propio ritmo', async () => {
    await elegirModo('fluidez');
    expect(document.querySelector('h2')?.textContent).toBe('Fluidez');
    expect(document.querySelector('button.btn-temario')?.textContent).toContain('Fluidez');
    const texto = [...document.querySelectorAll('.drill .ch')].map((c) => c.textContent).join('').replace(/ /g, ' ');
    campo().value = texto;
    campo().dispatchEvent(new InputEvent('input', { bubbles: true }));
    flushSync();
    await tick();
    const dialogo = document.querySelector('dialog#dialogo-resultado')!;
    expect(dialogo.textContent).toContain('Primera tanda limpia');
    await vi.waitFor(() => expect(localStorage.getItem('libretype.sesiones')).toContain('"fluidez"'));

    // La siguiente tanda ya tiene ritmo de referencia: el de la anterior.
    boton('Otra tanda').click();
    await tick();
    expect(document.querySelector('p.focus')?.textContent ?? '').toMatch(/ritmo habitual|primera tanda/i);
    expect(document.querySelector('#dialogo-resultado')).toBeNull();
    expect(document.activeElement).toBe(campo());
  });
});

describe('prueba de colocación (2.9)', () => {
  function escribirTramo(conFallos = false): void {
    const texto = [...document.querySelectorAll('.drill .ch')].map((c) => c.textContent).join('').replace(/ /g, ' ');
    campo().value = conFallos ? [...texto].map((c, i) => (i % 2 ? 'x' : c)).join('') : texto;
    campo().dispatchEvent(new InputEvent('input', { bubbles: true }));
    flushSync();
  }

  it('se elige desde el temario, abre lo demostrado y se para sin reproches', async () => {
    await elegirModo('colocacion');
    boton('Empezar la prueba').click();
    await tick();
    expect(document.querySelector('h2')?.textContent).toContain(LESSONS[0].title);

    escribirTramo();
    await vi.waitFor(() => expect(document.querySelector('h2')?.textContent).toContain(LESSONS[1].title));
    // Sin diálogo de resultado entre tramos: la prueba sigue sola.
    expect(document.querySelector('#dialogo-resultado')).toBeNull();

    escribirTramo(true);
    await vi.waitFor(() => expect(document.querySelector('h2')?.textContent).toBe('Prueba terminada'));
    const fin = document.querySelector('main')!.textContent!;
    expect(fin).toContain('Se ha abierto una lección');
    expect(fin).not.toMatch(/\d+\s*%/);

    // El desbloqueo es el de siempre: una sesión normal de la lección.
    const guardadas = JSON.parse(localStorage.getItem('libretype.sesiones')!);
    expect(guardadas.map((s: { leccion: string }) => s.leccion)).toEqual([LESSONS[0].id, LESSONS[1].id]);

    boton(`Ir a «${LESSONS[1].title}»`).click();
    await tick();
    expect(document.querySelector('h2')?.textContent).toBe(LESSONS[1].title);
  });
});
