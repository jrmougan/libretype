<script lang="ts">
  import Drill from './lib/components/Drill.svelte';
  import { LAYOUTS } from './lib/keyboard/layouts';
  import { LESSONS } from './lib/lessons';

  let layout = $state(LAYOUTS[0]);
  let lessonIx = $state(0);
  let drill = $state<ReturnType<typeof Drill> | null>(null);
  let result = $state<{ wpm: number; accuracy: number } | null>(null);

  // Ajustes de accesibilidad. Se aplican a <html> para que los tokens los vean.
  let scale = $state(1);
  let theme = $state<'auto' | 'light' | 'dark'>('auto');
  let motion = $state<'auto' | 'reduced'>('auto');
  let font = $state<'default' | 'dyslexic'>('default');
  let settingsOpen = $state(false);

  const lesson = $derived(LESSONS[lessonIx]);

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
      <button class="lesson" aria-current={i === lessonIx ? 'true' : undefined}
              onclick={() => pick(i)}>{l.title}</button>
    {/each}
  </nav>

  <main>
    <h2>{lesson.title}</h2>
    <p class="focus">{lesson.focus}</p>

    {#key lesson.id}
      <Drill
        bind:this={drill}
        {layout}
        target={lesson.text}
        onDone={(wpm, accuracy) => (result = { wpm, accuracy })}
      />
    {/key}

    {#if result}
      <div class="result" role="status">
        <strong>Lección terminada.</strong>
        {result.wpm} palabras por minuto, {result.accuracy}% de precisión.
        <button onclick={again}>Repetir</button>
        {#if lessonIx < LESSONS.length - 1}
          <button onclick={() => pick(lessonIx + 1)}>Siguiente lección</button>
        {/if}
      </div>
    {/if}
  </main>
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
</style>
