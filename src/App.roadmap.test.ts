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

describe('fluidez', () => {
  async function abrirFluidez(sesiones: unknown[] = [SESION]): Promise<void> {
    await abrir({}, sesiones);
    const selector = document.querySelector<HTMLSelectElement>('.barra select')!;
    selector.value = 'fluidez';
    selector.dispatchEvent(new Event('change', { bubbles: true }));
    await tick();
    await tick();
  }
  const guardadas = (): { leccion: string }[] => JSON.parse(localStorage.getItem('libretype.sesiones')!);

  it('se abre desde el selector, con palabras escribibles con lo ya enseñado', async () => {
    await abrirFluidez();
    expect(document.querySelector('.drill h2')?.textContent).toBe('Fluidez');
    const alfabeto = catalogo.alfabetoHasta(catalogo.primera.id);
    expect(textoMostrado().split(' ')).toHaveLength(20);
    expect([...textoMostrado()].filter((ch) => ch !== ' ' && !alfabeto.has(ch))).toEqual([]);
    expect(document.activeElement).toBe(campo());
  });

  it('la primera tanda limpia fija el ritmo; la siguiente se compara con él, no con una cifra fija', async () => {
    await abrirFluidez();
    await teclear(textoMostrado());
    const dialogo = (): string => document.querySelector('#dialogo-resultado')?.textContent ?? '';
    expect(dialogo()).toContain('Primera tanda limpia');
    expect(guardadas().at(-1)?.leccion).toBe('fluidez');

    boton('Otra tanda').click();
    await tick();
    await tick();
    expect(document.querySelector('#dialogo-resultado')).toBeNull();
    expect(document.querySelector('.drill')?.textContent).toContain('Tu ritmo habitual en estas tandas');
    await teclear(textoMostrado());
    expect(dialogo()).toMatch(/ritmo habitual/);
  });

  it('una tanda no cuenta como lección del temario: ni objetivo ni desbloqueo', async () => {
    await abrirFluidez();
    await teclear(textoMostrado());
    const texto = document.querySelector('#dialogo-resultado')!.textContent!;
    expect(texto).not.toContain('Lección superada');
    expect(texto).not.toContain('Objetivo');
  });
});

describe('prueba de colocación', () => {
  const OTRA = { ...SESION, leccion: 'practica-continua' };
  const lecciones = catalogo.principal.lecciones;
  const guardadas = (): { leccion: string; pctAcierto: number }[] => JSON.parse(localStorage.getItem('libretype.sesiones')!);

  async function abrirPrueba(): Promise<void> {
    await abrir({}, [OTRA]);
    const selector = document.querySelector<HTMLSelectElement>('.barra select')!;
    selector.value = 'colocacion';
    selector.dispatchEvent(new Event('change', { bubbles: true }));
    await tick();
    await tick();
  }

  it('se explica antes de empezar, sin cifras ni preguntar por la edad, y se puede no hacer', async () => {
    await abrirPrueba();
    const tarjeta = document.querySelector('.prueba')!;
    expect(tarjeta.querySelector('h2')?.textContent).toBe('Prueba de colocación');
    expect(tarjeta.textContent).toContain(`«${lecciones[0].title}»`);
    expect(tarjeta.textContent).not.toMatch(/\d/);
    expect(tarjeta.textContent).not.toMatch(/edad|años|niñ|mayor/i);
    expect(document.querySelector('textarea.capture')).toBeNull();

    boton('Mejor empiezo por las lecciones').click();
    await tick();
    await tick();
    expect(document.querySelector('.drill h2')?.textContent).toBe(lecciones[0].title);
    expect(guardadas()).toHaveLength(1);
  });

  it('cada tramo bien escrito abre su lección y pasa al siguiente; al primero que cuesta, se para', async () => {
    await abrirPrueba();
    boton('Empezar la prueba').click();
    await tick();
    await tick();
    expect(document.querySelector('.drill h2')?.textContent).toBe(`Prueba de colocación · ${lecciones[0].title}`);
    expect(document.activeElement).toBe(campo());
    // Durante la prueba no hay cifras en la barra.
    expect(document.querySelector('.metricas')).toBeNull();

    await teclear(textoMostrado());
    await vi.waitFor(() => expect(document.querySelector('.drill h2')?.textContent)
      .toBe(`Prueba de colocación · ${lecciones[1].title}`));
    expect(document.querySelector('#dialogo-resultado')).toBeNull();
    await teclear(textoMostrado());
    await vi.waitFor(() => expect(document.querySelector('.drill h2')?.textContent)
      .toBe(`Prueba de colocación · ${lecciones[2].title}`));

    // El tercero, lleno de fallos.
    await teclear('x'.repeat(textoMostrado().length));
    await vi.waitFor(() => expect(document.querySelector('.prueba h2')?.textContent).toBe('Prueba terminada'));
    const fin = document.querySelector('.prueba')!;
    expect(fin.textContent).toContain('Se han abierto 2 lecciones');
    expect(fin.textContent).toContain(`«${lecciones[2].title}»`);
    // Ni qué ha fallado ni cuánto.
    expect(fin.textContent).not.toMatch(/%|fall|precisi/i);

    // Tres sesiones normales, una por tramo, con el identificador de su lección.
    expect(guardadas().slice(1).map((s) => s.leccion)).toEqual(lecciones.slice(0, 3).map((l) => l.id));

    boton(`Ir a «${lecciones[2].title}»`).click();
    await tick();
    await tick();
    expect(document.querySelector('.drill h2')?.textContent).toBe(lecciones[2].title);
    const opcion = (id: string) => document.querySelector<HTMLOptionElement>(`.barra option[value="${id}"]`)!;
    expect(opcion(lecciones[2].id).disabled).toBe(false);
    expect(opcion(lecciones[3].id).disabled).toBe(true);
  });

  it('si el primer tramo ya cuesta, no se abre nada y se sigue por la primera lección', async () => {
    await abrirPrueba();
    boton('Empezar la prueba').click();
    await tick();
    await tick();
    await teclear('x'.repeat(textoMostrado().length));
    await vi.waitFor(() => expect(document.querySelector('.prueba h2')?.textContent).toBe('Prueba terminada'));
    expect(document.querySelector('.prueba')?.textContent).toContain(`empezar por «${lecciones[0].title}»`);
  });

  it('con todo el temario abierto la opción no se ofrece', async () => {
    await abrir({}, lecciones.map((l) => ({ ...SESION, leccion: l.id, pctAcierto: 95 })));
    expect(document.querySelector('.barra option[value="colocacion"]')).toBeNull();
  });
});

describe('teclas recién dominadas', () => {
  const logro = (): string | undefined => document.querySelector('#dialogo-resultado .logro')?.textContent ?? undefined;
  // Todas dominadas menos la K, que está a un acierto rápido de pasar el umbral.
  const dominada = { intentos: 20, aciertos: 20, msTotal: 20 * 250 };
  const casi = { intentos: 7, aciertos: 7, msTotal: 7 * 250 };
  const REPOSO = ['KeyA', 'KeyS', 'KeyD', 'KeyF', 'KeyJ', 'KeyL', 'Semicolon', 'Space'];

  it('al terminar se cuenta como logro la tecla que acaba de dejar de necesitar la letra', async () => {
    localStorage.setItem('libretype.teclas', JSON.stringify([...REPOSO.map((c) => [c, dominada]), ['KeyK', casi]]));
    await abrir();
    expect(textoMostrado()).toContain('k');
    await teclear(textoMostrado());
    expect(logro()).toBe('Ya escribes sin mirar la K.');
  });

  it('muchas de golpe se cuentan en vez de enumerarse', async () => {
    await abrir();
    await teclear(textoMostrado());
    expect(logro()).toMatch(/^Ya escribes sin mirar \d+ teclas nuevas\.$/);
  });

  it('sin ninguna tecla nueva dominada no se dice nada', async () => {
    await abrir();
    await teclear('x'.repeat(textoMostrado().length));
    expect(logro()).toBeUndefined();
  });
});
