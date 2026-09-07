/**
 * Tests de regresión del motor de tecleo.
 *
 * Los dos bugs que ha tenido este motor compilaban limpios y pasaban
 * `svelte-check` sin errores. Eran de orden de eventos y de estado de
 * composición, y solo se vieron ejecutando la app y escribiendo tildes a mano.
 * Estos tests existen para que no haya que volver a hacerlo.
 *
 * Las trazas de macOS son capturas literales del spike (`traces.ts`).
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { TypingEngine, computeStats, diffAgainstTarget } from './engine';
import {
  ALL_TRACES, LINUX_ACUTE_A, MACOS_ACUTE_A, MACOS_ACUTE_CANCELLED,
  MACOS_DIAERESIS_U, PLAIN_TYPING, replay, type Trace,
} from './traces';

let el: HTMLTextAreaElement;
let engine: TypingEngine;

beforeEach(() => {
  el = document.createElement('textarea');
  document.body.appendChild(el);
  engine = new TypingEngine(el);
});

afterEach(() => {
  engine.destroy();
  el.remove();
});

/** Estado del motor después de cada evento de la traza. */
interface Snapshot {
  after: string;
  committed: string;
  text: string;
  composing: boolean;
  stamps: number;
}

function run(trace: Trace, offset = ''): Snapshot[] {
  // El prefijo se escribe como lo haría el usuario, con su evento `input`.
  if (offset) {
    el.value = offset;
    el.dispatchEvent(new InputEvent('input', { data: offset }));
  }

  const snaps: Snapshot[] = [];
  replay(el, trace, (step) => {
    snaps.push({
      after: step.type,
      committed: engine.committed,
      text: engine.text,
      composing: engine.composing,
      stamps: engine.stamps.length,
    });
  }, offset);
  return snaps;
}

describe('texto confirmado', () => {
  for (const trace of ALL_TRACES) {
    it(`${trace.id} (${trace.origin}) deja "${trace.committed}"`, () => {
      run(trace);
      expect(engine.committed).toBe(trace.committed);
    });
  }
});

describe('el acento a medias no cuenta como escrito', () => {
  // Este es el primer bug: durante la composición el campo ya muestra `´`,
  // la lección lo contaba como carácter y saltaba a la letra siguiente en vez
  // de pedir la vocal que completa la tilde.

  it('macOS: lo confirmado no crece hasta el compositionend', () => {
    const snaps = run(MACOS_ACUTE_A);

    const duranteComposicion = snaps.filter((s) => s.composing);
    expect(duranteComposicion.length).toBeGreaterThan(0);
    for (const s of duranteComposicion) {
      expect(s.committed, `tras ${s.after}`).toBe('');
    }

    // El campo sí muestra el acento mientras tanto: es lo que ve el alumno.
    expect(snaps.some((s) => s.composing && s.text === '´')).toBe(true);
  });

  it('Linux: mismo comportamiento con el orden inverso de eventos', () => {
    const snaps = run(LINUX_ACUTE_A);
    for (const s of snaps.filter((s) => s.composing)) {
      expect(s.committed, `tras ${s.after}`).toBe('');
    }
    expect(engine.committed).toBe('á');
  });

  it('a mitad de palabra solo avanza al confirmar', () => {
    const snaps = run(MACOS_ACUTE_A, 'pap');
    for (const s of snaps.filter((s) => s.composing)) {
      expect(s.committed).toBe('pap');
    }
    expect(engine.committed).toBe('papá');
  });
});

describe('el compositionend fuerza el recálculo', () => {
  // Segundo bug: el `input` con el texto final llega ANTES del
  // `compositionend`, así que al llegar el `compositionend` el valor del campo
  // ya no cambia. Si el motor corta ahí por "no ha cambiado nada", la frontera
  // de lo confirmado no se mueve y la lección se queda clavada en la tilde.

  it('avanza justo en el compositionend, no antes', () => {
    const snaps = run(MACOS_ACUTE_A);
    const i = snaps.findIndex((s) => s.after === 'compositionend');

    expect(snaps[i - 1].committed).toBe('');
    expect(snaps[i].committed).toBe('á');
  });

  it('el valor del campo ya era el final antes del compositionend', () => {
    // Si esto deja de ser cierto, el test de arriba estaría probando otra cosa.
    const pasos = MACOS_ACUTE_A.steps;
    const fin = pasos.findIndex((s) => s.type === 'compositionend');
    expect(pasos[fin - 1].value).toBe(pasos[fin].value);
  });
});

describe('acento cancelado', () => {
  it('´ + t da los dos caracteres, sin duplicar ni perder', () => {
    run(MACOS_ACUTE_CANCELLED);
    expect(engine.committed).toBe('´t');
  });

  it('diéresis', () => {
    run(MACOS_DIAERESIS_U);
    expect(engine.committed).toBe('ü');
  });
});

describe('canal físico', () => {
  it('sigue las teclas por code, independientemente de la composición', () => {
    const vistos: string[] = [];
    engine.destroy();
    engine = new TypingEngine(el, { physical: (e) => { if (e.down) vistos.push(e.code); } });

    run(MACOS_ACUTE_A);

    // En macOS estos keydown llegan DESPUÉS de que el carácter esté confirmado.
    // El canal físico no debe perdérselos por eso.
    expect(vistos).toEqual(['Quote', 'KeyA']);
  });

  it('no deja teclas encendidas al perder el foco', () => {
    el.dispatchEvent(new KeyboardEvent('keydown', { key: 'a', code: 'KeyA' }));
    expect(engine.heldCodes.has('KeyA')).toBe(true);

    el.dispatchEvent(new FocusEvent('blur'));
    expect(engine.heldCodes.size).toBe(0);
  });
});

describe('sellos de tiempo', () => {
  it('hay uno por carácter confirmado, ninguno por acento a medias', () => {
    const snaps = run(MACOS_ACUTE_A);
    for (const s of snaps.filter((s) => s.composing)) {
      expect(s.stamps, `tras ${s.after}`).toBe(s.committed.length);
    }
    expect(engine.stamps).toHaveLength(1);
  });

  it('se recortan al borrar', () => {
    run(PLAIN_TYPING);
    expect(engine.stamps).toHaveLength(2);

    el.value = 'a';
    el.dispatchEvent(new InputEvent('input', { data: null }));
    expect(engine.stamps).toHaveLength(1);
  });
});

describe('reset', () => {
  it('deja el motor limpio', () => {
    run(MACOS_ACUTE_A);
    engine.reset();
    expect(engine.committed).toBe('');
    expect(engine.text).toBe('');
    expect(engine.stamps).toHaveLength(0);
    expect(engine.composing).toBe(false);
  });
});

describe('comparación con el objetivo', () => {
  it('marca correcto, erróneo, actual y pendiente', () => {
    expect(diffAgainstTarget('pa', 'papá'))
      .toEqual(['correct', 'correct', 'current', 'pending']);
  });

  it('un error no descoloca los siguientes', () => {
    expect(diffAgainstTarget('pxpá', 'papá'))
      .toEqual(['correct', 'wrong', 'correct', 'correct']);
  });

  it('acepta el objetivo vacío', () => {
    expect(diffAgainstTarget('', '')).toEqual([]);
  });
});

describe('protección contra pegado (issue #4)', () => {
  it('cancela el evento paste por defecto', () => {
    const pasteEv = new Event('paste', { cancelable: true });
    el.dispatchEvent(pasteEv);
    expect(pasteEv.defaultPrevented).toBe(true);
  });

  it('cancela beforeinput de tipo insertFromPaste por defecto', () => {
    const beforeInputEv = new InputEvent('beforeinput', {
      inputType: 'insertFromPaste',
      cancelable: true,
    });
    el.dispatchEvent(beforeInputEv);
    expect(beforeInputEv.defaultPrevented).toBe(true);
  });

  it('no cancela beforeinput de inserción normal', () => {
    const beforeInputEv = new InputEvent('beforeinput', {
      inputType: 'insertText',
      cancelable: true,
    });
    el.dispatchEvent(beforeInputEv);
    expect(beforeInputEv.defaultPrevented).toBe(false);
  });
});

describe('composición huérfana en blur (issue #5)', () => {
  it('en blur resetea composing y compBase si había composición activa', () => {
    el.dispatchEvent(new CompositionEvent('compositionstart'));
    expect(engine.composing).toBe(true);

    el.dispatchEvent(new FocusEvent('blur'));
    expect(engine.composing).toBe(false);

    // Tras recuperar el foco, el motor no se queda congelado
    el.value = 'a';
    el.dispatchEvent(new InputEvent('input', { data: 'a' }));
    expect(engine.committed).toBe('a');
  });
});

describe('cursor y sellos de tiempo (issue #6)', () => {
  it('inserción en posición desplazada preserva los sellos correspondientes', () => {
    const ev1 = new InputEvent('input');
    Object.defineProperty(ev1, 'timeStamp', { value: 1000 });
    el.value = 'ac';
    el.dispatchEvent(ev1);
    expect(engine.stamps).toEqual([1000, 1000]);

    // Inserción de 'b' en medio a los 2000ms
    const ev2 = new InputEvent('input');
    Object.defineProperty(ev2, 'timeStamp', { value: 2000 });
    el.value = 'abc';
    el.dispatchEvent(ev2);
    expect(engine.committed).toBe('abc');
    expect(engine.stamps).toEqual([1000, 2000, 1000]);
  });

  it('borrado en el medio no desincroniza los sellos de caracteres posteriores', () => {
    el.value = 'abc';
    el.dispatchEvent(new InputEvent('input', { timeStamp: 1000 } as any));
    // Se borra 'b'
    el.value = 'ac';
    el.dispatchEvent(new InputEvent('input', { timeStamp: 2000 } as any));
    expect(engine.committed).toBe('ac');
    expect(engine.stamps).toHaveLength(2);
  });
});

describe('liberación de teclas retenidas en reset (issue #10)', () => {
  it('emite down: false para cualquier tecla retenida en #held', () => {
    const liberadas: string[] = [];
    engine.destroy();
    engine = new TypingEngine(el, {
      physical: (k) => {
        if (!k.down) liberadas.push(k.code);
      },
    });

    el.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyA' }));
    el.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyB' }));
    expect(engine.heldCodes.size).toBe(2);

    engine.reset();
    expect(engine.heldCodes.size).toBe(0);
    expect(liberadas).toEqual(['KeyA', 'KeyB']);
  });
});

describe('métricas', () => {
  it('cuenta cinco caracteres por palabra sobre los aciertos', () => {
    const s = computeStats('papá café', 'papá café', [0, 60000]);
    expect(s.correct).toBe(9);
    expect(s.accuracy).toBe(100);
    expect(s.wpm).toBe(Math.round(9 / 5));
  });

  it('no divide por cero con un solo carácter', () => {
    const s = computeStats('p', 'papá', [1000]);
    expect(s.wpm).toBe(0);
    expect(Number.isFinite(s.wpm)).toBe(true);
  });

  it('la precisión baja con los fallos', () => {
    expect(computeStats('pxpx', 'papá', [0, 1000]).accuracy).toBe(50);
  });

  it('sin escribir nada la precisión es 100, no NaN', () => {
    expect(computeStats('', 'papá', []).accuracy).toBe(100);
  });

  it('descuenta pulsaciones erróneas corregidas con retroceso (issue #3)', () => {
    // 4 caracteres correctos y 1 error corregido con retroceso = 4 / 5 = 80% precisión
    const s = computeStats('hola', 'hola', [0, 1000, 2000, 3000], 1);
    expect(s.correct).toBe(4);
    expect(s.typed).toBe(5);
    expect(s.accuracy).toBe(80);
  });

  it('con suficientes errores con retroceso la precisión cae bajo el 90% para evitar récord falso (issue #3)', () => {
    // 10 correctos y 2 errores corregidos: 10 / 12 = 83% < 90%
    const s = computeStats('abcdefghij', 'abcdefghij', [0, 1000], 2);
    expect(s.accuracy).toBe(83);
    expect(s.accuracy).toBeLessThan(90);
  });

  it('descuenta pausas largas de inactividad de elapsedMs (issue #8)', () => {
    // 4 caracteres con una pausa de 5 minutos (300.000 ms) entre el segundo y tercer carácter
    const stamps = [1000, 1500, 301500, 302000];
    const s = computeStats('hola', 'hola', stamps);
    // Con el tope de inactividad a 2000ms:
    // delta 0->1: 500ms
    // delta 1->2: 300.000ms -> acotado a 2000ms
    // delta 2->3: 500ms
    // Total: 3000ms
    expect(s.elapsedMs).toBe(3000);
    expect(s.wpm).toBeGreaterThan(0);
  });
});
