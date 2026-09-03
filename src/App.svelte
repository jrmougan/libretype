<script lang="ts">
  import { onMount } from 'svelte';
  import Drill from './lib/components/Drill.svelte';
  import LeccionCero from './lib/components/LeccionCero.svelte';
  import Progreso from './lib/components/Progreso.svelte';
  import SelectorTono from './lib/components/SelectorTono.svelte';
  import { LAYOUTS } from './lib/keyboard/layouts';
  import { LESSONS } from './lib/lessons';
  import type { Stats } from './lib/keyboard/engine';
  import {
    contarDominadas, mapaDeDominio, registrar, type EstadoTecla,
  } from './lib/keyboard/dominio';
  import { abrirAlmacen, type Almacen } from './lib/storage/almacen';
  import { esRecord, resumirLecciones, type Sesion } from './lib/storage/progreso';
  import {
    aplicar, cargar, guardar as guardarPrefs, POR_DEFECTO,
    type Preferencias, type Tono,
  } from './lib/preferencias';
  import { PRECISION_ALTA, vozDe } from './lib/voz';

  /**
   * Preferencias de interfaz. Se cargan de disco antes del primer pintado para
   * que quien necesita el texto al 200% no vea un parpadeo al 100%.
   */
  let prefs = $state<Preferencias>(
    typeof localStorage === 'undefined' ? { ...POR_DEFECTO } : cargar(),
  );
  let settingsOpen = $state(false);

  let layout = $state(LAYOUTS[0]);
  let lessonIx = $state(0);
  let drill = $state<ReturnType<typeof Drill> | null>(null);
  let result = $state<{ stats: Stats; record: boolean } | null>(null);

  let almacen: Almacen | null = null;
  let sesiones = $state<Sesion[]>([]);
  let tipoAlmacen = $state<'sqlite' | 'local'>('local');
  let verProgreso = $state(false);
  /** 'tono' solo aparece la primera vez; 'cero' es la colocación de manos. */
  let vista = $state<'tono' | 'cero' | 'leccion'>('leccion');

  /** Intentos acumulados por tecla, que deciden cuánta ayuda visual retirar. */
  let teclas = $state<Map<string, EstadoTecla>>(new Map());

  const dominios = $derived(
    prefs.ayudaTeclado === 'siempre' ? new Map<string, number>() : mapaDeDominio(teclas),
  );
  const aprendidas = $derived(contarDominadas(mapaDeDominio(teclas)));

  const porLeccion = $derived(resumirLecciones(sesiones));

  const voz = $derived(vozDe(prefs.tono));
  const lesson = $derived(LESSONS[lessonIx]);

  /** En español el separador decimal es la coma, no el punto. */
  const pct = (n: number) => n.toLocaleString('es-ES', { maximumFractionDigits: 1 });

  onMount(async () => {
    almacen = await abrirAlmacen();
    tipoAlmacen = almacen.tipo;
    sesiones = await almacen.leerTodas();
    teclas = await almacen.leerTeclas();

    // Primera vez: primero cómo quiere la aplicación, luego dónde van las
    // manos. Nunca soltarle un ejercicio a alguien que no ha tecleado nunca.
    if (prefs.tono === null) vista = 'tono';
    else if (sesiones.length === 0) vista = 'cero';
  });

  function elegirTono(tono: Tono): void {
    prefs = { ...prefs, tono };
    vista = sesiones.length === 0 ? 'cero' : 'leccion';
  }

  function anotarTecla(code: string, acierto: boolean, ms: number): void {
    // Se muta un mapa nuevo para que Svelte lo vea cambiar.
    const m = new Map(teclas);
    m.set(code, registrar(m.get(code), acierto, ms));
    teclas = m;
  }

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
    // El dominio por tecla se persiste al terminar la lección, no en cada
    // pulsación: escribir en la base de datos sesenta veces por minuto no
    // aporta nada y se nota.
    try {
      await almacen?.guardar(sesion);
      sesiones = [...sesiones, sesion];
      await almacen?.guardarTeclas(teclas);
    } catch (err) {
      console.warn('[libretype] no se pudo guardar la sesión:', err);
    }
  }

  async function borrarProgreso(): Promise<void> {
    await almacen?.borrarTodo();
    sesiones = [];
    teclas = new Map();
  }

  // Aplicar y guardar van juntos: un ajuste que no sobrevive a cerrar la app
  // deja fuera a quien depende de él.
  $effect(() => {
    aplicar(prefs, document.documentElement);
    guardarPrefs(prefs);
  });

  function pick(i: number): void {
    lessonIx = i;
    result = null;
    vista = 'leccion';
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
        <label for="scale">Tamaño del texto: {Math.round(prefs.escala * 100)}%</label>
        <input id="scale" type="range" min="1" max="2" step="0.1"
               value={prefs.escala}
               oninput={(e) => (prefs = { ...prefs, escala: +e.currentTarget.value })} />
      </div>

      <div class="field">
        <span id="theme-l">Tema</span>
        <div class="group" role="group" aria-labelledby="theme-l">
          {#each [['auto', 'Sistema'], ['claro', 'Claro'], ['oscuro', 'Oscuro']] as [v, l] (v)}
            <button aria-pressed={prefs.tema === v}
                    onclick={() => (prefs = { ...prefs, tema: v as Preferencias['tema'] })}>
              {l}
            </button>
          {/each}
        </div>
      </div>

      <div class="field">
        <span id="tono-l">Cómo te habla</span>
        <div class="group" role="group" aria-labelledby="tono-l">
          <button aria-pressed={prefs.tono === 'juego'}
                  onclick={() => (prefs = { ...prefs, tono: 'juego' })}>
            Con celebración
          </button>
          <button aria-pressed={prefs.tono !== 'juego'}
                  onclick={() => (prefs = { ...prefs, tono: 'sobrio' })}>
            Tranquila
          </button>
        </div>
        <p class="note">Cambia los colores y los mensajes. No cambia el tamaño ni las lecciones.</p>
      </div>

      <div class="field">
        <span id="motion-l">Animaciones</span>
        <div class="group" role="group" aria-labelledby="motion-l">
          <button aria-pressed={prefs.movimiento === 'auto'}
                  onclick={() => (prefs = { ...prefs, movimiento: 'auto' })}>
            Normales
          </button>
          <button aria-pressed={prefs.movimiento === 'reducido'}
                  onclick={() => (prefs = { ...prefs, movimiento: 'reducido' })}>
            Reducidas
          </button>
        </div>
      </div>

      <div class="field">
        <span id="font-l">Tipografía</span>
        <div class="group" role="group" aria-labelledby="font-l">
          <button aria-pressed={prefs.fuente === 'normal'}
                  onclick={() => (prefs = { ...prefs, fuente: 'normal' })}>
            Normal
          </button>
          <button aria-pressed={prefs.fuente === 'dislexia'}
                  onclick={() => (prefs = { ...prefs, fuente: 'dislexia' })}>
            Para dislexia
          </button>
        </div>
      </div>

      <div class="field">
        <span id="ayuda-l">Letras del teclado en pantalla</span>
        <div class="group" role="group" aria-labelledby="ayuda-l">
          <button aria-pressed={prefs.ayudaTeclado === 'auto'}
                  onclick={() => (prefs = { ...prefs, ayudaTeclado: 'auto' })}>
            Se van quitando
          </button>
          <button aria-pressed={prefs.ayudaTeclado === 'siempre'}
                  onclick={() => (prefs = { ...prefs, ayudaTeclado: 'siempre' })}>
            Siempre visibles
          </button>
        </div>
        <p class="note">
          Las teclas que ya dominas dejan de mostrar su letra, para que dejes de
          mirar el teclado. {#if aprendidas > 0}Llevas {aprendidas}
          {aprendidas === 1 ? 'tecla aprendida' : 'teclas aprendidas'}.{/if}
        </p>
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

  {#if vista !== 'tono'}
  <nav aria-label="Lecciones">
    <button
      class="lesson cero"
      aria-current={vista === 'cero' ? 'true' : undefined}
      onclick={() => (vista = 'cero')}
    >
      Antes de empezar
    </button>

    {#each LESSONS as l, i (l.id)}
      {@const marca = porLeccion.get(l.id)}
      <button
        class="lesson"
        aria-current={vista === 'leccion' && i === lessonIx ? 'true' : undefined}
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
  {/if}

  <main>
    {#if vista === 'tono'}
      <SelectorTono onElegir={elegirTono} />
    {:else if vista === 'cero'}
      <LeccionCero {layout} onTerminar={() => pick(0)} />
    {:else}
      <div class="leccion-cab">
        <h2>{lesson.title}</h2>
        <span class="cobertura"
              aria-label="Al terminarla podrás escribir el {pct(lesson.cobertura)}% de las palabras del español">
          {pct(lesson.cobertura)}% del español
        </span>
      </div>
      <p class="focus">{lesson.focus}</p>

      {#key lesson.id}
        <Drill
          bind:this={drill}
          {layout}
          target={lesson.text}
          {dominios}
          onDone={terminada}
          onTecla={anotarTecla}
        />
      {/key}

      {#if result}
        <div class="result" class:record={result.record}
             class:celebra={result.record && prefs.tono === 'juego'} role="status">
          <strong>
            {#if result.record}★ {voz.record}{:else}{voz.terminada}{/if}
          </strong>
          <span>
            {result.stats.wpm} palabras por minuto, {result.stats.accuracy}% de precisión.
          </span>
          <span class="animo">
            {result.stats.accuracy >= PRECISION_ALTA ? voz.animoAlto : voz.animoBajo}
          </span>
          <button onclick={again}>{voz.repetir}</button>
          {#if lessonIx < LESSONS.length - 1}
            <button onclick={() => pick(lessonIx + 1)}>{voz.siguiente}</button>
          {/if}
        </div>
      {/if}
    {/if}
  </main>

  {#if vista !== 'tono'}
  <button class="ver-progreso" aria-expanded={verProgreso}
          onclick={() => (verProgreso = !verProgreso)}>
    {verProgreso ? 'Ocultar progreso' : 'Ver progreso'}
  </button>

  {#if verProgreso}
    <Progreso {sesiones} lecciones={LESSONS} {tipoAlmacen} onBorrar={borrarProgreso} />
  {/if}
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
  /* La lección cero no es un ejercicio más: se separa del resto. */
  .lesson.cero { border-style: dashed; margin-right: var(--space-2); }

  .leccion-cab {
    display: flex; align-items: baseline; gap: var(--space-3);
    flex-wrap: wrap; margin-bottom: var(--space-1);
  }
  .leccion-cab h2 { margin: 0; }

  /* Cuánto español desbloquea la lección. Sale de contar frecuencias sobre un
     corpus real, no es un número decorativo. */
  .cobertura {
    font-size: var(--text-sm);
    font-variant-numeric: tabular-nums;
    color: var(--accent);
    border: 1px solid var(--accent);
    border-radius: 999px;
    padding: 1px var(--space-2);
    white-space: nowrap;
  }

  .focus { margin: 0 0 var(--space-4); color: var(--fg-muted); max-width: 70ch; }

  .result {
    display: flex; align-items: center; gap: var(--space-3); flex-wrap: wrap;
    background: var(--ok-bg); border: 2px solid var(--ok);
    border-radius: var(--radius); padding: var(--space-3) var(--space-4);
  }
  /* El récord se distingue por la estrella y el texto, no solo por el borde. */
  .result.record { border-width: 3px; border-style: double; }
  .result .animo { color: var(--fg-muted); }

  /* La celebración solo existe en el tono de juego, y se apaga sola si el
     sistema o el usuario piden menos movimiento. */
  .result.celebra {
    border-color: var(--celebracion);
    animation: celebrar var(--motion-slow) var(--ease) 2 alternate;
  }
  @keyframes celebrar {
    from { transform: scale(1); }
    to { transform: scale(1.015); }
  }
  @media (prefers-reduced-motion: reduce) {
    .result.celebra { animation: none; }
  }
  :global(:root[data-motion='reducido']) .result.celebra { animation: none; }

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
