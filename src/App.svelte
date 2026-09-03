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
  /** Métricas en vivo, que ahora viven en la barra de arriba. */
  let ultimasStats = $state<Stats>(
    { wpm: 0, accuracy: 100, correct: 0, typed: 0, elapsedMs: 0 },
  );

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
    settingsOpen = false;
    verProgreso = false;
    ultimasStats = { wpm: 0, accuracy: 100, correct: 0, typed: 0, elapsedMs: 0 };
    drill?.restart();
  }

  function again(): void {
    result = null;
    drill?.restart();
  }
</script>

<!--
  Todo cabe en la ventana sin scroll, y no es una preferencia estética: el
  alumno necesita ver a la vez el texto, la pista y el teclado. Si hay que
  desplazarse, se rompe justo la relación que enseña a no mirarse las manos.

  De ahí la estructura: barra compacta arriba, y el teclado ocupando lo que
  sobre. Los ajustes y el progreso son paneles superpuestos, no bloques que
  empujen el contenido hacia abajo.
-->
<div class="app">
  <header class="barra">
    <h1>LibreType</h1>

    <label class="selector">
      <span class="sr-only">Lección</span>
      <select
        value={vista === 'leccion' ? String(lessonIx) : 'cero'}
        onchange={(e) => {
          const v = e.currentTarget.value;
          if (v === 'cero') vista = 'cero';
          else pick(+v);
        }}
      >
        <option value="cero">Antes de empezar · dónde van las manos</option>
        {#each LESSONS as l, i (l.id)}
          {@const marca = porLeccion.get(l.id)}
          <option value={String(i)}>
            {i + 1}. {l.title}{marca && marca.mejorPpm > 0 ? ` · ${marca.mejorPpm} ppm` : ''}
          </option>
        {/each}
      </select>
    </label>

    {#if vista === 'leccion'}
      <dl class="metricas">
        <div><dt>Velocidad</dt><dd>{ultimasStats.wpm}<small>ppm</small></dd></div>
        <div><dt>Precisión</dt><dd>{ultimasStats.accuracy}<small>%</small></dd></div>
        <div><dt>Avance</dt><dd>{ultimasStats.typed}<small>/{lesson.text.length}</small></dd></div>
      </dl>
    {/if}

    <div class="acciones">
      <button aria-expanded={verProgreso} onclick={() => { verProgreso = !verProgreso; settingsOpen = false; }}>
        Progreso
      </button>
      <button aria-expanded={settingsOpen} onclick={() => { settingsOpen = !settingsOpen; verProgreso = false; }}>
        Ajustes
      </button>
    </div>
  </header>

  <main class="escena">
    {#if vista === 'tono'}
      <div class="centrado"><SelectorTono onElegir={elegirTono} /></div>
    {:else if vista === 'cero'}
      <LeccionCero {layout} onTerminar={() => pick(0)} />
    {:else}
      {#key lesson.id}
        <Drill
          bind:this={drill}
          {layout}
          target={lesson.text}
          titulo={lesson.title}
          explicacion={lesson.focus}
          cobertura={pct(lesson.cobertura)}
          espacioJusto={prefs.escala >= 1.4}
          {dominios}
          onDone={terminada}
          onTecla={anotarTecla}
          onStats={(s) => (ultimasStats = s)}
        />
      {/key}
    {/if}
  </main>

  <!-- Superpuesto: aparecer no puede mover el teclado de sitio. -->
  {#if result}
    <div class="capa" role="presentation">
      <div class="resultado" class:record={result.record}
           class:celebra={result.record && prefs.tono === 'juego'} role="status">
        <strong>
          {#if result.record}★ {voz.record}{:else}{voz.terminada}{/if}
        </strong>
        <span>{result.stats.wpm} palabras por minuto, {result.stats.accuracy}% de precisión.</span>
        <span class="animo">
          {result.stats.accuracy >= PRECISION_ALTA ? voz.animoAlto : voz.animoBajo}
        </span>
        <div class="botones">
          <button onclick={again}>{voz.repetir}</button>
          {#if lessonIx < LESSONS.length - 1}
            <button class="primario" onclick={() => pick(lessonIx + 1)}>{voz.siguiente}</button>
          {/if}
        </div>
      </div>
    </div>
  {/if}

  {#if settingsOpen || verProgreso}
    <aside class="panel" aria-label={settingsOpen ? 'Ajustes' : 'Progreso'}>
      <div class="panel-cab">
        <h2>{settingsOpen ? 'Ajustes' : voz.progreso}</h2>
        <button onclick={() => { settingsOpen = false; verProgreso = false; }}>Cerrar</button>
      </div>

      <div class="panel-cuerpo">
        {#if settingsOpen}
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
                      onclick={() => (prefs = { ...prefs, movimiento: 'auto' })}>Normales</button>
              <button aria-pressed={prefs.movimiento === 'reducido'}
                      onclick={() => (prefs = { ...prefs, movimiento: 'reducido' })}>Reducidas</button>
            </div>
          </div>

          <div class="field">
            <span id="font-l">Tipografía</span>
            <div class="group" role="group" aria-labelledby="font-l">
              <button aria-pressed={prefs.fuente === 'normal'}
                      onclick={() => (prefs = { ...prefs, fuente: 'normal' })}>Normal</button>
              <button aria-pressed={prefs.fuente === 'dislexia'}
                      onclick={() => (prefs = { ...prefs, fuente: 'dislexia' })}>Para dislexia</button>
            </div>
          </div>

          <div class="field">
            <span id="ayuda-l">Letras del teclado en pantalla</span>
            <div class="group" role="group" aria-labelledby="ayuda-l">
              <button aria-pressed={prefs.ayudaTeclado === 'auto'}
                      onclick={() => (prefs = { ...prefs, ayudaTeclado: 'auto' })}>Se van quitando</button>
              <button aria-pressed={prefs.ayudaTeclado === 'siempre'}
                      onclick={() => (prefs = { ...prefs, ayudaTeclado: 'siempre' })}>Siempre visibles</button>
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
        {:else}
          <Progreso {sesiones} lecciones={LESSONS} {tipoAlmacen} onBorrar={borrarProgreso} />
        {/if}
      </div>
    </aside>
  {/if}
</div>

<style>
  /* Altura fija de ventana: nada de scroll de página. Lo que no cabe se
     encoge (el teclado) o se desplaza dentro de su propia caja (el texto). */
  .app {
    height: 100dvh;
    display: grid;
    grid-template-rows: auto 1fr;
    overflow: hidden;
    position: relative;
  }

  .barra {
    display: flex;
    align-items: center;
    gap: var(--space-3);
    flex-wrap: wrap;
    padding: var(--space-2) var(--space-4);
    border-bottom: 1px solid var(--border);
    background: var(--surface);
  }
  h1 {
    margin: 0;
    font-size: var(--text-lg);
    white-space: nowrap;
  }

  /* El selector sustituye a los diez botones que ocupaban dos filas. */
  .selector { flex: 1 1 260px; min-width: 0; }
  .selector select, #layout {
    width: 100%;
    font: inherit;
    min-height: var(--target-min);
    padding: 0 var(--space-3);
    border: 1px solid var(--border-strong);
    border-radius: var(--radius);
    background: var(--surface);
    color: var(--fg);
  }

  .metricas { display: flex; gap: var(--space-4); margin: 0; }
  .metricas div { display: flex; flex-direction: column; }
  .metricas dt { font-size: var(--text-xs); color: var(--fg-muted); line-height: 1.2; }
  .metricas dd {
    margin: 0; font-size: var(--text-lg); line-height: 1.1;
    font-variant-numeric: tabular-nums;
  }
  .metricas small { font-size: var(--text-xs); color: var(--fg-muted); }

  .acciones { display: flex; gap: var(--space-2); margin-left: auto; }
  .acciones button { min-height: var(--target-min); }

  .escena {
    min-height: 0;
    display: grid;
    padding: var(--space-3) var(--space-4);
    /* Último recurso. Con la letra al 200% en una ventana baja puede no caber
       todo por mucho que se encojan las piezas; entonces esta zona se desplaza.
       Desplazarse es malo; recortar contenido y que nadie lo encuentre es peor. */
    overflow-y: auto;
  }
  .centrado { align-self: center; justify-self: center; max-width: 72ch; }

  /* --- Superpuestos ------------------------------------------------------ */
  .capa {
    position: absolute; inset: 0;
    display: grid; place-items: center;
    background: color-mix(in srgb, var(--bg) 78%, transparent);
    padding: var(--space-4);
  }
  .resultado {
    display: grid; gap: var(--space-2);
    max-width: 46ch;
    padding: var(--space-6);
    background: var(--surface);
    border: 2px solid var(--ok);
    border-radius: var(--radius);
    box-shadow: 0 12px 40px rgb(0 0 0 / 0.28);
  }
  .resultado strong { font-size: var(--text-lg); }
  .resultado .animo { color: var(--fg-muted); }
  .botones { display: flex; gap: var(--space-2); flex-wrap: wrap; margin-top: var(--space-2); }
  .primario { background: var(--accent); color: var(--accent-fg); border-color: var(--accent); }

  /* El récord se distingue por la estrella y el texto, no solo por el borde. */
  .resultado.record { border-width: 3px; border-style: double; }
  .resultado.celebra {
    border-color: var(--celebracion);
    animation: celebrar var(--motion-slow) var(--ease) 2 alternate;
  }
  @keyframes celebrar { from { transform: scale(1); } to { transform: scale(1.015); } }
  @media (prefers-reduced-motion: reduce) { .resultado.celebra { animation: none; } }

  .panel {
    position: absolute; top: 0; right: 0; bottom: 0;
    width: min(30rem, 100%);
    display: grid;
    grid-template-rows: auto 1fr;
    background: var(--surface);
    border-left: 1px solid var(--border);
    box-shadow: -12px 0 40px rgb(0 0 0 / 0.22);
  }
  .panel-cab {
    display: flex; align-items: center; justify-content: space-between;
    gap: var(--space-3);
    padding: var(--space-3) var(--space-4);
    border-bottom: 1px solid var(--border);
  }
  .panel-cab h2 { margin: 0; font-size: var(--text-lg); }
  /* El panel sí se desplaza por dentro: es lo que evita que lo haga la página. */
  .panel-cuerpo {
    overflow-y: auto;
    padding: var(--space-4);
    display: grid;
    gap: var(--space-4);
    align-content: start;
  }

  .field { display: grid; gap: var(--space-2); align-content: start; }
  .group { display: flex; gap: var(--space-2); flex-wrap: wrap; }
  .group button[aria-pressed='true'] {
    background: var(--accent); color: var(--accent-fg); border-color: var(--accent);
  }
  .note { margin: 0; font-size: var(--text-sm); color: var(--fg-muted); }
  input[type='range'] { min-height: var(--target-min); }

  /* Pantallas bajas: la barra se aprieta para dejarle sitio al teclado. */
  @media (max-height: 620px) {
    .barra { padding: var(--space-1) var(--space-3); }
    .escena { padding: var(--space-2) var(--space-3); }
    .metricas { gap: var(--space-3); }
  }
</style>
