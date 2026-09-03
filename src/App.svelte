<script lang="ts">
  import { onMount } from 'svelte';
  import Drill from './lib/components/Drill.svelte';
  import Progreso from './lib/components/Progreso.svelte';
  import { LAYOUTS } from './lib/keyboard/layouts';
  import { LESSONS } from './lib/lessons';
  import type { Stats } from './lib/keyboard/engine';
  import { abrirAlmacen, type Almacen } from './lib/storage/almacen';
  import { esRecord, resumirLecciones, type Sesion } from './lib/storage/progreso';

  let layout = $state(LAYOUTS[0]);
  let lessonIx = $state(0);
  let drill = $state<ReturnType<typeof Drill> | null>(null);
  let result = $state<{ stats: Stats; record: boolean } | null>(null);

  let almacen: Almacen | null = null;
  let sesiones = $state<Sesion[]>([]);
  let tipoAlmacen = $state<'sqlite' | 'local'>('local');
  let verProgreso = $state(false);

  const porLeccion = $derived(resumirLecciones(sesiones));

  // Ajustes de accesibilidad. Se aplican a <html> para que los tokens los vean.
  let scale = $state(1);
  let theme = $state<'auto' | 'light' | 'dark'>('auto');
  let motion = $state<'auto' | 'reduced'>('auto');
  let font = $state<'default' | 'dyslexic'>('default');
  let settingsOpen = $state(false);

  const lesson = $derived(LESSONS[lessonIx]);

  onMount(async () => {
    almacen = await abrirAlmacen();
    tipoAlmacen = almacen.tipo;
    sesiones = await almacen.leerTodas();
  });

  async function terminada(stats: Stats): Promise<void> {
    const sesion: Sesion = {
      leccion: lesson.id,
      ppm: stats.wpm,
      pctAcierto: stats.accuracy,
      aciertos: stats.correct,
      escritos: stats.typed,
      ms: Math.round(stats.elapsedMs),
      terminadaEn: new Date().toISOString(),
    };

    // Se calcula antes de guardar: después, la propia sesión ya sería la marca.
    const record = esRecord(porLeccion.get(lesson.id), sesion);
    result = { stats, record };

    // Que falle el guardado no puede tumbar la práctica.
    try {
      await almacen?.guardar(sesion);
      sesiones = [...sesiones, sesion];
    } catch (err) {
      console.warn('[libretype] no se pudo guardar la sesión:', err);
    }
  }

  async function borrarProgreso(): Promise<void> {
    await almacen?.borrarTodo();
    sesiones = [];
  }

  $effect(() => {
    const el = document.documentElement;
    el.style.setProperty('--ui-scale', String(scale));
    if (theme === 'auto') el.removeAttribute('data-theme');
    else el.setAttribute('data-theme', theme);
    if (motion === 'auto') el.removeAttribute('data-motion');
    else el.setAttribute('data-motion', 'reduced');
    if (font === 'default') el.removeAttribute('data-font');
    else el.setAttribute('data-font', 'dyslexic');
  });

  function pick(i: number): void {
    lessonIx = i;
    result = null;
    drill?.restart();
  }

  function again(): void {
    result = null;
    drill?.restart();
  }
</script>

<div class="app">
  <header>
    <h1>LibreType</h1>
    <button aria-expanded={settingsOpen} onclick={() => (settingsOpen = !settingsOpen)}>
      Ajustes
    </button>
  </header>

  {#if settingsOpen}
    <section class="settings" aria-label="Ajustes de accesibilidad">
      <div class="field">
        <label for="scale">Tamaño del texto: {Math.round(scale * 100)}%</label>
        <input id="scale" type="range" min="1" max="2" step="0.1" bind:value={scale} />
      </div>

      <div class="field">
        <span id="theme-l">Tema</span>
        <div class="group" role="group" aria-labelledby="theme-l">
          {#each [['auto', 'Sistema'], ['light', 'Claro'], ['dark', 'Oscuro']] as [v, l] (v)}
            <button aria-pressed={theme === v} onclick={() => (theme = v as typeof theme)}>
              {l}
            </button>
          {/each}
        </div>
      </div>

      <div class="field">
        <span id="motion-l">Animaciones</span>
        <div class="group" role="group" aria-labelledby="motion-l">
          <button aria-pressed={motion === 'auto'} onclick={() => (motion = 'auto')}>
            Normales
          </button>
          <button aria-pressed={motion === 'reduced'} onclick={() => (motion = 'reduced')}>
            Reducidas
          </button>
        </div>
      </div>

      <div class="field">
        <span id="font-l">Tipografía</span>
        <div class="group" role="group" aria-labelledby="font-l">
          <button aria-pressed={font === 'default'} onclick={() => (font = 'default')}>
            Normal
          </button>
          <button aria-pressed={font === 'dyslexic'} onclick={() => (font = 'dyslexic')}>
            Para dislexia
          </button>
        </div>
      </div>

      <div class="field">
        <label for="layout">Distribución del teclado</label>
        <select id="layout" bind:value={layout}>
          {#each LAYOUTS as l (l.id)}<option value={l}>{l.name}</option>{/each}
        </select>
        <p class="note">
          No la detectamos automáticamente: la API que lo permite solo existe en
          Chromium, así que en macOS y Linux no sería fiable.
        </p>
      </div>
    </section>
  {/if}

  <nav aria-label="Lecciones">
    {#each LESSONS as l, i (l.id)}
      {@const marca = porLeccion.get(l.id)}
      <button
        class="lesson"
        aria-current={i === lessonIx ? 'true' : undefined}
        onclick={() => pick(i)}
      >
        {l.title}
        {#if marca && marca.mejorPpm > 0}
          <span class="marca" aria-label="tu marca: {marca.mejorPpm} palabras por minuto">
            {marca.mejorPpm} ppm
          </span>
        {:else if marca}
          <span class="marca" aria-label="practicada, aún sin marca limpia">·</span>
        {/if}
      </button>
    {/each}
  </nav>

  <main>
    <h2>{lesson.title}</h2>
    <p class="focus">{lesson.focus}</p>

    {#key lesson.id}
      <Drill bind:this={drill} {layout} target={lesson.text} onDone={terminada} />
    {/key}

    {#if result}
      <div class="result" class:record={result.record} role="status">
        <strong>
          {#if result.record}★ ¡Tu mejor marca en esta lección!{:else}Lección terminada.{/if}
        </strong>
        {result.stats.wpm} palabras por minuto, {result.stats.accuracy}% de precisión.
        <button onclick={again}>Repetir</button>
        {#if lessonIx < LESSONS.length - 1}
          <button onclick={() => pick(lessonIx + 1)}>Siguiente lección</button>
        {/if}
      </div>
    {/if}
  </main>

  <button class="ver-progreso" aria-expanded={verProgreso}
          onclick={() => (verProgreso = !verProgreso)}>
    {verProgreso ? 'Ocultar progreso' : 'Ver progreso'}
  </button>

  {#if verProgreso}
    <Progreso {sesiones} lecciones={LESSONS} {tipoAlmacen} onBorrar={borrarProgreso} />
  {/if}
</div>

<style>
  .app { max-width: 1100px; margin: 0 auto; padding: var(--space-4); display: grid; gap: var(--space-4); }
  header { display: flex; align-items: center; justify-content: space-between; gap: var(--space-4); }
  h1 { font-size: var(--text-xl); margin: 0; }
  h2 { font-size: var(--text-lg); margin: 0 0 var(--space-1); }

  .settings {
    display: grid; gap: var(--space-4);
    grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
    background: var(--surface); border: 1px solid var(--border);
    border-radius: var(--radius); padding: var(--space-4);
  }
  .field { display: grid; gap: var(--space-2); align-content: start; }
  .group { display: flex; gap: var(--space-2); flex-wrap: wrap; }
  .group button[aria-pressed='true'] {
    background: var(--accent); color: var(--accent-fg); border-color: var(--accent);
  }
  .note { margin: 0; font-size: var(--text-sm); color: var(--fg-muted); }

  input[type='range'] { min-height: var(--target-min); }
  select { font: inherit; min-height: var(--target-min); padding: var(--space-2);
           border: 1px solid var(--border-strong); border-radius: var(--radius);
           background: var(--surface); color: var(--fg); }

  nav { display: flex; gap: var(--space-2); flex-wrap: wrap; }
  .lesson[aria-current='true'] {
    background: var(--accent); color: var(--accent-fg); border-color: var(--accent);
  }

  .focus { margin: 0 0 var(--space-4); color: var(--fg-muted); }

  .result {
    display: flex; align-items: center; gap: var(--space-3); flex-wrap: wrap;
    background: var(--ok-bg); border: 2px solid var(--ok);
    border-radius: var(--radius); padding: var(--space-3) var(--space-4);
  }
  /* El récord se distingue por la estrella y el texto, no solo por el borde. */
  .result.record { border-width: 3px; border-style: double; }

  .marca {
    display: inline-block;
    margin-left: var(--space-2);
    padding: 0 var(--space-2);
    border-radius: 999px;
    background: var(--surface-sunken);
    border: 1px solid var(--border);
    font-size: var(--text-xs);
    font-variant-numeric: tabular-nums;
  }
  .lesson[aria-current='true'] .marca {
    background: var(--accent-fg); color: var(--accent); border-color: var(--accent-fg);
  }

  .ver-progreso { justify-self: start; }
</style>
