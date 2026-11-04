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

<div class="centrado editor-propio">
  <h2>Práctica libre con texto propio</h2>
  <p class="note">Escribe o pega el texto que quieras practicar. Los caracteres que no estén en tu teclado se quitarán.</p>
  <label for="texto-propio-input" class="sr-only">Tu texto</label>
  <textarea
    bind:this={campo}
    id="texto-propio-input"
    class="input-texto-propio"
    rows="4"
    aria-invalid={error ? true : undefined}
    bind:value={texto}
    placeholder="Escribe o pega aquí tu texto…"
  ></textarea>
  {#if error}
    <p class="note aviso-error" role="alert">{error}</p>
  {/if}
  <div class="acciones-propio">
    <button class="primario" onclick={onEmpezar}>Empezar a teclear</button>
    <button onclick={onGuardarComoLeccion}>Guardar como lección</button>
  </div>
</div>

<style>
  /* `safe`: si con la letra grande no cabe, centrar lo dejaría sin poder llegar
     a su parte de arriba. */
  .centrado { align-self: safe center; justify-self: center; max-width: 72ch; }
  .editor-propio {
    display: grid;
    gap: var(--space-3);
    width: 100%;
  }
  h2 { margin: 0; font-size: var(--text-xl); }
  .input-texto-propio {
    width: 100%;
    font-family: var(--font-drill);
    padding: var(--space-3);
    resize: vertical;
  }
  .acciones-propio {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-2);
  }
  .note { margin: 0; font-size: var(--text-sm); color: var(--fg-muted); }
  .aviso-error { color: var(--error); }
</style>
