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
  import { TypingEngine, computeStats, diffAgainstTarget, UMBRAL_PAUSA_MS, type CharState, type Stats }
    from '../keyboard/engine';
  import { MS_RAPIDO, type MapaDominio } from '../keyboard/dominio';
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
  }

  let {
    layout, target, activo = true, onDone, onTecla, dominios, onStats,
    titulo = '', explicacion = '', cobertura = '', idioma = '', espacioJusto = false,
    movimiento = 'auto', animaciones = 'auto', pausado = false, onReanudar,
  }: Props = $props();

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
   * mover la rueda a mitad de una lección. Se sitúa su línea arriba del todo para
   * dejar a la vista lo que viene. Sin animación: lo que importa es que esté ya.
   */
  $effect(() => {
    void states;
    const caja = cajaTexto;
    const cursor = caja?.querySelector('.ch.current');
    if (!caja || !cursor) return;
    const c = caja.getBoundingClientRect();
    const r = cursor.getBoundingClientRect();
    if (r.top < c.top || r.bottom > c.bottom) {
      caja.scrollTop += r.top - c.top - caja.clientTop;
    }
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
  }
</script>

<div class="drill" class:sin-animaciones={sinAnimaciones} class:compacta={espacioJusto}>
  <header class="cab">
    <h2>{titulo}</h2>
    {#if cobertura}
      <span class="cobertura"
            aria-label="Al terminarla podrás escribir el {cobertura}% de las palabras que se escriben en {idioma}">
        {cobertura}% del {idioma}
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
  <label class="text" bind:this={cajaTexto} aria-label={`Texto de la lección: ${target}`}>
    <textarea
      bind:this={field}
      class="capture"
      autocomplete="off"
      autocapitalize="off"
      spellcheck="false"
      disabled={!activo || pausado}
      aria-label={`Escribe el texto de la lección: ${target}`}
      onpaste={(e) => e.preventDefault()}
      onbeforeinput={(e) => {
        if ((e as InputEvent).inputType === 'insertFromPaste') {
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

  <!-- Para lector de pantalla: el bucle de práctica es visual y motor, pero la
       pista sí tiene que ser audible, y el progreso legible. -->
  <p class="sr-only" aria-live="polite">{hint}</p>

  <p class="hint" aria-hidden="true">
    {#if nextStep}
      <span class="swatch" style="background: var(--finger-{nextStep.finger})"
            aria-hidden="true"></span>{hint}
    {:else}
      Lección terminada.
    {/if}
  </p>

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
    border-radius: var(--radius);
    font-size: var(--text-lg);
    font-weight: 500;
  }

  /* El teclado se lleva el espacio que sobre; todo lo demás ocupa lo justo.
     `min-height: 0` es lo que permite que la rejilla encoja de verdad en vez
     de desbordar. */
  .drill {
    display: grid;
    grid-template-areas: 'cabecera' 'explicacion' 'texto' 'pista' 'teclado';
    /* Los mínimos también van en las filas: si solo los tienen los hijos,
       la rejilla puede encogerlas hasta que texto y teclado se solapen. */
    grid-template-rows: auto auto
      minmax(calc(1.7 * var(--text-drill) + 2 * var(--space-3) + 2px), auto)
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
      minmax(calc(1.7 * var(--text-drill) + 2 * var(--space-1) + 2px), auto)
      auto minmax(var(--suelo-teclado), 1fr);
  }
  .compacta .cab h2 {
    position: absolute; width: 1px; height: 1px;
    overflow: hidden; clip-path: inset(50%); white-space: nowrap;
  }
  .compacta .cobertura { display: none; }
  .compacta .text { padding: var(--space-1) var(--space-3); }
  .compacta .hint { font-size: var(--text-base); }
  .compacta .explica { padding: 0 var(--space-3); }

  .capture {
    position: absolute;
    width: 1px; height: 1px;
    opacity: 0;
    /* No usamos display:none ni visibility:hidden: el campo tiene que poder
       recibir el foco de verdad para que llegue el texto compuesto. */
  }

  .cab { grid-area: cabecera; display: flex; align-items: center; gap: var(--space-3); flex-wrap: wrap; }
  /* `anywhere`, no `break-word`: solo el primero reduce el ancho mínimo. Un título sin
     espacios, que la validación admite, ensancharía si no toda la lección. */
  .cab h2 { margin: 0; font-size: var(--text-lg); min-width: 0; overflow-wrap: anywhere; }

  .cobertura {
    font-size: var(--text-sm);
    font-variant-numeric: tabular-nums;
    color: var(--accent);
    border: 1px solid var(--accent);
    border-radius: var(--radius-pill);
    padding: 1px var(--space-2);
    white-space: nowrap;
  }
  .explica {
    margin-left: auto;
    min-height: var(--target-min);
    min-width: var(--target-min);
    display: inline-flex;
    align-items: center;
    justify-content: center;
    padding: var(--space-2) var(--space-3);
    font-size: var(--text-sm);
  }

  .focus { grid-area: explicacion; margin: 0; color: var(--fg-muted); max-width: 78ch; min-width: 0; font-size: var(--text-sm); overflow-wrap: anywhere; }

  .text {
    grid-area: texto;
    cursor: text;
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
    scroll-margin-top: var(--space-2);
  }

  /* Comparte celda con el texto y no ocupa sitio: que aparezca no mueve nada. */
  .aviso-foco {
    grid-area: texto;
    display: none;
    align-self: end;
    justify-self: end;
    margin: var(--space-1);
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

  .palabra { display: inline-block; }
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

  .hint {
    grid-area: pista;
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
    .ch.current { background: Highlight; color: HighlightText; }
    .aviso-foco { border: 1px solid CanvasText; }
    .swatch { forced-color-adjust: none; }
  }
</style>
