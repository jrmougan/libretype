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
  import PistaDedo from './PistaDedo.svelte';
  import { TypingEngine, computeStats, diffAgainstTarget, UMBRAL_PAUSA_MS, type CharState, type Stats }
    from '../keyboard/engine';
  import { MS_RAPIDO, type MapaDominio } from '../keyboard/dominio';
  import { crearFiltroTemblor } from '../keyboard/temblor';
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
    /** El idioma de esa cobertura, tras «del» y «en». */
    idioma?: string;
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
    titulo = '', explicacion = '', cobertura = '', idioma = '', espacioJusto = false,
    movimiento = 'auto', animaciones = 'auto', pausado = false, onReanudar, onPausar,
    ignorarRepeticion = false,
  }: Props = $props();

  const filtroTemblor = crearFiltroTemblor();

  /** Para enlazar el campo con su descripción aunque haya más de un Drill montado. */
  const uid = $props.id();

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
      return `${base} — acento: no verás nada hasta pulsar la vocal`;
    }
    return base;
  });

  /**
   * El texto se reparte por palabras para que el salto de línea no parta ninguna:
   * cada carácter es su propio elemento, y sin este envoltorio se podría cortar
   * «por» en «po» y «r». El espacio va con la palabra de delante, y un espacio al
   * final de la línea se sigue viendo cuando le toca al cursor.
   */
  const palabras = $derived.by(() => {
    const trozos: { inicio: number; caracteres: string[] }[] = [];
    let actual: { inicio: number; caracteres: string[] } | null = null;
    [...target].forEach((ch, i) => {
      actual ??= { inicio: i, caracteres: [] };
      actual.caracteres.push(ch);
      if (ch === ' ') { trozos.push(actual); actual = null; }
    });
    if (actual) trozos.push(actual);
    return trozos;
  });

  let cajaTexto = $state<HTMLLabelElement>();

  /**
   * El texto se desplaza dentro de su caja (paso 2 del orden de sacrificio), así
   * que hay que llevar el cursor a la vista: nadie va a soltar el teclado para
   * mover la rueda a mitad de una lección. Su línea va **siempre** arriba del todo,
   * no solo cuando se sale: así lo que queda a la vista por debajo es lo que viene,
   * y al llegar al final de una línea ya se ve la siguiente. Leer por delante es
   * como mantiene el ritmo quien ya no reacciona tan rápido. Sin animación: lo que
   * importa es que esté ya.
   *
   * La distancia entre el primer carácter y el cursor no depende de cuánto esté
   * desplazada la caja, así que sirve de destino tal cual; si todo cabe, no se toca.
   */
  $effect(() => {
    void states;
    const caja = cajaTexto;
    const cursor = caja?.querySelector('.ch.current');
    const primero = caja?.querySelector('.ch');
    if (!caja || !cursor || !primero) return;
    if (caja.scrollHeight <= caja.clientHeight + 1) return;
    const destino = Math.max(0, cursor.getBoundingClientRect().top - primero.getBoundingClientRect().top);
    // Con margen: un píxel de redondeo no puede mover el texto a cada tecla.
    if (Math.abs(caja.scrollTop - destino) > 2) caja.scrollTop = destino;
  });

  /**
   * Último paso del orden de sacrificio: si con la letra grande no cabe todo, la
   * escena se desplaza. Pero antes de teclear interesa ver el título y, al
   * empezar, el texto, la pista y el teclado juntos; lo que no quepa, que sea lo
   * de arriba. Una vez por intento: después el alumno manda en su desplazamiento.
   */
  let textoEnVista = false;
  $effect(() => {
    if (typed.length === 0) { textoEnVista = false; return; }
    if (textoEnVista) return;
    textoEnVista = true;
    cajaTexto?.scrollIntoView?.({ block: 'start' });
  });

  onMount(() => {
    if (!field) return;

    // `autocorrect` no está en los tipos HTML de Svelte, pero WebKit sí lo
    // respeta y aquí hace falta: si macOS "corrige" lo que teclea el alumno,
    // corrompe el ejercicio.
    field.setAttribute('autocorrect', 'off');

    engine = new TypingEngine(field, {
      // El motor avisa de cada suelta ANTES de vaciar su lista al perder el foco: sin
      // quitarla aquí, la tecla con la que se salió del campo (Tab) se quedaba
      // encendida en pantalla al volver.
      physical: (ev) => {
        const pulsadas = new Set(engine!.heldCodes);
        if (!ev.down) pulsadas.delete(ev.code);
        held = pulsadas;
      },
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

<div class="drill" class:sin-animaciones={sinAnimaciones} class:compacta={espacioJusto}>
  <header class="cab">
    <h2>{titulo}</h2>
    {#if cobertura}
      <span class="chip cobertura"
            aria-label="Al terminarla podrás escribir el {cobertura}% de las palabras que se escriben en {idioma}">
        {cobertura}% del {idioma}
      </span>
    {/if}
    {#if explicacion}
      <button class="enlace explica" aria-expanded={explicacionAbierta}
              onclick={() => (decisionManual = !explicacionAbierta)}>
        {explicacionAbierta ? 'Ocultar' : '¿Qué se practica?'}
      </button>
    {/if}
  </header>

  {#if explicacionAbierta && explicacion}
    <!-- Con la letra grande la cifra de cobertura no cabe en la fila y baja aquí. -->
    <p class="focus">{explicacion}{#if espacioJusto && cobertura}{' '}Al terminarla podrás escribir el {cobertura}% de las palabras que se escriben en {idioma}.{/if}</p>
  {/if}

  <!-- Hermano de la etiqueta, no hijo: un botón dentro de un <label> es HTML
       inválido, y comparte su celda de la rejilla para taparla solo a ella. Sin
       eso se quedaba sin caja de referencia y cubría la aplicación entera,
       incluida la barra desde la que también se puede reanudar. -->
  {#if pausado}
    <div class="pausa-cartel" role="status">
      <span>Ejercicio pausado</span>
      {#if onReanudar}
        <button type="button" class="primario" onclick={onReanudar}>
          Reanudar
        </button>
      {/if}
    </div>
  {/if}

  <!-- La etiqueta devuelve el foco al pulsar el texto sin interceptar teclas.
       El campo real conserva la composición del método de entrada del sistema. -->
  <!-- El nombre del campo es corto y el texto va como descripción: con la lección
       entera en el nombre, el lector la repetía cada vez que el foco volvía aquí.
       La descripción se anuncia después y se puede saltar. -->
  <label class="text" bind:this={cajaTexto}>
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
        <span class="palabra">
          {#each p.caracteres as ch, j (j)}
            <span class="ch {states[p.inicio + j]}">{ch === ' ' ? '\u00a0' : ch}</span>
          {/each}
        </span>
      {/each}
    </span>
  </label>

  <!-- El campo es invisible, así que perder el foco no se notaba: se tecleaba y no
       pasaba nada. Lo enseña el CSS, sin tocar el foco ni el campo, y lo deja pasar
       el clic hasta la etiqueta, que es quien lo devuelve. Con el teclado no hace
       falta: el campo está justo después de los controles de arriba. -->
  <span class="aviso-foco" aria-hidden="true">Pulsa aquí para seguir escribiendo</span>

  <!-- El mismo dato que el «Avance» de la barra de arriba, a golpe de vista: por
       eso no se anuncia. Va fuera de la caja que se desplaza, en su misma celda,
       para no irse con el texto. -->
  <div class="avance" aria-hidden="true">
    <span style:transform="scaleX({avance})"></span>
  </div>

  <!-- Para lector de pantalla: el bucle de práctica es visual y motor, pero la
       pista sí tiene que ser audible, y el progreso legible. -->
  <p class="sr-only" aria-live="polite">{hint}</p>
  <span id="{uid}-texto" class="sr-only">Texto: {target}</span>

  <!-- Lo mismo que la región viva de arriba, para la vista. Con la letra grande
       se pliega la tarjeta de manos para que el teclado conserve su suelo (orden
       de sacrificio en PistaDedo.svelte). -->
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
  /* Misma celda que `.text`: la tapa sin moverla, y el teclado sigue en su sitio. */
  .pausa-cartel {
    grid-area: texto;
    background: color-mix(in srgb, var(--surface) 92%, transparent);
    border: 1px solid var(--border-strong);
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: center;
    gap: var(--space-2) var(--space-4);
    padding: var(--space-2);
    z-index: 1;
    border-radius: var(--radius-card);
    font-size: var(--text-lg);
    font-weight: 700;
  }

  /* El teclado se lleva el espacio que sobre; todo lo demás ocupa lo justo.
     `min-height: 0` es lo que permite que la rejilla encoja de verdad en vez
     de desbordar. */
  .drill {
    display: grid;
    grid-template-areas: 'cabecera' 'explicacion' 'texto' 'pista' 'teclado';
    /* Los mínimos también van en las filas: si solo los tienen los hijos,
       la rejilla puede encogerlas hasta que texto y teclado se solapen. */
    /* El suelo de la fila del texto es una línea entera: el interlineado, el
       relleno de la tarjeta (más los 4px de la barra de avance) y el borde. */
    grid-template-rows: auto auto
      minmax(calc(1.7 * var(--text-drill) + 2 * var(--space-3) + 4px + 2px), auto)
      auto minmax(var(--suelo-teclado), 1fr);
    gap: var(--space-2);
    min-height: 0;
    /* El suelo de `.teclado` solo sirve mientras el límite sea el alto: cuando lo es
       el ancho, el SVG ya no crece y lo que queda por encima es hueco vacío que
       empuja a desplazar (120px a 1024x640 al 200%). El 0,33 es el alto entre el
       ancho del teclado, un poco por encima de la proporción real para no recortarle
       nunca una letra; `cqw` se mide contra `.escena`. Lo comprueba geometria.test.ts.
       Va también en la fila: si solo lo tuviera el hijo, el texto se quedaría el
       sitio y el teclado desbordaría, y el orden de sacrificio dice lo contrario. */
    --suelo-teclado: min(calc(min(34vh, 230px) * var(--ui-scale)), 33cqw);
  }

  /* Letra grande: cada fila cuesta el doble y el título ya está en el selector de
     la barra, así que la pista y la explicación comparten fila encima del teclado.
     El título sigue en el árbol para el lector de pantalla. */
  .compacta {
    gap: calc(var(--space-1) / 2);
    grid-template-areas: 'explicacion explicacion' 'texto texto' 'pista cabecera' 'teclado teclado';
    grid-template-columns: minmax(0, 1fr) auto;
    grid-template-rows: auto
      minmax(calc(1.7 * var(--text-drill) + 2 * var(--space-1) + 4px + 2px), auto)
      auto minmax(var(--suelo-teclado), 1fr);
  }
  .compacta .cab h2 {
    position: absolute; width: 1px; height: 1px;
    overflow: hidden; clip-path: inset(50%); white-space: nowrap;
  }
  .compacta .cobertura { display: none; }
  /* Con la letra grande la caja enseña una línea y poco más, y al llegar al final
     de esa línea no se veía nada de lo que viene: leer por delante es como mantiene
     el ritmo quien ya no reacciona tan rápido. Con el interlineado más prieto, en el
     mismo alto de caja caben la línea del cursor y la siguiente en cuanto la ventana
     da para ello (medido: dos enteras a 1280x800 al 200%; en ventanas más bajas, la
     de debajo asoma). El suelo de la fila no cambia: esto no le quita nada al
     teclado ni mueve el orden de sacrificio. */
  .compacta .text { padding: var(--space-1) var(--space-3) calc(var(--space-1) + 4px); line-height: 1.35; }
  .compacta .explica { padding: 0 var(--space-3); }

  .capture {
    position: absolute;
    width: 1px; height: 1px;
    opacity: 0;
    /* No usamos display:none ni visibility:hidden: el campo tiene que poder
       recibir el foco de verdad para que llegue el texto compuesto. */
  }

  .cab { grid-area: cabecera; display: flex; align-items: center; gap: var(--space-2) var(--space-3); flex-wrap: wrap; }
  /* `anywhere`, no `break-word`: solo el primero reduce el ancho mínimo. Un título sin
     espacios, que la validación admite, ensancharía si no toda la lección. */
  .cab h2 { margin: 0; font-size: var(--text-xl); font-weight: 700; line-height: 1.15; min-width: 0; overflow-wrap: anywhere; }

  /* El chip (base.css) en acento suave: es lo que se gana, no un aviso. */
  .cobertura { font-variant-numeric: tabular-nums; }

  /* Con aspecto de enlace (base.css), pero sigue midiendo lo que un botón. */
  .explica {
    margin-left: auto;
    min-height: var(--target-min);
    min-width: var(--target-min);
    display: inline-flex;
    align-items: center;
    justify-content: center;
    padding: var(--space-2) var(--space-3);
  }

  .focus { grid-area: explicacion; margin: 0; color: var(--fg-muted); max-width: 78ch; min-width: 0; font-size: var(--text-base); overflow-wrap: anywhere; }

  .text {
    grid-area: texto;
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
    word-break: break-word;
    /* Si el texto es largo o la letra muy grande, se desplaza aquí dentro y no
       arrastra a la página entera. */
    overflow-y: auto;
    max-height: 30vh;
    scroll-margin-top: var(--space-2);
  }

  /* Comparte celda con el texto y no ocupa sitio: que aparezca no mueve nada. */
  .aviso-foco {
    grid-area: texto;
    display: none;
    align-self: end;
    justify-self: end;
    margin: var(--space-1) var(--space-1) calc(var(--space-1) + 4px);
    padding: 0 var(--space-2);
    font-size: var(--text-sm);
    background: var(--accent);
    color: var(--accent-fg);
    border-radius: var(--radius);
    pointer-events: none;
  }
  .drill:has(.capture:not(:focus, :disabled)) .aviso-foco { display: block; }

  .text:has(.capture:focus-visible) {
    outline: 3px solid var(--accent);
    outline-offset: 2px;
  }

  /* Barra de avance de 4px pegada al borde inferior de la tarjeta. Comparte
     celda con el texto y no ocupa sitio. */
  .avance {
    grid-area: texto;
    align-self: end;
    height: 4px;
    margin: 0 1px 1px;
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

  .palabra { display: inline-block; }
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

  @keyframes blink { 50% { opacity: 0.62; } }
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
    min-height: var(--suelo-teclado);
    display: grid;
  }

  /* Colores forzados: el fondo no llega, y el cursor y el error dependían de él. */
  @media (forced-colors: active) {
    /* El subrayado transparente de lo pendiente se volvía visible y todo parecía
       acertado. Aquí se declara cada estado con los colores del sistema. */
    .ch { forced-color-adjust: none; border-bottom-color: Canvas; }
    .ch.pending { color: CanvasText; }
    .ch.correct { color: CanvasText; border-bottom-color: CanvasText; }
    .ch.wrong {
      color: CanvasText;
      background: Canvas;
      border-bottom-color: CanvasText;
      text-decoration: line-through;
    }
    .ch.current { background: Highlight; color: HighlightText; border-bottom-color: Highlight; }
    .aviso-foco { border: 1px solid CanvasText; }
    .avance { border-top: 1px solid CanvasText; }
    .avance span { background: Highlight; }
  }
</style>
