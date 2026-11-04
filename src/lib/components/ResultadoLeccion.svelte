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
    voz: Voz;
    /** La forma de seguir adelante que tenga este ejercicio. */
    avance: Accion | null;
    onRepetir: () => void;
    /** Frase sobre el objetivo de la lección; ya viene redactada desde `objetivos`. */
    nota?: string | null;
    errorGuardado?: boolean;
    /** Si hay teclas que piden repaso, cómo ir a practicarlas. */
    repaso?: Accion | null;
  }

  let {
    stats, record, celebra, voz, avance, onRepetir,
    nota = null, errorGuardado = false, repaso = null,
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

<!-- Superpuesto: aparecer no puede mover el teclado de sitio. -->
<dialog
  id="dialogo-resultado"
  class="capa"
  use:abrir
  aria-labelledby="resultado-titulo"
  aria-describedby="resultado-desc"
  aria-live="polite"
  oncancel={(e) => { e.preventDefault(); onRepetir(); }}
>
  <div class="resultado" class:record class:celebra aria-live="polite">
    <h2 id="resultado-titulo">
      {#if record}★ {voz.record}{:else}{voz.terminada}{/if}
    </h2>
    <div id="resultado-desc">
      <span class="cifras">{stats.wpm} palabras por minuto, {stats.accuracy}% de precisión.</span>
      <span class="animo">{animo}</span>
    </div>
    {#if nota}<p class="note">{nota}</p>{/if}
    {#if errorGuardado}
      <p class="note" role="status">No se ha podido guardar el resultado. Este intento solo contará hasta que cierres la aplicación.</p>
    {/if}
    <div class="botones">
      {#if repetirPrimero}
        <button class="primario" onclick={onRepetir}>{voz.repetir}</button>
        {#if avance}<button onclick={avance.onclick}>{avance.texto}</button>{/if}
      {:else if avance}
        <button class="primario" onclick={avance.onclick}>{avance.texto}</button>
        <button onclick={onRepetir}>{voz.repetir}</button>
      {/if}
    </div>
    {#if repaso}
      <div class="repaso">
        <p class="note">{voz.repaso} Puedes practicar a tu ritmo con vocabulario conocido.</p>
        <button onclick={repaso.onclick}>{repaso.texto}</button>
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
    border: var(--borde-grueso) solid var(--ok);
    border-radius: var(--radius);
    box-shadow: var(--sombra-capa);
  }
  h2 { margin: 0; font-size: var(--text-lg); }
  #resultado-desc { display: grid; gap: var(--space-1); }
  .cifras { font-variant-numeric: tabular-nums; }
  .animo { color: var(--fg-muted); }
  .note { margin: 0; font-size: var(--text-sm); color: var(--fg-muted); }
  .botones { display: flex; gap: var(--space-2); flex-wrap: wrap; margin-top: var(--space-2); }
  .repaso {
    display: grid; gap: var(--space-2);
    margin-top: var(--space-2);
    padding-top: var(--space-3);
    border-top: 1px solid var(--border);
    justify-items: start;
  }

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
</style>
