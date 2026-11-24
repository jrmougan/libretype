/**
 * Sonido opcional: un toque suave al acertar, otro más grave al fallar y un
 * pequeño acorde al terminar.
 *
 * Todo se sintetiza con WebAudio en el momento: no hay ficheros que cargar ni
 * nada que pedir a la red, así que no cambia la promesa de que la única
 * petición de la aplicación es la de buscar actualizaciones.
 *
 * **Viene desactivado.** Es una decisión, no un descuido: esta aplicación se
 * usa en aulas y bibliotecas con muchos equipos juntos, donde un pitido por
 * pulsación en veinte ordenadores a la vez es ruido para todos; quien usa un
 * lector de pantalla ya tiene la voz ocupando el audio; y un sonido que nadie
 * ha pedido sobresalta justo al público que más fácil se aleja de una app. Se
 * activa en Ajustes con un clic, con su volumen, y se queda guardado.
 *
 * El fallo no es un zumbido de error: es una nota grave y corta. Ninguna voz de
 * la aplicación reprende, y el sonido tampoco.
 *
 * El contexto de audio se inyecta para poder probarlo sin navegador, y se crea
 * tarde, en el primer sonido: los navegadores no dejan arrancarlo antes de que
 * la persona haya tocado algo, y una pulsación ya lo es.
 */

/** Lo poco de `AudioContext` que se usa; así un doble de prueba es pequeño. */
export interface ContextoAudio {
  readonly currentTime: number;
  readonly destination: unknown;
  readonly state?: string;
  resume?: () => Promise<void>;
  createOscillator(): {
    type: string;
    frequency: { setValueAtTime(v: number, t: number): void };
    connect(destino: unknown): unknown;
    start(t?: number): void;
    stop(t?: number): void;
  };
  createGain(): {
    gain: {
      setValueAtTime(v: number, t: number): void;
      linearRampToValueAtTime(v: number, t: number): void;
      exponentialRampToValueAtTime(v: number, t: number): void;
    };
    connect(destino: unknown): unknown;
  };
}

export type CrearContexto = () => ContextoAudio | null;

/** El de verdad, si el entorno lo tiene. En jsdom o un WebView sin audio, nada. */
export const contextoDelNavegador: CrearContexto = () => {
  const g = globalThis as unknown as {
    AudioContext?: new () => ContextoAudio;
    webkitAudioContext?: new () => ContextoAudio;
  };
  const Clase = g.AudioContext ?? g.webkitAudioContext;
  try {
    return Clase ? new Clase() : null;
  } catch {
    return null;
  }
};

interface Nota {
  frecuencia: number;
  /** Segundos desde ahora. */
  inicio: number;
  duracion: number;
  forma: 'sine' | 'triangle';
  /** Volumen máximo antes de aplicar el de la persona. Muy por debajo de 1 a propósito. */
  pico: number;
}

const ACIERTO: Nota[] = [{ frecuencia: 880, inicio: 0, duracion: 0.045, forma: 'sine', pico: 0.05 }];
const FALLO: Nota[] = [{ frecuencia: 196, inicio: 0, duracion: 0.11, forma: 'triangle', pico: 0.09 }];
const FIN: Nota[] = [
  { frecuencia: 523.25, inicio: 0, duracion: 0.14, forma: 'sine', pico: 0.08 },
  { frecuencia: 659.25, inicio: 0.12, duracion: 0.14, forma: 'sine', pico: 0.08 },
  { frecuencia: 783.99, inicio: 0.24, duracion: 0.22, forma: 'sine', pico: 0.08 },
];

/**
 * Una vocal con tilde son dos teclas y se anotan a la vez: sin esto sonaría
 * doble. Dos sonidos del mismo tipo más juntos que esto se funden en uno.
 */
export const MS_ENTRE_SONIDOS = 30;

export interface Sonido {
  acierto(volumen: number): void;
  fallo(volumen: number): void;
  fin(volumen: number): void;
}

export function crearSonido(
  crear: CrearContexto = contextoDelNavegador,
  ahora: () => number = () => performance.now(),
): Sonido {
  let ctx: ContextoAudio | null | undefined;
  const ultimo = new Map<string, number>();

  function tocar(tipo: string, notas: readonly Nota[], volumen: number): void {
    const v = Math.min(1, Math.max(0, Number.isFinite(volumen) ? volumen : 0));
    if (v <= 0) return;
    const t = ahora();
    const previo = ultimo.get(tipo);
    if (previo !== undefined && t - previo < MS_ENTRE_SONIDOS) return;
    ultimo.set(tipo, t);

    if (ctx === undefined) ctx = crear();
    if (!ctx) return;
    // Que el audio falle nunca puede interrumpir la práctica.
    try {
      if (ctx.state === 'suspended') void ctx.resume?.().catch(() => {});
      const base = ctx.currentTime;
      for (const n of notas) {
        const osc = ctx.createOscillator();
        const gan = ctx.createGain();
        const t0 = base + n.inicio;
        osc.type = n.forma;
        osc.frequency.setValueAtTime(n.frecuencia, t0);
        // Entrada y salida en rampa: sin ellas cada nota hace un clic.
        gan.gain.setValueAtTime(0.0001, t0);
        gan.gain.linearRampToValueAtTime(n.pico * v, t0 + 0.008);
        gan.gain.exponentialRampToValueAtTime(0.0001, t0 + n.duracion);
        osc.connect(gan);
        gan.connect(ctx.destination);
        osc.start(t0);
        osc.stop(t0 + n.duracion + 0.02);
      }
    } catch { /* sin sonido, se sigue practicando */ }
  }

  return {
    acierto: (v) => tocar('acierto', ACIERTO, v),
    fallo: (v) => tocar('fallo', FALLO, v),
    fin: (v) => tocar('fin', FIN, v),
  };
}
