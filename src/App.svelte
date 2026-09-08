<script lang="ts">
  import { onMount, tick } from 'svelte';
  import Drill from './lib/components/Drill.svelte';
  import LeccionCero from './lib/components/LeccionCero.svelte';
  import Progreso from './lib/components/Progreso.svelte';
  import SelectorTono from './lib/components/SelectorTono.svelte';
  import { buildIndex, LAYOUTS, obtenerLayout } from './lib/keyboard/layouts';
  import {
    generarTextoPractica,
    LESSONS,
    normalizarTextoLibre,
    type Lesson,
  } from './lib/lessons';
  import type { EjercicioRefuerzo } from './lib/refuerzo';
  import type { Stats } from './lib/keyboard/engine';
  import {
    contarDominadas, mapaDeDominio, registrar, type EstadoTecla,
  } from './lib/keyboard/dominio';
  import { abrirAlmacen, type Almacen } from './lib/storage/almacen';
  import { leccionesOxidadas } from './lib/storage/repaso';
  import { esRecord, resumirLecciones, type Sesion } from './lib/storage/progreso';
  import {
    leccionesSuperadas, nivelDisponible, OBJETIVO_PENDIENTE, objetivoLeccion,
  } from './lib/storage/objetivos';
  import {
    aplicar, cargar, guardar as guardarPrefs, POR_DEFECTO,
    type Preferencias, type Tono,
  } from './lib/preferencias';
  import { PRECISION_ALTA, vozDe } from './lib/voz';
  import {
    crearActualizador, detectarEntorno,
    type Actualizador, type EstadoActualizacion,
  } from './lib/actualizacion';

  /**
   * Preferencias de interfaz. Se cargan de disco antes del primer pintado para
   * que quien necesita el texto al 200% no vea un parpadeo al 100%.
   */
  const prefsIniciales = typeof localStorage === 'undefined' ? { ...POR_DEFECTO } : cargar();
  let prefs = $state<Preferencias>(prefsIniciales);
  let settingsOpen = $state(false);

  let layout = $state(obtenerLayout(prefsIniciales.layout));
  const ixGuardada = LESSONS.findIndex((l) => l.id === prefs.ultimaLeccion);
  let lessonIx = $state(0);
  let progresoCargado = $state(false);
  let errorGuardado = $state(false);
  let leccionPersonalizada = $state<Lesson | null>(null);
  let pausado = $state(false);
  let drill = $state<ReturnType<typeof Drill> | null>(null);
  let result = $state<{ stats: Stats; record: boolean } | null>(null);
  let dialogoResultado = $state<HTMLDialogElement | null>(null);
  let dialogoPanel = $state<HTMLDialogElement | null>(null);
  /** Métricas en vivo, que ahora viven en la barra de arriba. */
  let ultimasStats = $state<Stats>(
    { wpm: 0, accuracy: 100, correct: 0, typed: 0, elapsedMs: 0 },
  );

  let almacen = $state<Almacen | null>(null);
  let sesiones = $state<Sesion[]>([]);
  let tipoAlmacen = $state<'sqlite' | 'local'>('local');
  let errorAlmacen = $state(false);
  let verProgreso = $state(false);
  /** 'tono' solo aparece la primera vez; 'cero' es la colocación de manos; 'continua' y 'propio' son práctica libre. */
  let vista = $state<'tono' | 'cero' | 'leccion' | 'continua' | 'propio'>('leccion');

  /** Variables para Práctica continua (Issue #19) */
  let nivelPractica = $state(0);
  let textoContinua = $state(generarTextoPractica(0));
  let continuaKey = $state(0);

  /** Variables para Texto propio (Issue #19) */
  let textoPropio = $state('');
  let textoPropioActivo = $state('');
  let enEdicionPropio = $state(true);
  let errorTextoPropio = $state('');
  let propioKey = $state(0);

  /** Intentos acumulados por tecla, que deciden cuánta ayuda visual retirar. */
  let teclas = $state<Map<string, EstadoTecla>>(new Map());
  /** Copia del estado persistido para preservar el dominio si se abandona la lección. */
  let teclasBase = new Map<string, EstadoTecla>();

  const dominios = $derived(
    prefs.ayudaTeclado === 'siempre' ? new Map<string, number>() : mapaDeDominio(teclas),
  );
  const aprendidas = $derived(contarDominadas(mapaDeDominio(teclas)));

  /**
   * Actualizaciones. Fuera del escritorio no hay nada que hacer, así que el
   * actualizador se queda en null y la barra no enseña nada.
   */
  let actualizador = $state<Actualizador | null>(null);
  let estadoAct = $state<EstadoActualizacion>({ fase: 'inactivo' });
  /** 'deb' o 'rpm' cuando el paquete lo gestiona apt o dnf, y no la app. */
  let gestorDelSistema = $state<'deb' | 'rpm' | null>(null);
  /**
   * En la barra solo aparecen las tres fases que piden algo de la persona.
   * «Buscando», «al día» y los errores viven en Ajustes: son la respuesta a
   * una pregunta que se hace allí, y aquí competirían por sitio con las
   * métricas de la lección.
   */
  const avisoActualizacion = $derived(
    estadoAct.fase === 'disponible' || estadoAct.fase === 'descargando' || estadoAct.fase === 'lista'
      ? estadoAct
      : null,
  );

  const porLeccion = $derived(resumirLecciones(sesiones));
  const superadas = $derived(leccionesSuperadas(sesiones));
  const maxDesbloqueado = $derived(nivelDisponible(sesiones));

  const voz = $derived(vozDe(prefs.tono));
  const lesson = $derived(leccionPersonalizada ?? LESSONS[lessonIx]);

  /** En español el separador decimal es la coma, no el punto. */
  const pct = (n: number) => n.toLocaleString('es-ES', { maximumFractionDigits: 1 });

  onMount(async () => {
    almacen = await abrirAlmacen();
    tipoAlmacen = almacen.tipo;
    errorAlmacen = Boolean(almacen.errorAlmacen);
    sesiones = await almacen.leerTodas();
    lessonIx = Math.min(Math.max(ixGuardada, 0), nivelDisponible(sesiones));
    teclas = await almacen.leerTeclas();
    teclasBase = new Map(teclas);

    // Primera vez: primero cómo quiere la aplicación, luego dónde van las
    // manos. Nunca soltarle un ejercicio a alguien que no ha tecleado nunca.
    if (prefs.tono === null) vista = 'tono';
    else if (sesiones.length === 0) vista = 'cero';
    else {
      const ix = LESSONS.findIndex((l) => l.id === prefs.ultimaLeccion);
      if (ix >= 0) lessonIx = Math.min(ix, nivelDisponible(sesiones));
    }
    progresoCargado = true;

  });

  onMount(() => {
    let temporizador: ReturnType<typeof setTimeout> | null = null;
    (async () => {
      const entorno = await detectarEntorno();
      if (entorno.tipo === 'gestionado') { gestorDelSistema = entorno.gestor; return; }
      if (entorno.tipo !== 'propio') return; // Navegador: nada que actualizar.
      actualizador = crearActualizador(entorno.api, (e) => { estadoAct = e; });
      if (!prefs.buscarActualizaciones) return;
      // Con retraso a propósito: al arrancar compiten la base de datos, las
      // preferencias y el primer pintado, y esto es lo único que puede esperar.
      temporizador = setTimeout(() => void actualizador?.comprobar(), 4000);
    })();
    return () => { if (temporizador) clearTimeout(temporizador); };
  });

  onMount(() => {
    function onWindowBlur(): void {
      if (vista === 'leccion' && !result && !settingsOpen && !verProgreso && ultimasStats.typed > 0) {
        pausado = true;
      }
    }
    window.addEventListener('blur', onWindowBlur);
    return () => window.removeEventListener('blur', onWindowBlur);
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
    const idLeccion =
      vista === 'continua'
        ? 'practica-continua'
        : vista === 'propio'
          ? 'texto-propio'
          : lesson.id;

    const sesion: Sesion = {
      leccion: idLeccion,
      ppm: stats.wpm,
      pctAcierto: stats.accuracy,
      aciertos: stats.correct,
      escritos: stats.typed,
      ms: Math.round(stats.elapsedMs),
      terminadaEn: new Date().toISOString(),
    };

    // Se calcula antes de guardar: después, la propia sesión ya sería la marca.
    const record = esRecord(porLeccion.get(idLeccion), sesion);
    errorGuardado = false;
    sesiones = [...sesiones, sesion];
    result = { stats, record };

    // Que falle el guardado no puede tumbar la práctica.
    // El dominio por tecla se persiste al terminar la lección, no en cada
    // pulsación: escribir en la base de datos sesenta veces por minuto no
    // aporta nada y se nota.
    try {
      await almacen?.guardar(sesion);
      await almacen?.guardarTeclas(teclas);
      teclasBase = new Map(teclas);
    } catch (err) {
      errorGuardado = true;
      console.warn('[libretype] no se pudo guardar la sesión:', err);
    }
  }

  async function exportarProgreso(): Promise<string> {
    if (!almacen) return "";
    return await almacen.exportar();
  }

  async function importarProgreso(json: string): Promise<void> {
    if (!almacen) return;
    await almacen.importar(json);
    sesiones = await almacen.leerTodas();
    teclas = await almacen.leerTeclas();
    teclasBase = new Map(teclas);
    await pick(Math.min(lessonIx, nivelDisponible(sesiones)));
  }

  async function borrarProgreso(): Promise<void> {
    await almacen?.borrarTodo();
    sesiones = [];
    teclas = new Map();
    teclasBase = new Map();
    await pick(0);
  }

  // Aplicar y guardar van juntos: un ajuste que no sobrevive a cerrar la app
  // deja fuera a quien depende de él.
  $effect(() => {
    aplicar(prefs, document.documentElement);
    guardarPrefs(prefs);
  });

  async function pick(i: number): Promise<void> {
    if (!progresoCargado || !Number.isInteger(i) || i < 0 || i > maxDesbloqueado) return;
    // Cerrar antes de sustituir la lección: WebKit restaura el foco del
    // diálogo y, si el campo anterior ya no existe, lo manda al documento.
    dialogoResultado?.close();
    dialogoPanel?.close();
    if (!result) {
      // Si se abandona la lección antes de terminarla, se preserva el estado
      // persistido según AGENTS.md (el dominio solo se persiste al terminar).
      teclas = new Map(teclasBase);
    }
    leccionPersonalizada = null;
    lessonIx = i;
    prefs = { ...prefs, ultimaLeccion: LESSONS[i]?.id ?? LESSONS[0].id };
    result = null;
    pausado = false;
    vista = 'leccion';
    settingsOpen = false;
    verProgreso = false;
    ultimasStats = { wpm: 0, accuracy: 100, correct: 0, typed: 0, elapsedMs: 0 };
    drill?.restart();
    await tick();
    drill?.enfocar();
  }

  async function activarContinua(): Promise<void> {
    dialogoResultado?.close();
    dialogoPanel?.close();
    if (!result) {
      teclas = new Map(teclasBase);
    }
    nivelPractica = maxDesbloqueado;
    textoContinua = generarTextoPractica(nivelPractica);
    continuaKey++;
    result = null;
    vista = 'continua';
    settingsOpen = false;
    verProgreso = false;
    ultimasStats = { wpm: 0, accuracy: 100, correct: 0, typed: 0, elapsedMs: 0 };
    await tick();
    drill?.restart();
    drill?.enfocar();
  }

  async function nuevaContinua(nivel = nivelPractica): Promise<void> {
    dialogoResultado?.close();
    if (!result) {
      teclas = new Map(teclasBase);
    }
    nivelPractica = Math.min(Math.max(nivel, 0), maxDesbloqueado);
    textoContinua = generarTextoPractica(nivelPractica);
    continuaKey++;
    result = null;
    ultimasStats = { wpm: 0, accuracy: 100, correct: 0, typed: 0, elapsedMs: 0 };
    await tick();
    drill?.restart();
    drill?.enfocar();
  }

  async function activarPropio(): Promise<void> {
    dialogoResultado?.close();
    dialogoPanel?.close();
    if (!result) {
      teclas = new Map(teclasBase);
    }
    result = null;
    settingsOpen = false;
    verProgreso = false;
    ultimasStats = { wpm: 0, accuracy: 100, correct: 0, typed: 0, elapsedMs: 0 };
    vista = 'propio';
    if (textoPropioActivo && !enEdicionPropio) {
      await tick();
      drill?.restart();
      drill?.enfocar();
    } else {
      enEdicionPropio = true;
    }
  }

  async function empezarTextoPropio(): Promise<void> {
    errorTextoPropio = '';
    const index = buildIndex(layout);
    const permitido = new Set(index.keys());
    const limpio = normalizarTextoLibre(textoPropio, permitido);
    if (!limpio) {
      errorTextoPropio = 'Introduce un texto con caracteres válidos para la distribución actual.';
      return;
    }
    textoPropioActivo = limpio;
    enEdicionPropio = false;
    propioKey++;
    ultimasStats = { wpm: 0, accuracy: 100, correct: 0, typed: 0, elapsedMs: 0 };
    await tick();
    drill?.restart();
    drill?.enfocar();
  }

  async function again(): Promise<void> {
    dialogoResultado?.close();
    if (!result) {
      teclas = new Map(teclasBase);
    }
    result = null;
    pausado = false;
    drill?.restart();
    await tick();
    drill?.enfocar();
  }

  async function reiniciarLeccion(): Promise<void> {
    pausado = false;
    ultimasStats = { wpm: 0, accuracy: 100, correct: 0, typed: 0, elapsedMs: 0 };
    drill?.restart();
    await tick();
    drill?.enfocar();
  }

  function alternarPausa(): void {
    pausado = !pausado;
    if (!pausado) {
      tick().then(() => drill?.enfocar());
    }
  }

  async function practicarRefuerzo(ej: EjercicioRefuerzo): Promise<void> {
    await cerrarPanel();
    leccionPersonalizada = {
      id: ej.id,
      title: ej.titulo,
      focus: ej.focus,
      nuevas: ej.teclasFlojas.join(''),
      cobertura: 100,
      text: ej.text,
    };
    result = null;
    pausado = false;
    vista = 'leccion';
    ultimasStats = { wpm: 0, accuracy: 100, correct: 0, typed: 0, elapsedMs: 0 };
    drill?.restart();
    await tick();
    drill?.enfocar();
  }

  // El diálogo nativo lleva el foco al primer control, mantiene Tab dentro y
  // hace inerte el fondo. Al desmontarlo restaura el foco de quien lo abrió.
  function abrirDialogo(dialogo: HTMLDialogElement): { destroy: () => void } {
    dialogo.showModal();
    return { destroy: () => dialogo.close() };
  }

  async function cerrarPanel(): Promise<void> {
    dialogoPanel?.close();
    settingsOpen = false;
    verProgreso = false;
    await tick();
    if (vista === 'leccion' || vista === 'continua' || (vista === 'propio' && !enEdicionPropio)) {
      drill?.enfocar();
    }
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
      <span class="sr-only">Lección o modo de práctica</span>
      <select
        disabled={!progresoCargado}
        value={vista === 'leccion' ? (leccionPersonalizada ? 'refuerzo' : String(lessonIx)) : vista}
        onchange={(e) => {
          const v = e.currentTarget.value;
          if (v === 'cero') vista = 'cero';
          else if (v === 'continua') activarContinua();
          else if (v === 'propio') activarPropio();
          else if (v === 'refuerzo') { /* ya activa */ }
          else pick(+v);
        }}
      >
        <option value="cero">Antes de empezar · dónde van las manos</option>
        {#if leccionPersonalizada}
          <option value="refuerzo">{leccionPersonalizada.title}</option>
        {/if}
        {#each LESSONS as l, i (l.id)}
          {@const marca = porLeccion.get(l.id)}
          {@const esUltima = l.id === prefs.ultimaLeccion && sesiones.length > 0}
          <option value={String(i)} disabled={i > maxDesbloqueado}>
            {i + 1}. {l.title}{i > maxDesbloqueado ? ' · Bloqueada' : superadas.has(l.id) ? ' · Superada' : ' · Disponible'}{marca && marca.mejorPpm > 0 ? ` · ${marca.mejorPpm} ppm` : ''}{esUltima ? ' · Seguías por aquí' : ''}
          </option>
        {/each}
        <option value="continua">Práctica continua · vocabulario acumulado</option>
        <option value="propio">Texto propio · práctica libre</option>
      </select>
    </label>

    {#if vista === 'leccion' || vista === 'continua' || (vista === 'propio' && !enEdicionPropio)}
      {@const textoObjetivo = vista === 'continua' ? textoContinua : vista === 'propio' ? textoPropioActivo : lesson.text}
      <div class="controles-intento">
        <button
          type="button"
          class="btn-intento"
          onclick={reiniciarLeccion}
          aria-label="Empezar de nuevo esta lección"
        >
          Reiniciar
        </button>
        <button
          type="button"
          class="btn-intento"
          onclick={alternarPausa}
          aria-label={pausado ? 'Reanudar lección' : 'Pausar lección'}
          aria-pressed={pausado}
        >
          {pausado ? 'Reanudar' : 'Pausar'}
        </button>
      </div>

      <dl class="metricas">
        <div><dt>Velocidad</dt><dd>{ultimasStats.wpm}<small>ppm</small></dd></div>
        <div><dt>Precisión</dt><dd>{ultimasStats.accuracy}<small>%</small></dd></div>
        <div><dt>Avance</dt><dd>{ultimasStats.typed}<small>/{textoObjetivo.length}</small></dd></div>
      </dl>
    {/if}

    <div class="acciones">
      <!--
        role="status" y no "alert": se anuncia cuando el lector de pantalla
        termine lo que esté diciendo, no interrumpiendo a media lección. Nunca
        instala ni reinicia solo; las dos cosas son un clic.
      -->
      {#if avisoActualizacion}
        <div class="actualizacion" role="status">
          {#if avisoActualizacion.fase === 'disponible'}
            <button
              class="btn-actualizar"
              onclick={() => void actualizador?.instalar()}
              title={avisoActualizacion.notas || undefined}
            >
              Actualizar <small>a la {avisoActualizacion.version}</small>
            </button>
          {:else if avisoActualizacion.fase === 'descargando'}
            <span class="act-texto">
              Descargando{avisoActualizacion.pct >= 0 ? ` ${avisoActualizacion.pct}%` : '…'}
            </span>
          {:else}
            <button class="btn-actualizar" onclick={() => void actualizador?.reiniciar()}>
              Reiniciar <small>para terminar</small>
            </button>
          {/if}
        </div>
      {/if}
      <button
        aria-expanded={verProgreso}
        aria-controls="panel-dialogo"
        onclick={() => { verProgreso = !verProgreso; settingsOpen = false; }}
      >
        Progreso
      </button>
      <button
        aria-expanded={settingsOpen}
        aria-controls="panel-dialogo"
        onclick={() => { settingsOpen = !settingsOpen; verProgreso = false; }}
      >
        Ajustes
      </button>
    </div>
  </header>

  <main class="escena">
    {#if !progresoCargado}
      <p class="note" role="status">Cargando progreso…</p>
    {:else if vista === 'tono'}
      <div class="centrado"><SelectorTono onElegir={elegirTono} /></div>
    {:else if vista === 'cero'}
      <LeccionCero {layout} onTerminar={() => pick(0)} />
    {:else if vista === 'continua'}
      <div class="barra-practica">
        <label for="selector-nivel-practica">Vocabulario desbloqueado hasta:</label>
        <select
          id="selector-nivel-practica"
          bind:value={nivelPractica}
          onchange={() => nuevaContinua(nivelPractica)}
        >
          {#each LESSONS.slice(0, maxDesbloqueado + 1) as l, i}
            <option value={i}>{i + 1}. {l.title}</option>
          {/each}
        </select>
        <button onclick={() => nuevaContinua(nivelPractica)}>Nuevo texto aleatorio</button>
      </div>
      {#key continuaKey}
        <Drill
          bind:this={drill}
          {layout}
          activo={!settingsOpen && !verProgreso && !result}
          target={textoContinua}
          titulo="Práctica continua"
          explicacion={`Vocabulario acumulado hasta la lección ${nivelPractica + 1}: ${LESSONS[nivelPractica].title}.`}
          cobertura={pct(LESSONS[nivelPractica].cobertura)}
          espacioJusto={prefs.escala >= 1.4}
          movimiento={prefs.movimiento}
          animaciones={prefs.movimiento === 'reducido' ? 'reducidas' : 'normales'}
          {dominios}
          onDone={terminada}
          onTecla={anotarTecla}
          onStats={(s) => (ultimasStats = s)}
        />
      {/key}
    {:else if vista === 'propio'}
      {#if enEdicionPropio}
        <div class="centrado editor-propio">
          <h2>Práctica libre con texto propio</h2>
          <p class="note">Escribe o pega el texto que desees practicar. Se utilizarán las teclas disponibles en la distribución activa.</p>
          <label for="texto-propio-input" class="sr-only">Texto personalizado</label>
          <textarea
            id="texto-propio-input"
            class="input-texto-propio"
            rows="5"
            bind:value={textoPropio}
            placeholder="Escribe o pega aquí tu propio texto..."
          ></textarea>
          {#if errorTextoPropio}
            <p class="nota aviso aviso-error" role="alert">{errorTextoPropio}</p>
          {/if}
          <div class="acciones-propio">
            <button class="primario" onclick={empezarTextoPropio}>Empezar a teclear</button>
          </div>
        </div>
      {:else}
        <div class="barra-practica">
          <span>Practicando tu propio texto ({textoPropioActivo.length} caracteres)</span>
          <button onclick={() => { enEdicionPropio = true; }}>Cambiar texto</button>
          <button onclick={again}>Reiniciar</button>
        </div>
        {#key propioKey}
          <Drill
            bind:this={drill}
            {layout}
            activo={!settingsOpen && !verProgreso && !result}
            target={textoPropioActivo}
            titulo="Texto propio"
            explicacion="Práctica libre con texto personalizado."
            cobertura=""
            espacioJusto={prefs.escala >= 1.4}
            movimiento={prefs.movimiento}
            animaciones={prefs.movimiento === 'reducido' ? 'reducidas' : 'normales'}
            {dominios}
            onDone={terminada}
            onTecla={anotarTecla}
            onStats={(s) => (ultimasStats = s)}
          />
        {/key}
      {/if}
    {:else}
      {#key lesson.id}
        <Drill
          bind:this={drill}
          {layout}
          activo={!settingsOpen && !verProgreso && !result}
          {pausado}
          onReanudar={() => { pausado = false; tick().then(() => drill?.enfocar()); }}
          target={lesson.text}
          titulo={lesson.title}
          explicacion={leccionPersonalizada ? lesson.focus : objetivoLeccion(lesson.focus)}
          cobertura={pct(lesson.cobertura)}
          espacioJusto={prefs.escala >= 1.4}
          movimiento={prefs.movimiento}
          animaciones={prefs.movimiento === 'reducido' ? 'reducidas' : 'normales'}
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
    <dialog
      id="dialogo-resultado"
      class="capa"
      bind:this={dialogoResultado}
      use:abrirDialogo
      aria-labelledby="resultado-titulo"
      aria-describedby="resultado-desc"
      aria-live="polite"
      oncancel={(e) => { e.preventDefault(); again(); }}
    >
      <div
        class="resultado"
        class:record={result.record}
        class:celebra={result.record && prefs.tono === 'juego'}
        aria-live="polite"
      >
        <strong id="resultado-titulo">
          {#if result.record}★ {voz.record}{:else}{voz.terminada}{/if}
        </strong>
        <div id="resultado-desc">
          <span>{result.stats.wpm} palabras por minuto, {result.stats.accuracy}% de precisión.</span>
          <span class="animo">
            {result.stats.accuracy < 90 ? voz.animoBajo : (result.stats.accuracy >= PRECISION_ALTA ? voz.animoAlto : voz.animoAlto)}
          </span>
        </div>
        {#if vista === 'leccion' && !leccionPersonalizada}
          <p class="note">
            {#if superadas.has(lesson.id)}
              Lección superada.{lessonIx === LESSONS.length - 1 ? ' Has completado el temario.' : ' Puedes pasar a la siguiente lección.'}
            {:else}
              {OBJETIVO_PENDIENTE}
            {/if}
          </p>
        {/if}
        {#if errorGuardado}
          <p class="note" role="status">No se pudo guardar el resultado. El avance de este intento solo estará disponible durante esta sesión.</p>
        {/if}
        <div class="botones">
          {#if vista === 'leccion' && !leccionPersonalizada && leccionesOxidadas(sesiones, undefined, lesson.id).length > 0}
            <p class="note">{voz.repaso} Puedes practicar a tu ritmo con vocabulario conocido.</p>
            <button onclick={() => { vista = 'continua'; nuevaContinua(maxDesbloqueado); }}>Repasar con práctica continua</button>
          {/if}
          {#if result.stats.accuracy < 90}
            <button class="primario" onclick={again}>{voz.repetir}</button>
            {#if vista === 'continua'}
              <button onclick={() => nuevaContinua()}>Nuevo texto</button>
            {:else if vista === 'propio'}
              <button onclick={() => { dialogoResultado?.close(); enEdicionPropio = true; result = null; }}>Cambiar texto</button>
            {:else if !leccionPersonalizada && lessonIx < maxDesbloqueado}
              <button onclick={() => pick(lessonIx + 1)}>{voz.siguiente}</button>
            {/if}
          {:else}
            <button onclick={again}>{voz.repetir}</button>
            {#if vista === 'continua'}
              <button class="primario" onclick={() => nuevaContinua()}>Nuevo texto</button>
            {:else if vista === 'propio'}
              <button class="primario" onclick={() => { dialogoResultado?.close(); enEdicionPropio = true; result = null; }}>Cambiar texto</button>
            {:else if !leccionPersonalizada && lessonIx < maxDesbloqueado}
              <button class="primario" onclick={() => pick(lessonIx + 1)}>{voz.siguiente}</button>
            {/if}
          {/if}
        </div>
      </div>
    </dialog>
  {/if}

  {#if settingsOpen || verProgreso}
    <dialog
      id="panel-dialogo"
      class="panel"
      bind:this={dialogoPanel}
      use:abrirDialogo
      aria-label={settingsOpen ? 'Ajustes' : 'Progreso'}
      oncancel={(e) => { e.preventDefault(); cerrarPanel(); }}
    >
      <div class="panel-cab">
        <h2>{settingsOpen ? 'Ajustes' : voz.progreso}</h2>
        <button onclick={cerrarPanel}>Cerrar</button>
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
            <select
              id="layout"
              value={layout.id}
              onchange={(e) => {
                const id = e.currentTarget.value;
                layout = obtenerLayout(id);
                prefs = { ...prefs, layout: id };
              }}
            >
              {#each LAYOUTS as l (l.id)}<option value={l.id}>{l.name}</option>{/each}
            </select>
            <p class="note">
              No la detectamos automáticamente: la API que lo permite solo existe en
              Chromium, así que en macOS y Linux no sería fiable.
            </p>
          </div>

          {#if gestorDelSistema}
            <div class="field">
              <span id="act-l">Actualizaciones</span>
              <p class="note">
                LibreType se instaló con
                {gestorDelSistema === 'deb' ? 'apt' : 'dnf'}, así que las
                actualizaciones llegan con las del resto del sistema. La
                aplicación no las descarga por su cuenta ni consulta nada por
                internet.
              </p>
            </div>
          {:else if actualizador}
            <div class="field">
              <span id="act-l">Actualizaciones</span>
              <div class="group" role="group" aria-labelledby="act-l">
                <button aria-pressed={prefs.buscarActualizaciones}
                        onclick={() => (prefs = { ...prefs, buscarActualizaciones: true })}>
                  Avisarme
                </button>
                <button aria-pressed={!prefs.buscarActualizaciones}
                        onclick={() => (prefs = { ...prefs, buscarActualizaciones: false })}>
                  No buscar
                </button>
              </div>
              <p class="note">
                Es lo único que LibreType consulta por internet: un fichero público
                en GitHub con el número de la última versión. No se envía nada de
                tu progreso ni de quién eres. Nunca se instala sola.
              </p>
              <div class="act-manual">
                <button
                  onclick={() => void actualizador?.comprobar(true)}
                  disabled={estadoAct.fase === 'buscando' || estadoAct.fase === 'descargando'}
                >
                  Buscar ahora
                </button>
                <!-- Aquí sí se cuentan todas las fases: alguien acaba de preguntar. -->
                <p class="note" role="status">
                  {#if estadoAct.fase === 'buscando'}Buscando…
                  {:else if estadoAct.fase === 'al-dia'}Estás en la última versión, la {estadoAct.version}.
                  {:else if estadoAct.fase === 'disponible'}Hay una versión nueva, la {estadoAct.version}.
                  {:else if estadoAct.fase === 'descargando'}Descargando{estadoAct.pct >= 0 ? ` ${estadoAct.pct}%` : '…'}
                  {:else if estadoAct.fase === 'lista'}Lista la {estadoAct.version}. Se aplica al reiniciar.
                  {:else if estadoAct.fase === 'error'}No se ha podido comprobar. {estadoAct.mensaje}
                  {/if}
                </p>
              </div>
            </div>
          {/if}
        {:else}
          <Progreso
            {sesiones}
            lecciones={LESSONS}
            {tipoAlmacen}
            {errorAlmacen}
            {almacen}
            {teclas}
            onBorrar={borrarProgreso}
            onExportar={exportarProgreso}
            onImportar={importarProgreso}
            onPracticarRefuerzo={practicarRefuerzo}
          />
        {/if}
      </div>
    </dialog>
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

  .controles-intento { display: flex; gap: var(--space-2); }
  .btn-intento { min-height: var(--target-min); }

  .acciones { display: flex; gap: var(--space-2); margin-left: auto; align-items: center; }
  .acciones button { min-height: var(--target-min); }

  /* El aviso de versión nueva vive con los demás botones de la barra y solo
     aparece cuando hay algo que hacer. Ocupa sitio en una barra que ya va
     justa, así que el texto es corto y el detalle va en el <small>. */
  .actualizacion { display: flex; align-items: center; }
  .btn-actualizar {
    min-height: var(--target-min);
    border: 1px solid var(--accent);
    background: var(--accent);
    color: var(--accent-fg);
    border-radius: var(--radius);
    padding: 0 var(--space-3);
    font: inherit;
    white-space: nowrap;
  }
  /* El color no es lo que lo distingue: el texto ya dice qué hace. */
  .btn-actualizar small { font-size: var(--text-xs); opacity: 0.9; }
  .act-texto {
    font-size: var(--text-sm);
    color: var(--fg-muted);
    white-space: nowrap;
    font-variant-numeric: tabular-nums;
  }

  .act-manual { display: flex; align-items: center; gap: var(--space-3); flex-wrap: wrap; }
  .act-manual button { min-height: var(--target-min); }
  .act-manual .note { margin: 0; }

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
  dialog {
    color: var(--fg);
    max-width: none;
    max-height: none;
    margin: 0;
    padding: 0;
    border: 0;
  }
  dialog::backdrop {
    background: color-mix(in srgb, var(--bg) 78%, transparent);
  }
  .capa {
    position: fixed; inset: 0;
    width: 100%; height: 100%;
    display: grid; place-items: center;
    background: transparent;
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
  #resultado-desc { display: grid; gap: var(--space-1); }
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
  :global(:root[data-motion="reducido"]) .resultado.celebra,
  :global(:root[data-motion="reduced"]) .resultado.celebra {
    animation: none;
  }

  .panel {
    position: fixed; top: 0; right: 0; bottom: 0; left: auto;
    height: 100%;
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

  .barra-practica {
    display: flex;
    align-items: center;
    gap: var(--space-3);
    margin-bottom: var(--space-2);
    font-size: var(--text-sm);
    color: var(--fg-muted);
    flex-wrap: wrap;
  }
  .barra-practica select {
    font: inherit;
    min-height: var(--target-min);
    padding: 0 var(--space-2);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    background: var(--surface);
    color: var(--fg);
  }
  .barra-practica button {
    min-height: var(--target-min);
  }
  .editor-propio {
    display: grid;
    gap: var(--space-3);
    width: 100%;
  }
  .input-texto-propio {
    width: 100%;
    min-height: 120px;
    font-family: var(--font-drill);
    font-size: var(--text-base);
    padding: var(--space-3);
    border: 1px solid var(--border-strong);
    border-radius: var(--radius);
    background: var(--surface);
    color: var(--fg);
    resize: vertical;
  }
  .acciones-propio {
    display: flex;
    gap: var(--space-2);
  }
</style>
