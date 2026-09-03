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
    guia = new Set<string>(), etiqueta = undefined,
    dominios = new Map<string, number>(),
  }: Props = $props();

  const U = 62;    // ancho de una tecla en unidades SVG
  const GAP = 5;
  const H = 58;

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
  /** Hueco para el triángulo que señala la tecla objetivo. Va dentro del
      viewBox y no como relleno CSS, para que forme parte de lo que se escala
      cuando el teclado tiene que encogerse. */
  const MARGEN_ARRIBA = 16;

  const fingerVar = (f: Finger) => `var(--finger-${f})`;

  function state(k: Placed): 'pressed' | 'next' | 'idle' {
    if (held.has(k.code)) return 'pressed';
    if (next && next.code === k.code) return 'next';
    return 'idle';
  }

  /** ¿Hay que pulsar Mayús o AltGr a la vez? Se resalta también el modificador. */
  function modifierActive(k: Placed): boolean {
    if (!next) return false;
    if (next.shift && (k.code === 'ShiftLeft' || k.code === 'ShiftRight')) return true;
    if (next.altgr && k.code === 'AltRight') return true;
    return false;
  }

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
  viewBox="0 {-MARGEN_ARRIBA} {width} {height + MARGEN_ARRIBA}"
  role="img"
  aria-label={label}
  preserveAspectRatio="xMidYMid meet"
>
  {#each placed as k (k.code)}
    {@const st = state(k)}
    {@const isMod = modifierActive(k)}
    {@const enGuia = guia.has(k.code)}
    {@const opac = k.label ? 1 : opacidadEtiqueta(dominios.get(k.code) ?? 0)}
    <g class="key {st}" class:mod={isMod} class:wrong={st === 'pressed' && lastWrong}>
      <rect
        x={k.x} y={k.y} width={k.w} height={H} rx="7"
        fill={st === 'pressed'
          ? (lastWrong ? 'var(--error-bg)' : 'var(--accent)')
          : st === 'next' || isMod || enGuia ? 'var(--surface)' : 'var(--surface-sunken)'}
        stroke={st === 'next' || isMod || enGuia
          ? 'var(--accent)'
          : st === 'pressed' && lastWrong ? 'var(--error)' : 'var(--border)'}
        stroke-width={st === 'next' || isMod || enGuia ? 3.5 : 1.5}
        stroke-dasharray={isMod && st !== 'pressed' ? '7 4' : undefined}
      />

      <!-- Barra de color del dedo. Nunca es la única señal: el nombre del dedo
           va también en texto en la pista de la lección. -->
      {#if k.base || k.label}
        <rect
          x={k.x + 5} y={k.y + H - 7} width={k.w - 10} height="3.5" rx="2"
          fill={fingerVar(k.finger)} opacity={st === 'pressed' ? 0.95 : 0.65}
        />
      {/if}

      <!-- Muesca de la fila de reposo, como el relieve de F y J. -->
      {#if k.home}
        <rect x={k.x + k.w / 2 - 9} y={k.y + H - 15} width="18" height="2.5" rx="1.5"
              fill="var(--fg-muted)" opacity="0.75" />
      {/if}

      {#if k.label}
        <text x={k.x + k.w / 2} y={k.y + H / 2 + 4} class="lbl small"
              fill={st === 'pressed' && !lastWrong ? 'var(--accent-fg)' : 'var(--fg-muted)'}>
          {k.label}
        </text>
      {:else}
        {#if k.shift}
          <text x={k.x + 9} y={k.y + 19} class="lbl tiny" opacity={opac}
                fill="var(--fg-muted)">{k.shift}</text>
        {/if}
        <text
          x={k.x + 9} y={k.y + H - 17} class="lbl main" opacity={opac}
          fill={st === 'pressed' && !lastWrong ? 'var(--accent-fg)' : 'var(--fg)'}
        >{k.base}</text>
        {#if k.altgr}
          <text x={k.x + k.w - 9} y={k.y + H - 17} class="lbl tiny alt" opacity={opac}
                fill="var(--fg-muted)">{k.altgr}</text>
        {/if}
        <!-- La tecla aprendida no se queda vacía, que parecería un fallo de
             dibujo: lleva una marca que significa «esta ya te la sabes». -->
        {#if opac === 0}
          <circle cx={k.x + k.w / 2} cy={k.y + H / 2 - 2} r="3"
                  fill="var(--fg-muted)" opacity="0.5" />
        {/if}
      {/if}

      <!-- Señal de forma para la tecla objetivo: quien no distinga el color
           igualmente ve el triángulo. -->
      {#if st === 'next'}
        <path
          d="M {k.x + k.w / 2 - 7} {k.y - 11} L {k.x + k.w / 2 + 7} {k.y - 11} L {k.x + k.w / 2} {k.y - 2} Z"
          fill="var(--accent)"
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

  .key rect { transition: fill var(--motion-fast) var(--ease); }

  .lbl {
    font-family: var(--font-drill);
    pointer-events: none;
    user-select: none;
  }
  .main { font-size: 19px; }
  .small { font-size: 12px; text-anchor: middle; }
  .tiny { font-size: 11px; }
  .alt { text-anchor: end; }
</style>
