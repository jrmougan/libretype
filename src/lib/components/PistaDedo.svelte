<script lang="ts">
  /**
   * Pista visual de la tecla siguiente: qué tecla, con qué dedo y, si es un
   * acento, qué viene después.
   *
   * Es la versión para la vista de la región `aria-live` de Drill, que ya dice
   * lo mismo en texto al lector de pantalla. Por eso todo el componente es
   * `aria-hidden`: repetirlo sería anunciar cada pulsación dos veces.
   *
   * El color del dedo nunca va solo: el título lo nombra en texto, y en la
   * tarjeta de manos la barra del dedo activo lleva además contorno y opacidad
   * completa.
   *
   * Orden de sacrificio dentro de la fila de pista (de lo primero que se va a
   * lo último), para que el teclado conserve su suelo al 200%:
   *
   * 1. La tarjeta de manos (`compacta`, y por ancho con poco sitio).
   * 2. La teja se encoge (`compacta`).
   * 3. El título y la descripción se quedan siempre: son la pista.
   */
  import { FINGER_NAMES, type Finger, type KeyStep } from '../keyboard/layouts';

  interface Props {
    /** Tecla que toca pulsar, o null si la lección ha terminado. */
    paso: KeyStep | null;
    /**
     * Cuando `paso` es una tecla muerta, la pulsación que la completa (la
     * vocal de la tilde). Se dibuja después de la flecha, en discontinuo.
     */
    despues?: KeyStep | null;
    /** Poco alto disponible (letra grande): se pliega la tarjeta de manos. */
    compacta?: boolean;
  }

  let { paso, despues = null, compacta = false }: Props = $props();

  /** Las manos de izquierda a derecha, con la altura relativa de cada dedo. */
  const MANOS: { dedo: Finger; alto: number }[] = [
    { dedo: 'l-pinky', alto: 0.62 },
    { dedo: 'l-ring', alto: 0.86 },
    { dedo: 'l-middle', alto: 1 },
    { dedo: 'l-index', alto: 0.9 },
    { dedo: 'thumb', alto: 0.5 },
    { dedo: 'r-index', alto: 0.9 },
    { dedo: 'r-middle', alto: 1 },
    { dedo: 'r-ring', alto: 0.86 },
    { dedo: 'r-pinky', alto: 0.62 },
  ];

  const dedoVar = (f: Finger) => `var(--finger-${f})`;

  const esEspacio = $derived(paso?.char === ' ');
  const teja = $derived(esEspacio ? 'Espacio' : (paso?.char ?? ''));

  const titulo = $derived.by(() => {
    if (!paso) return '';
    const dedo = FINGER_NAMES[paso.finger];
    if (paso.dead) return `Acento con el ${dedo}`;
    if (esEspacio) return `Espacio con el ${dedo}`;
    return `«${paso.char}» con el ${dedo}`;
  });

  const descripcion = $derived.by(() => {
    if (!paso) return '';
    const partes: string[] = [];
    const mods = [paso.shift && 'Mayús', paso.altgr && 'AltGr'].filter(Boolean);
    if (mods.length) {
      partes.push(`Con ${mods.join(' y ')} ${mods.length > 1 ? 'pulsadas' : 'pulsada'}.`);
    }
    if (paso.dead) {
      partes.push(despues
        ? `Es un acento: no se verá nada hasta que pulses la ${despues.char}.`
        : 'Es un acento: no se verá nada hasta la letra siguiente.');
    }
    return partes.join(' ');
  });
</script>

<div class="pista" class:compacta aria-hidden="true">
  {#if paso}
    <div class="tarjeta">
      <span class="tejas">
        <span class="teja" class:larga={esEspacio} style:--dedo={dedoVar(paso.finger)}>{teja}</span>
        {#if paso.dead && despues}
          <span class="flecha">→</span>
          <span class="teja despues" style:--dedo={dedoVar(despues.finger)}>{despues.char}</span>
        {/if}
      </span>
      <span class="textos">
        <strong class="titulo">{titulo}</strong>
        {#if descripcion}<span class="descripcion">{descripcion}</span>{/if}
      </span>
    </div>

    <div class="tarjeta manos">
      <span class="barras">
        {#each MANOS as m (m.dedo)}
          <span
            class="barra"
            class:pulgar={m.dedo === 'thumb'}
            class:activa={m.dedo === paso.finger}
            data-dedo={m.dedo}
            style:--dedo={dedoVar(m.dedo)}
            style:--alto={m.alto}
          ></span>
        {/each}
      </span>
      <span class="leyenda"><span>Izquierda</span><span>Derecha</span></span>
    </div>
  {:else}
    <p class="fin">Lección terminada.</p>
  {/if}
</div>

<style>
  .pista {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    gap: var(--space-2);
    align-items: stretch;
    min-width: 0;
  }

  .tarjeta {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    padding: var(--space-2) var(--space-3);
    display: flex;
    align-items: center;
    gap: var(--space-3);
    min-width: 0;
  }

  .tejas { display: flex; align-items: center; gap: var(--space-2); flex: none; }

  /* 60px a escala 100%. */
  .teja {
    --lado: calc(3.75rem * var(--ui-scale));
    min-width: var(--lado);
    height: var(--lado);
    padding: 0 var(--space-2);
    box-sizing: border-box;
    display: grid;
    place-items: center;
    background: var(--dedo);
    color: var(--on-finger);
    border-radius: var(--radius);
    font-family: var(--font-key);
    font-size: calc(1.75rem * var(--ui-scale));
    font-weight: 700;
    line-height: 1;
    /* El canto, del color del dedo oscurecido: el velo de --scrim va encima
       del color y funciona igual en claro que en oscuro. */
    box-shadow: 0 3px 0 var(--scrim), 0 3px 0 var(--dedo);
  }
  .teja.larga { font-size: var(--text-base); }

  /* La vocal que completa la tilde: todavía no toca, así que va en hueco. */
  .teja.despues {
    background: var(--surface);
    color: var(--fg);
    border: 2px dashed var(--dedo);
    box-shadow: none;
  }

  .flecha { font-size: var(--text-lg); color: var(--fg-muted); }

  .textos { display: flex; flex-direction: column; gap: var(--space-1); min-width: 0; }
  .titulo { font-size: calc(1.1875rem * var(--ui-scale)); line-height: 1.25; color: var(--fg); }
  .descripcion { font-size: var(--text-base); line-height: 1.35; color: var(--fg-muted); }

  .manos { flex-direction: column; justify-content: flex-end; gap: var(--space-1); }

  .barras {
    display: flex;
    align-items: flex-end;
    gap: calc(0.25rem * var(--ui-scale));
    /* 64px a escala 100%: la altura del dedo más largo. */
    height: calc(4rem * var(--ui-scale));
  }
  .barra {
    width: calc(1.125rem * var(--ui-scale));
    height: calc(var(--alto) * 4rem * var(--ui-scale));
    background: var(--dedo);
    border-radius: var(--radius-chip);
    opacity: 0.28;
    box-sizing: border-box;
  }
  .barra.pulgar { width: calc(1.875rem * var(--ui-scale)); }
  /* El dedo activo no se distingue solo por el color: opacidad completa y
     contorno. */
  .barra.activa {
    opacity: 1;
    outline: 3px solid var(--fg);
    outline-offset: 1px;
  }

  .leyenda {
    display: flex;
    justify-content: space-between;
    gap: var(--space-2);
    font-size: var(--text-xs);
    color: var(--fg-muted);
  }

  .fin { margin: 0; font-size: var(--text-lg); color: var(--fg-muted); }

  /* 1 y 2 del orden de sacrificio: con la letra grande la fila no puede
     comerse el suelo del teclado. */
  .compacta { grid-template-columns: minmax(0, 1fr); }
  .compacta .manos { display: none; }
  .compacta .tarjeta { padding: var(--space-1) var(--space-3); }
  .compacta .teja { --lado: calc(2.25rem * var(--ui-scale)); font-size: calc(1.25rem * var(--ui-scale)); }
  .compacta .teja.larga { font-size: var(--text-sm); }

  /* Con poco ancho, la tarjeta de manos también es lo primero que se va. */
  @media (max-width: 40rem) {
    .pista { grid-template-columns: minmax(0, 1fr); }
    .manos { display: none; }
  }

  /* En alto contraste del sistema los fondos se pierden: el borde es lo que
     deja ver la teja y las barras (la activa conserva además su contorno). */
  @media (forced-colors: active) {
    .teja, .barra { border: 2px solid CanvasText; }
  }
</style>
