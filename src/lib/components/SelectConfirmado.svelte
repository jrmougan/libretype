<script lang="ts">
  /**
   * Un `<select>` cuya elección cambia de contexto: abandona el intento en curso y se
   * lleva el foco. Con la lista cerrada, cada flecha cambia el valor y dispara `change`,
   * así que recorrer las opciones tiraría el intento a la primera pulsación (WCAG 3.2.2):
   * recorrer solo deja la opción marcada, e Intro la confirma. Con la lista abierta, o
   * con el ratón, `change` ya es una elección hecha.
   *
   * Lo que los distingue es el momento: la flecha sobre la lista cerrada dispara
   * `change` en el mismo turno que el `keydown`, antes de cualquier temporizador. En
   * macOS la flecha abre la lista, y `change` llega mucho después, al elegir.
   */
  import { tick, type Snippet } from 'svelte';

  interface Props {
    id: string;
    valor: string;
    deshabilitado?: boolean;
    /** Lo que se le dice a quien ha marcado una opción sin confirmarla. */
    pista: string;
    onElegir: (valor: string) => void;
    children: Snippet;
  }

  let { id, valor, deshabilitado = false, pista, onElegir, children }: Props = $props();

  let recorriendo = false;
  let pendiente = $state<string | null>(null);

  async function elegir(select: HTMLSelectElement, opcion: string): Promise<void> {
    pendiente = null;
    onElegir(opcion);
    // Una opción puede no cambiar lo que se practica (una lección bloqueada, abrir un
    // panel): el selector tiene que volver a enseñar lo que sigue abierto.
    await tick();
    select.value = valor;
  }

  function alCambiar(e: Event & { currentTarget: HTMLSelectElement }): void {
    const select = e.currentTarget;
    if (recorriendo) pendiente = select.value === valor ? null : select.value;
    else void elegir(select, select.value);
  }

  function volver(select: HTMLSelectElement): void {
    pendiente = null;
    select.value = valor;
  }

  function alPulsar(e: KeyboardEvent & { currentTarget: HTMLSelectElement }): void {
    if (e.key === 'Enter') {
      if (pendiente === null) return;
      e.preventDefault();
      void elegir(e.currentTarget, pendiente);
    } else if (e.key === 'Escape') {
      if (pendiente === null) return;
      e.preventDefault();
      volver(e.currentTarget);
    } else if (e.key !== 'Tab') {
      const select = e.currentTarget;
      recorriendo = true;
      setTimeout(() => {
        recorriendo = false;
        // WebKit no dispara `change` al volver a la última opción por la que lo disparó,
        // aunque luego se le haya puesto otro valor desde aquí: tras Esc, la misma flecha
        // cambiaba la opción en silencio e Intro ya no hacía nada. Manda lo que se ve.
        pendiente = select.value === valor ? null : select.value;
      }, 0);
    }
  }

  // Salir sin confirmar no abandona nada: se enseña otra vez lo que sigue abierto.
  function alSalir(e: FocusEvent & { currentTarget: HTMLSelectElement }): void {
    if (pendiente !== null) volver(e.currentTarget);
  }
</script>

<div class="confirmado">
  <select {id} disabled={deshabilitado} value={valor} onchange={alCambiar} onkeydown={alPulsar} onblur={alSalir}>
    {@render children()}
  </select>
  <!-- Encima de lo de debajo: mostrarla no puede mover nada (AGENTS.md). Siempre en el
       árbol, porque un lector de pantalla no anuncia una región que acaba de nacer. -->
  <span class="pista" class:visible={pendiente !== null} role="status">
    {pendiente !== null ? pista : ''}
  </span>
</div>

<style>
  .confirmado { position: relative; min-width: 0; }
  .confirmado select { width: 100%; }
  .pista {
    display: none;
    position: absolute;
    top: 100%;
    left: 0;
    z-index: 1;
    margin-top: var(--space-1);
    padding: var(--space-1) var(--space-2);
    font-size: var(--text-sm);
    color: var(--fg);
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--radius);
  }
  .pista.visible { display: block; }
</style>
