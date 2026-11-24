<script lang="ts">
  /**
   * Recordatorio amable de descanso.
   *
   * Cuenta solo el tiempo practicando de verdad (no con la lección pausada ni
   * con un panel abierto) y, al llegar a los minutos elegidos, saca un aviso
   * que no bloquea nada: no roba el foco, no tapa el texto y se cierra con un
   * botón. Mecanografiar mucho rato seguido cansa manos, muñecas y vista, y
   * más a quien tiene artrosis o temblor; pero decidir parar es de la persona.
   *
   * No dice cuánto tiempo lleva ni lo cuenta como algo malo: es una sugerencia,
   * no un control de uso.
   */
  import { onMount } from 'svelte';

  interface Props {
    /** Minutos de práctica antes de sugerir la pausa; 0 lo apaga. */
    minutos: number;
    /** Si ahora mismo se está practicando (cuenta el tiempo). */
    practicando: boolean;
    /** Cada cuánto se suma tiempo. Solo se cambia en los tests. */
    pasoMs?: number;
  }

  let { minutos, practicando, pasoMs = 5000 }: Props = $props();

  let acumuladoMs = $state(0);
  let visible = $state(false);

  onMount(() => {
    const id = setInterval(() => {
      if (!practicando || minutos <= 0 || visible) return;
      acumuladoMs += pasoMs;
      if (acumuladoMs >= minutos * 60000) visible = true;
    }, pasoMs);
    return () => clearInterval(id);
  });

  function cerrar(): void {
    visible = false;
    acumuladoMs = 0;
  }
</script>

{#if visible && minutos > 0}
  <!-- role="status": se anuncia cuando el lector termine lo que esté diciendo,
       sin interrumpir. No es un diálogo: no se lleva el foco del campo. -->
  <div class="recordatorio" role="status">
    <p>
      Buen momento para una pausa: suelta las manos, mueve las muñecas y mira
      algo lejano un momento. Cuando quieras, sigues donde lo dejaste.
    </p>
    <button type="button" onclick={cerrar}>Vale</button>
  </div>
{/if}

<style>
  /* Fijo y en una esquina: aparecer no puede mover el teclado de sitio. Con
     la forma de los paneles (radio, sombra), pero sin velo: no bloquea nada. */
  .recordatorio {
    position: fixed;
    right: var(--space-4);
    bottom: var(--space-4);
    z-index: 10;
    max-width: min(calc(28rem * var(--ui-scale)), calc(100vw - 2 * var(--space-4)));
    max-height: calc(100dvh - 2 * var(--space-4));
    overflow-y: auto;
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--space-3);
    padding: var(--space-4);
    background: var(--surface);
    color: var(--fg);
    border: 2px solid var(--accent);
    border-radius: var(--radius-card);
    box-shadow: var(--shadow-panel);
    font-size: var(--text-sm);
  }
  p { margin: 0; flex: 1 1 calc(14rem * var(--ui-scale)); }
  button {
    flex: none;
    font-weight: 700;
    border-radius: var(--radius);
    background: var(--accent-soft);
    color: var(--accent-ink);
    border-color: var(--accent-ink);
  }
  button:hover { background: var(--accent-soft); filter: brightness(0.97); }
</style>
