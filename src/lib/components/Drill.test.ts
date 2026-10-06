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

describe('precisión y retroceso (issue #3)', () => {
  it('registra errores corregidos con retroceso en las métricas de la lección', async () => {
    let estadisticasFinales: any = null;
    componente = mount(Drill, {
      target: document.body,
      props: {
        layout: ES_ISO,
        target: 'as',
        titulo: 'Prueba',
        onDone: (s) => {
          estadisticasFinales = s;
        },
      },
    });
    flushSync();
    const campo = document.querySelector('textarea')!;

    // Escribe error 'x' en lugar de 'a'
    campo.value = 'x';
    campo.dispatchEvent(new InputEvent('input', { bubbles: true }));
    flushSync();

    // Borra con retroceso
    campo.value = '';
    campo.dispatchEvent(new InputEvent('input', { bubbles: true }));
    flushSync();

    // Escribe 'a' y luego 's' correctamente
    campo.value = 'a';
    campo.dispatchEvent(new InputEvent('input', { bubbles: true }));
    flushSync();

    campo.value = 'as';
    campo.dispatchEvent(new InputEvent('input', { bubbles: true }));
    flushSync();
    await tick();

    expect(estadisticasFinales).not.toBeNull();
    expect(estadisticasFinales.correct).toBe(2);
    expect(estadisticasFinales.typed).toBe(3); // 2 correctos + 1 error corregido
    expect(estadisticasFinales.accuracy).toBe(67);
  });
});

describe('protección contra pegado en Drill (issue #4)', () => {
  it('previene el evento de pegado en el textarea', () => {
    const campo = montar();
    const pasteEv = new Event('paste', { cancelable: true, bubbles: true });
    campo.dispatchEvent(pasteEv);
    expect(pasteEv.defaultPrevented).toBe(true);
  });
});

describe('reporte de tiempos por tecla (issue #9)', () => {
  it('la primera tecla no reporta 0ms artificialmente al escribir', async () => {
    const reportes: { code: string; acierto: boolean; ms: number }[] = [];
    componente = mount(Drill, {
      target: document.body,
      props: {
        layout: ES_ISO,
        target: 'as',
        titulo: 'Prueba',
        onTecla: (code, acierto, ms) => {
          reportes.push({ code, acierto, ms });
        },
      },
    });
    flushSync();
    const campo = document.querySelector('textarea')!;

    const ev1 = new InputEvent('input', { bubbles: true });
    Object.defineProperty(ev1, 'timeStamp', { value: 1000 });
    campo.value = 'a';
    campo.dispatchEvent(ev1);
    flushSync();

    const ev2 = new InputEvent('input', { bubbles: true });
    Object.defineProperty(ev2, 'timeStamp', { value: 1350 });
    campo.value = 'as';
    campo.dispatchEvent(ev2);
    flushSync();
    await tick();

    expect(reportes.length).toBeGreaterThanOrEqual(2);
    for (const r of reportes) {
      expect(r.ms).toBeGreaterThan(0);
    }
    expect(reportes[0].ms).toBe(350);
  });
});

describe('reiniciar y pausar lección (issue #24)', () => {
  it('restart() reinicia el texto y las métricas', async () => {
    let statsReportadas: any = null;
    componente = mount(Drill, {
      target: document.body,
      props: {
        layout: ES_ISO,
        target: 'as',
        titulo: 'Prueba',
        onStats: (s) => { statsReportadas = s; },
      },
    });
    flushSync();
    const campo = document.querySelector('textarea')!;

    campo.value = 'a';
    campo.dispatchEvent(new InputEvent('input', { bubbles: true }));
    flushSync();
    expect(campo.value).toBe('a');
    expect(statsReportadas.typed).toBe(1);

    // El botón vive en la barra de la aplicación (2.6: había tres); la lección
    // solo expone la operación.
    expect([...document.querySelectorAll('button')].some(
      (b) => b.textContent?.includes('Empezar de nuevo'),
    )).toBe(false);
    componente!.restart();
    flushSync();
    await tick();

    expect(campo.value).toBe('');
    expect(statsReportadas.typed).toBe(0);
    expect(statsReportadas.correct).toBe(0);
  });

  it('cuando está pausado deshabilita el campo y muestra el cartel de pausa', async () => {
    componente = mount(Drill, {
      target: document.body,
      props: {
        layout: ES_ISO,
        target: 'as',
        titulo: 'Prueba',
        pausado: true,
      },
    });
    flushSync();

    const campo = document.querySelector('textarea')!;
    expect(campo.disabled).toBe(true);

    const cartel = document.querySelector('.pausa-cartel');
    expect(cartel).not.toBeNull();
    expect(cartel?.textContent).toContain('Ejercicio pausado');
  });
});

describe('Esc pausa desde el campo (2.6)', () => {
  function montarConPausa() {
    const onPausar = vi.fn();
    componente = mount(Drill, {
      target: document.body,
      props: { layout: ES_ISO, target: 'ás', titulo: 'Tildes', onPausar },
    });
    flushSync();
    return { campo: document.querySelector('textarea')!, onPausar };
  }

  const esc = (init: KeyboardEventInit = {}) =>
    new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true, ...init });

  it('Esc en el campo pide la pausa y no deja que el motor haga nada más', () => {
    const { campo, onPausar } = montarConPausa();
    const ev = esc();
    campo.dispatchEvent(ev);
    expect(onPausar).toHaveBeenCalledTimes(1);
    expect(ev.defaultPrevented).toBe(true);
  });

  it('a mitad de un acento, Esc es del método de entrada y no pausa', () => {
    const { campo, onPausar } = montarConPausa();
    campo.dispatchEvent(esc({ isComposing: true }));
    campo.dispatchEvent(esc({ keyCode: 229 }));
    // Composición en curso según el propio motor (el ´ ya está en el campo).
    campo.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true }));
    campo.value = '´';
    campo.dispatchEvent(new InputEvent('input', { bubbles: true, isComposing: true }));
    flushSync();
    campo.dispatchEvent(esc());
    expect(onPausar).not.toHaveBeenCalled();
  });

  it('Esc fuera del campo no lo escucha nadie: no hay manejador global', () => {
    const { onPausar } = montarConPausa();
    document.body.dispatchEvent(esc());
    window.dispatchEvent(esc());
    expect(onPausar).not.toHaveBeenCalled();
  });

  it('las demás teclas pasan sin tocar', () => {
    const { campo, onPausar } = montarConPausa();
    const ev = new KeyboardEvent('keydown', { key: 'a', code: 'KeyA', bubbles: true, cancelable: true });
    campo.dispatchEvent(ev);
    expect(ev.defaultPrevented).toBe(false);
    expect(onPausar).not.toHaveBeenCalled();
  });
});

describe('filtro de temblor en el campo (2.7)', () => {
  function montarFiltro(ignorarRepeticion: boolean) {
    componente = mount(Drill, {
      target: document.body,
      props: { layout: ES_ISO, target: 'aab', titulo: 'Prueba', ignorarRepeticion },
    });
    flushSync();
    return document.querySelector('textarea')!;
  }

  function escribe(campo: HTMLTextAreaElement, data: string, t: number): boolean {
    vi.spyOn(performance, 'now').mockReturnValue(t);
    const ev = new InputEvent('beforeinput', { inputType: 'insertText', data, bubbles: true, cancelable: true });
    campo.dispatchEvent(ev);
    return ev.defaultPrevented;
  }

  it('activado, cancela el rebote antes de que llegue al campo', () => {
    const campo = montarFiltro(true);
    expect(escribe(campo, 'a', 1000)).toBe(false);
    expect(escribe(campo, 'a', 1040)).toBe(true);
    expect(escribe(campo, 'a', 1200)).toBe(false);
  });

  it('apagado (por defecto) no toca nada', () => {
    const campo = montarFiltro(false);
    expect(escribe(campo, 'a', 1000)).toBe(false);
    expect(escribe(campo, 'a', 1010)).toBe(false);
  });
});
