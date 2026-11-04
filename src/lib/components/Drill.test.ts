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

describe('la cifra de cobertura', () => {
  it('habla del idioma del curso, no siempre del español', () => {
    componente = mount(Drill, {
      target: document.body,
      props: { layout: ES_ISO, target: 'ás', titulo: 'T', cobertura: '45', idioma: 'inglés' },
    });
    flushSync();
    const chapa = document.querySelector('.cobertura')!;
    expect(chapa.textContent).toContain('45% del inglés');
    expect(chapa.getAttribute('aria-label')).toContain('se escriben en inglés');
    expect(document.body.textContent).not.toContain('español');
  });
});

describe('texto largo dentro de su caja', () => {
  const rect = (top: number, bottom: number) => ({ top, bottom }) as DOMRect;

  it('lleva el cursor a la vista al salirse de la caja', async () => {
    // Sin esto, en cuanto el texto pasaba de lo que cabe en la caja, el cursor
    // seguía avanzando por debajo sin que se viera.
    componente = mount(Drill, {
      target: document.body,
      props: { layout: ES_ISO, target: 'uno dos', titulo: 'Largo' },
    });
    flushSync();
    const campo = document.querySelector('textarea')!;
    const caja = document.querySelector<HTMLElement>('.text')!;
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
      return this === caja ? rect(100, 150) : rect(180, 200);
    });

    campo.value = 'u';
    campo.dispatchEvent(new InputEvent('input', { bubbles: true }));
    await tick();

    expect(caja.scrollTop).toBe(80);
  });

  it('no parte las palabras: cada una va entera en su envoltorio', () => {
    componente = mount(Drill, {
      target: document.body,
      props: { layout: ES_ISO, target: 'uno dos', titulo: 'Largo' },
    });
    flushSync();
    const palabras = [...document.querySelectorAll('.palabra')].map((p) => p.textContent);
    expect(palabras).toEqual(['uno\u00a0', 'dos']);
    expect(document.querySelectorAll('.ch')).toHaveLength(7);
  });
});

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
    campo.blur();
    (componente as unknown as { enfocar: () => void }).enfocar();
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
  // El botón vive en la barra de `App`, que tiene su propio test: aquí se comprueba
  // lo que ese botón llama. Antes había dos botones con la misma etiqueta accesible.
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

    (componente as unknown as { restart: () => void }).restart();
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

describe('pulido de la lección', () => {
  it('la tecla con la que se sale del campo no se queda encendida', async () => {
    const campo = montar();
    campo.dispatchEvent(new KeyboardEvent('keydown', { code: 'Tab', bubbles: true }));
    flushSync();
    expect(document.querySelector('g.key.pressed')).not.toBeNull();
    campo.dispatchEvent(new FocusEvent('blur'));
    flushSync();
    expect(document.querySelector('g.key.pressed')).toBeNull();
  });

  it('al empezar a teclear lleva el texto a la vista una sola vez por intento', async () => {
    const original = Element.prototype.scrollIntoView;
    const desplazar = vi.fn();
    Element.prototype.scrollIntoView = desplazar;
    try {
      const campo = montar();
      expect(desplazar).not.toHaveBeenCalled();
      for (const v of ['á', 'ás']) {
        campo.value = v;
        campo.dispatchEvent(new InputEvent('input', { bubbles: true }));
        flushSync();
      }
      expect(desplazar).toHaveBeenCalledTimes(1);
    } finally {
      Element.prototype.scrollIntoView = original;
    }
  });

  it('el aviso de foco perdido no le estorba al lector de pantalla', () => {
    montar();
    expect(document.querySelector('.aviso-foco')?.getAttribute('aria-hidden')).toBe('true');
  });
});
