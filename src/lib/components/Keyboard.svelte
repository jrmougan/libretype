<script lang="ts">
  /**
   * Teclado en pantalla en SVG.
   *
   * SVG y no canvas: escala nítido a cualquier tamaño (importa cuando alguien
   * pone la interfaz al 200%), es estilizable con los tokens de tema y se puede
   * inspeccionar. Un canvas sería un rectángulo opaco para cualquier ajuste del
   * sistema.
   *
   * Se guía por `code`, la posición física, nunca por el carácter: es lo único
   * que se mantiene igual entre distribuciones y entre motores.
   *
   * Cómo se ve cada tecla (dirección visual 1a):
   *
   * - Tecla de carácter: fondo `--surface`, contorno `--border-strong` (la
   *   forma de la tecla tiene que llegar a 3:1, WCAG 1.4.11) y una sombra
   *   inferior que la levanta del fondo. Letra base abajo a la izquierda, la de
   *   Mayús arriba a la izquierda y la de AltGr abajo a la derecha, estas dos
   *   pequeñas y atenuadas. En la base, una barrita del color del dedo.
   * - Tecla de control: fondo `--surface-sunken` y el rótulo centrado.
   * - Tecla siguiente: rellena del color del dedo, levantada, con un anillo
   *   del mismo color separado del borde y un triángulo arriba, dentro de la
   *   tecla. El triángulo y el anillo son la señal de FORMA: nunca depende
   *   solo del color. El triángulo va dentro y no encima, como antes, porque
   *   fuera tapaba la barrita de dedo de la tecla de la fila de arriba.
   * - Tecla dominada: sin letras y con un punto (ver `dominio.ts`).
   */
  import { opacidadEtiqueta, type MapaDominio } from '../keyboard/dominio';
  import { FINGER_NAMES, type Finger, type KeyDef, type KeyStep, type Layout }
    from '../keyboard/layouts';

  interface Props {
    layout: Layout;
    /** Teclas físicamente pulsadas ahora mismo (canal A del motor). */
    held: ReadonlySet<string>;
    /** Tecla que toca pulsar, o null si no hay lección activa. */
    next?: KeyStep | null;
    /** Marca la última pulsación como errónea. */
    lastWrong?: boolean;
    /**
     * Teclas señaladas como grupo, por `code`. La lección cero las usa para
     * enseñar la posición de reposo: no es «pulsa esta», es «aquí van los
     * dedos».
     */
    guia?: ReadonlySet<string>;
    /**
     * Cómo se dibuja el teclado.
     *
     * - `practica` (por defecto): el de las lecciones.
     * - `reposo`: el de la lección cero. Las teclas de `guia` llevan un fondo
     *   suave y el borde del color de su dedo, todas las letras van centradas y
     *   en mayúscula —como están impresas en el teclado de verdad, que es el
     *   que la persona tiene delante— y las de `objetivos` se dibujan como la
     *   tecla siguiente.
     */
    variante?: 'practica' | 'reposo';
    /**
     * Solo en `variante="reposo"`: teclas que se dibujan como «la siguiente»
     * (rellenas, con anillo y triángulo). Si no se pasa, son las de `guia` que
     * llevan relieve, es decir, la F y la J: el ancla a la que se vuelve.
     */
    objetivos?: ReadonlySet<string>;
    /** Etiqueta accesible; si no se pasa, se describe la tecla objetivo. */
    etiqueta?: string;
    /**
     * Dominio por tecla, de 0 a 1. Las teclas que el alumno ya domina dejan de
     * mostrar su letra: mirar la pantalla para buscarla es el hábito que hay
     * que romper, y retirar el andamiaje poco a poco es parte de enseñar.
     * Vacío = ayuda completa.
     */
    dominios?: MapaDominio;
  }

  let {
    layout, held, next = null, lastWrong = false,
    guia = new Set<string>(), variante = 'practica', objetivos = undefined,
    etiqueta = undefined,
    dominios = new Map<string, number>(),
  }: Props = $props();

  const U = 62;    // ancho de una tecla en unidades SVG
  const GAP = 5;
  const H = 62;
  /** Radio de la tecla, en unidades del viewBox. */
  const R = 9;

  interface Placed extends KeyDef { x: number; y: number; w: number }

  const placed = $derived.by<Placed[]>(() => {
    const out: Placed[] = [];
    layout.rows.forEach((row, r) => {
      let x = 0;
      const y = r * (H + GAP);
      for (const k of row) {
        const w = (k.width ?? 1) * U + ((k.width ?? 1) - 1) * GAP;
        out.push({ ...k, x, y, w });
        x += w + GAP;
      }
    });
    return out;
  });

  const width = $derived(
    Math.max(...layout.rows.map(r =>
      r.reduce((s, k) => s + (k.width ?? 1) * U + ((k.width ?? 1) - 1) * GAP + GAP, 0))) - GAP,
  );
  const height = $derived(layout.rows.length * (H + GAP) - GAP);

  /* El anillo de la tecla siguiente va separado del borde y sobresale de la
     tecla. Los márgenes le dejan sitio dentro del viewBox —y no como relleno
     CSS— para que forme parte de lo que se escala cuando el teclado tiene que
     encogerse. Arriba cuenta además lo que se levanta la tecla (2). */
  const ANILLO_SEPARACION = 4;
  const ANILLO_GROSOR = 3;
  const ANILLO_FUERA = ANILLO_SEPARACION + ANILLO_GROSOR;
  const MARGEN_ARRIBA = ANILLO_FUERA + 3;
  const MARGEN_LADO = ANILLO_FUERA + 1;
  const MARGEN_ABAJO = ANILLO_FUERA + 1;

  const fingerVar = (f: Finger) => `var(--finger-${f})`;

  const objetivosEfectivos = $derived<ReadonlySet<string>>(
    variante !== 'reposo'
      ? new Set<string>()
      : (objetivos ?? new Set(
          placed.filter(k => guia.has(k.code) && tieneRelieve(k)).map(k => k.code),
        )),
  );

  /** La F y la J: las de reposo de los índices, las que llevan relieve. */
  function tieneRelieve(k: KeyDef): boolean {
    return k.home === true && (k.finger === 'l-index' || k.finger === 'r-index');
  }

  function state(k: Placed): 'pressed' | 'next' | 'idle' {
    if (held.has(k.code)) return 'pressed';
    if (next && next.code === k.code) return 'next';
    if (objetivosEfectivos.has(k.code)) return 'next';
    return 'idle';
  }

  /** ¿Hay que pulsar Mayús o AltGr a la vez? Se resalta también el modificador. */
  function modifierActive(k: Placed): boolean {
    if (!next) return false;
    if (next.shift && (k.code === 'ShiftLeft' || k.code === 'ShiftRight')) return true;
    if (next.altgr && k.code === 'AltRight') return true;
    return false;
  }

  /* La tecla siguiente se dibuja la última: su anillo sobresale hacia las
     vecinas y tiene que quedar por encima de ellas, no debajo. */
  const ordenadas = $derived(
    [...placed].sort((a, b) => Number(state(a) === 'next') - Number(state(b) === 'next')),
  );

  const label = $derived(
    etiqueta ??
      (next
        ? `Teclado en pantalla. Siguiente tecla: ${next.char === ' ' ? 'espacio' : next.char}` +
          `, con el ${FINGER_NAMES[next.finger]}` +
          (next.dead ? '. Es un acento: no aparecerá nada hasta la letra siguiente.' : '')
        : 'Teclado en pantalla.'),
  );
</script>

<svg
  class="keyboard"
  viewBox="{-MARGEN_LADO} {-MARGEN_ARRIBA} {width + 2 * MARGEN_LADO} {height + MARGEN_ARRIBA + MARGEN_ABAJO}"
  role="img"
  aria-label={label}
  preserveAspectRatio="xMidYMid meet"
>
  {#each ordenadas as k (k.code)}
    {@const st = state(k)}
    {@const isMod = modifierActive(k)}
    {@const enGuia = guia.has(k.code)}
    {@const reposo = variante === 'reposo'}
    {@const control = !!k.label}
    {@const opac = control || reposo ? 1 : opacidadEtiqueta(dominios.get(k.code) ?? 0)}
    {@const dedo = fingerVar(k.finger)}
    {@const tinta = st === 'next'
      ? 'var(--on-finger)'
      : st === 'pressed' && !lastWrong ? 'var(--accent-fg)' : null}
    <g class="key {st}" class:mod={isMod} class:control class:guia={enGuia}
       class:wrong={st === 'pressed' && lastWrong}>
      <!-- Sombra inferior: el canto de la tecla. La siguiente la lleva del
           color de su dedo, oscurecido con el velo de --scrim. -->
      {#if st !== 'pressed'}
        <rect class="sombra" x={k.x} y={k.y + (st === 'next' ? 4 : 2)} width={k.w} height={H} rx={R}
              fill={st === 'next' ? dedo : 'var(--border-strong)'} />
        {#if st === 'next'}
          <rect class="sombra" x={k.x} y={k.y + 4} width={k.w} height={H} rx={R} fill="var(--scrim)" />
        {/if}
      {/if}

      <rect
        class="cap"
        x={k.x} y={k.y} width={k.w} height={H} rx={R}
        fill={st === 'pressed'
          ? (lastWrong ? 'var(--error-bg)' : 'var(--accent)')
          : st === 'next' ? dedo
          : reposo && enGuia ? `color-mix(in srgb, ${dedo} 18%, var(--surface))`
          : control && !isMod && !enGuia ? 'var(--surface-sunken)' : 'var(--surface)'}
        stroke={st === 'next' || (reposo && enGuia)
          ? dedo
          : isMod || enGuia ? 'var(--accent)'
          : st === 'pressed' && lastWrong ? 'var(--error)' : 'var(--border-strong)'}
        stroke-width={reposo && enGuia ? 2 : isMod || enGuia ? 3 : 1.5}
        stroke-dasharray={isMod && st !== 'pressed' ? '7 4' : undefined}
      />

      <!-- Barra de color del dedo. Nunca es la única señal: el nombre del dedo
           va también en texto en la pista de la lección. En la tecla siguiente
           no hace falta: la tecla entera ya es de ese color. -->
      {#if (k.base || k.label) && st !== 'next'}
        <rect
          x={k.x + 5} y={k.y + H - 7} width={k.w - 10} height="4" rx="2"
          fill={dedo} opacity={st === 'pressed' ? 0.95 : 0.7}
        />
      {/if}

      <!-- Muesca de la F y la J, como su relieve: es lo que permite volver a
           la fila de reposo sin mirar. Algo a la derecha del centro para no
           pisar el rabito de la j; centrada cuando la letra va centrada. -->
      {#if tieneRelieve(k)}
        <rect class="muesca" x={k.x + k.w / 2 - (reposo ? 7 : 2)} y={k.y + H - 12} width="14" height="3" rx="1.5"
              fill={tinta ?? 'var(--fg-muted)'} />
      {/if}

      {#if control}
        <text x={k.x + k.w / 2} y={k.y + H / 2 + 4} class="lbl small"
              fill={tinta ?? 'var(--fg-muted)'}>
          {k.label}
        </text>
      {:else if reposo}
        <!-- Lección cero: la letra como está impresa en la tecla de verdad. -->
        <text class="lbl main centro" x={k.x + k.w / 2} y={k.y + H / 2 + 8}
              fill={tinta ?? 'var(--fg)'}>{k.base?.toUpperCase()}</text>
      {:else}
        {#if k.shift}
          <text x={k.x + 9} y={k.y + 21} class="lbl tiny sup" opacity={opac}
                fill={tinta ?? (opac < 1 ? 'var(--fg)' : 'var(--fg-muted)')}>{k.shift}</text>
        {/if}
        <text
          x={k.x + 9} y={k.y + H - 15} class="lbl main" opacity={opac}
          fill={tinta ?? 'var(--fg)'}
        >{k.base}</text>
        {#if k.altgr}
          <text x={k.x + k.w - 9} y={k.y + H - 15} class="lbl tiny alt" opacity={opac}
                fill={tinta ?? (opac < 1 ? 'var(--fg)' : 'var(--fg-muted)')}>{k.altgr}</text>
        {/if}
        <!-- La tecla aprendida no se queda vacía, que parecería un fallo de
             dibujo: lleva una marca que significa «esta ya te la sabes». -->
        {#if opac === 0}
          <circle cx={k.x + k.w / 2} cy={k.y + H / 2 - 2} r="3.5"
                  fill={tinta ?? 'var(--fg-muted)'} />
        {/if}
      {/if}

      <!-- Señal de forma para la tecla objetivo: quien no distinga el color
           igualmente ve el anillo y el triángulo. -->
      {#if st === 'next'}
        <rect
          class="anillo"
          x={k.x - ANILLO_SEPARACION - ANILLO_GROSOR / 2}
          y={k.y - ANILLO_SEPARACION - ANILLO_GROSOR / 2}
          width={k.w + 2 * ANILLO_SEPARACION + ANILLO_GROSOR}
          height={H + 2 * ANILLO_SEPARACION + ANILLO_GROSOR}
          rx={R + ANILLO_SEPARACION + ANILLO_GROSOR / 2}
          fill="none" stroke={dedo} stroke-width={ANILLO_GROSOR}
        />
        <path
          d="M {k.x + k.w / 2 - 6} {k.y + 5} L {k.x + k.w / 2 + 6} {k.y + 5} L {k.x + k.w / 2} {k.y + 12} Z"
          fill="var(--on-finger)"
        />
      {/if}
    </g>
  {/each}
</svg>

<style>
  /* Ocupa el hueco que le deja el contenedor y se escala para caber entero:
     es la pieza que absorbe la diferencia cuando la ventana es baja o el texto
     está al 200%. */
  .keyboard {
    width: 100%;
    height: 100%;
    min-height: 0;
    display: block;
  }

  .key { transition: transform var(--motion-fast) var(--ease); }
  .key rect { transition: fill var(--motion-fast) var(--ease); }
  /* La siguiente se levanta y la pulsada se hunde hasta su sombra. En el SVG
     los px de un transform son unidades del viewBox; MARGEN_ARRIBA y
     MARGEN_ABAJO cuentan con estos 2. */
  .key.next { transform: translateY(-2px); }
  .key.pressed { transform: translateY(2px); }

  .lbl {
    font-family: var(--font-key);
    pointer-events: none;
    user-select: none;
  }
  .main { font-size: var(--text-key-main); font-weight: 500; }
  .centro { text-anchor: middle; }
  .small { font-size: var(--text-key-small); text-anchor: middle; }
  .tiny { font-size: var(--text-key-tiny); }
  .alt { text-anchor: end; }
  /* La `y` de esta etiqueta es una constante del viewBox (k.y + 21), así que al
     crecer la letra principal se le echa encima. Se sube en proporción a lo que
     ha crecido la fuente; a escala 1 es translateY(0). */
  .sup { transform: translateY(calc(-20px * (var(--factor-tecla) - 1))); }
</style>
