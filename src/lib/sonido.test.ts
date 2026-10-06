import { describe, expect, it, vi } from 'vitest';
import { contextoDelNavegador, crearSonido, MS_ENTRE_SONIDOS, type ContextoAudio } from './sonido';

/** Un AudioContext de mentira que apunta qué se ha tocado y a qué volumen. */
function contextoFalso(estado = 'running') {
  const notas: { frecuencia: number; forma: string; pico: number }[] = [];
  const resume = vi.fn(() => Promise.resolve());
  const ctx: ContextoAudio = {
    currentTime: 0,
    destination: {},
    state: estado,
    resume,
    createOscillator() {
      const nota = { frecuencia: 0, forma: '', pico: 0 };
      notas.push(nota);
      return {
        set type(v: string) { nota.forma = v; },
        get type() { return nota.forma; },
        frequency: { setValueAtTime: (v: number) => { nota.frecuencia = v; } },
        connect: () => undefined,
        start: () => {},
        stop: () => {},
      };
    },
    createGain() {
      const nota = notas[notas.length - 1];
      return {
        gain: {
          setValueAtTime: () => {},
          linearRampToValueAtTime: (v: number) => { nota.pico = v; },
          exponentialRampToValueAtTime: () => {},
        },
        connect: () => undefined,
      };
    },
  };
  return { ctx, notas, resume };
}

describe('sonido opcional', () => {
  it('el fallo suena más grave que el acierto, y el fin es un pequeño acorde', () => {
    const { ctx, notas } = contextoFalso();
    let t = 0;
    const s = crearSonido(() => ctx, () => (t += 1000));
    s.acierto(1);
    s.fallo(1);
    s.fin(1);
    expect(notas[1].frecuencia).toBeLessThan(notas[0].frecuencia);
    expect(notas).toHaveLength(5);
  });

  it('respeta el volumen elegido y con volumen cero no suena nada', () => {
    const { ctx, notas } = contextoFalso();
    let t = 0;
    const s = crearSonido(() => ctx, () => (t += 1000));
    s.acierto(1);
    s.acierto(0.5);
    expect(notas[1].pico).toBeCloseTo(notas[0].pico / 2);
    s.acierto(0);
    s.fallo(Number.NaN);
    expect(notas).toHaveLength(2);
  });

  it('es suave: ningún sonido pasa de una décima del volumen máximo', () => {
    const { ctx, notas } = contextoFalso();
    let t = 0;
    const s = crearSonido(() => ctx, () => (t += 1000));
    s.acierto(1); s.fallo(1); s.fin(1);
    for (const n of notas) expect(n.pico).toBeLessThanOrEqual(0.1);
  });

  it('una vocal con tilde no suena doble aunque se anoten dos teclas', () => {
    const { ctx, notas } = contextoFalso();
    let t = 0;
    const s = crearSonido(() => ctx, () => t);
    s.acierto(1);
    t += MS_ENTRE_SONIDOS - 1;
    s.acierto(1);
    expect(notas).toHaveLength(1);
    t += MS_ENTRE_SONIDOS;
    s.acierto(1);
    expect(notas).toHaveLength(2);
  });

  it('crea el contexto tarde, una sola vez, y lo despierta si está suspendido', () => {
    const { ctx, resume } = contextoFalso('suspended');
    const crear = vi.fn(() => ctx);
    let t = 0;
    const s = crearSonido(crear, () => (t += 1000));
    expect(crear).not.toHaveBeenCalled();
    s.acierto(1);
    s.fallo(1);
    expect(crear).toHaveBeenCalledTimes(1);
    expect(resume).toHaveBeenCalled();
  });

  it('sin audio en el entorno no rompe nada', () => {
    let t = 0;
    const s = crearSonido(() => null, () => (t += 1000));
    expect(() => { s.acierto(1); s.fin(1); }).not.toThrow();
    const roto = { ...contextoFalso().ctx, createOscillator: () => { throw new Error('sin audio'); } };
    expect(() => crearSonido(() => roto, () => (t += 1000)).fallo(1)).not.toThrow();
    // jsdom no tiene AudioContext: el de verdad devuelve null en vez de fallar.
    expect(contextoDelNavegador()).toBeNull();
  });
});
