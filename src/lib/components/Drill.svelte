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
  import { onMount, type Snippet } from 'svelte';
  import Keyboard from './Keyboard.svelte';
  import PistaDedo from './PistaDedo.svelte';
  import { TypingEngine, computeStats, diffAgainstTarget, UMBRAL_PAUSA_MS, type CharState, type Stats }
    from '../keyboard/engine';
  import { MS_RAPIDO, type MapaDominio } from '../keyboard/dominio';
  import { crearFiltroTemblor } from '../keyboard/temblor';
  import { desplazamientoLectura, trocearEnPalabras } from '../keyboard/lectura';
  import { buildIndex, FINGER_NAMES, type KeyStep, type Layout }
    from '../keyboard/layouts';

  interface Props {
    layout: Layout;
    target: string;
    /** Suspende la captura mientras hay un panel o resultado abierto. */
    activo?: boolean;
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
     * Qué precede a la cobertura en su chip. En una lección es lo que se gana
     * al terminarla; en la práctica continua, lo que ya cubre el vocabulario.
     */
    coberturaRotulo?: string;
    /**
     * Controles propios del modo (el vocabulario de la práctica continua, el
     * «Cambiar texto» del texto propio). Van en la cabecera y no en una fila
     * aparte encima: esa fila se la comía al teclado.
     */
    controles?: Snippet;
    /**
     * Con la letra muy grande no cabe todo. El orden de sacrificio es
     * explícito: primero se pliega la explicación, luego el texto se desplaza
     * dentro de su caja, y el teclado nunca baja de legible. Esto lo decide
     * quien conoce la escala elegida, no el componente.
     */
    espacioJusto?: boolean;
    /** Permite forzar animaciones reducidas en la lección. */
    movimiento?: 'auto' | 'reducido';
    animaciones?: 'normales' | 'reducidas' | 'auto';
    /** Indica si el ejercicio está pausado. */
    pausado?: boolean;
    /** Callback para reanudar desde el cartel de pausa. */
    onReanudar?: () => void;
    /**
     * Esc desde el propio campo. Se escucha en el `<textarea>` y no en la
     * ventana: un manejador global de teclas es justo lo que descartaron los
     * spikes, y además así Esc solo pausa cuando se está escribiendo.
     */
    onPausar?: () => void;
    /**
     * Ignorar el rebote de una tecla por temblor. Actúa antes de que el
     * carácter llegue al campo, así que el motor no se entera (ver
     * `keyboard/temblor.ts`, que explica dónde y por qué ahí).
     */
    ignorarRepeticion?: boolean;
  }

  let {
    layout, target, activo = true, onDone, onTecla, dominios, onStats,
    titulo = '', explicacion = '', cobertura = '', coberturaRotulo = 'Al terminarla:',
    controles, espacioJusto = false,
    movimiento = 'auto', animaciones = 'auto', pausado = false, onReanudar, onPausar,
    ignorarRepeticion = false,
  }: Props = $props();

  /** Para enlazar el campo con la descripción que lleva el texto entero. */
  const uid = $props.id();
  const filtroTemblor = crearFiltroTemblor();

  const sinAnimaciones = $derived(movimiento === 'reducido' || animaciones === 'reducidas');

  let field = $state<HTMLTextAreaElement | null>(null);
  let engine: TypingEngine | null = null;

  let typed = $state('');
  let composing = $state(false);
  let held = $state<Set<string>>(new Set());
  let stamps = $state<readonly number[]>([]);
  let errores = $state(0);
  let pendienteTecla0: { code: string; acierto: boolean }[] | null = null;

  let pausadoEn: number | null = null;
  let tiempoDescontado = $state(0);

  $effect(() => {
    if (pausado) {
      pausadoEn = performance.now();
    } else if (pausadoEn !== null) {
      tiempoDescontado += performance.now() - pausadoEn;
      pausadoEn = null;
    }
  });

  const index = $derived(buildIndex(layout));
  /** El texto por palabras, para que el salto de línea no parta ninguna. */
  const palabras = $derived(trocearEnPalabras(target));
  let caja = $state<HTMLElement | null>(null);
  const states = $derived<CharState[]>(diffAgainstTarget(typed, target));
  const stampsEfectivos = $derived(
    tiempoDescontado > 0
      ? stamps.map((st, idx) => (idx === 0 ? st : Math.max(stamps[0], st - tiempoDescontado)))
      : stamps,
  );
  const stats = $derived(computeStats(typed, target, stampsEfectivos, errores));
  const finished = $derived(typed.length >= target.length);
  /** Fracción escrita, para la barra de avance del pie de la tarjeta. */
  const avance = $derived(target.length ? Math.min(1, typed.length / target.length) : 0);

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

  // Al avanzar, la línea del cursor sube a lo alto de la caja: lo que se ve
  // debajo es lo que viene, que es lo que hay que poder leer por delante. Sin
  // esto, al 200% el cursor se salía por abajo (ver keyboard/lectura.ts).
  $effect(() => {
    void typed.length;
    if (!caja) return;
    const primero = caja.querySelector<HTMLElement>('.ch');
    const cursor = caja.querySelector<HTMLElement>('.ch.current');
    if (!primero || !cursor) return;
    const nuevo = desplazamientoLectura({
      scrollTop: caja.scrollTop,
      primeroTop: primero.getBoundingClientRect().top,
      cursorTop: cursor.getBoundingClientRect().top,
      cabeEntero: caja.scrollHeight <= caja.clientHeight,
    });
    if (nuevo !== null) caja.scrollTop = nuevo;
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
        const antes = typed;
        const nuevoTyped = s.committed.slice(0, target.length);
        if (nuevoTyped.length < antes.length) {
          // El alumno ha borrado caracteres: contabilizar errores corregidos
          for (let i = nuevoTyped.length; i < antes.length; i++) {
            if (antes[i] !== target[i]) {
              errores++;
            }
          }
        }
        typed = nuevoTyped;
        composing = s.composing;
        stamps = [...engine!.stamps];
        if (nuevoTyped.length > antes.length) {
          reportarTeclas(antes.length, nuevoTyped.length);
        }
      },
    });
    return () => engine?.destroy();
  });

  // Solo al entrar en la lección o volver de un panel. Perder el foco nunca
  // lo recupera: Tab y Mayús+Tab tienen que poder llegar a los demás controles.
  $effect(() => {
    if (activo && !pausado) field?.focus();
  });

  export function enfocar(): void {
    if (activo && !pausado) field?.focus();
  }

  /**
   * Apunta cada carácter recién confirmado como un intento sobre las teclas que
   * había que pulsar. Para una vocal con tilde son dos: el acento y la vocal, y
   * las dos se llevan el mismo resultado. Es una aproximación —no sabemos cuál
   * de las dos falló— pero mide lo que interesa: si esa combinación le sale.
   */
  function reportarTeclas(desde: number, hasta: number): void {
    if (!onTecla) return;

    // Si teníamos la primera tecla pendiente y ahora tenemos al menos 2 sellos
    if (pendienteTecla0 && stamps.length >= 2) {
      const ms0 = Math.min(Math.max(0, stamps[1] - stamps[0]), UMBRAL_PAUSA_MS);
      for (const p of pendienteTecla0) {
        onTecla(p.code, p.acierto, ms0);
      }
      pendienteTecla0 = null;
    }

    for (let i = desde; i < hasta; i++) {
      const esperado = target[i];
      if (esperado === undefined) continue;
      const pasos = index.get(esperado);
      if (!pasos) continue;
      const acierto = typed[i] === esperado;

      if (i === 0) {
        if (stamps.length >= 2) {
          const ms = Math.min(Math.max(0, stamps[1] - stamps[0]), UMBRAL_PAUSA_MS);
          for (const paso of pasos) onTecla(paso.code, acierto, ms);
        } else {
          pendienteTecla0 = pasos.map((p) => ({ code: p.code, acierto }));
        }
        continue;
      }

      const delta = stamps[i] && stamps[i - 1] ? stamps[i] - stamps[i - 1] : 0;
      const ms = Math.min(Math.max(0, delta), UMBRAL_PAUSA_MS);
      for (const paso of pasos) onTecla(paso.code, acierto, ms);
    }
  }

  // Se avisa una sola vez: sin el guardia, cualquier reactividad posterior
  // (un keyup que llega tarde, por ejemplo) guardaría la sesión otra vez.
  let avisado = $state(false);

  $effect(() => {
    if (finished && !composing && !avisado) {
      avisado = true;
      if (pendienteTecla0) {
        for (const p of pendienteTecla0) {
          onTecla?.(p.code, p.acierto, MS_RAPIDO);
        }
        pendienteTecla0 = null;
      }
      onDone?.(stats);
    }
  });

  export function restart(): void {
    decisionManual = null;
    engine?.reset();
    typed = '';
    stamps = [];
    errores = 0;
    pendienteTecla0 = null;
    avisado = false;
    tiempoDescontado = 0;
    pausadoEn = null;
    filtroTemblor.olvidar();
  }
</script>

<div class="drill" class:sin-animaciones={sinAnimaciones} class:justo={espacioJusto}>
  <header class="cab">
    <h2>{titulo}</h2>
    <!-- La frase va en el texto y no en un aria-label, que en un <span> no lo
         anuncian todos los lectores. Con la letra grande el rótulo se queda
         solo para el lector: a la vista, la cabecera tiene que caber en una
         fila o el teclado pierde ese alto. -->
    {#if cobertura}
      <span class="chip cobertura"><span class:sr-only={espacioJusto}>{coberturaRotulo} </span>{cobertura} % del español</span>
    {/if}
    {@render controles?.()}
    <span class="cab-fin">
      {#if explicacion}
        <button class="enlace explica" aria-expanded={explicacionAbierta}
                onclick={() => (decisionManual = !explicacionAbierta)}>
          {explicacionAbierta ? 'Ocultar' : '¿Qué se practica?'}
        </button>
      {/if}
      <button class="btn-barra seguir" onclick={enfocar} disabled={!activo || pausado}>Seguir escribiendo</button>
    </span>
    <!-- «Empezar de nuevo» vive solo en la barra de arriba: había tres. -->
  </header>

  {#if explicacionAbierta && explicacion}
    <p class="focus">{explicacion}</p>
  {/if}

  <!-- El cartel de pausa va fuera del <label>: un botón dentro de la etiqueta
       de un campo formaría parte de su nombre accesible y el clic sería
       ambiguo (WCAG 4.1.2). -->
  <div class="texto-caja">
    {#if pausado}
      <div class="pausa-cartel" role="status" aria-live="polite">
        <span>Ejercicio pausado</span>
        {#if onReanudar}
          <button type="button" class="primario btn-reanudar" onclick={onReanudar}>
            Reanudar
          </button>
        {/if}
      </div>
    {/if}
    <!-- La etiqueta devuelve el foco al pulsar el texto sin interceptar teclas.
         El campo real conserva la composición del método de entrada del sistema. -->
    <label class="text" bind:this={caja}>
      <textarea
        bind:this={field}
        class="capture"
        autocomplete="off"
        autocapitalize="off"
        spellcheck="false"
        disabled={!activo || pausado}
        aria-label={titulo ? `Campo de práctica: ${titulo}` : 'Campo de práctica'}
        aria-describedby="{uid}-texto"
        onpaste={(e) => e.preventDefault()}
        onkeydown={(e) => {
          if (e.key !== 'Escape' || !onPausar) return;
          // A mitad de un acento, Esc es del método de entrada: cancela la
          // composición. Robárselo dejaría el ´ colgado en el campo. 229 es el
          // keyCode que dan algunos motores mientras compone el IME.
          if (e.isComposing || composing || e.keyCode === 229) return;
          e.preventDefault();
          onPausar();
        }}
        onbeforeinput={(e) => {
          const ev = e as InputEvent;
          if (ev.inputType === 'insertFromPaste') {
            e.preventDefault();
            return;
          }
          // Capa aparte del motor: si se cancela aquí, el carácter no llega al
          // campo y el canal B (que lee el valor) no tiene nada que deshacer.
          if (ignorarRepeticion && filtroTemblor.debeIgnorar(ev, performance.now())) {
            e.preventDefault();
          }
        }}
      ></textarea>
      <span aria-hidden="true">
        {#each palabras as p (p.inicio)}
          <span class="palabra">{#each [...p.texto] as ch, k (k)}<span
            class="ch {states[p.inicio + k]}">{ch === ' ' ? '\u00a0' : ch}</span>{/each}</span><wbr />
        {/each}
      </span>
    </label>
    <!-- El avance ya se lee en la barra de arriba (Avance «10 de 53»): esto es
         el mismo dato a golpe de vista, y por eso no se anuncia. -->
    <div class="avance" aria-hidden="true">
      <span style:transform="scaleX({avance})"></span>
    </div>
  </div>

  <!-- Para lector de pantalla: el bucle de práctica es visual y motor, pero la
       pista sí tiene que ser audible, y el progreso legible. -->
  <p class="sr-only" aria-live="polite">{hint}</p>

  <!-- El nombre del campo es corto: el texto entero va como descripción, que
       el lector anuncia después y se puede saltar. Meterlo en el nombre lo
       repetía completo cada vez que el foco volvía al campo. -->
  <p class="sr-only" id="{uid}-texto">Texto: {target}</p>

  <!-- Lo mismo que la región viva de arriba, para la vista. Con la letra
       grande se pliega la tarjeta de manos para que el teclado conserve su
       suelo (orden de sacrificio en PistaDedo.svelte). -->
  <div class="hint" aria-hidden="true">
    <PistaDedo
      paso={nextStep}
      despues={nextStep?.dead && nextChar ? (index.get(nextChar)?.[1] ?? null) : null}
      compacta={espacioJusto}
    />
  </div>

  <div class="teclado" aria-hidden="true">
    <Keyboard {layout} {held} next={nextStep} {lastWrong} {dominios} />
  </div>
</div>

<style>
  .pausa-cartel {
    position: absolute;
    inset: 0;
    background: color-mix(in srgb, var(--surface) 92%, transparent);
    /* En fila: con una sola línea de texto la tarjeta mide menos que el
       rótulo y el botón uno encima del otro. */
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: center;
    gap: var(--space-2) var(--space-4);
    z-index: 5;
    border-radius: var(--radius-card);
    font-size: var(--text-lg);
    font-weight: 700;
  }
  /* El estilo es el del botón principal (base.css); aquí solo el tamaño. */
  .btn-reanudar { font-size: var(--text-base); }

  /* El teclado se lleva el espacio que sobre; todo lo demás ocupa lo justo.
     `min-height: 0` es lo que permite que la rejilla encoja de verdad en vez
     de desbordar. */
  .drill {
    display: grid;
    grid-template-areas: 'cabecera' 'explicacion' 'texto' 'pista' 'teclado';
    /* Los mínimos también van en las filas: si solo los tienen los hijos,
       la rejilla puede encogerlas hasta que texto y teclado se solapen. */
    /* El suelo de la fila del texto es una línea entera: el interlineado, el
       relleno de la tarjeta (arriba --space-3; abajo, además, los 4px de la
       barra de avance) y el borde. */
    grid-template-rows: auto auto
      minmax(calc(1.7 * var(--text-drill) + 2 * var(--space-3) + 4px + 2px), auto)
      auto minmax(min(34vh, 230px), 1fr);
    gap: var(--space-2);
    min-height: 0;
  }

  /* Con la letra grande, el suelo de la caja del texto pasa de una línea a
     dos (sin pasar del 30vh de siempre): la del cursor y la siguiente. Con
     una sola, al llegar al final de una línea no se ve nada de lo que viene, y
     leer por delante es como compensan los mecanógrafos mayores (2.8). El
     interlineado baja algo para que las dos líneas quepan en ese 30vh. */
  .drill.justo {
    grid-template-rows: auto auto
      minmax(min(calc(2 * 1.5 * var(--text-drill) + 2 * var(--space-3) + 4px + 2px), 30vh), auto)
      auto minmax(min(34vh, 230px), 1fr);
  }
  .justo .text { line-height: 1.5; }

  .capture {
    position: absolute;
    width: 1px; height: 1px;
    opacity: 0;
    /* No usamos display:none ni visibility:hidden: el campo tiene que poder
       recibir el foco de verdad para que llegue el texto compuesto. */
  }

  .cab {
    grid-area: cabecera;
    display: flex;
    align-items: center;
    gap: var(--space-2) var(--space-3);
    flex-wrap: wrap;
  }
  .cab h2 { margin: 0; font-size: var(--text-xl); font-weight: 700; line-height: 1.15; }

  /* El chip (base.css) en acento suave: es lo que se gana, no un aviso. */
  .cobertura { font-variant-numeric: tabular-nums; }

  .cab-fin {
    margin-left: auto;
    display: flex;
    align-items: center;
    gap: var(--space-1);
  }
  .explica {
    min-height: var(--target-min);
    min-width: var(--target-min);
    display: inline-flex;
    align-items: center;
    justify-content: center;
    padding: var(--space-2) var(--space-3);
  }
  .seguir { color: var(--fg-muted); font-size: var(--text-sm); }

  .focus { grid-area: explicacion; margin: 0; color: var(--fg-muted); max-width: 78ch; font-size: var(--text-base); }

  .texto-caja {
    grid-area: texto;
    position: relative;
    display: grid;
    min-height: 0;
  }

  .text {
    cursor: text;
    font-family: var(--font-drill);
    font-size: var(--text-drill);
    line-height: 1.7;
    background: var(--surface);
    /* Es la caja que se pulsa para escribir: cuenta como contorno de control. */
    border: 1px solid var(--border-strong);
    border-radius: var(--radius-card);
    /* Abajo, sitio para la barra de avance: nunca tapa la última línea. */
    padding: var(--space-3) var(--space-4) calc(var(--space-3) + 4px);
    margin: 0;
    overflow-wrap: anywhere;
    /* Si el texto es largo o la letra muy grande, se desplaza aquí dentro y no
       arrastra a la página entera. */
    overflow-y: auto;
    max-height: 30vh;
  }

  /* Cada palabra es un bloque que no se parte, salvo que no quepa entera en
     una línea (overflow-wrap). Entre palabras, <wbr> deja saltar de línea. */
  .palabra { display: inline-block; }

  .text:has(.capture:focus-visible) {
    outline: 3px solid var(--accent);
    outline-offset: 2px;
  }

  /* Barra de avance de 4px pegada al borde inferior de la tarjeta. Está fuera
     de la caja que se desplaza para que no se vaya con el texto. */
  .avance {
    position: absolute;
    left: 1px; right: 1px; bottom: 1px;
    height: 4px;
    background: var(--surface-sunken);
    border-radius: 0 0 var(--radius-card) var(--radius-card);
    overflow: hidden;
    pointer-events: none;
  }
  .avance span {
    display: block;
    height: 100%;
    background: var(--accent);
    transform-origin: left;
    transition: transform var(--motion-base) var(--ease);
  }

  /* Cuatro estados, y ninguno solo por color: lo pendiente va atenuado y sin
     subrayar; lo acertado, en tinta plena con subrayado sencillo; el error,
     con fondo y subrayado doble; el cursor, en bloque. */
  .ch { padding: 1px 0; border-bottom: 3px solid transparent; }
  .ch.pending { color: var(--fg-muted); }
  .ch.correct { color: var(--fg); border-bottom-color: var(--ok); }

  .ch.wrong {
    color: var(--error);
    background: var(--error-bg);
    border-bottom: 3px double var(--error);
    border-radius: 2px;
  }

  .ch.current {
    background: var(--accent);
    color: var(--accent-fg);
    border-bottom-color: var(--fg);
    border-radius: var(--radius-sm) var(--radius-sm) 0 0;
    animation: blink 1.1s var(--ease) infinite;
  }

  /* En alto contraste del sistema el fondo del cursor se pierde (lo fuerza a
     Canvas): el contorno con Highlight es lo que lo deja ver. */
  @media (forced-colors: active) {
    .ch.current {
      outline: 3px solid Highlight;
      outline-offset: 1px;
      animation: none;
    }
  }

  @keyframes blink { 50% { opacity: 0.62; } }
  @keyframes pulse { 50% { opacity: 0.62; } }
  @media (prefers-reduced-motion: reduce) {
    .ch.current {
      animation: none;
      opacity: 1;
      outline: 2px solid var(--fg);
    }
  }
  :global(:root[data-motion="reducido"]) .ch.current,
  :global(:root[data-motion="reduced"]) .ch.current,
  .sin-animaciones .ch.current {
    animation: none;
    opacity: 1;
    outline: 2px solid var(--fg);
  }

  .hint { grid-area: pista; min-width: 0; }

  /* El teclado se adapta a la altura disponible, pero con suelo: por debajo de
     esto las letras dejan de leerse y un teclado ilegible es peor que uno al
     que haya que desplazarse. Si ni así cabe, es `.escena` quien se desplaza
     por dentro; nunca se recorta contenido.

     El suelo va multiplicado por `--ui-scale` porque estaba escrito en píxeles
     de caja y no en legibilidad de la letra: al 200% todo lo demás crecía, el
     teclado se pegaba al suelo y sus letras acababan más pequeñas que al 100%
     (issue #13). Ojo con el paréntesis: se multiplica el `min()` entero, no una
     de sus ramas. `min(34vh, calc(230px * var(--ui-scale)))` —que es lo que
     proponía la issue— no sirve, porque `min()` coge el menor y a 771px de alto
     el menor sigue siendo `34vh`. Esta palanca solo actúa cuando el límite es
     el ALTO; cuando lo es el ancho, el que trabaja es `--factor-tecla`. */
  .teclado {
    grid-area: teclado;
    min-height: calc(min(34vh, 230px) * var(--ui-scale));
    display: grid;
  }
</style>
