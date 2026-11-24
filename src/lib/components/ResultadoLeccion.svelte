<script lang="ts">
  /**
   * El diálogo de fin de lección. Su trabajo es dejar claro el siguiente paso, así
   * que siempre hay una acción principal, va la primera y es la que recibe el foco:
   * Intro sigue adelante sin tener que buscar nada. Y siempre hay salida, también
   * donde no hay «lección siguiente».
   */
  import type { Stats } from '../keyboard/engine';
  import { alcanzaObjetivo } from '../storage/objetivos';
  import { PRECISION_ALTA, type Voz } from '../voz';

  export interface Accion {
    texto: string;
    onclick: () => void;
  }

  interface Props {
    stats: Stats;
    record: boolean;
    celebra: boolean;
    /** Tono con celebración: el diálogo lleva la franja con los colores de los dedos. */
    franja?: boolean;
    voz: Voz;
    /** La forma de seguir adelante que tenga este ejercicio. */
    avance: Accion | null;
    onRepetir: () => void;
    /** Frase sobre el objetivo de la lección; ya viene redactada desde `objetivos`. */
    nota?: string | null;
    errorGuardado?: boolean;
    /** Si hay teclas que piden repaso, cómo ir a practicarlas. */
    repaso?: Accion | null;
    /** Las teclas que más costaron en este intento, ya enumeradas («la P y la tilde»). */
    costaron?: string;
    /** Cómo practicar justo esas teclas, si se puede con lo que ya ha visto. */
    refuerzoTeclas?: Accion | null;
    /** Teclas que acaban de dejar de necesitar la letra en pantalla, ya enumeradas. */
    logro?: string;
  }

  let {
    stats, record, celebra, franja = false, voz, avance, onRepetir,
    nota = null, errorGuardado = false, repaso = null, costaron = '', refuerzoTeclas = null, logro = '',
  }: Props = $props();

  /** Por debajo del objetivo lo natural es repetir; por encima, seguir. */
  const repetirPrimero = $derived(!alcanzaObjetivo(stats.accuracy) || !avance);
  const animo = $derived(
    !alcanzaObjetivo(stats.accuracy) ? voz.animoBajo
      : stats.accuracy >= PRECISION_ALTA ? voz.animoAlto
      : voz.animoMedio,
  );

  // El diálogo nativo mantiene Tab dentro y hace inerte el fondo. Al cerrarlo
  // restaura el foco de quien lo abrió.
  function abrir(dialogo: HTMLDialogElement): { destroy: () => void } {
    dialogo.showModal();
    dialogo.querySelector<HTMLElement>('.primario')?.focus();
    return { destroy: () => dialogo.close() };
  }
</script>

<!-- Superpuesto: aparecer no puede mover el teclado de sitio. El <dialog> ocupa
     la ventana y pinta el velo; la caja va centrada encima. -->
<dialog
  id="dialogo-resultado"
  class="capa"
  use:abrir
  aria-labelledby="resultado-titulo"
  aria-describedby="resultado-desc"
  oncancel={(e) => { e.preventDefault(); onRepetir(); }}
>
  <!-- Una sola región viva en todo el diálogo: anidar otra (en el <dialog> o en
       el aviso de guardado) hacía que el lector anunciase lo mismo dos veces. -->
  <div class="resultado" class:record class:celebra aria-live="polite">
    <!-- La franja con los colores de los dedos es del tono con celebración: en
         el tranquilo, el resultado no se adorna. -->
    {#if franja}<div class="franja" aria-hidden="true"></div>{/if}
    <div class="res-cuerpo">
      <div class="res-cab">
        <!-- El récord se dice con la estrella y la palabra, no solo con el color. -->
        {#if record}<span class="chip celebra chip-record">★ Récord</span>{/if}
        <h2 id="resultado-titulo">{record ? voz.record : voz.terminada}</h2>
      </div>
      <div id="resultado-desc">
        <div class="cifras">
          <p class="cifra">
            <span class="cifra-valor">{stats.wpm}</span>
            <span class="cifra-eti">palabras por minuto<span class="sr-only">,</span></span>
          </p>
          <!-- El fondo de acierto solo cuando lo es: por debajo del objetivo la
               tarjeta queda neutra, sin rojo ni reproche. -->
          <p class="cifra" class:cifra-ok={alcanzaObjetivo(stats.accuracy)}>
            <span class="cifra-valor">{stats.accuracy}%</span>
            <span class="cifra-eti">de precisión<span class="sr-only">.</span></span>
          </p>
        </div>
        <p class="animo">{animo}</p>
      </div>
      <!-- Un logro medido con uno mismo: es lo que el teclado en pantalla deja de enseñar. -->
      {#if logro}<p class="logro">Ya escribes sin mirar {logro}.</p>{/if}
      {#if nota}<p class="note">{nota}</p>{/if}
      {#if errorGuardado}
        <p class="note">No se ha podido guardar el resultado. Este intento solo contará hasta que cierres la aplicación.</p>
      {/if}
      <!-- El principal va el primero y se lleva el ancho. -->
      <div class="botones">
        {#if repetirPrimero}
          <button class="primario" onclick={onRepetir}>{voz.repetir}</button>
          {#if avance}<button onclick={avance.onclick}>{avance.texto}</button>{/if}
        {:else if avance}
          <button class="primario" onclick={avance.onclick}>{avance.texto}</button>
          <button onclick={onRepetir}>{voz.repetir}</button>
        {/if}
      </div>
    </div>
    {#if costaron || repaso}
      <div class="res-pie">
        <!-- «86 %» no dice qué hacer después; «las que más costaron: la P» sí. El
             sujeto son las teclas, nunca la persona. -->
        {#if costaron}
          <div class="repaso costaron">
            <p class="note">{voz.costaron} {costaron}. {voz.costaronAnimo}</p>
            {#if refuerzoTeclas}<button class="suave" onclick={refuerzoTeclas.onclick}>{refuerzoTeclas.texto}</button>{/if}
          </div>
        {/if}
        {#if repaso}
          <div class="repaso">
            <p class="note">{voz.repaso} Puedes practicar a tu ritmo con vocabulario conocido.</p>
            <button class="suave" onclick={repaso.onclick}>{repaso.texto}</button>
          </div>
        {/if}
      </div>
    {/if}
  </div>
</dialog>

<style>
  dialog {
    color: var(--fg);
    max-width: none;
    max-height: none;
    margin: 0;
    border: 0;
  }
  /* El velo va en el propio diálogo y no en ::backdrop, que no hereda los
     tokens en todos los WebKit que soportamos. */
  dialog::backdrop { background: transparent; }
  .capa {
    position: fixed; inset: 0;
    width: 100%; height: 100%;
    display: grid; place-items: center;
    background: var(--scrim);
    padding: var(--space-4);
  }
  .resultado {
    width: min(calc(36.25rem * var(--ui-scale)), 100%);
    display: grid;
    min-height: 0;
    max-height: 100%;
    overflow-y: auto;
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--radius-panel);
    box-shadow: var(--shadow-panel);
  }
  /* Los nueve colores de los dedos, en el orden del teclado. Decorativa: no
     dice nada que no diga el texto. */
  .franja {
    height: calc(var(--space-2) + var(--space-1) / 2);
    background: linear-gradient(90deg,
      var(--finger-l-pinky) 0 11.11%, var(--finger-l-ring) 0 22.22%,
      var(--finger-l-middle) 0 33.33%, var(--finger-l-index) 0 44.44%,
      var(--finger-thumb) 0 55.55%, var(--finger-r-index) 0 66.66%,
      var(--finger-r-middle) 0 77.77%, var(--finger-r-ring) 0 88.88%,
      var(--finger-r-pinky) 0 100%);
  }
  .res-cuerpo {
    display: grid;
    gap: var(--space-3);
    padding: var(--space-6);
  }
  .res-cab { display: grid; gap: var(--space-2); justify-items: start; }
  h2 { margin: 0; font-size: var(--text-xl); line-height: 1.2; overflow-wrap: anywhere; }
  #resultado-desc { display: grid; gap: var(--space-3); }
  .cifras {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(min(100%, calc(12rem * var(--ui-scale))), 1fr));
    gap: var(--space-3);
  }
  .cifra {
    margin: 0;
    display: grid;
    padding: var(--space-3) var(--space-4);
    border-radius: var(--radius-card);
    background: var(--surface-sunken);
  }
  .cifra-valor {
    font-size: var(--text-cifra-grande);
    font-weight: 700;
    line-height: 1.1;
    font-variant-numeric: tabular-nums;
  }
  .cifra-eti { font-size: var(--text-sm); color: var(--fg-muted); }
  /* El acierto se dice con la cifra y el texto; el fondo verde acompaña. */
  .cifra-ok { background: var(--ok-bg); }
  .cifra-ok .cifra-valor { color: var(--ok); }
  .cifra-ok .cifra-eti { color: var(--fg); }
  .animo { margin: 0; font-size: var(--text-lg); font-weight: 700; }
  .note { margin: 0; font-size: var(--text-sm); color: var(--fg-muted); }
  /* El logro se distingue por el texto y el borde, no solo por el color. */
  .logro {
    margin: 0;
    font-weight: 700;
    border-left: 4px solid var(--ok);
    padding-left: var(--space-2);
  }
  .botones { display: flex; gap: var(--space-2); flex-wrap: wrap; margin-top: var(--space-2); }
  .botones button { min-height: var(--target-primario); }
  .botones .primario { flex: 1 1 auto; }

  .res-pie {
    display: grid;
    gap: var(--space-3);
    padding: var(--space-4) var(--space-6);
    border-top: 1px solid var(--border);
  }
  .repaso {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-3);
    flex-wrap: wrap;
  }
  .repaso .note { flex: 1 1 calc(14rem * var(--ui-scale)); }

  /* Con la letra grande cada fila cuesta el doble: menos aire, mismas piezas. */
  :global(.compacta) .capa { padding: var(--space-2); }
  :global(.compacta) .res-cuerpo { padding: var(--space-4); gap: var(--space-2); }
  :global(.compacta) .res-pie { padding: var(--space-3) var(--space-4); }
  :global(.compacta) .cifra { padding: var(--space-2) var(--space-3); }
  :global(.compacta) .cifra-valor { font-size: calc(1.75rem * var(--ui-scale)); }

  /* El récord se distingue por el chip y su texto, no solo por un color. */
  .resultado.celebra {
    animation: celebrar var(--motion-slow) var(--ease) 2 alternate;
  }
  @keyframes celebrar { from { transform: scale(1); } to { transform: scale(1.015); } }
  @media (prefers-reduced-motion: reduce) { .resultado.celebra { animation: none; } }
  :global(:root[data-motion="reducido"]) .resultado.celebra,
  :global(:root[data-motion="reduced"]) .resultado.celebra {
    animation: none;
  }
  @media (forced-colors: active) {
    .resultado { border-color: CanvasText; }
    .cifra { border: 1px solid CanvasText; }
    .franja { display: none; }
  }
</style>
