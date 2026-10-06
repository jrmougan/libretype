<script lang="ts">
  /**
   * Tamaño del texto: cuatro botones de valor fijo y, en Ajustes, también el
   * deslizador.
   *
   * Está en la primera pantalla además de en Ajustes porque quien necesita la
   * letra grande no puede tener que leer en pequeño para encontrar dónde se
   * agranda. Cada botón enseña una muestra a su tamaño en vez de describirlo.
   */
  import { ESCALA_MAX, ESCALA_MIN, ESCALAS_FIJAS } from '../tamano';

  interface Props {
    escala: number;
    onCambiar: (escala: number) => void;
    /** El deslizador da el ajuste fino; en la primera pantalla sobra. */
    conDeslizador?: boolean;
    /** Identificador para enlazar etiquetas si hay más de uno en la página. */
    id?: string;
  }

  let { escala, onCambiar, conDeslizador = false, id = 'tamano' }: Props = $props();

  const pct = (n: number) => `${Math.round(n * 100)}%`;
  const igual = (a: number, b: number) => Math.abs(a - b) < 0.001;
</script>

<div class="tamano">
  <span id="{id}-l" class="titulo">Tamaño del texto: <span class="valor">{pct(escala)}</span></span>
  <div class="group botones" role="group" aria-labelledby="{id}-l">
    {#each ESCALAS_FIJAS as valor (valor)}
      <button
        type="button"
        aria-pressed={igual(escala, valor)}
        aria-label="Texto al {pct(valor)}"
        onclick={() => onCambiar(valor)}
      >
        <!-- La muestra crece con el valor pero no con la escala actual: así se
             comparan entre sí aunque ya esté todo grande. -->
        <span class="muestra" aria-hidden="true" style="font-size: calc(1rem * {valor})">Aa</span>
        <!-- La marca va junto a la cifra y no delante de la muestra (como en
             los demás grupos): así la muestra queda alineada con las otras. -->
        <span class="cifra" aria-hidden="true">{#if igual(escala, valor)}<span class="marca">✓</span>{/if}{pct(valor)}</span>
      </button>
    {/each}
  </div>
  {#if conDeslizador}
    <label class="fino">
      <span>Ajuste fino</span>
      <input
        id="{id}-rango"
        type="range"
        min={ESCALA_MIN}
        max={ESCALA_MAX}
        step="0.05"
        value={escala}
        aria-valuetext={pct(escala)}
        oninput={(e) => onCambiar(+e.currentTarget.value)}
      />
    </label>
  {/if}
  <p class="nota">También con Ctrl y + o −, y Ctrl y 0 para volver al 100%.</p>
</div>

<style>
  .tamano { display: grid; gap: var(--space-2); justify-items: start; }
  .titulo { font-weight: 700; }
  /* El valor elegido en tinta de acento, como en la maqueta del deslizador. */
  .valor { color: var(--accent-ink); font-variant-numeric: tabular-nums; }

  /* Grupo segmentado de base.css, con botones altos porque llevan muestra. */
  .botones button {
    display: inline-flex;
    flex-direction: column;
    align-items: center;
    justify-content: flex-end;
    min-width: calc(var(--target-min) * 1.5);
    min-height: calc(var(--target-min) * 1.5);
    padding: var(--space-1) var(--space-3);
    gap: 0;
  }
  /* Lo elegido: papel, contorno más grueso, negrita y ✓. Nunca solo color. */
  .botones button[aria-pressed='true'] { border: 2px solid var(--fg); }
  .botones button[aria-pressed='true']::before { content: none; }
  .muestra { line-height: 1.1; font-weight: 700; }
  .cifra { font-size: var(--text-xs); font-variant-numeric: tabular-nums; }
  .marca { margin-right: 0.25em; }
  .fino { display: grid; gap: var(--space-1); font-size: var(--text-sm); justify-self: stretch; }
  .fino input { min-height: var(--target-min); width: 100%; }
  .nota { margin: 0; font-size: var(--text-sm); color: var(--fg-muted); }
</style>
