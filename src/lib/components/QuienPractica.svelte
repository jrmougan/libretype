<script lang="ts">
  /**
   * «¿Quién practica?», al abrir la aplicación cuando hay más de un perfil.
   *
   * Un perfil es un alias: sin contraseña y sin pedir edad, que no hace falta
   * para nada y clasificaría a la persona (ver AGENTS.md, «Tono»). Como no hay
   * contraseña, los perfiles no son privados entre sí, y aquí se dice tal
   * cual: en un equipo compartido cualquiera puede abrir cualquiera.
   */
  import { onMount, tick } from 'svelte';
  import { MAX_ALIAS, type Perfil } from '../storage/almacen';

  interface Props {
    perfiles: readonly Perfil[];
    onElegir: (id: number) => void;
    /** Crea el perfil y entra con él. Lanza con un mensaje legible si no puede. */
    onCrear: (alias: string) => Promise<void>;
  }

  let { perfiles, onElegir, onCrear }: Props = $props();

  let lista = $state<HTMLUListElement | null>(null);
  let creando = $state(false);
  let alias = $state('');
  let error = $state('');
  let campo = $state<HTMLInputElement | null>(null);

  // Quien llega con el teclado empieza ya sobre el primer nombre.
  onMount(() => lista?.querySelector('button')?.focus());

  async function crear(e: SubmitEvent): Promise<void> {
    e.preventDefault();
    error = '';
    try {
      await onCrear(alias);
    } catch (err) {
      error = err instanceof Error ? err.message : 'No se pudo crear el perfil.';
      campo?.focus();
    }
  }

  async function abrirFormulario(): Promise<void> {
    creando = true;
    await tick();
    campo?.focus();
  }
</script>

<section class="quien" aria-labelledby="quien-tit">
  <h2 id="quien-tit">¿Quién practica?</h2>
  <p class="intro">Elige tu nombre para seguir donde lo dejaste.</p>

  <ul class="perfiles" bind:this={lista}>
    {#each perfiles as p (p.id)}
      <li><button type="button" class="perfil" onclick={() => onElegir(p.id)}>{p.alias}</button></li>
    {/each}
  </ul>

  {#if creando}
    <form class="nuevo" onsubmit={crear}>
      <label for="alias-nuevo">Tu nombre o un alias</label>
      <div class="fila">
        <input
          id="alias-nuevo"
          bind:this={campo}
          bind:value={alias}
          maxlength={MAX_ALIAS}
          autocomplete="off"
          aria-describedby={error ? 'alias-error' : undefined}
          aria-invalid={error ? 'true' : undefined}
        />
        <button type="submit" class="primario">Empezar</button>
        <button type="button" onclick={() => { creando = false; error = ''; }}>Cancelar</button>
      </div>
      {#if error}<p id="alias-error" class="error" role="alert">{error}</p>{/if}
    </form>
  {:else}
    <button type="button" onclick={abrirFormulario}>No estoy en la lista</button>
  {/if}

  <p class="nota">
    Los perfiles no tienen contraseña: en este equipo cualquiera puede abrir
    cualquier perfil y ver su progreso. Sirven para que cada persona siga por
    donde iba, no para guardar secretos.
  </p>
</section>

<style>
  .quien {
    display: grid;
    gap: var(--space-4);
    max-width: 72ch;
    margin: 0 auto;
    padding: var(--space-4);
  }
  h2 { margin: 0; font-size: var(--text-xl); }
  .intro { margin: 0; font-size: var(--text-lg); color: var(--fg-muted); }

  .perfiles {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(min(100%, 14rem), 1fr));
    gap: var(--space-3);
  }
  /* Botones grandes: se elige con el ratón, el dedo o el teclado, y el
     público incluye a quien tiene menos precisión motora. */
  .perfil {
    width: 100%;
    min-height: calc(var(--target-min) * 1.5);
    font-size: var(--text-lg);
    font-weight: 600;
    border: 2px solid var(--border-strong);
    overflow-wrap: anywhere;
  }
  .perfil:hover { border-color: var(--accent); }

  .nuevo { display: grid; gap: var(--space-2); }
  .fila { display: flex; flex-wrap: wrap; gap: var(--space-2); }
  input {
    font: inherit;
    min-height: var(--target-min);
    padding: var(--space-2) var(--space-3);
    border: 1px solid var(--border-strong);
    border-radius: var(--radius);
    background: var(--surface);
    color: var(--fg);
    flex: 1 1 14rem;
  }
  .primario { background: var(--accent); color: var(--accent-fg); border-color: var(--accent); }
  .error {
    margin: 0;
    padding: var(--space-2) var(--space-3);
    border-left: 4px solid var(--error);
    background: var(--error-bg);
    color: var(--fg);
  }
  .nota { margin: 0; font-size: var(--text-sm); color: var(--fg-muted); }
</style>
