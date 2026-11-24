<script lang="ts">
  import { onMount, tick } from 'svelte';
  import Drill from './lib/components/Drill.svelte';
  import EditorTextoPropio from './lib/components/EditorTextoPropio.svelte';
  import Informe from './lib/components/Informe.svelte';
  import LeccionCero from './lib/components/LeccionCero.svelte';
  import LeccionesPropias from './lib/components/LeccionesPropias.svelte';
  import PanelAjustes from './lib/components/PanelAjustes.svelte';
  import Perfiles from './lib/components/Perfiles.svelte';
  import Progreso from './lib/components/Progreso.svelte';
  import PruebaColocacion from './lib/components/PruebaColocacion.svelte';
  import QuienPractica from './lib/components/QuienPractica.svelte';
  import RecordatorioPausa from './lib/components/RecordatorioPausa.svelte';
  import ResultadoLeccion, { type Accion } from './lib/components/ResultadoLeccion.svelte';
  import SelectConfirmado from './lib/components/SelectConfirmado.svelte';
  import SelectorLeccion from './lib/components/SelectorLeccion.svelte';
  import SelectorTono from './lib/components/SelectorTono.svelte';
  import TamanoTexto from './lib/components/TamanoTexto.svelte';
  import { escucharAtajosTamano } from './lib/tamano';
  import { obtenerLayout } from './lib/keyboard/layouts';
  import { catalogo } from './lib/lecciones/catalogo';
  import { ejercicioDe, resolverLeccion, type Seleccion } from './lib/lecciones/ejercicio';
  import { inicioDeColocacion, trasTramo, type Colocacion } from './lib/lecciones/colocacion';
  import { generarTanda, ritmoReferencia, valorarTanda } from './lib/lecciones/fluidez';
  import { semillaNueva, textoDeIntento } from './lib/lecciones/generador';
  import { cuentaParaDominio, esIdPropio } from './lib/lecciones/ids';
  import { LIMITES, type Borrador, type LeccionPropia } from './lib/lecciones/personalizadas';
  import { caracteresEscribibles, normalizarTextoLibre } from './lib/lecciones/texto';
  import { generarRefuerzoDeTeclas, type EjercicioRefuerzo } from './lib/refuerzo';
  import { anotarFallo, enumerar, nombreTecla, teclasConMasFallos, type TeclaConFallos } from './lib/fallos';
  import { recienDominadas } from './lib/storage/comparacion';
  import type { Stats } from './lib/keyboard/engine';
  import {
    contarDominadas, mapaDeDominio, registrar, type EstadoTecla,
  } from './lib/keyboard/dominio';
  import {
    abrirAlmacen, buscarPerfil, cargarDatos, PERFIL_PRINCIPAL,
    type Almacen, type ModoImportacion, type Perfil, type ResultadoRestauracion,
  } from './lib/storage/almacen';
  import { leerPolitica } from './lib/politica';
  import { leccionesOxidadas } from './lib/storage/repaso';
  import { esRecord, resumirLecciones, type Sesion } from './lib/storage/progreso';
  import { leccionesSuperadas, OBJETIVO_PENDIENTE } from './lib/storage/objetivos';
  import {
    aplicar, cargar, guardar as guardarPrefs, PALABRAS_POR_LONGITUD, palabrasPorTexto, POR_DEFECTO,
    type Preferencias, type Tono,
  } from './lib/preferencias';
  import { QUE_ES_PPM, vozDe } from './lib/voz';
  import { crearSonido } from './lib/sonido';
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

  /** Sintetizado con WebAudio y apagado por defecto: ver `lib/sonido.ts`. */
  const sonido = crearSonido();

  /** Solo hay un panel superpuesto a la vez. */
  let panel = $state<'ajustes' | 'progreso' | 'lecciones' | null>(null);
  /** Restaurando una copia: el panel que dirá cómo ha ido no se puede cerrar. */
  let importando = $state(false);
  /** Con qué se abre el formulario de «Tus lecciones», si viene de otro sitio. */
  let borradorPanel = $state<Partial<Borrador> | null>(null);

  let layout = $state(obtenerLayout(prefsIniciales.layout));
  let leccionId = $state(catalogo.primera.id);
  let refuerzo = $state<EjercicioRefuerzo | null>(null);
  /**
   * Texto del intento en curso cuando no es el revisado a mano: a partir del
   * segundo intento de una lección del temario se genera uno nuevo cada vez
   * (`lecciones/generador.ts`). `null` es el texto de la lección.
   */
  let textoIntento = $state<string | null>(null);
  let numIntento = $state(0);
  let progresoCargado = $state(false);
  let errorGuardado = $state(false);
  let pausado = $state(false);
  let drill = $state<ReturnType<typeof Drill> | null>(null);
  let result = $state<{ stats: Stats; record: boolean; costaron: TeclaConFallos[]; logro: string } | null>(null);
  /** Fallos por tecla del intento en curso; aparte del dominio, que es una media de semanas. */
  let fallosIntento = new Map<string, number>();
  let dialogoPanel = $state<HTMLDialogElement | null>(null);
  let panelLecciones = $state<ReturnType<typeof LeccionesPropias> | null>(null);
  const STATS_CERO: Stats = { wpm: 0, accuracy: 100, correct: 0, typed: 0, elapsedMs: 0 };
  /** Métricas en vivo, que ahora viven en la barra de arriba. */
  let ultimasStats = $state<Stats>(STATS_CERO);

  let almacen = $state<Almacen | null>(null);
  let sesiones = $state<Sesion[]>([]);
  /** Lecciones del alumno, lápidas incluidas: el histórico aún las nombra. */
  let propias = $state<LeccionPropia[]>([]);
  let tipoAlmacen = $state<'sqlite' | 'local'>('local');
  let errorAlmacen = $state(false);
  /**
   * 'perfil' pregunta quién practica y solo aparece con más de un perfil; 'tono' solo
   * la primera vez; 'cero' es la colocación de manos; el resto son formas de practicar.
   */
  let vista = $state<'perfil' | 'tono' | 'cero' | 'leccion' | 'continua' | 'propio' | 'fluidez' | 'colocacion'>('leccion');

  /** Los perfiles de este equipo y cuál está practicando. Ver `storage/almacen.ts`. */
  let perfiles = $state<Perfil[]>([]);
  let perfilActivo = $state(PERFIL_PRINCIPAL);
  const aliasActivo = $derived(perfiles.find((p) => p.id === perfilActivo)?.alias ?? '');

  /** La prueba de colocación en curso; solo cuenta mientras `vista` es 'colocacion'. */
  let colocacion = $state<Colocacion | null>(null);

  /** Tandas de fluidez: el texto, la clave para rehacer la práctica y el ritmo con el que se compara. */
  let textoFluidez = $state('');
  let fluidezKey = $state(0);
  let ritmoFluidez = $state<number | null>(null);

  /** Variables para Práctica continua (Issue #19) */
  let nivelPractica = $state(catalogo.primera.id);
  let textoContinua = $state(
    catalogo.textoPractica(catalogo.primera.id, palabrasPorTexto(prefsIniciales.longitudTexto)),
  );
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
  /** 'deb' o 'rpm' cuando el paquete lo gestiona apt o dnf, y 'politica' cuando lo apagó quien administra el equipo. */
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
  const voz = $derived(vozDe(prefs.tono));

  /** Lo que se está tecleando, venga de donde venga. */
  const seleccion = $derived<Seleccion>(
    vista === 'continua'
      ? { tipo: 'continua', hasta: nivelPractica, texto: textoContinua, intento: continuaKey }
      : vista === 'colocacion' && colocacion
        ? { tipo: 'colocacion', id: colocacion.actual, tramo: colocacion.abiertas + 1 }
      : vista === 'fluidez'
        ? { tipo: 'fluidez', texto: textoFluidez, intento: fluidezKey, referencia: ritmoFluidez }
      : vista === 'propio'
        ? { tipo: 'libre', texto: textoPropioActivo, intento: propioKey }
        : refuerzo
          ? { tipo: 'refuerzo', ejercicio: refuerzo }
          : { tipo: 'leccion', id: leccionId, texto: textoIntento, intento: numIntento },
  );
  const ejercicio = $derived(ejercicioDe(seleccion, propias));
  /** Solo el temario habla de objetivos, desbloqueos y lección siguiente. */
  const enTemario = $derived(vista === 'leccion' && !refuerzo && catalogo.tiene(leccionId));
  const siguiente = $derived.by(() => {
    const s = enTemario ? catalogo.siguiente(leccionId) : undefined;
    return s && catalogo.estaDesbloqueada(s.id, superadas) ? s : undefined;
  });
  /** La captura está activa solo si hay algo que teclear y nada encima. */
  const practicando = $derived(
    vista === 'leccion' || vista === 'continua' || vista === 'fluidez'
      || (vista === 'propio' && !enEdicionPropio) || (vista === 'colocacion' && colocacion?.fase === 'tramo'),
  );
  /** Con la letra grande cada fila cuesta el doble: barra y lección se aprietan. */
  const compacta = $derived(prefs.escala >= 1.4);

  /** Cómo se sigue al terminar: cada tipo de ejercicio tiene el suyo, y ninguno es un callejón. */
  const avance = $derived.by<Accion | null>(() => {
    if (vista === 'continua') return { texto: 'Nuevo texto', onclick: () => void nuevaContinua() };
    if (vista === 'fluidez') return { texto: 'Otra tanda', onclick: () => void nuevaFluidez() };
    if (vista === 'propio') return { texto: 'Cambiar texto', onclick: cambiarTexto };
    if (refuerzo) return { texto: 'Volver a la lección', onclick: () => void elegirLeccion(leccionId) };
    if (siguiente) return { texto: voz.siguiente, onclick: () => void elegirLeccion(siguiente.id) };
    if (esIdPropio(leccionId)) return { texto: 'Tus lecciones', onclick: () => abrirDesdeResultado('lecciones') };
    return { texto: 'Ver tu progreso', onclick: () => abrirDesdeResultado('progreso') };
  });
  const notaResultado = $derived.by(() => {
    // La tanda se valora contra el ritmo de las anteriores, no contra una cifra.
    if (vista === 'fluidez') return result ? valorarTanda(result.stats.wpm, result.stats.accuracy, ritmoFluidez) : null;
    if (!enTemario) return null;
    if (!superadas.has(leccionId)) return OBJETIVO_PENDIENTE;
    return catalogo.siguiente(leccionId)
      ? 'Lección superada. Puedes pasar a la siguiente lección.'
      : 'Lección superada. Has completado el temario.';
  });
  const repasoResultado = $derived<Accion | null>(
    enTemario && leccionesOxidadas(sesiones, undefined, leccionId).length > 0
      ? { texto: 'Repasar con práctica continua', onclick: () => void activarContinua() }
      : null,
  );

  /** Las teclas del intento, dichas como en una frase, y un ejercicio hecho con ellas. */
  const costaronResultado = $derived(result ? enumerar(result.costaron.map((t) => t.nombre)) : '');
  const refuerzoResultado = $derived.by<Accion | null>(() => {
    if (!result || result.costaron.length === 0) return null;
    const ej = generarRefuerzoDeTeclas(result.costaron, superadas, layout, catalogo.cursoDe(leccionId)?.id);
    return ej ? { texto: voz.refuerzo, onclick: () => void practicarRefuerzo(ej) } : null;
  });

  onMount(async () => {
    try {
      const abierto = await abrirAlmacen();
      almacen = abierto;
      tipoAlmacen = abierto.tipo;
      errorAlmacen = Boolean(abierto.errorAlmacen);
      const elegido = await perfilDeArranque(abierto);
      // Con varios perfiles y sin nada que decida por la persona, se pregunta.
      if (elegido === null) vista = 'perfil';
      else await entrarConPerfil(elegido);
    } catch (err) {
      console.warn('[libretype] no se pudo preparar el progreso:', err);
    } finally {
      // Pase lo que pase: no poder practicar es peor que perder el histórico.
      progresoCargado = true;
    }
  });

  /**
   * Con qué perfil se abre, o `null` si hay que preguntarlo. La política del
   * equipo manda (crea el perfil si no existe); con uno solo no hay nada que
   * preguntar; y en el respaldo, con SQLite caído, se sigue con el último usado:
   * los perfiles de verdad están en la base de datos que no se ha podido abrir.
   */
  async function perfilDeArranque(a: Almacen): Promise<number | null> {
    if (a.errorAlmacen) return prefs.perfil;
    perfiles = await a.listarPerfiles();
    const { perfilPorDefecto } = await leerPolitica();
    if (perfilPorDefecto) {
      const existente = buscarPerfil(perfiles, perfilPorDefecto);
      if (existente) return existente.id;
      try {
        const creado = await a.crearPerfil(perfilPorDefecto);
        perfiles = await a.listarPerfiles();
        return creado.id;
      } catch (err) {
        console.warn('[libretype] no se pudo crear el perfil de la política:', err);
      }
    }
    return perfiles.length > 1 ? null : (perfiles[0]?.id ?? PERFIL_PRINCIPAL);
  }

  /**
   * Carga lo de ese perfil y lo deja listo para practicar. Sirve al arrancar y al
   * cambiar de perfil: lo que hubiera a medias era de otra persona y no cuenta.
   */
  async function entrarConPerfil(id: number): Promise<void> {
    if (!almacen) return;
    soltarIntento();
    refuerzo = null;
    almacen.usarPerfil(id);
    const datos = await cargarDatos(almacen);
    almacen = datos.almacen;
    tipoAlmacen = datos.almacen.tipo;
    errorAlmacen = Boolean(datos.almacen.errorAlmacen);
    perfilActivo = id;
    sesiones = datos.sesiones;
    propias = datos.propias;
    teclas = datos.teclas;
    teclasBase = new Map(teclas);
    // `ultimaLeccion` es del último perfil que practicó aquí: a otro no le dice nada.
    const guardada = prefs.perfil === id ? prefs.ultimaLeccion : undefined;
    if (prefs.perfil !== id) prefs = { ...prefs, perfil: id };
    fijarLeccion(resolverLeccion(guardada, leccionesSuperadas(sesiones), propias, layout));

    // Primera vez: primero cómo quiere la aplicación, luego dónde van las
    // manos. Nunca soltarle un ejercicio a alguien que no ha tecleado nunca.
    if (prefs.tono === null) vista = 'tono';
    else if (sesiones.length === 0) vista = 'cero';
    else vista = 'leccion';
  }

  async function cambiarDePerfil(id: number): Promise<void> {
    await entrarConPerfil(id);
    await tick();
    drill?.restart();
    drill?.enfocar();
  }

  /** Desde «¿Quién practica?»: quien no está en la lista se añade y entra. */
  async function crearYEntrar(alias: string): Promise<void> {
    if (!almacen) return;
    const creado = await almacen.crearPerfil(alias);
    perfiles = await almacen.listarPerfiles();
    await entrarConPerfil(creado.id);
  }

  async function crearPerfil(alias: string): Promise<void> {
    if (!almacen) return;
    await almacen.crearPerfil(alias);
    perfiles = await almacen.listarPerfiles();
  }

  async function renombrarPerfil(id: number, alias: string): Promise<void> {
    if (!almacen) return;
    await almacen.renombrarPerfil(id, alias);
    perfiles = await almacen.listarPerfiles();
  }

  /** Si se borra el que está practicando, se sigue con el principal. */
  async function borrarPerfil(id: number): Promise<void> {
    if (!almacen) return;
    await almacen.borrarPerfil(id);
    perfiles = await almacen.listarPerfiles();
    if (id === perfilActivo) await cambiarDePerfil(PERFIL_PRINCIPAL);
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
      if (practicando && !result && !panel && ultimasStats.typed > 0) {
        pausado = true;
      }
    }
    window.addEventListener('blur', onWindowBlur);
    return () => window.removeEventListener('blur', onWindowBlur);
  });

  // Ctrl+ / Ctrl− / Ctrl+0 mueven --ui-scale y no el zoom del motor (ver lib/tamano.ts).
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
    if (prefs.sonido) {
      if (acierto) sonido.acierto(prefs.volumen);
      else sonido.fallo(prefs.volumen);
    }
    fallosIntento = anotarFallo(fallosIntento, code, acierto);
    if (!cuentaParaDominio(ejercicio.idSesion)) return;
    // Se muta un mapa nuevo para que Svelte lo vea cambiar.
    const m = new Map(teclas);
    m.set(code, registrar(m.get(code), acierto, ms));
    teclas = m;
  }

  /** Pocas se nombran; muchas de golpe se cuentan, que una lista de ocho no se lee. */
  function logroDe(codigos: readonly string[]): string {
    if (codigos.length === 0) return '';
    return codigos.length <= 4
      ? enumerar(codigos.map((code) => nombreTecla(code, layout)))
      : `${codigos.length} teclas nuevas`;
  }

  async function terminada(stats: Stats): Promise<void> {
    const idLeccion = ejercicio.idSesion;
    const sesion: Sesion = {
      leccion: idLeccion,
      ppm: stats.wpm,
      pctAcierto: stats.accuracy,
      aciertos: stats.correct,
      escritos: stats.typed,
      ms: Math.round(stats.elapsedMs),
      terminadaEn: new Date().toISOString(),
    };

    // Un tramo de la prueba de colocación no abre el diálogo de resultado: se
    // guarda como una sesión normal y se pasa al siguiente, o la prueba se para.
    if (vista === 'colocacion' && colocacion) {
      sesiones = [...sesiones, sesion];
      teclasBase = new Map(teclas);
      fallosIntento = new Map();
      ultimasStats = STATS_CERO;
      colocacion = trasTramo(colocacion, sesion);
      try {
        await almacen?.guardar(sesion);
        await almacen?.guardarTeclas(teclas);
      } catch (err) {
        console.warn('[libretype] no se pudo guardar el tramo:', err);
      }
      await tick();
      if (colocacion?.fase === 'tramo') drill?.enfocar();
      else document.querySelector<HTMLElement>('.prueba .primario')?.focus();
      return;
    }

    // Se calcula antes de guardar: después, la propia sesión ya sería la marca.
    const record = esRecord(porLeccion.get(idLeccion), sesion);
    errorGuardado = false;
    sesiones = [...sesiones, sesion];
    result = {
      stats, record,
      costaron: teclasConMasFallos(fallosIntento, 3, layout),
      // Contra lo guardado antes de este ejercicio: las que acaban de perder la letra.
      logro: logroDe(recienDominadas(teclasBase, teclas)),
    };
    fallosIntento = new Map();
    if (prefs.sonido) sonido.fin(prefs.volumen);
    // Este intento ya no se descarta aunque falle el guardado: al siguiente se reintenta.
    teclasBase = new Map(teclas);

    // Que falle el guardado no puede tumbar la práctica.
    // El dominio por tecla se persiste al terminar la lección, no en cada
    // pulsación: escribir en la base de datos sesenta veces por minuto no
    // aporta nada y se nota.
    try {
      await almacen?.guardar(sesion);
      await almacen?.guardarTeclas(teclas);
    } catch (err) {
      errorGuardado = true;
      console.warn('[libretype] no se pudo guardar la sesión:', err);
    }
  }

  async function exportarProgreso(): Promise<string> {
    if (!almacen) return "";
    return await almacen.exportar();
  }

  /**
   * El panel se queda abierto: es donde se dice cómo ha ido, y una operación que
   * sustituye todo el progreso no puede terminar sin ningún aviso. Lo de debajo se
   * pone al día sin llevarse el foco, que sigue en el panel.
   */
  async function importarProgreso(json: string, modo: ModoImportacion = 'sustituir'): Promise<ResultadoRestauracion | void> {
    if (!almacen) return;
    importando = true;
    try {
      let resultado: ResultadoRestauracion;
      try {
        resultado = await almacen.importar(json, modo);
      } catch (err) {
        // Las lecciones pueden haber quedado a medias: que se vea lo que hay en disco.
        await releerDelAlmacen();
        throw err;
      }
      await releerDelAlmacen();
      descartarIntento();
      refuerzo = null;
      fijarLeccion(resolverLeccion(leccionId, superadas, propias, layout));
      if (vista !== 'tono') vista = 'leccion';
      drill?.restart();
      return resultado;
    } finally {
      // Hasta aquí, no antes: mientras se relee, «Cerrar» enseñaría datos a medias.
      importando = false;
    }
  }

  async function releerDelAlmacen(): Promise<void> {
    if (!almacen) return;
    try {
      sesiones = await almacen.leerTodas();
      propias = await almacen.leerLecciones();
      teclas = await almacen.leerTeclas();
      teclasBase = new Map(teclas);
    } catch (err) {
      console.warn('[libretype] no se pudo releer el progreso:', err);
    }
  }

  async function borrarProgreso(): Promise<void> {
    await almacen?.borrarTodo();
    sesiones = [];
    propias = await almacen?.leerLecciones() ?? [];
    teclas = new Map();
    teclasBase = new Map();
    await elegirLeccion(catalogo.primera.id);
  }

  // Aplicar y guardar van juntos: un ajuste que no sobrevive a cerrar la app
  // deja fuera a quien depende de él.
  $effect(() => {
    aplicar(prefs, document.documentElement);
    guardarPrefs(prefs);
  });

  function fijarLeccion(id: string): void {
    leccionId = id;
    if (prefs.ultimaLeccion !== id) prefs = { ...prefs, ultimaLeccion: id };
    prepararTextoIntento();
  }

  /**
   * Decide el texto del intento que empieza. La primera vez, el revisado a mano;
   * si la lección ya se ha practicado, uno nuevo, para que el objetivo mida
   * destreza y no memoria. Se llama al entrar en una lección y al repetirla, no
   * al reiniciar a medias: ese sigue siendo el mismo intento.
   */
  function prepararTextoIntento(): void {
    const yaPracticada = porLeccion.has(leccionId);
    const texto = catalogo.tiene(leccionId)
      ? textoDeIntento(
        leccionId, yaPracticada, semillaNueva(),
        palabrasPorTexto(prefs.longitudTexto) / PALABRAS_POR_LONGITUD.normal,
      )
      : null;
    textoIntento = texto !== null && texto !== catalogo.leccion(leccionId)?.text ? texto : null;
    numIntento++;
  }

  /**
   * Lo que había a medias deja de contar. Si se abandona la lección antes de
   * terminarla, se preserva el estado persistido según AGENTS.md (el dominio solo
   * se persiste al terminar).
   */
  function descartarIntento(): void {
    cerrarResultado();
    if (!result) teclas = new Map(teclasBase);
    result = null;
    pausado = false;
    ultimasStats = STATS_CERO;
    fallosIntento = new Map();
  }

  /**
   * Abandona lo que hubiera a medias y cierra lo que hubiera encima. Cerrar antes de
   * sustituir la lección: WebKit restaura el foco del diálogo y, si el campo anterior
   * ya no existe, lo manda al documento.
   */
  function soltarIntento(): void {
    descartarIntento();
    dialogoPanel?.close();
    panel = null;
    borradorPanel = null;
  }

  /** Si la lección es la misma hace falta reiniciarla; si cambia, se monta de cero. */
  async function arrancarDrill(): Promise<void> {
    drill?.restart();
    await tick();
    drill?.enfocar();
  }

  async function elegirLeccion(id: string): Promise<void> {
    const abrible = catalogo.tiene(id)
      ? catalogo.estaDesbloqueada(id, superadas)
      : esIdPropio(id) && resolverLeccion(id, superadas, propias, layout) === id;
    if (!progresoCargado || !abrible) return;
    soltarIntento();
    refuerzo = null;
    fijarLeccion(id);
    vista = 'leccion';
    await arrancarDrill();
  }

  function alElegirEnSelector(valor: string): void {
    if (valor === 'cero') {
      soltarIntento();
      // Un refuerzo abandonado no se puede retomar: dejarlo en la lista sería una
      // opción que no hace nada al elegirla.
      refuerzo = null;
      vista = 'cero';
    } else if (valor === 'continua') void activarContinua();
    else if (valor === 'colocacion') abrirColocacion();
    else if (valor === 'fluidez') void nuevaFluidez();
    else if (valor === 'propio') void activarPropio();
    else if (valor === 'gestionar') abrirLecciones();
    else if (valor !== 'refuerzo') void elegirLeccion(valor);
  }

  async function abrirLecciones(borrador: Partial<Borrador> | null = null): Promise<void> {
    const sustituye = panel !== null;
    borradorPanel = borrador;
    panel = 'lecciones';
    if (!sustituye || borrador) return;
    // El diálogo sigue abierto y solo cambia lo de dentro: el botón pulsado se ha ido
    // y con él el foco, que caería al documento. El título, además, dice dónde se está.
    await tick();
    dialogoPanel?.querySelector<HTMLElement>('.panel-cab h2')?.focus();
  }

  async function activarContinua(): Promise<void> {
    soltarIntento();
    refuerzo = null;
    nivelPractica = catalogo.ultimaDisponible(superadas, catalogo.cursoDe(leccionId)?.id).id;
    textoContinua = catalogo.textoPractica(nivelPractica, palabrasPorTexto(prefs.longitudTexto));
    continuaKey++;
    vista = 'continua';
    await arrancarDrill();
  }

  async function nuevaContinua(): Promise<void> {
    soltarIntento();
    textoContinua = catalogo.textoPractica(nivelPractica, palabrasPorTexto(prefs.longitudTexto));
    continuaKey++;
    await arrancarDrill();
  }

  /** Enseña la tarjeta de la prueba de colocación; los tramos empiezan al pulsar su botón. */
  function abrirColocacion(): void {
    const inicio = inicioDeColocacion(superadas, catalogo.cursoDe(leccionId)?.id);
    if (!progresoCargado || inicio === null) return;
    soltarIntento();
    refuerzo = null;
    colocacion = { fase: 'antes', inicio, actual: inicio, abiertas: 0 };
    vista = 'colocacion';
  }

  async function empezarColocacion(): Promise<void> {
    if (!colocacion) return;
    colocacion = { ...colocacion, fase: 'tramo' };
    await tick();
    drill?.enfocar();
  }

  /** Al salir de la prueba, a la lección más avanzada que haya quedado abierta. */
  function seguirTrasColocacion(): void {
    void elegirLeccion(catalogo.ultimaDisponible(superadas, catalogo.cursoDe(colocacion?.inicio ?? leccionId)?.id).id);
  }

  /** Empieza o repite una tanda de fluidez con lo que hay abierto en el curso que se sigue. */
  async function nuevaFluidez(): Promise<void> {
    soltarIntento();
    refuerzo = null;
    const hasta = catalogo.ultimaDisponible(superadas, catalogo.cursoDe(leccionId)?.id).id;
    textoFluidez = generarTanda(hasta, palabrasPorTexto(prefs.longitudTexto));
    // Antes de esta tanda: después, ella misma ya contaría en su propia meta.
    ritmoFluidez = ritmoReferencia(sesiones);
    fluidezKey++;
    vista = 'fluidez';
    await arrancarDrill();
  }

  function elegirNivelPractica(id: string): void {
    nivelPractica = id;
    void nuevaContinua();
  }

  async function activarPropio(): Promise<void> {
    soltarIntento();
    refuerzo = null;
    vista = 'propio';
    if (textoPropioActivo && !enEdicionPropio) await arrancarDrill();
    else enEdicionPropio = true;
  }

  async function empezarTextoPropio(): Promise<void> {
    errorTextoPropio = '';
    if (!textoPropio.trim()) {
      errorTextoPropio = 'Todavía no hay nada que practicar. Escribe o pega un texto arriba.';
      return;
    }
    const limpio = normalizarTextoLibre(textoPropio, caracteresEscribibles(layout));
    if (!limpio) {
      errorTextoPropio = 'Este texto no tiene ningún carácter que se pueda teclear con tu teclado. Prueba con otro.';
      return;
    }
    // Cada letra es un nodo del DOM: un libro pegado entero deja la práctica sin respuesta.
    const caracteres = [...limpio].length;
    if (caracteres > LIMITES.textoMax) {
      errorTextoPropio = `Este texto tiene ${caracteres} caracteres y caben ${LIMITES.textoMax}. Prueba con un trozo.`;
      return;
    }
    textoPropioActivo = limpio;
    enEdicionPropio = false;
    propioKey++;
    ultimasStats = STATS_CERO;
    await arrancarDrill();
  }

  /** El resultado cierra su diálogo al desmontarse; esto lo hace antes, ver `soltarIntento`. */
  function cerrarResultado(): void {
    document.querySelector<HTMLDialogElement>('#dialogo-resultado')?.close();
  }

  /** El texto anterior se abandona: lo que tuviera a medias, en pausa o no, se va con él. */
  function cambiarTexto(): void {
    descartarIntento();
    enEdicionPropio = true;
  }

  function abrirDesdeResultado(cual: 'lecciones' | 'progreso'): void {
    cerrarResultado();
    result = null;
    // Al volver del panel no puede quedar una lección ya terminada y sin nada que hacer.
    void reiniciarLeccion();
    panel = cual;
  }

  async function again(): Promise<void> {
    cerrarResultado();
    if (!result) {
      teclas = new Map(teclasBase);
    }
    // Repetir tras terminar es otro intento: en el temario toca texto nuevo.
    if (result && enTemario) prepararTextoIntento();
    result = null;
    pausado = false;
    fallosIntento = new Map();
    drill?.restart();
    await tick();
    drill?.enfocar();
  }

  async function reiniciarLeccion(): Promise<void> {
    // Lo abandonado no cuenta, o se podría acumular dominio a base de reiniciar.
    teclas = new Map(teclasBase);
    pausado = false;
    ultimasStats = STATS_CERO;
    fallosIntento = new Map();
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

  /**
   * Esc desde el campo. Al pausar el campo se desactiva y el foco se iría al
   * documento: va a «Reanudar», para que Intro devuelva a la práctica.
   */
  async function pausarDesdeCampo(): Promise<void> {
    if (pausado) return;
    pausado = true;
    await tick();
    document.querySelector<HTMLElement>('.pausa-cartel button')?.focus();
  }

  async function practicarRefuerzo(ej: EjercicioRefuerzo): Promise<void> {
    soltarIntento();
    refuerzo = ej;
    vista = 'leccion';
    await arrancarDrill();
  }

  /**
   * Una personalizada ha cambiado. Si es la que está abierta, el `{#key}` vuelve a
   * montar la práctica con el texto nuevo, y el intento a medias ya no vale.
   */
  function alCambiarPropias(lista: LeccionPropia[]): void {
    const antes = ejercicio.clave;
    propias = lista;
    if (ejercicioDe(seleccion, lista).clave !== antes) {
      if (!result) teclas = new Map(teclasBase);
      ultimasStats = STATS_CERO;
    }
  }

  /** Si se borra la que estaba abierta, se vuelve a un sitio seguro sin cerrar el panel. */
  function alBorrarPropia(id: string): void {
    if (leccionId !== id) return;
    fijarLeccion(resolverLeccion(undefined, superadas, propias, layout));
    if (vista === 'leccion' && !refuerzo) pausado = false;
  }

  // El diálogo nativo lleva el foco al primer control, mantiene Tab dentro y
  // hace inerte el fondo. Al desmontarlo restaura el foco de quien lo abrió.
  function abrirDialogo(dialogo: HTMLDialogElement): { destroy: () => void } {
    dialogo.showModal();
    return { destroy: () => dialogo.close() };
  }

  function cambiarAjustes(cambios: Partial<Preferencias>): void {
    if (cambios.layout) layout = obtenerLayout(cambios.layout);
    prefs = { ...prefs, ...cambios };
  }

  /**
   * Chromium, y con él WebView2, deja de avisar con `cancel` tras varios Escape y
   * cierra el diálogo por su cuenta. Sin esto, `panel` seguiría abierto en un diálogo
   * que ya no es modal: fondo sin inertizar, Tab fuera y Escape sin efecto. Un cierre
   * nuestro también pasa por aquí, pero para entonces `panel` ya es null.
   */
  function alCerrarseDialogo(e: Event): void {
    const dialogo = e.currentTarget as HTMLDialogElement;
    if (!panel || dialogo !== dialogoPanel || dialogo.open) return;
    if (importando) dialogo.showModal();
    else if (panelLecciones && !panelLecciones.intentarCerrar()) dialogo.showModal();
    else void cerrarPanelYa();
  }

  /** Lo que se esté escribiendo en «Tus lecciones» no se pierde por un Escape. */
  async function cerrarPanel(): Promise<void> {
    if (panelLecciones && !panelLecciones.intentarCerrar()) return;
    await cerrarPanelYa();
  }

  async function cerrarPanelYa(): Promise<void> {
    // El resultado de restaurar una copia se dice en este panel: no puede irse antes.
    if (importando) return;
    dialogoPanel?.close();
    panel = null;
    borradorPanel = null;
    await tick();
    if (practicando) drill?.enfocar();
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
<div class="app" class:compacta>
  <header class="barra">
    <h1 class="logo">Libre<span class="logo-type">Type</span></h1>

    <!-- Antes de elegir el tono, o de saber quién practica, no hay nada que elegir
         aquí: se vería vacío. -->
    {#if vista !== 'tono' && vista !== 'perfil'}
      <SelectorLeccion
        valor={vista === 'leccion' ? (refuerzo ? 'refuerzo' : leccionId) : vista}
        deshabilitado={!progresoCargado}
        {superadas}
        {porLeccion}
        seguiaEn={sesiones.length > 0 ? prefs.ultimaLeccion : null}
        tituloRefuerzo={refuerzo?.titulo ?? null}
        {propias}
        onElegir={alElegirEnSelector}
      />
    {/if}

    {#if practicando}
      <div class="controles-intento">
        <button
          type="button"
          class="btn-barra btn-intento"
          onclick={reiniciarLeccion}
          aria-label="Reiniciar esta lección"
        >
          <!-- El icono acompaña al texto, no lo sustituye: «↺» a secas no lo
               entiende todo el mundo. -->
          <span class="ico ico-reiniciar" aria-hidden="true"></span>Reiniciar
        </button>
        <button
          type="button"
          class="btn-barra btn-intento"
          class:activo={pausado}
          onclick={alternarPausa}
          aria-label={pausado ? 'Reanudar lección' : 'Pausar lección'}
        >
          <span class="ico {pausado ? 'ico-seguir' : 'ico-pausa'}" aria-hidden="true"></span>{pausado ? 'Reanudar' : 'Pausar'}
        </button>
      </div>

      <!-- Quien se distrae o se agobia con los números puede quitarlos de la vista;
           el resultado se sigue enseñando al terminar. -->
      {#if !prefs.ocultarMetricas && vista !== 'colocacion'}
        <dl class="metricas">
          <div title={QUE_ES_PPM}><dt>Velocidad</dt><dd>{ultimasStats.wpm}<small>ppm</small></dd></div>
          <div><dt>Precisión</dt><dd>{ultimasStats.accuracy}<small>%</small></dd></div>
          <div><dt>Avance</dt><dd>{ultimasStats.typed}<small>/{ejercicio.texto.length}</small></dd></div>
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
              class="primario"
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
            <button class="primario" onclick={() => void actualizador?.reiniciar()}>
              Actualizar <small>y reiniciar</small>
            </button>
          {/if}
        </div>
      {/if}
      <button
        class="btn-barra contorno"
        aria-expanded={panel === 'progreso'}
        aria-controls="panel-dialogo"
        aria-haspopup="dialog"
        disabled={vista === 'perfil'}
        onclick={() => { panel = panel === 'progreso' ? null : 'progreso'; }}
      >
        Progreso
      </button>
      <button
        class="btn-barra contorno"
        aria-expanded={panel === 'ajustes'}
        aria-controls="panel-dialogo"
        aria-haspopup="dialog"
        onclick={() => { panel = panel === 'ajustes' ? null : 'ajustes'; }}
      >
        Ajustes
      </button>
    </div>
  </header>

  <main class="escena">
    {#if !progresoCargado}
      <p class="note" role="status">Cargando progreso…</p>
    {:else if vista === 'perfil'}
      <!-- También aquí el tamaño: es la primera pantalla de un equipo compartido. -->
      <div class="centrado primera">
        <TamanoTexto id="tamano-perfil" escala={prefs.escala}
                     onCambiar={(escala) => (prefs = { ...prefs, escala })} />
        <QuienPractica {perfiles} onElegir={(id) => void entrarConPerfil(id)} onCrear={crearYEntrar} />
      </div>
    {:else if vista === 'tono'}
      <!-- El tamaño va ya aquí: quien necesita la letra grande no puede tener que
           leer en pequeño para encontrar dónde se agranda. -->
      <div class="centrado primera">
        <TamanoTexto id="tamano-inicio" escala={prefs.escala}
                     onCambiar={(escala) => (prefs = { ...prefs, escala })} />
        <SelectorTono onElegir={elegirTono} />
      </div>
    {:else if vista === 'cero'}
      <!-- Quien ya practica ha venido a repasar: vuelve a lo suyo, sin perder el sitio. -->
      <LeccionCero
        {layout}
        textoTerminar={sesiones.length > 0 ? 'Volver a tu lección' : undefined}
        onTerminar={() => elegirLeccion(
          sesiones.length > 0 ? resolverLeccion(leccionId, superadas, propias, layout) : catalogo.primera.id,
        )}
      />
    {:else if vista === 'colocacion' && colocacion && colocacion.fase !== 'tramo'}
      {@const destino = catalogo.ultimaDisponible(superadas, catalogo.cursoDe(colocacion.inicio)?.id)}
      <PruebaColocacion
        fase={colocacion.fase}
        primera={catalogo.leccion(colocacion.inicio)?.title ?? ''}
        seguirEn={destino.title}
        abiertas={colocacion.abiertas}
        completo={inicioDeColocacion(superadas, catalogo.cursoDe(colocacion.inicio)?.id) === null}
        onEmpezar={empezarColocacion}
        onSeguir={seguirTrasColocacion}
      />
    {:else if vista === 'propio' && enEdicionPropio}
      <EditorTextoPropio
        bind:texto={textoPropio}
        error={errorTextoPropio}
        onEmpezar={empezarTextoPropio}
        onGuardarComoLeccion={() => abrirLecciones({ texto: textoPropio })}
      />
    {:else}
      {#if vista === 'continua'}
        <div class="barra-practica">
          <label for="selector-nivel-practica">Vocabulario desbloqueado hasta:</label>
          <SelectConfirmado
            id="selector-nivel-practica"
            valor={nivelPractica}
            pista="Pulsa Intro para usarlo · Esc para volver"
            onElegir={elegirNivelPractica}
          >
            {#each catalogo.lecciones.filter((l) => catalogo.estaDesbloqueada(l.id, superadas)) as l (l.id)}
              <option value={l.id}>{catalogo.indiceEnCurso(l.id) + 1}. {l.title}</option>
            {/each}
          </SelectConfirmado>
          <button onclick={() => nuevaContinua()}>Nuevo texto</button>
        </div>
      {:else if vista === 'propio'}
        <div class="barra-practica">
          <span>Practicando tu propio texto ({textoPropioActivo.length} caracteres)</span>
          <button onclick={cambiarTexto}>Cambiar texto</button>
        </div>
      {/if}
      {#key ejercicio.clave}
        <Drill
          bind:this={drill}
          {layout}
          activo={!panel && !result}
          {pausado}
          onReanudar={alternarPausa}
          onPausar={pausarDesdeCampo}
          ignorarRepeticion={prefs.ignorarRepeticion}
          target={ejercicio.texto}
          titulo={ejercicio.titulo}
          explicacion={ejercicio.explicacion}
          cobertura={ejercicio.cobertura}
          idioma={ejercicio.idioma}
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

  {#if result}
    <ResultadoLeccion
      stats={result.stats}
      record={result.record}
      celebra={result.record && prefs.tono === 'juego'}
      franja={prefs.tono === 'juego'}
      {voz}
      {avance}
      nota={notaResultado}
      {errorGuardado}
      repaso={repasoResultado}
      costaron={costaronResultado}
      refuerzoTeclas={refuerzoResultado}
      logro={result.logro}
      onRepetir={again}
    />
  {/if}

  <RecordatorioPausa
    minutos={prefs.recordatorioPausa}
    practicando={progresoCargado && practicando && !pausado && !panel && !result}
  />

  {#if panel}
    <!-- El <dialog> ocupa la ventana y pinta el velo; la caja va centrada
         encima. Así el velo no depende de que ::backdrop herede los tokens. -->
    <dialog
      id="panel-dialogo"
      class="panel"
      bind:this={dialogoPanel}
      use:abrirDialogo
      aria-label={panel === 'ajustes' ? 'Ajustes' : panel === 'lecciones' ? 'Tus lecciones' : 'Progreso'}
      oncancel={(e) => { e.preventDefault(); cerrarPanel(); }}
      onclose={alCerrarseDialogo}
    >
      <div class="panel-caja" class:caja-ajustes={panel === 'ajustes'} class:caja-lecciones={panel === 'lecciones'}>
      <div class="panel-cab">
        <!-- Con más de un perfil, el título dice de quién es lo que se enseña. -->
        <h2 tabindex="-1">{panel === 'ajustes' ? 'Ajustes' : panel === 'lecciones' ? 'Tus lecciones' : voz.progreso}{#if panel !== 'ajustes' && perfiles.length > 1 && aliasActivo}{' · '}{aliasActivo}{/if}</h2>
        <button onclick={cerrarPanel} disabled={importando}>Cerrar</button>
      </div>

      <div class="panel-cuerpo">
        {#if panel === 'lecciones'}
          <LeccionesPropias
            bind:this={panelLecciones}
            {almacen}
            lecciones={propias}
            {layout}
            {porLeccion}
            borradorInicial={borradorPanel}
            onCambio={alCambiarPropias}
            onBorrada={alBorrarPropia}
            onPracticar={elegirLeccion}
            onCerrar={cerrarPanelYa}
          />
        {:else if panel === 'ajustes'}
          <PanelAjustes
            {prefs}
            onCambiar={cambiarAjustes}
            layoutId={layout.id}
            {aprendidas}
            {gestorDelSistema}
            {actualizador}
            {estadoAct}
            onProbarSonido={(cual, volumen) => sonido[cual](volumen)}
          />
        {:else}
          <Progreso
            {sesiones}
            lecciones={catalogo.lecciones}
            leccionesPropias={propias}
            {tipoAlmacen}
            {errorAlmacen}
            {almacen}
            {teclas}
            cursoActual={catalogo.cursoDe(leccionId)?.id}
            {layout}
            onBorrar={borrarProgreso}
            onExportar={exportarProgreso}
            onImportar={importarProgreso}
            onPracticarRefuerzo={practicarRefuerzo}
            onGestionarLecciones={() => abrirLecciones()}
            onIrAPracticar={cerrarPanelYa}
            alias={perfiles.length > 1 ? aliasActivo : ''}
            leccionActual={vista === 'leccion' && !refuerzo ? leccionId : null}
            celebra={prefs.tono === 'juego'}
          />
          <!-- Con SQLite caído los perfiles de verdad no se pueden leer: no se gestionan. -->
          {#if !errorAlmacen && perfiles.length > 0}
            <Perfiles
              {perfiles}
              activo={perfilActivo}
              onCambiar={(id) => void cambiarDePerfil(id)}
              onCrear={crearPerfil}
              onRenombrar={renombrarPerfil}
              onBorrar={borrarPerfil}
            />
          {/if}
          <Informe alias={aliasActivo || 'este equipo'} {sesiones} {teclas} />
        {/if}
      </div>
      </div>
    </dialog>
  {/if}
</div>

<style>
  /* Altura fija de ventana: nada de scroll de página. Lo que no cabe se
     encoge (el teclado) o se desplaza dentro de su propia caja (el texto).

     `clip` y no solo `hidden`: una caja con `hidden` no se desplaza con la rueda
     pero sí por programa, y enfocar un campo fuera de vista la movía. Los campos de
     captura cuelgan de aquí, así que al enfocarlos con la letra al 200% se iba la
     barra, y en la lección cero la pantalla se quedaba en blanco y sin salida.
     `hidden` queda de respaldo para los motores que no conocen `clip`. */
  .app {
    height: 100dvh;
    display: grid;
    grid-template-rows: auto minmax(0, 1fr);
    overflow: hidden;
    overflow: clip;
    position: relative;
  }

  .barra {
    display: flex;
    align-items: center;
    gap: var(--space-2) var(--space-3);
    flex-wrap: wrap;
    padding: var(--space-2) var(--space-4);
    border-bottom: 1px solid var(--border);
    background: var(--surface);
  }
  .logo {
    margin: 0;
    font-size: var(--text-cifra);
    font-weight: 700;
    letter-spacing: -0.01em;
    white-space: nowrap;
  }
  /* Solo el color separa «Type», pero no comunica nada: es la marca. */
  .logo-type { color: var(--accent-ink); }

  /* Las métricas van en bloque, sobre fondo hundido. La barra no puede ganar
     altura con ello: aprietan el interlineado y caben en --target-min. */
  .metricas {
    display: flex;
    gap: var(--space-4);
    margin: 0;
    padding: calc(var(--space-1) / 2) var(--space-3);
    background: var(--surface-sunken);
    border-radius: var(--radius);
  }
  /* Ancho reservado: que las cifras crezcan no puede mover el resto de la barra. */
  .metricas div { display: flex; flex-direction: column; min-width: 5ch; }
  .metricas dt { font-size: var(--text-xs); color: var(--fg-muted); line-height: 1.1; }
  .metricas dd {
    margin: 0; font-size: var(--text-cifra); font-weight: 700; line-height: 1;
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
  }
  .metricas small { font-size: var(--text-xs); font-weight: 500; color: var(--fg-muted); }

  .controles-intento { display: flex; gap: var(--space-1); }
  .btn-intento {
    display: inline-flex;
    align-items: center;
    gap: var(--space-2);
    padding-inline: var(--space-3);
    white-space: nowrap;
  }
  /* Iconos dibujados con CSS y no con caracteres: así no entran en el nombre
     accesible ni en el textContent del botón. */
  .ico { display: inline-block; flex: none; width: 1em; height: 1em; }
  .ico-reiniciar::before {
    content: '↺';
    content: '↺' / '';
    display: block;
    font-size: 1.25em;
    line-height: 0.8;
    font-weight: 700;
  }
  .ico-pausa {
    width: 0.8em;
    border-left: 0.28em solid currentColor;
    border-right: 0.28em solid currentColor;
  }
  .ico-seguir {
    width: 0.8em;
    background: currentColor;
    clip-path: polygon(10% 0, 100% 50%, 10% 100%);
  }

  .acciones { display: flex; gap: var(--space-2); margin-left: auto; align-items: center; }

  /* El aviso de versión nueva vive con los demás botones de la barra y solo
     aparece cuando hay algo que hacer. Ocupa sitio en una barra que ya va
     justa, así que el texto es corto y el detalle va en el <small>. */
  .actualizacion { display: flex; align-items: center; }
  /* El principal (base.css), a la medida de la barra: sin el alto de más ni el
     canto, que aquí se lo quitarían al teclado. */
  .actualizacion button {
    white-space: nowrap;
    min-height: var(--target-min);
    padding-inline: var(--space-3);
    box-shadow: none;
  }
  /* El color no es lo que lo distingue: el texto ya dice qué hace. */
  .actualizacion small { font-size: var(--text-xs); opacity: 0.9; }
  .act-texto {
    font-size: var(--text-sm);
    color: var(--fg-muted);
    white-space: nowrap;
    font-variant-numeric: tabular-nums;
  }

  /* Sin la marca, la barra cabe en una fila a 1024 y deja sitio al aviso: la
     ventana ya dice cómo se llama la aplicación. Sigue en el árbol. */
  @media (max-width: 1100px) {
    .logo, .actualizacion small {
      position: absolute; width: 1px; height: 1px;
      overflow: hidden; clip-path: inset(50%);
    }
  }

  /* Letra grande: dos filas de barra como mucho. Fuera lo que se repite (la marca,
     las etiquetas de unas métricas que ya llevan su unidad, el relleno de los
     botones), porque cada píxel de aquí se lo quita al teclado. */
  .compacta .logo, .compacta .metricas dt {
    position: absolute; width: 1px; height: 1px;
    overflow: hidden; clip-path: inset(50%);
  }
  .compacta .barra { padding: calc(var(--space-1) / 2) var(--space-2); gap: calc(var(--space-1) / 2) var(--space-2); }
  .compacta .barra button { padding: 0 var(--space-3); }
  /* Dos filas siempre, no «las que quepan»: si dependiera del ancho de las métricas,
     pasar de 100% a 99% cambiaría la barra de altura a mitad de lección. */
  .compacta .barra > :global(.selector) { flex-basis: 45%; }
  .compacta .barra :global(select) { padding-block: 0; }
  .compacta .barra-practica { flex-wrap: nowrap; margin-bottom: calc(var(--space-1) / 2); }
  .compacta .barra-practica > :global(.confirmado) { flex: 1 1 0; }
  .compacta .barra-practica :global(select) { padding-block: 0; }
  .compacta .barra-practica label, .compacta .barra-practica > span {
    position: absolute; width: 1px; height: 1px;
    overflow: hidden; clip-path: inset(50%);
  }
  .compacta .barra-practica button { padding: 0 var(--space-3); white-space: nowrap; }
  .compacta .metricas { gap: var(--space-3); padding-block: 0; }
  .compacta .metricas dd { font-size: var(--text-base); line-height: 1.3; }
  .compacta .btn-intento { gap: var(--space-1); }
  .compacta .actualizacion small {
    position: absolute; width: 1px; height: 1px;
    overflow: hidden; clip-path: inset(50%);
  }
  .compacta .escena { padding: var(--space-1) var(--space-2); }

  .escena {
    min-height: 0;
    display: grid;
    /* El teclado mide su suelo contra este ancho, ver `.drill` en Drill.svelte. */
    container-type: inline-size;
    /* La barra de práctica ocupa lo justo: si no, se reparte el sobrante a medias
       con la lección y se lo quita al teclado. */
    grid-template-rows: minmax(0, 1fr);
    padding: var(--space-3) var(--space-4);
    /* Último recurso. Con la letra al 200% en una ventana baja puede no caber
       todo por mucho que se encojan las piezas; entonces esta zona se desplaza.
       Desplazarse es malo; recortar contenido y que nadie lo encuentre es peor. */
    overflow-y: auto;
  }
  .escena:has(> .barra-practica) { grid-template-rows: auto minmax(0, 1fr); }
  /* `safe`: si no cabe, centrar dejaría la parte de arriba donde no se puede llegar. */
  .centrado { align-self: safe center; justify-self: center; max-width: 72ch; }
  .primera { display: grid; gap: var(--space-6); }

  /* --- Panel superpuesto -------------------------------------------------
   * El <dialog> ocupa la ventana y pinta el velo (--scrim), y la caja va
   * centrada encima, igual que el diálogo de resultado. El velo va en el propio
   * diálogo y no en ::backdrop porque este no hereda los tokens en todos los
   * WebKit que soportamos. */
  dialog {
    color: var(--fg);
    max-width: none;
    max-height: none;
    margin: 0;
    padding: 0;
    border: 0;
  }
  dialog::backdrop { background: transparent; }
  .panel {
    position: fixed; inset: 0;
    width: 100%; height: 100%;
    display: grid; place-items: center;
    background: var(--scrim);
    padding: var(--space-4);
  }

  /* El ancho va en función de `--ui-scale`, como la letra: fijo, al 200% cabían
     dos palabras por línea y el panel de progreso medía casi 8000px de alto. */
  .panel-caja {
    width: min(calc(60rem * var(--ui-scale)), 100%);
    max-height: 100%;
    min-height: 0;
    display: grid;
    grid-template-rows: auto minmax(0, 1fr);
    overflow: hidden;
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--radius-panel);
    box-shadow: var(--shadow-panel);
  }
  /* Ajustes va en dos columnas al 100% (una con la letra grande). */
  .panel-caja.caja-ajustes { width: min(calc(65rem * var(--ui-scale)), 100%); }
  .panel-caja.caja-lecciones { width: min(calc(44rem * var(--ui-scale)), 100%); }
  .panel-cab {
    display: flex; align-items: center; justify-content: space-between;
    gap: var(--space-3);
    padding: var(--space-4) var(--space-6);
    border-bottom: 1px solid var(--border);
  }
  .panel-cab h2 { margin: 0; font-size: calc(1.5rem * var(--ui-scale)); line-height: 1.2; min-width: 0; overflow-wrap: anywhere; }
  /* El panel sí se desplaza por dentro: es lo que evita que lo haga la página. */
  .panel-cuerpo {
    min-height: 0;
    overflow-y: auto;
    padding: var(--space-4) var(--space-6) var(--space-6);
    display: grid;
    gap: var(--space-6);
    align-content: start;
  }
  .compacta .panel { padding: var(--space-2); }
  .compacta .panel-cab { padding: var(--space-2) var(--space-4); }
  .compacta .panel-cuerpo { padding: var(--space-3) var(--space-4) var(--space-4); }
  @media (forced-colors: active) {
    .panel-caja { border-color: CanvasText; }
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
    gap: var(--space-2) var(--space-3);
    margin-bottom: var(--space-2);
    font-size: var(--text-sm);
    color: var(--fg-muted);
    flex-wrap: wrap;
  }
</style>
