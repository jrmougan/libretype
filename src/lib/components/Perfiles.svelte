<script lang="ts">
  /**
   * Gestión de perfiles: crear, cambiar de nombre, borrar y cambiar de perfil.
   *
   * Vive en el panel de progreso porque un perfil es justo eso: de quién es
   * el progreso. Las preferencias (tamaño, tema, tono) no van por perfil: son
   * de este equipo y esta pantalla.
   *
   * Borrar pide confirmación con el nombre y lo que se pierde, y no se puede
   * borrar el primer perfil (es el dueño de lo que había antes de que
   * existieran perfiles); sí se puede renombrar y vaciar.
   */
  import { tick } from 'svelte';
  import { MAX_ALIAS, PERFIL_PRINCIPAL, type Perfil } from '../storage/almacen';

  interface Props {
    perfiles: readonly Perfil[];
    activo: number;
    onCambiar: (id: number) => void;
    onCrear: (alias: string) => Promise<void>;
    onRenombrar: (id: number, alias: string) => Promise<void>;
    onBorrar: (id: number) => Promise<void>;
  }

  let { perfiles, activo, onCambiar, onCrear, onRenombrar, onBorrar }: Props = $props();

  let nuevo = $state('');
  let editando = $state<number | null>(null);
  let aliasEditado = $state('');
  let borrando = $state<Perfil | null>(null);
  let error = $state('');
  let aviso = $state('');
  let contenedor = $state<HTMLElement | null>(null);

  const mensaje = (err: unknown) => (err instanceof Error ? err.message : 'No se pudo completar.');

  async function enfocar(selector: string): Promise<void> {
    await tick();
    contenedor?.querySelector<HTMLElement>(selector)?.focus();
  }

  async function crear(e: SubmitEvent): Promise<void> {
    e.preventDefault();
    error = '';
    aviso = '';
    try {
      await onCrear(nuevo);
      aviso = `Perfil «${nuevo.trim()}» creado.`;
      nuevo = '';
    } catch (err) {
      error = mensaje(err);
    }
  }

  function empezarEdicion(p: Perfil): void {
    editando = p.id;
    aliasEditado = p.alias;
    error = '';
    void enfocar('#alias-editado');
  }

  async function guardarEdicion(e: SubmitEvent): Promise<void> {
    e.preventDefault();
    if (editando === null) return;
    const id = editando;
    try {
      await onRenombrar(id, aliasEditado);
      editando = null;
      aviso = 'Nombre cambiado.';
      void enfocar(`[data-perfil="${id}"] .renombrar`);
    } catch (err) {
      error = mensaje(err);
    }
  }

  function pedirBorrado(p: Perfil): void {
    borrando = p;
    error = '';
    void enfocar('.confirmar-borrado .cancelar');
  }

  async function confirmarBorrado(): Promise<void> {
    if (!borrando) return;
    const alias = borrando.alias;
    try {
      await onBorrar(borrando.id);
      aviso = `Perfil «${alias}» borrado.`;
      borrando = null;
      void enfocar('#alias-nuevo-perfil');
    } catch (err) {
      error = mensaje(err);
    }
  }
</script>

<section class="perfiles" aria-labelledby="perfiles-tit" bind:this={contenedor}>
  <h3 id="perfiles-tit">Quién practica en este equipo</h3>
  <p class="nota">
    Cada perfil lleva su propio progreso y sus teclas aprendidas. No tienen
    contraseña: cualquiera que use este equipo puede abrir cualquier perfil y
    ver su progreso. El tamaño de la letra, el tema y los demás ajustes son
    del equipo y valen para todos.
  </p>

  <ul class="lista">
    {#each perfiles as p (p.id)}
      <li data-perfil={p.id} class:activo={p.id === activo}>
        {#if editando === p.id}
          <form class="fila" onsubmit={guardarEdicion}>
            <label class="sr-only" for="alias-editado">Nuevo nombre para {p.alias}</label>
            <input id="alias-editado" bind:value={aliasEditado} maxlength={MAX_ALIAS} autocomplete="off" />
            <button type="submit">Guardar</button>
            <button type="button" onclick={() => (editando = null)}>Cancelar</button>
          </form>
        {:else}
          <span class="alias">
            {p.alias}
            {#if p.id === activo}<small>· practicando ahora</small>{/if}
          </span>
          <span class="botones">
            {#if p.id !== activo}
              <button type="button" onclick={() => onCambiar(p.id)}>
                Practicar <span class="sr-only">como {p.alias}</span>
              </button>
            {/if}
            <button type="button" class="renombrar" onclick={() => empezarEdicion(p)}>
              Cambiar nombre <span class="sr-only">de {p.alias}</span>
            </button>
            {#if p.id !== PERFIL_PRINCIPAL}
              <button type="button" onclick={() => pedirBorrado(p)}>
                Borrar <span class="sr-only">el perfil de {p.alias}</span>
              </button>
            {/if}
          </span>
        {/if}
      </li>
    {/each}
  </ul>

  {#if borrando}
    <div class="confirmar-borrado" role="group" aria-labelledby="borrar-tit">
      <p id="borrar-tit">
        ¿Borrar el perfil «{borrando.alias}» y todo su progreso? Se pierden sus
        sesiones y sus teclas aprendidas, y no se puede deshacer. Si quieres
        conservarlo, practica con ese perfil y exporta antes una copia de
        seguridad.
      </p>
      <div class="fila">
        <button type="button" class="peligro" onclick={confirmarBorrado}>
          Sí, borrar el perfil de {borrando.alias}
        </button>
        <button type="button" class="cancelar" onclick={() => (borrando = null)}>Cancelar</button>
      </div>
    </div>
  {/if}

  <form class="fila" onsubmit={crear}>
    <label for="alias-nuevo-perfil">Añadir a otra persona</label>
    <input
      id="alias-nuevo-perfil"
      bind:value={nuevo}
      maxlength={MAX_ALIAS}
      autocomplete="off"
      placeholder="Nombre o alias"
    />
    <button type="submit">Añadir perfil</button>
  </form>

  {#if error}<p class="error" role="alert">{error}</p>{/if}
  <p class="sr-only" role="status">{aviso}</p>
</section>

<style>
  .perfiles { display: grid; gap: var(--space-3); }
  h3 { margin: 0; font-size: var(--text-lg); }
  .nota { margin: 0; font-size: var(--text-sm); color: var(--fg-muted); }

  .lista { list-style: none; margin: 0; padding: 0; display: grid; gap: var(--space-2); }
  .lista li {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-2);
    padding: var(--space-2) var(--space-3);
    border: 1px solid var(--border-strong);
    border-radius: var(--radius);
  }
  /* El perfil activo no se distingue solo por color: lleva el texto
     «practicando ahora» y un borde más grueso. */
  .lista li.activo { border-width: 3px; border-color: var(--accent); }
  .alias { font-weight: 600; overflow-wrap: anywhere; }
  .alias small { font-weight: 400; color: var(--fg-muted); }
  .botones, .fila { display: flex; flex-wrap: wrap; gap: var(--space-2); align-items: center; }

  input {
    font: inherit;
    min-height: var(--target-min);
    padding: var(--space-2) var(--space-3);
    border: 1px solid var(--border-strong);
    border-radius: var(--radius);
    background: var(--surface);
    color: var(--fg);
    flex: 1 1 12rem;
  }

  .confirmar-borrado {
    display: grid;
    gap: var(--space-2);
    padding: var(--space-3);
    border: 2px solid var(--error);
    border-radius: var(--radius);
    background: var(--error-bg);
  }
  .confirmar-borrado p { margin: 0; }
  .peligro { border: 2px solid var(--error); font-weight: 600; }
  .error {
    margin: 0;
    padding: var(--space-2) var(--space-3);
    border-left: 4px solid var(--error);
    background: var(--error-bg);
  }
</style>
