<script lang="ts">
  import { onMount, tick } from 'svelte';
  import Drill from './lib/components/Drill.svelte';
  import LeccionCero from './lib/components/LeccionCero.svelte';
  import Progreso from './lib/components/Progreso.svelte';
  import SelectorTono from './lib/components/SelectorTono.svelte';
  import QuienPractica from './lib/components/QuienPractica.svelte';
  import Perfiles from './lib/components/Perfiles.svelte';
  import Informe from './lib/components/Informe.svelte';
  import { leerPolitica } from './lib/politica';
  import TamanoTexto from './lib/components/TamanoTexto.svelte';
  import PruebaColocacion from './lib/components/PruebaColocacion.svelte';
  import RecordatorioPausa from './lib/components/RecordatorioPausa.svelte';
  import Temario, { type Modo } from './lib/components/Temario.svelte';
  import { escucharAtajosTamano } from './lib/tamano';
  import { avisoQuitados, caracteresQuitados } from './lib/texto-propio';
  import {
    explicacionFluidez, generarTanda, ID_FLUIDEZ, ritmoReferencia, valorarTanda,
  } from './lib/fluidez';
  import { buildIndex, LAYOUTS, obtenerLayout } from './lib/keyboard/layouts';
  import {
    LESSONS,
    normalizarTextoLibre,
    type Lesson,
  } from './lib/lessons';
  import {
    CARACTERES_POR_PALABRA, generarTextoPractica, semillaNueva, textoDeIntento,
  } from './lib/generador';
  import {
    generarEjercicioRefuerzo, nivelEnsenado, teclasParaReforzar, type EjercicioRefuerzo,
  } from './lib/refuerzo';
  import { anotarFallo, enumerar, teclasConMasFallos, type TeclaConFallos } from './lib/fallos';
  import { crearSonido } from './lib/sonido';
  import type { Stats } from './lib/keyboard/engine';
  import {
    contarDominadas, mapaDeDominio, registrar, type EstadoTecla,
  } from './lib/keyboard/dominio';
  import {
    abrirAlmacen, mismoAlias, PERFIL_PRINCIPAL, type Almacen, type Perfil,
  } from './lib/storage/almacen';
  import { recienDominadas } from './lib/storage/comparacion';
  import { leccionesOxidadas } from './lib/storage/repaso';
  import { esRecord, resumirLecciones, type Sesion } from './lib/storage/progreso';
  import {
    leccionesSuperadas, nivelDisponible, OBJETIVO_PENDIENTE, objetivoLeccion,
  } from './lib/storage/objetivos';
  import {
    aplicar, cargar, guardar as guardarPrefs, MINUTOS_PAUSA, PALABRAS_POR_LONGITUD, palabrasPorTexto, POR_DEFECTO,
    type Preferencias, type Tono,
  } from './lib/preferencias';
  import { QUE_ES_PPM, textosResultado, vozDe } from './lib/voz';
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
  let result = $state<{
    stats: Stats;
    record: boolean;
    /** Las teclas con más fallos de este intento, para decirlo al terminar. */
    costaron: TeclaConFallos[];
    /** Refuerzo de teclas flojas que se ofrece junto al resultado, si hay alguna. */
    refuerzo: EjercicioRefuerzo | null;
    /** Teclas que este intento ha retirado del teclado en pantalla. */
    sinMirar?: string[];
  } | null>(null);
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
  /**
   * 'perfil' es «¿Quién practica?», al abrir con más de un perfil; 'tono' solo
   * aparece la primera vez; 'cero' es la colocación de manos; 'continua',
   * 'propio' y 'fluidez' son práctica libre.
   */
  let vista = $state<
    'perfil' | 'tono' | 'cero' | 'leccion' | 'continua' | 'propio' | 'fluidez' | 'colocacion'
  >('leccion');
  /** Perfiles de este equipo. El progreso y el dominio van por perfil; las preferencias, no. */
  let perfiles = $state<Perfil[]>([]);
  let perfilActivo = $state(PERFIL_PRINCIPAL);
  const aliasActivo = $derived(perfiles.find((p) => p.id === perfilActivo)?.alias ?? '');
  let verTemario = $state(false);
  /** Cualquiera de los tres paneles superpuestos suspende la captura. */
  const panelAbierto = $derived(settingsOpen || verProgreso || verTemario);
  /** Para rehacer la prueba de colocación desde el principio si se vuelve a elegir. */
  let colocacionKey = $state(0);

  /** Tandas de fluidez (2.5): texto, clave para rehacer el Drill y su meta. */
  let textoFluidez = $state('');
  let fluidezKey = $state(0);
  /** Tu ritmo de antes de esta tanda; se fija al empezarla, no al terminarla. */
  let ritmoFluidez = $state<number | null>(null);
  /** La valoración de la tanda recién terminada, contra ese ritmo. */
  let valoracionFluidez = $state('');

  /** Variables para Práctica continua (Issue #19) */
  let nivelPractica = $state(0);
  /**
   * Lo que marca el `<select>` de vocabulario, que no se aplica hasta pulsar
   * el botón: si cambiara el texto con cada flecha, recorrer la lista con el
   * teclado iría tirando textos (WCAG 3.2.2).
   */
  let nivelElegido = $state(0);
  let textoContinua = $state(textoPractica(0, prefsIniciales.longitudTexto));
  let continuaKey = $state(0);

  /** Variables para Texto propio (Issue #19) */
  let textoPropio = $state('');
  let textoPropioActivo = $state('');
  let enEdicionPropio = $state(true);
  let errorTextoPropio = $state('');
  /** Qué caracteres se quitaron al empezar, para que no parezca un fallo. */
  let avisoTextoPropio = $state('');
  let propioKey = $state(0);

  /**
   * Texto del intento en curso. Cambia en cada intento (`generador.ts`); el
   * identificador de la lección no, que es lo que guardan récords y repaso.
   */
  let textoLeccion = $state(LESSONS[0].text);
  /** Fallos por tecla del intento en curso; se vacía al empezar otro. */
  let fallosIntento = $state<Map<string, number>>(new Map());
  const sonido = crearSonido();

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
  /**
   * 'deb' o 'rpm' cuando el paquete lo gestiona apt o dnf, y no la app;
   * 'politica' cuando quien administra el equipo apagó las actualizaciones.
   */
  let gestorDelSistema = $state<'deb' | 'rpm' | 'politica' | null>(null);
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
  /** Titular y ánimo del resultado: según el intento real y el modo (roadmap 0.1). */
  const textosRes = $derived(result ? textosResultado(voz, {
    modo: vista === 'leccion' && !leccionPersonalizada ? 'leccion' : 'practica',
    precision: result.stats.accuracy,
    record: result.record,
  }) : null);

  /** En español el separador decimal es la coma, no el punto. */
  const pct = (n: number) => n.toLocaleString('es-ES', { maximumFractionDigits: 1 });

  onMount(async () => {
    almacen = await abrirAlmacen();
    tipoAlmacen = almacen.tipo;
    errorAlmacen = Boolean(almacen.errorAlmacen);
    perfiles = await almacen.listarPerfiles();

    // En un equipo gestionado, el administrador puede fijar el perfil con el
    // que se abre (ver politica.ts). Si no, con más de uno se pregunta.
    const { perfilPorDefecto } = await leerPolitica();
    if (perfilPorDefecto) {
      const fijado = perfiles.find((p) => mismoAlias(p.alias, perfilPorDefecto))
        ?? await crearPerfil(perfilPorDefecto).catch(() => null);
      if (fijado) return abrirPerfil(fijado.id, true);
    }
    if (perfiles.length > 1) { vista = 'perfil'; return; }
    await abrirPerfil(almacen.perfil, true);
  });

  /**
   * Carga el progreso de un perfil y decide por dónde se sigue.
   *
   * @param alArrancar en el arranque no hay lección montada que reiniciar.
   */
  async function abrirPerfil(id: number, alArrancar = false): Promise<void> {
    if (!almacen) return;
    almacen.usarPerfil(id);
    perfilActivo = id;
    sesiones = await almacen.leerTodas();
    lessonIx = Math.min(Math.max(ixGuardada, 0), nivelDisponible(sesiones));
    teclas = await almacen.leerTeclas();
    teclasBase = new Map(teclas);
    leccionPersonalizada = null;
    result = null;

    // Primera vez: primero cómo quiere la aplicación, luego dónde van las
    // manos. Nunca soltarle un ejercicio a alguien que no ha tecleado nunca.
    if (prefs.tono === null) vista = 'tono';
    else if (sesiones.length === 0) vista = 'cero';
    else {
      vista = 'leccion';
      const ix = LESSONS.findIndex((l) => l.id === prefs.ultimaLeccion);
      if (ix >= 0) lessonIx = Math.min(ix, nivelDisponible(sesiones));
    }
    prepararTexto();
    progresoCargado = true;
    if (!alArrancar && vista === 'leccion') await pick(lessonIx);
  }

  async function crearPerfil(alias: string): Promise<Perfil> {
    if (!almacen) throw new Error('El almacén todavía no está listo.');
    const nuevo = await almacen.crearPerfil(alias);
    perfiles = await almacen.listarPerfiles();
    return nuevo;
  }

  async function renombrarPerfil(id: number, alias: string): Promise<void> {
    await almacen?.renombrarPerfil(id, alias);
    if (almacen) perfiles = await almacen.listarPerfiles();
  }

  async function borrarPerfil(id: number): Promise<void> {
    if (!almacen) return;
    await almacen.borrarPerfil(id);
    perfiles = await almacen.listarPerfiles();
    if (id === perfilActivo) await abrirPerfil(almacen.perfil);
  }

  async function cambiarPerfil(id: number): Promise<void> {
    await cerrarPanel();
    await abrirPerfil(id);
  }

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
      // En todos los modos con ejercicio en marcha, no solo en las lecciones:
      // si no, el cronómetro de la práctica libre seguía corriendo (roadmap 0.2).
      if (hayEjercicio() && !result && !panelAbierto && ultimasStats.typed > 0) {
        pausado = true;
      }
    }
    window.addEventListener('blur', onWindowBlur);
    return () => window.removeEventListener('blur', onWindowBlur);
  });

  /** Hay un `Drill` en pantalla: lección, práctica libre o tanda de fluidez. */
  function hayEjercicio(): boolean {
    return enPractica;
  }

  // Ctrl+ / Ctrl− / Ctrl+0 mueven --ui-scale (ver lib/tamano.ts).
  onMount(() => escucharAtajosTamano(
    window,
    () => prefs.escala,
    (escala) => { prefs = { ...prefs, escala }; },
  ));

  function elegirTono(tono: Tono): void {
    prefs = { ...prefs, tono };
    vista = sesiones.length === 0 ? 'cero' : 'leccion';
  }

  function anotarTecla(code: string, acierto: boolean, ms: number): void {
    // Se muta un mapa nuevo para que Svelte lo vea cambiar.
    const m = new Map(teclas);
    m.set(code, registrar(m.get(code), acierto, ms));
    teclas = m;
    fallosIntento = anotarFallo(fallosIntento, code, acierto);
    if (prefs.sonido) {
      if (acierto) sonido.acierto(prefs.volumen);
      else sonido.fallo(prefs.volumen);
    }
  }

  // Un intento empieza con el campo vacío, venga de donde venga el reinicio
  // (barra, diálogo, botón del propio ejercicio): ahí se vacía la cuenta.
  $effect(() => {
    if (ultimasStats.typed === 0) fallosIntento = new Map();
  });

  /**
   * Prepara el texto del siguiente intento. El primer contacto con una lección
   * usa su texto revisado a mano; después, uno nuevo cada vez.
   */
  /**
   * Práctica continua con la longitud elegida. El generador mide en caracteres
   * y la preferencia en palabras; cada texto lleva semilla nueva.
   */
  function textoPractica(nivel: number, longitud: Preferencias['longitudTexto']): string {
    return generarTextoPractica(nivel, semillaNueva(), palabrasPorTexto(longitud) * CARACTERES_POR_PALABRA);
  }

  function prepararTexto(): void {
    if (leccionPersonalizada) {
      textoLeccion = leccionPersonalizada.text;
      return;
    }
    const yaPracticada = porLeccion.has(LESSONS[lessonIx]?.id ?? '');
    textoLeccion = textoDeIntento(
      lessonIx, yaPracticada, semillaNueva(),
      palabrasPorTexto(prefs.longitudTexto) / PALABRAS_POR_LONGITUD.normal,
    );
  }

  async function terminada(stats: Stats): Promise<void> {
    const idLeccion =
      vista === 'continua'
        ? 'practica-continua'
        : vista === 'propio'
          ? 'texto-propio'
          : vista === 'fluidez'
            ? ID_FLUIDEZ
            : lesson.id;
    if (vista === 'fluidez') valoracionFluidez = valorarTanda(stats.wpm, stats.accuracy, ritmoFluidez);

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
    // Solo se ofrece reforzar con teclas enseñadas, y solo si alguna cuesta de
    // verdad (con intentos suficientes para saberlo).
    const nivel = nivelEnsenado(sesiones);
    const refuerzo = teclasParaReforzar(teclas, nivel, layout).length > 0
      ? generarEjercicioRefuerzo(teclas, layout, { nivel })
      : null;
    // Se compara con lo persistido antes de este intento: lo que cambia es lo
    // que acaba de conseguir, y se cuenta como logro (2.4).
    result = {
      stats, record, costaron: teclasConMasFallos(fallosIntento, 3, layout), refuerzo,
      sinMirar: recienDominadas(teclasBase, teclas, layout),
    };
    if (prefs.sonido) sonido.fin(prefs.volumen);

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

  /**
   * Un tramo de la prueba de colocación: se guarda como una sesión normal de
   * su lección, sin diálogo de resultado (la prueba sigue sola al siguiente).
   */
  async function guardarTramo(sesion: Sesion): Promise<void> {
    errorGuardado = false;
    sesiones = [...sesiones, sesion];
    try {
      await almacen?.guardar(sesion);
      await almacen?.guardarTeclas(teclas);
      teclasBase = new Map(teclas);
    } catch (err) {
      errorGuardado = true;
      console.warn('[libretype] no se pudo guardar el tramo:', err);
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
    prepararTexto();
    prefs = { ...prefs, ultimaLeccion: LESSONS[i]?.id ?? LESSONS[0].id };
    result = null;
    pausado = false;
    vista = 'leccion';
    settingsOpen = false;
    verProgreso = false;
    verTemario = false;
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
    nivelElegido = nivelPractica;
    textoContinua = textoPractica(nivelPractica, prefs.longitudTexto);
    continuaKey++;
    result = null;
    pausado = false;
    vista = 'continua';
    settingsOpen = false;
    verProgreso = false;
    verTemario = false;
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
    nivelElegido = nivelPractica;
    textoContinua = textoPractica(nivelPractica, prefs.longitudTexto);
    continuaKey++;
    result = null;
    pausado = false;
    ultimasStats = { wpm: 0, accuracy: 100, correct: 0, typed: 0, elapsedMs: 0 };
    await tick();
    drill?.restart();
    drill?.enfocar();
  }

  /** Empieza o repite una tanda de fluidez con el vocabulario abierto. */
  async function nuevaFluidez(): Promise<void> {
    dialogoResultado?.close();
    dialogoPanel?.close();
    if (!result) teclas = new Map(teclasBase);
    textoFluidez = generarTanda(maxDesbloqueado, palabrasPorTexto(prefs.longitudTexto));
    // La meta es tu ritmo anterior: se toma antes de la tanda, con lo guardado.
    ritmoFluidez = ritmoReferencia(sesiones);
    valoracionFluidez = '';
    fluidezKey++;
    result = null;
    pausado = false;
    vista = 'fluidez';
    settingsOpen = false;
    verProgreso = false;
    verTemario = false;
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
    pausado = false;
    settingsOpen = false;
    verProgreso = false;
    verTemario = false;
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
    avisoTextoPropio = avisoQuitados(caracteresQuitados(textoPropio, permitido));
    enEdicionPropio = false;
    pausado = false;
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
    if (vista === 'leccion') prepararTexto();
    drill?.restart();
    await tick();
    drill?.enfocar();
  }

  async function reiniciarLeccion(): Promise<void> {
    pausado = false;
    ultimasStats = { wpm: 0, accuracy: 100, correct: 0, typed: 0, elapsedMs: 0 };
    if (vista === 'leccion') prepararTexto();
    drill?.restart();
    await tick();
    drill?.enfocar();
  }

  function pausar(): void { pausado = true; }

  function reanudar(): void {
    pausado = false;
    tick().then(() => drill?.enfocar());
  }

  function alternarPausa(): void {
    pausado = !pausado;
    if (!pausado) {
      tick().then(() => drill?.enfocar());
    }
  }

  async function practicarRefuerzo(ej: EjercicioRefuerzo): Promise<void> {
    dialogoResultado?.close();
    await cerrarPanel();
    leccionPersonalizada = {
      id: ej.id,
      title: ej.titulo,
      focus: ej.focus,
      nuevas: ej.teclasFlojas.join(''),
      cobertura: 100,
      text: ej.text,
    };
    prepararTexto();
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

  /** Hay un ejercicio en pantalla (no el editor de texto propio ni un menú). */
  const enPractica = $derived(
    vista === 'leccion' || vista === 'continua' || vista === 'fluidez'
      || (vista === 'propio' && !enEdicionPropio),
  );

  /** Lo que se está practicando, en los términos del temario. */
  const modoActual = $derived<Modo | null>(vista === 'tono' || vista === 'perfil' ? null : vista);

  /** Qué dice el botón del temario: dónde está ahora la persona. */
  const rotuloActual = $derived(
    vista === 'leccion'
      ? (leccionPersonalizada ? leccionPersonalizada.title : `${lessonIx + 1}. ${lesson.title}`)
      : vista === 'cero' ? 'Antes de empezar'
      : vista === 'continua' ? 'Práctica continua'
      : vista === 'fluidez' ? 'Fluidez'
      : vista === 'colocacion' ? 'Prueba de colocación'
      : vista === 'propio' ? 'Texto propio'
      : '',
  );

  async function elegirModo(modo: Exclude<Modo, 'leccion'>): Promise<void> {
    if (modo === 'continua') return activarContinua();
    if (modo === 'propio') return activarPropio();
    if (modo === 'fluidez') return nuevaFluidez();
    if (modo === 'colocacion') {
      dialogoPanel?.close();
      if (!result) teclas = new Map(teclasBase);
      result = null;
      pausado = false;
      settingsOpen = false;
      verProgreso = false;
      verTemario = false;
      colocacionKey++;
      vista = 'colocacion';
      return;
    }
    if (modo === 'cero') {
      dialogoPanel?.close();
      if (!result) teclas = new Map(teclasBase);
      result = null;
      pausado = false;
      settingsOpen = false;
      verProgreso = false;
      verTemario = false;
      vista = 'cero';
    }
  }

  async function cerrarPanel(): Promise<void> {
    dialogoPanel?.close();
    settingsOpen = false;
    verProgreso = false;
    verTemario = false;
    await tick();
    if (enPractica) {
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

    <!-- El temario es un panel, no un <select>: con teclado, el desplegable
         cambiaba de lección con cada flecha (WCAG 3.2.2). -->
    <button
      class="btn-temario"
      disabled={!progresoCargado}
      aria-expanded={verTemario}
      aria-controls="panel-dialogo"
      onclick={() => { verTemario = !verTemario; settingsOpen = false; verProgreso = false; }}
    >
      <span class="eti">Temario</span>
      {#if rotuloActual}<span class="actual">{rotuloActual}</span>{/if}
    </button>

    {#if enPractica}
      {@const textoObjetivo = vista === 'continua' ? textoContinua : vista === 'propio' ? textoPropioActivo : vista === 'fluidez' ? textoFluidez : textoLeccion}
      <div class="controles-intento">
        <!-- El único «Empezar de nuevo»: había otro en la cabecera de la
             lección y un tercero en Texto propio. -->
        <button type="button" class="btn-intento" onclick={reiniciarLeccion}>
          Empezar de nuevo
        </button>
        <button
          type="button"
          class="btn-intento"
          onclick={alternarPausa}
          aria-pressed={pausado}
          title="También con Esc mientras escribes"
        >
          {pausado ? 'Reanudar' : 'Pausar'}
        </button>
      </div>

      <!-- Se pueden ocultar en Ajustes: a quien le distraen o le agobian, el
           resultado se le sigue enseñando al terminar. -->
      {#if !prefs.ocultarMetricas}
        <dl class="metricas">
          <div title={QUE_ES_PPM}>
            <dt>Velocidad</dt>
            <dd>{ultimasStats.wpm}<small aria-hidden="true">ppm</small><span class="sr-only"> palabras por minuto</span></dd>
          </div>
          <div><dt>Precisión</dt><dd>{ultimasStats.accuracy}<small>%</small></dd></div>
          <div><dt>Avance</dt><dd>{ultimasStats.typed}<small>/{textoObjetivo.length}</small></dd></div>
        </dl>
      {/if}
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
        onclick={() => { verProgreso = !verProgreso; settingsOpen = false; verTemario = false; }}
      >
        Progreso
      </button>
      <button
        aria-expanded={settingsOpen}
        aria-controls="panel-dialogo"
        onclick={() => { settingsOpen = !settingsOpen; verProgreso = false; verTemario = false; }}
      >
        Ajustes
      </button>
    </div>
  </header>

  <main class="escena">
    {#if vista === 'perfil'}
      <div class="centrado">
        <QuienPractica
          {perfiles}
          onElegir={(id) => abrirPerfil(id, true)}
          onCrear={async (alias) => { await abrirPerfil((await crearPerfil(alias)).id, true); }}
        />
      </div>
    {:else if !progresoCargado}
      <p class="note" role="status">Cargando progreso…</p>
    {:else if vista === 'tono'}
      <div class="centrado primera">
        <TamanoTexto id="tamano-inicio" escala={prefs.escala}
                     onCambiar={(escala) => (prefs = { ...prefs, escala })} />
        <SelectorTono onElegir={elegirTono} />
      </div>
    {:else if vista === 'cero'}
      <LeccionCero {layout} onTerminar={() => pick(0)} />
    {:else if vista === 'continua'}
      <div class="barra-practica">
        <label for="selector-nivel-practica">Vocabulario desbloqueado hasta:</label>
        <select id="selector-nivel-practica" bind:value={nivelElegido}>
          {#each LESSONS.slice(0, maxDesbloqueado + 1) as l, i}
            <option value={i}>{i + 1}. {l.title}</option>
          {/each}
        </select>
        <button onclick={() => nuevaContinua(nivelElegido)}>Nuevo texto</button>
      </div>
      {#key continuaKey}
        <Drill
          bind:this={drill}
          {layout}
          activo={!panelAbierto && !result}
          {pausado}
          onPausar={pausar}
          onReanudar={reanudar}
          ignorarRepeticion={prefs.ignorarRepeticion}
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
    {:else if vista === 'colocacion'}
      {#key colocacionKey}
        <PruebaColocacion
          lecciones={LESSONS}
          desde={maxDesbloqueado}
          {layout}
          onTramo={guardarTramo}
          onSeguir={(i) => void pick(i)}
          activo={!panelAbierto && !result}
          {pausado}
          onPausar={pausar}
          onReanudar={reanudar}
          {dominios}
          espacioJusto={prefs.escala >= 1.4}
          movimiento={prefs.movimiento}
          ignorarRepeticion={prefs.ignorarRepeticion}
          onTecla={anotarTecla}
          onStats={(s) => (ultimasStats = s)}
        />
      {/key}
    {:else if vista === 'fluidez'}
      {#key fluidezKey}
        <Drill
          bind:this={drill}
          {layout}
          activo={!panelAbierto && !result}
          {pausado}
          onPausar={pausar}
          onReanudar={reanudar}
          ignorarRepeticion={prefs.ignorarRepeticion}
          target={textoFluidez}
          titulo="Fluidez"
          explicacion={explicacionFluidez(ritmoFluidez)}
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
        <section class="centrado editor-propio" aria-labelledby="propio-tit">
          <p class="antetitulo">Práctica libre · Texto propio</p>
          <h2 id="propio-tit">Práctica libre con texto propio</h2>
          <p class="descripcion" id="propio-desc">Escribe o pega el texto que desees practicar. Se utilizarán las teclas disponibles en la distribución activa.</p>
          <label for="texto-propio-input" class="sr-only">Texto personalizado</label>
          <textarea
            id="texto-propio-input"
            class="input-texto-propio"
            rows="5"
            aria-describedby="propio-desc"
            bind:value={textoPropio}
            placeholder="Escribe o pega aquí tu propio texto..."
          ></textarea>
          {#if errorTextoPropio}
            <p class="nota aviso aviso-error" role="alert">{errorTextoPropio}</p>
          {/if}
          <div class="acciones-propio">
            <span class="contador">
              {textoPropio.length === 1 ? '1 carácter' : `${textoPropio.length} caracteres`}
            </span>
            <button class="primario" onclick={empezarTextoPropio}>Empezar a teclear</button>
          </div>
        </section>
      {:else}
        <div class="barra-practica">
          <span>Practicando tu propio texto ({textoPropioActivo.length} caracteres)</span>
          <button onclick={() => { enEdicionPropio = true; }}>Cambiar texto</button>
          {#if avisoTextoPropio}
            <p class="aviso-quitados" role="status">{avisoTextoPropio}</p>
          {/if}
        </div>
        {#key propioKey}
          <Drill
            bind:this={drill}
            {layout}
            activo={!panelAbierto && !result}
            {pausado}
            onPausar={pausar}
            onReanudar={reanudar}
            ignorarRepeticion={prefs.ignorarRepeticion}
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
          activo={!panelAbierto && !result}
          {pausado}
          onPausar={pausar}
          onReanudar={reanudar}
          ignorarRepeticion={prefs.ignorarRepeticion}
          target={textoLeccion}
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
      oncancel={(e) => { e.preventDefault(); again(); }}
    >
      <!-- Una sola región viva en todo el diálogo: anidar otra (en el
           <dialog> o en el aviso de guardado) hacía que el lector anunciase
           lo mismo dos veces. -->
      <div
        class="resultado"
        class:record={result.record}
        class:celebra={result.record && prefs.tono === 'juego'}
        aria-live="polite"
      >
        <strong id="resultado-titulo">
          {#if result.record}★ {/if}{textosRes?.titulo}
        </strong>
        <div id="resultado-desc">
          <span>{result.stats.wpm} palabras por minuto, {result.stats.accuracy}% de precisión.</span>
          <span class="animo">{textosRes?.animo}</span>
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
        {#if vista === 'leccion' && !leccionPersonalizada && !superadas.has(lesson.id)}
          <p class="note">{voz.horizonte}</p>
        {/if}
        {#if result.costaron.length > 0}
          <p class="note costaron">
            {voz.costaron} {enumerar(result.costaron.map((t) => t.nombre))}. {voz.costaronAnimo}
          </p>
        {/if}
        {#if vista === 'fluidez' && valoracionFluidez}
          <p class="note">{valoracionFluidez}</p>
        {/if}
        {#if result.sinMirar && result.sinMirar.length > 0}
          <p class="note logro">
            {result.sinMirar.length === 1 ? 'Ya escribes sin mirar la tecla' : 'Ya escribes sin mirar las teclas'}
            {result.sinMirar.map((c) => `«${c}»`).join(', ')}{prefs.ayudaTeclado === 'auto'
              ? (result.sinMirar.length === 1 ? ': su letra deja el teclado de la pantalla.' : ': sus letras dejan el teclado de la pantalla.')
              : '.'}
          </p>
        {/if}
        {#if errorGuardado}
          <p class="note">No se pudo guardar el resultado. El avance de este intento solo estará disponible durante esta sesión.</p>
        {/if}
        <div class="botones">
          {#if result.stats.accuracy < 90}
            <button class="primario" onclick={again}>{voz.repetir}</button>
            {#if vista === 'continua'}
              <button onclick={() => nuevaContinua()}>Nuevo texto</button>
            {:else if vista === 'fluidez'}
              <button onclick={() => nuevaFluidez()}>Otra tanda</button>
            {:else if vista === 'propio'}
              <button onclick={() => { dialogoResultado?.close(); enEdicionPropio = true; result = null; }}>Cambiar texto</button>
            {:else if !leccionPersonalizada && lessonIx < maxDesbloqueado}
              <button onclick={() => pick(lessonIx + 1)}>{voz.siguiente}</button>
            {/if}
          {:else}
            <button onclick={again}>{voz.repetir}</button>
            {#if vista === 'continua'}
              <button class="primario" onclick={() => nuevaContinua()}>Nuevo texto</button>
            {:else if vista === 'fluidez'}
              <button class="primario" onclick={() => nuevaFluidez()}>Otra tanda</button>
            {:else if vista === 'propio'}
              <button class="primario" onclick={() => { dialogoResultado?.close(); enEdicionPropio = true; result = null; }}>Cambiar texto</button>
            {:else if !leccionPersonalizada && lessonIx < maxDesbloqueado}
              <button class="primario" onclick={() => pick(lessonIx + 1)}>{voz.siguiente}</button>
            {/if}
          {/if}
        </div>
        {#if vista === 'leccion' && !leccionPersonalizada && leccionesOxidadas(sesiones, undefined, lesson.id).length > 0}
          <p class="note">{voz.repaso} Puedes practicar a tu ritmo con vocabulario conocido.</p>
          <button onclick={() => { vista = 'continua'; nuevaContinua(maxDesbloqueado); }}>Repasar con práctica continua</button>
        {/if}
        {#if result.refuerzo}
          {@const refuerzo = result.refuerzo}
          <p class="note">{voz.refuerzo}</p>
          <button onclick={() => practicarRefuerzo(refuerzo)}>Practicar las teclas que más cuestan</button>
        {/if}
      </div>
    </dialog>
  {/if}

  <RecordatorioPausa
    minutos={prefs.recordatorioPausa}
    practicando={(enPractica || vista === 'colocacion') && !pausado && !panelAbierto && !result}
  />

  {#if panelAbierto}
    <dialog
      id="panel-dialogo"
      class="panel"
      class:ancho={verTemario}
      bind:this={dialogoPanel}
      use:abrirDialogo
      aria-label={settingsOpen ? 'Ajustes' : verTemario ? 'Temario' : 'Progreso'}
      oncancel={(e) => { e.preventDefault(); cerrarPanel(); }}
    >
      <div class="panel-cab">
        <h2>{settingsOpen ? 'Ajustes' : verTemario ? 'Temario' : voz.progreso}{#if verProgreso && !settingsOpen && perfiles.length > 1} · {aliasActivo}{/if}</h2>
        <button onclick={cerrarPanel}>Cerrar</button>
      </div>

      <div class="panel-cuerpo">
        {#if settingsOpen}
          <div class="field">
            <TamanoTexto escala={prefs.escala} conDeslizador
                         onCambiar={(escala) => (prefs = { ...prefs, escala })} />
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
            <span id="contraste-l">Contraste</span>
            <div class="group" role="group" aria-labelledby="contraste-l">
              {#each [['auto', 'Sistema'], ['normal', 'Normal'], ['alto', 'Alto']] as [v, l] (v)}
                <button aria-pressed={prefs.contraste === v}
                        onclick={() => (prefs = { ...prefs, contraste: v as Preferencias['contraste'] })}>
                  {l}
                </button>
              {/each}
            </div>
            <p class="note">
              «Alto» pone negro sobre blanco (o al revés con el tema oscuro) y
              bordes marcados. En «Sistema» se activa solo si tu equipo pide más
              contraste.
            </p>
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
            <span id="metricas-l">Mientras practicas</span>
            <div class="group" role="group" aria-labelledby="metricas-l">
              <button aria-pressed={!prefs.ocultarMetricas}
                      onclick={() => (prefs = { ...prefs, ocultarMetricas: false })}>Ver velocidad y precisión</button>
              <button aria-pressed={prefs.ocultarMetricas}
                      onclick={() => (prefs = { ...prefs, ocultarMetricas: true })}>Ocultarlas</button>
            </div>
            <p class="note">
              Si ver los números a cada tecla te distrae o te agobia, puedes
              ocultarlos: al terminar se siguen enseñando. {QUE_ES_PPM}
            </p>
          </div>

          <div class="field">
            <span id="sonido-l">Sonido</span>
            <div class="group" role="group" aria-labelledby="sonido-l">
              <button aria-pressed={!prefs.sonido}
                      onclick={() => (prefs = { ...prefs, sonido: false })}>Sin sonido</button>
              <button aria-pressed={prefs.sonido}
                      onclick={() => { prefs = { ...prefs, sonido: true }; sonido.fin(prefs.volumen); }}>Con sonido</button>
            </div>
            {#if prefs.sonido}
              <label for="volumen">Volumen: {Math.round(prefs.volumen * 100)}%</label>
              <input id="volumen" type="range" min="0.1" max="1" step="0.1"
                     value={prefs.volumen}
                     oninput={(e) => (prefs = { ...prefs, volumen: +e.currentTarget.value })}
                     onchange={() => sonido.acierto(prefs.volumen)} />
            {/if}
            <p class="note">
              Un toque suave al acertar, una nota grave al fallar y un acorde al
              terminar. Se genera en el equipo: no descarga nada.
            </p>
          </div>

          <div class="field">
            <span id="longitud-l">Longitud de los textos de práctica</span>
            <div class="group" role="group" aria-labelledby="longitud-l">
              {#each [['corto', 'Cortos'], ['normal', 'Normales'], ['largo', 'Largos']] as [v, l] (v)}
                <button aria-pressed={prefs.longitudTexto === v}
                        onclick={() => (prefs = { ...prefs, longitudTexto: v as Preferencias['longitudTexto'] })}>
                  {l}
                </button>
              {/each}
            </div>
            <p class="note">Cortos si cansa llegar al final; largos para coger ritmo.</p>
          </div>

          <div class="field">
            <span id="pausa-l">Recordarme descansar</span>
            <div class="group" role="group" aria-labelledby="pausa-l">
              {#each MINUTOS_PAUSA as m (m)}
                <button aria-pressed={prefs.recordatorioPausa === m}
                        onclick={() => (prefs = { ...prefs, recordatorioPausa: m })}>
                  {m === 0 ? 'No' : `Cada ${m} min`}
                </button>
              {/each}
            </div>
            <p class="note">Un aviso en una esquina, que no interrumpe ni se lleva el foco.</p>
          </div>

          <div class="field">
            <span id="temblor-l">Si a veces una tecla se repite sin querer</span>
            <div class="group" role="group" aria-labelledby="temblor-l">
              <button aria-pressed={!prefs.ignorarRepeticion}
                      onclick={() => (prefs = { ...prefs, ignorarRepeticion: false })}>Contar todo</button>
              <button aria-pressed={prefs.ignorarRepeticion}
                      onclick={() => (prefs = { ...prefs, ignorarRepeticion: true })}>Ignorar repeticiones muy rápidas</button>
            </div>
            <p class="note">
              Con temblor, el dedo puede rebotar y escribir dos veces la misma
              letra. Esto ignora la segunda si llega casi a la vez. Para algo más
              completo, el sistema tiene «teclas de rebote» (o «teclas lentas»):
              en Windows, en Configuración › Accesibilidad › Teclado; en macOS,
              en Ajustes del Sistema › Accesibilidad › Teclado; en GNOME, en
              Configuración › Accesibilidad › Escritura; en KDE, en Preferencias
              del sistema › Accesibilidad › Filtros de teclado.
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
                {#if gestorDelSistema === 'politica'}
                  Quien administra este equipo ha desactivado las
                  actualizaciones automáticas: se encarga de instalar las
                  versiones nuevas. La aplicación no consulta nada por internet.
                {:else}
                  LibreType se instaló con
                  {gestorDelSistema === 'deb' ? 'apt' : 'dnf'}, así que las
                  actualizaciones llegan con las del resto del sistema. La
                  aplicación no las descarga por su cuenta ni consulta nada por
                  internet.
                {/if}
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
        {:else if verTemario}
          <Temario
            lecciones={LESSONS}
            {sesiones}
            modo={leccionPersonalizada ? null : modoActual}
            leccionActual={lessonIx}
            onLeccion={(i) => void pick(i)}
            onModo={(m) => void elegirModo(m)}
          />
        {:else}
          <Progreso
            {sesiones}
            lecciones={LESSONS}
            {tipoAlmacen}
            {errorAlmacen}
            {almacen}
            {teclas}
            {layout}
            onBorrar={borrarProgreso}
            onExportar={exportarProgreso}
            onImportar={importarProgreso}
            onPracticarRefuerzo={practicarRefuerzo}
          />
          <Perfiles
            {perfiles}
            activo={perfilActivo}
            onCambiar={cambiarPerfil}
            onCrear={async (alias) => { await crearPerfil(alias); }}
            onRenombrar={renombrarPerfil}
            onBorrar={borrarPerfil}
          />
          <Informe alias={aliasActivo} {sesiones} {teclas} />
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

  /* El botón del temario sustituye a los diez botones que ocupaban dos filas
     y al <select> que vino después. Dice dónde estás sin tener que abrirlo. */
  .btn-temario {
    flex: 1 1 260px;
    min-width: 0;
    min-height: var(--target-min);
    display: flex;
    align-items: center;
    gap: var(--space-2);
    text-align: left;
    padding: 0 var(--space-3);
  }
  .btn-temario .eti { font-weight: 700; }
  .btn-temario .actual {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    color: var(--fg-muted);
  }
  .btn-temario .actual::before { content: '·'; margin-right: var(--space-2); }
  #layout {
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
  .primera { display: grid; gap: var(--space-6); }

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
    min-height: 0;
    max-height: 100%;
    overflow-y: auto;
    max-width: 46ch;
    padding: var(--space-6);
    background: var(--surface);
    border: 2px solid var(--ok);
    border-radius: var(--radius);
    box-shadow: 0 12px 40px rgb(0 0 0 / 0.28);
  }
  #resultado-desc { display: grid; gap: var(--space-1); }
  /* El logro se distingue por el texto y el borde, no solo por el color. */
  .logro { color: var(--fg); border-left: 4px solid var(--ok); padding-left: var(--space-2); }
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
  /* El temario necesita más ancho para que las tarjetas vayan de dos en dos. */
  .panel.ancho { width: min(46rem, 100%); }
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
    border: 1px solid var(--border-strong);
    border-radius: var(--radius);
    background: var(--surface);
    color: var(--fg);
  }
  .barra-practica button {
    min-height: var(--target-min);
  }
  .aviso-quitados {
    flex-basis: 100%;
    margin: 0;
    padding: var(--space-1) var(--space-3);
    background: var(--pending-bg);
    color: var(--pending);
    border-left: 4px solid var(--pending);
    border-radius: 0 var(--radius) var(--radius) 0;
  }
  /* --- Editor de texto propio: una tarjeta centrada ---------------------- */
  .editor-propio {
    display: grid;
    gap: var(--space-3);
    width: min(47.5rem, 100%);
    max-width: none;
    padding: var(--space-6);
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 1.25rem;
  }
  .editor-propio .antetitulo {
    margin: 0;
    font-size: var(--text-sm);
    font-weight: 700;
    color: var(--accent-ink);
  }
  .editor-propio h2 {
    margin: 0;
    font-size: var(--text-xl);
    line-height: 1.2;
  }
  .editor-propio .descripcion {
    margin: 0;
    font-size: calc(1.0625rem * var(--ui-scale));
    color: var(--fg-muted);
  }
  /* El campo se ve como campo aunque no tenga el foco: borde de acento. Al
     enfocarlo gana un halo, además del contorno de foco de siempre. */
  .input-texto-propio {
    width: 100%;
    min-height: calc(7.5rem * var(--ui-scale));
    font-family: var(--font-drill);
    font-size: calc(1.25rem * var(--ui-scale));
    line-height: 1.6;
    padding: var(--space-3) var(--space-4);
    border: 2px solid var(--accent);
    border-radius: 0.75rem;
    background: var(--surface);
    color: var(--fg);
    resize: vertical;
  }
  .input-texto-propio:focus { box-shadow: 0 0 0 4px var(--accent-soft); }
  .input-texto-propio::placeholder { color: var(--fg-muted); }
  .editor-propio .aviso-error {
    margin: 0;
    padding: var(--space-2) var(--space-3);
    border-left: 4px solid var(--error);
    background: var(--error-bg);
    color: var(--fg);
    border-radius: 0 0.75rem 0.75rem 0;
  }
  .acciones-propio {
    display: flex;
    align-items: center;
    justify-content: space-between;
    flex-wrap: wrap;
    gap: var(--space-3);
  }
  .contador {
    font-size: var(--text-sm);
    color: var(--fg-muted);
    font-variant-numeric: tabular-nums;
  }
  .acciones-propio .primario {
    min-height: calc(var(--target-min) + 0.25rem);
    padding-inline: var(--space-6);
    font-weight: 700;
    border-radius: 0.75rem;
    box-shadow: 0 3px 0 var(--accent-deep);
  }
</style>
