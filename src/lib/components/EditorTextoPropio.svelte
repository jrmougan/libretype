<script lang="ts">
  /** Texto de un solo uso: se pega, se practica y no se guarda salvo que se pida. */
  import { onMount } from 'svelte';

  interface Props {
    texto: string;
    error?: string;
    onEmpezar: () => void;
    onGuardarComoLeccion: () => void;
  }

  let { texto = $bindable(), error = '', onEmpezar, onGuardarComoLeccion }: Props = $props();

  let campo = $state<HTMLTextAreaElement | null>(null);
  // Se viene a escribir. Además, «Cambiar texto» desaparece al abrirse esto y, sin
  // llevar el foco a algún sitio, el teclado se quedaría en el documento.
  onMount(() => campo?.focus());
</script>

<!-- Una tarjeta centrada, como las demás pantallas de entrada. -->
<section class="centrado editor-propio" aria-labelledby="propio-tit">
  <p class="antetitulo">Práctica libre · Texto propio</p>
  <h2 id="propio-tit">Práctica libre con texto propio</h2>
  <p class="descripcion" id="propio-desc">Escribe o pega el texto que quieras practicar. Los caracteres que no estén en tu teclado se quitarán.</p>
  <label for="texto-propio-input" class="sr-only">Tu texto</label>
  <textarea
    bind:this={campo}
    id="texto-propio-input"
    class="input-texto-propio"
    rows="4"
    aria-describedby="propio-desc"
    aria-invalid={error ? true : undefined}
    bind:value={texto}
    placeholder="Escribe o pega aquí tu texto…"
  ></textarea>
  {#if error}
    <p class="aviso-error" role="alert">{error}</p>
  {/if}
  <div class="acciones-propio">
    <!-- Decorativo para el lector: el campo ya dice lo que contiene. -->
    <span class="contador">{texto.length === 1 ? '1 carácter' : `${texto.length} caracteres`}</span>
    <span class="botones">
      <button class="primario" onclick={onEmpezar}>Empezar a teclear</button>
      <button onclick={onGuardarComoLeccion}>Guardar como lección</button>
    </span>
  </div>
</section>

<style>
  /* `safe`: si con la letra grande no cabe, centrar lo dejaría sin poder llegar
     a su parte de arriba. */
  .centrado { align-self: safe center; justify-self: center; }
  .editor-propio {
    display: grid;
    gap: var(--space-3);
    width: min(calc(47.5rem * var(--ui-scale)), 100%);
    padding: var(--space-6);
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--radius-panel);
  }
  h2 { margin: 0; font-size: var(--text-xl); line-height: 1.2; }
  .descripcion { margin: 0; font-size: var(--text-md); color: var(--fg-muted); }
  /* El campo se ve como campo aunque no tenga el foco: borde de acento. Al
     enfocarlo gana un halo, además del contorno de foco de siempre. */
  .input-texto-propio {
    width: 100%;
    min-height: calc(7.5rem * var(--ui-scale));
    font-family: var(--font-drill);
    font-size: var(--text-lg);
    line-height: 1.6;
    padding: var(--space-3) var(--space-4);
    resize: vertical;
  }
  /* Con error manda el borde de `aria-invalid` de base.css. */
  .input-texto-propio:not([aria-invalid='true']) { border: var(--borde-grueso) solid var(--accent); }
  .input-texto-propio:focus { box-shadow: 0 0 0 4px var(--accent-soft); }
  /* El error no se dice solo con color: lleva barra, fondo y el borde grueso
     del campo (aria-invalid, en base.css). */
  .aviso-error {
    margin: 0;
    padding: var(--space-2) var(--space-3);
    border-left: 4px solid var(--error);
    background: var(--error-bg);
    color: var(--fg);
    border-radius: 0 var(--radius) var(--radius) 0;
  }
  .acciones-propio {
    display: flex;
    align-items: center;
    justify-content: space-between;
    flex-wrap: wrap;
    gap: var(--space-3);
  }
  .botones { display: flex; flex-wrap: wrap; gap: var(--space-2); align-items: center; }
  .contador { font-size: var(--text-sm); color: var(--fg-muted); font-variant-numeric: tabular-nums; }
  /* Con la letra grande la tarjeta no puede gastar media pantalla en aire. */
  :global(.app.compacta) .editor-propio { padding: var(--space-4); gap: var(--space-2); }
  :global(.app.compacta) .input-texto-propio { min-height: calc(4rem * var(--ui-scale)); line-height: 1.35; }
</style>
