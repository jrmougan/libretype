<script lang="ts">
  /**
   * Las dos tarjetas de la prueba de colocación: antes de empezar y al acabar.
   * Los tramos los pinta el `<Drill>` de siempre, en `App`. Ver
   * `lecciones/colocacion.ts`.
   *
   * No muestra puntuación ni el umbral: al pararse dice desde dónde seguir y
   * nada más; nunca qué ha fallado ni cuánto.
   */
  interface Props {
    fase: 'antes' | 'fin';
    /** Título de la lección por la que empieza la prueba. */
    primera: string;
    /** Título de la lección por la que seguir al acabar. */
    seguirEn: string;
    /** Lecciones abiertas en esta prueba. */
    abiertas: number;
    /** No queda ninguna lección por abrir en el curso. */
    completo: boolean;
    onEmpezar: () => void;
    /** Salir sin hacerla, o ir a la lección indicada al terminar. */
    onSeguir: () => void;
  }

  let { fase, primera, seguirEn, abiertas, completo, onEmpezar, onSeguir }: Props = $props();
</script>

{#if fase === 'antes'}
  <section class="prueba" aria-labelledby="prueba-tit">
    <h2 id="prueba-tit">Prueba de colocación</h2>
    <p>
      Vas a escribir tramos cortos, uno de cada lección, empezando por
      «{primera}». Cada tramo que salga con buena precisión abre su lección y te
      lleva al siguiente. Escribe sin prisa: aquí no cuenta la velocidad.
    </p>
    <p>
      En cuanto un tramo cueste, la prueba se para y te dice por dónde seguir.
      Lo que ya tengas abierto no se cierra.
    </p>
    <div class="botones">
      <button class="primario" onclick={onEmpezar}>Empezar la prueba</button>
      <button onclick={onSeguir}>Mejor empiezo por las lecciones</button>
    </div>
  </section>
{:else}
  <section class="prueba" aria-labelledby="prueba-fin" role="status">
    <h2 id="prueba-fin">Prueba terminada</h2>
    {#if completo}
      <p>Has abierto todo el temario. Puedes ir a la lección que quieras desde el selector.</p>
    {:else if abiertas === 0}
      <p>
        Lo mejor es empezar por «{seguirEn}»: así no te saltas nada de lo que
        viene después.
      </p>
    {:else}
      <p>
        {abiertas === 1 ? 'Se ha abierto una lección' : `Se han abierto ${abiertas} lecciones`}.
        Sigue por «{seguirEn}», que es donde está lo nuevo para ti.
      </p>
    {/if}
    <div class="botones">
      <button class="primario" onclick={onSeguir}>Ir a «{seguirEn}»</button>
    </div>
  </section>
{/if}

<style>
  /* Una tarjeta centrada, como las demás pantallas de entrada. `safe`: si no cabe,
     centrar dejaría la parte de arriba donde no se puede llegar. */
  .prueba {
    align-self: safe center;
    justify-self: center;
    width: min(72ch, 100%);
    display: grid;
    gap: var(--space-3);
    padding: var(--space-6);
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--radius);
  }
  h2 { margin: 0; font-size: var(--text-xl); line-height: 1.2; }
  p { margin: 0; line-height: 1.6; }
  .botones { display: flex; gap: var(--space-3); flex-wrap: wrap; margin-top: var(--space-2); }
</style>
