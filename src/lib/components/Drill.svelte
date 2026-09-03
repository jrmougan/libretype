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
  import { TypingEngine, computeStats, diffAgainstTarget, type CharState, type Stats }
    from '../keyboard/engine';
  import type { MapaDominio } from '../keyboard/dominio';
  import { buildIndex, FINGER_NAMES, type KeyStep, type Layout }
    from '../keyboard/layouts';

  interface Props {
    layout: Layout;
    target: string;
    /** Se llama una sola vez al completar la lección, con las métricas. */
    onDone?: (stats: Stats) => void;
    /**
     * Un intento sobre una tecla concreta. Se deduce del carácter **objetivo**,
     * no del `keydown`: los spikes demostraron que no se puede emparejar un
     * carácter confirmado con la tecla que lo produjo, porque el orden de los
     * eventos cambia según el motor.
     */
    onTecla?: (code: string, acierto: boolean, ms: number) => void;
    /** Dominio por tecla, para ir retirando la ayuda visual. */
    dominios?: MapaDominio;
    /** Métricas en vivo: las pinta la barra superior, no la lección. */
    onStats?: (s: Stats) => void;
    titulo?: string;
    explicacion?: string;
    cobertura?: string;
    /**
     * Con la letra muy grande no cabe todo. El orden de sacrificio es
     * explícito: primero se pliega la explicación, luego el texto se desplaza
     * dentro de su caja, y el teclado nunca baja de legible. Esto lo decide
     * quien conoce la escala elegida, no el componente.
     */
    espacioJusto?: boolean;
  }

  let {
    layout, target, onDone, onTecla, dominios, onStats,
    titulo = '', explicacion = '', cobertura = '', espacioJusto = false,
  }: Props = $props();

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

  // La explicación se lee antes de empezar y se aparta en cuanto se teclea:
  // ocupa sitio que necesita el teclado, pero no puede desaparecer del todo
  // porque hay quien vuelve a leerla.
  /**
   * `null` = decide la aplicación; un booleano = lo ha decidido la persona y su
   * decisión manda. Sin esto, o el botón no servía de nada durante el ejercicio
   * (cada pulsación volvía a cerrarla), o subir la letra al 200% a mitad de
   * lección dejaba la explicación abierta rompiendo la maquetación.
   */
  let decisionManual = $state<boolean | null>(null);
  const explicacionAbierta = $derived(
    decisionManual ?? (!espacioJusto && typed.length === 0),
  );

  $effect(() => { onStats?.(stats); });

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

    // `autocorrect` no está en los tipos HTML de Svelte, pero WebKit sí lo
    // respeta y aquí hace falta: si macOS "corrige" lo que teclea el alumno,
    // corrompe el ejercicio.
    field.setAttribute('autocorrect', 'off');

    engine = new TypingEngine(field, {
      physical: () => { held = new Set(engine!.heldCodes); },
      text: (s) => {
        // Se usa lo confirmado, no lo que se ve: mientras hay un acento a
        // medias el campo muestra `´` pero la posición de la lección no debe
        // avanzar, o la pista pediría la letra siguiente en vez de la vocal
        // que completa la tilde.
        const antes = typed.length;
        typed = s.committed.slice(0, target.length);
        composing = s.composing;
        stamps = [...engine!.stamps];
        if (typed.length > antes) reportarTeclas(antes, typed.length);
      },
    });
    engine.focus();
    return () => engine?.destroy();
  });

  /**
   * Apunta cada carácter recién confirmado como un intento sobre las teclas que
   * había que pulsar. Para una vocal con tilde son dos: el acento y la vocal, y
   * las dos se llevan el mismo resultado. Es una aproximación —no sabemos cuál
   * de las dos falló— pero mide lo que interesa: si esa combinación le sale.
   */
  function reportarTeclas(desde: number, hasta: number): void {
    if (!onTecla) return;
    for (let i = desde; i < hasta; i++) {
      const esperado = target[i];
      if (esperado === undefined) continue;
      const pasos = index.get(esperado);
      if (!pasos) continue;
      const ms = i > 0 && stamps[i] && stamps[i - 1] ? stamps[i] - stamps[i - 1] : 0;
      const acierto = typed[i] === esperado;
      for (const paso of pasos) onTecla(paso.code, acierto, ms);
    }
  }

  // Se avisa una sola vez: sin el guardia, cualquier reactividad posterior
  // (un keyup que llega tarde, por ejemplo) guardaría la sesión otra vez.
  let avisado = $state(false);

  $effect(() => {
    if (finished && !composing && !avisado) {
      avisado = true;
      onDone?.(stats);
    }
  });

  export function restart(): void {
    decisionManual = null;
    engine?.reset();
    typed = '';
    stamps = [];
    avisado = false;
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
    autocapitalize="off"
    spellcheck="false"
    aria-label="Escribe aquí el texto de la lección"
    onblur={() => engine?.focus()}
  ></textarea>

  <header class="cab">
    <h2>{titulo}</h2>
    {#if cobertura}
      <span class="cobertura"
            aria-label="Al terminarla podrás escribir el {cobertura}% de las palabras del español">
        {cobertura}% del español
      </span>
    {/if}
    {#if explicacion}
      <button class="explica" aria-expanded={explicacionAbierta}
              onclick={() => (decisionManual = !explicacionAbierta)}>
        {explicacionAbierta ? 'Ocultar' : '¿Qué se practica?'}
      </button>
    {/if}
  </header>

  {#if explicacionAbierta && explicacion}
    <p class="focus">{explicacion}</p>
  {/if}

  <p class="text" aria-hidden="true">
    {#each [...target] as ch, i (i)}
      <span class="ch {states[i]}">{ch === ' ' ? '\u00a0' : ch}</span>
    {/each}
  </p>

  <!-- Para lector de pantalla: el bucle de práctica es visual y motor, pero la
       pista sí tiene que ser audible, y el progreso legible. -->
  <p class="sr-only" aria-live="polite">{hint}</p>

  <p class="hint">
    {#if nextStep}
      <span class="swatch" style="background: var(--finger-{nextStep.finger})"
            aria-hidden="true"></span>{hint}
    {:else}
      Lección terminada.
    {/if}
  </p>

  <div class="teclado">
    <Keyboard {layout} {held} next={nextStep} {lastWrong} {dominios} />
  </div>
</div>

<style>
  /* El teclado se lleva el espacio que sobre; todo lo demás ocupa lo justo.
     `min-height: 0` es lo que permite que la rejilla encoja de verdad en vez
     de desbordar. */
  .drill {
    display: grid;
    grid-template-rows: auto auto minmax(0, auto) auto minmax(0, 1fr);
    gap: var(--space-2);
    min-height: 0;
  }

  .capture {
    position: absolute;
    width: 1px; height: 1px;
    opacity: 0;
    /* No usamos display:none ni visibility:hidden: el campo tiene que poder
       recibir el foco de verdad para que llegue el texto compuesto. */
  }

  .cab { display: flex; align-items: baseline; gap: var(--space-3); flex-wrap: wrap; }
  .cab h2 { margin: 0; font-size: var(--text-lg); }

  .cobertura {
    font-size: var(--text-sm);
    font-variant-numeric: tabular-nums;
    color: var(--accent);
    border: 1px solid var(--accent);
    border-radius: 999px;
    padding: 1px var(--space-2);
    white-space: nowrap;
  }
  .explica {
    margin-left: auto;
    min-height: 0;
    padding: 2px var(--space-2);
    font-size: var(--text-sm);
  }

  .focus { margin: 0; color: var(--fg-muted); max-width: 78ch; font-size: var(--text-sm); }

  .text {
    font-family: var(--font-drill);
    font-size: var(--text-drill);
    line-height: 1.7;
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    padding: var(--space-3) var(--space-4);
    margin: 0;
    word-break: break-word;
    /* Si el texto es largo o la letra muy grande, se desplaza aquí dentro y no
       arrastra a la página entera. */
    overflow-y: auto;
    max-height: 30vh;
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

  /* El teclado se adapta a la altura disponible, pero con suelo: por debajo de
     esto las letras dejan de leerse y un teclado ilegible es peor que uno al
     que haya que desplazarse. Si ni así cabe, es `.escena` quien se desplaza
     por dentro; nunca se recorta contenido. */
  .teclado {
    min-height: min(34vh, 230px);
    display: grid;
  }
</style>
