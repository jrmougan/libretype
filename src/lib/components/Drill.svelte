<script lang="ts">
  /**
   * Una lección: texto objetivo, captura, teclado y métricas.
   *
   * El campo de captura es un textarea real (fuera de pantalla pero enfocable),
   * no un manejador global de teclas. Así el texto pasa por el método de
   * entrada del sistema, que es quien compone las tildes. Interceptar `keydown`
   * a nivel de documento y reconstruir el texto sería justamente el error que
   * los spikes descartaron.
   */
  import { onMount } from 'svelte';
  import Keyboard from './Keyboard.svelte';
  import { TypingEngine, computeStats, diffAgainstTarget, type CharState }
    from '../keyboard/engine';
  import { buildIndex, FINGER_NAMES, type KeyStep, type Layout }
    from '../keyboard/layouts';

  interface Props {
    layout: Layout;
    target: string;
    onDone?: (wpm: number, accuracy: number) => void;
  }

  let { layout, target, onDone }: Props = $props();

  let field = $state<HTMLTextAreaElement | null>(null);
  let engine: TypingEngine | null = null;

  let typed = $state('');
  let composing = $state(false);
  let held = $state<Set<string>>(new Set());
  let stamps = $state<readonly number[]>([]);

  const index = $derived(buildIndex(layout));
  const states = $derived<CharState[]>(diffAgainstTarget(typed, target));
  const stats = $derived(computeStats(typed, target, stamps));
  const finished = $derived(typed.length >= target.length);

  /** Carácter que toca escribir ahora. */
  const nextChar = $derived(typed.length < target.length ? target[typed.length] : null);

  /**
   * Qué tecla concreta hay que pulsar. Para una letra con tilde son dos
   * pulsaciones (`´` y luego la vocal): si hay una composición a medias, ya
   * vamos por la segunda.
   */
  const nextStep = $derived.by<KeyStep | null>(() => {
    if (!nextChar) return null;
    const steps = index.get(nextChar);
    if (!steps || steps.length === 0) return null;
    if (steps.length === 1) return steps[0];
    return composing ? steps[1] : steps[0];
  });

  const lastWrong = $derived(
    typed.length > 0 && typed[typed.length - 1] !== target[typed.length - 1],
  );

  /** Pista en texto. El color del dedo nunca va solo. */
  const hint = $derived.by(() => {
    if (!nextStep || !nextChar) return '';
    const key = nextStep.char === ' ' ? 'espacio' : nextStep.char;
    const mods = [nextStep.shift && 'Mayús', nextStep.altgr && 'AltGr']
      .filter(Boolean).join(' + ');
    const base = `${mods ? mods + ' + ' : ''}${key} · ${FINGER_NAMES[nextStep.finger]}`;
    if (nextStep.dead) {
      return `${base} — acento: no verás nada hasta pulsar la ${nextChar} después`;
    }
    return base;
  });

  onMount(() => {
    if (!field) return;
    engine = new TypingEngine(field, {
      physical: () => { held = new Set(engine!.heldCodes); },
      text: (s) => {
        // Se usa lo confirmado, no lo que se ve: mientras hay un acento a
        // medias el campo muestra `´` pero la posición de la lección no debe
        // avanzar, o la pista pediría la letra siguiente en vez de la vocal
        // que completa la tilde.
        typed = s.committed.slice(0, target.length);
        composing = s.composing;
        stamps = [...engine!.stamps];
      },
    });
    engine.focus();
    return () => engine?.destroy();
  });

  $effect(() => {
    if (finished && !composing && onDone) onDone(stats.wpm, stats.accuracy);
  });

  export function restart(): void {
    engine?.reset();
    typed = '';
    stamps = [];
    engine?.focus();
  }
</script>

<div class="drill">
  <!-- Campo real de captura. Fuera de pantalla pero enfocable: el texto tiene
       que pasar por el método de entrada del sistema para que las tildes se
       compongan como en cualquier otra aplicación. -->
  <textarea
    bind:this={field}
    class="capture"
    autocomplete="off"
    autocorrect="off"
    autocapitalize="off"
    spellcheck="false"
    aria-label="Escribe aquí el texto de la lección"
    onblur={() => engine?.focus()}
  ></textarea>

  <p class="text" aria-hidden="true">
    {#each [...target] as ch, i (i)}
      <span class="ch {states[i]}">{ch === ' ' ? ' ' : ch}</span>
    {/each}
  </p>

  <!-- Para lector de pantalla: el bucle de práctica es visual y motor, pero la
       pista sí tiene que ser audible, y el progreso legible. -->
  <p class="sr-only" aria-live="polite" aria-atomic="true">{hint}</p>

  <p class="hint">
    {#if nextStep}
      <span class="swatch" style="background: var(--finger-{nextStep.finger})"
            aria-hidden="true"></span>{hint}
    {:else}
      Lección terminada.
    {/if}
  </p>

  <Keyboard {layout} {held} next={nextStep} {lastWrong} />

  <dl class="stats">
    <div><dt>Velocidad</dt><dd>{stats.wpm} <small>ppm</small></dd></div>
    <div><dt>Precisión</dt><dd>{stats.accuracy}<small>%</small></dd></div>
    <div><dt>Progreso</dt><dd>{typed.length}<small>/{target.length}</small></dd></div>
  </dl>
</div>

<style>
  .drill { display: grid; gap: var(--space-4); }

  .capture {
    position: absolute;
    width: 1px; height: 1px;
    opacity: 0;
    /* No usamos display:none ni visibility:hidden: el campo tiene que poder
       recibir el foco de verdad para que llegue el texto compuesto. */
  }

  .text {
    font-family: var(--font-drill);
    font-size: var(--text-drill);
    line-height: 1.8;
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    padding: var(--space-4);
    margin: 0;
    word-break: break-word;
  }

  .ch { padding: 1px 0; border-bottom: 3px solid transparent; }
  .ch.pending { color: var(--fg-muted); }
  .ch.correct { color: var(--ok); border-bottom-color: var(--ok); }

  /* El error no se marca solo con color: fondo, subrayado y borde. */
  .ch.wrong {
    color: var(--error);
    background: var(--error-bg);
    border-bottom: 3px double var(--error);
    border-radius: 2px;
  }

  /* El cursor tampoco: caja, fondo y parpadeo suave. */
  .ch.current {
    background: var(--accent);
    color: var(--accent-fg);
    border-radius: 3px;
    animation: pulse 1.1s var(--ease) infinite;
  }

  @keyframes pulse { 50% { opacity: 0.62; } }
  @media (prefers-reduced-motion: reduce) {
    .ch.current { animation: none; outline: 2px solid var(--fg); }
  }

  .hint {
    display: flex; align-items: center; gap: var(--space-2);
    margin: 0; min-height: 1.6em;
    font-size: var(--text-lg);
    color: var(--fg-muted);
  }
  .swatch {
    width: 1em; height: 1em; border-radius: 3px;
    border: 1px solid var(--border-strong);
    flex: none;
  }

  .stats {
    display: flex; gap: var(--space-6); margin: 0;
    padding: var(--space-3) var(--space-4);
    background: var(--surface); border: 1px solid var(--border);
    border-radius: var(--radius);
  }
  .stats div { display: flex; flex-direction: column; }
  .stats dt { font-size: var(--text-sm); color: var(--fg-muted); }
  .stats dd { margin: 0; font-size: var(--text-xl); font-variant-numeric: tabular-nums; }
  .stats small { font-size: var(--text-sm); color: var(--fg-muted); }
</style>
