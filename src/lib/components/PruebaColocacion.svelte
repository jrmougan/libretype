<script lang="ts">
  /**
   * La prueba de colocación: tramos cortos, de lección en lección, desde la
   * primera que aún no está abierta. Ver `lib/colocacion.ts`.
   *
   * No muestra puntuación ni el umbral: el tramo se escribe y, si sale con la
   * precisión de siempre, se pasa al siguiente sin más. Al pararse, dice desde
   * dónde seguir y nada más; nunca qué ha fallado ni cuánto.
   */
  import Drill from './Drill.svelte';
  import type { Stats } from '../keyboard/engine';
  import type { Layout } from '../keyboard/layouts';
  import type { MapaDominio } from '../keyboard/dominio';
  import type { Lesson } from '../lessons';
  import { abreLeccion, sesionDeTramo, tramoDe } from '../colocacion';
  import type { Sesion } from '../storage/progreso';

  interface Props {
    lecciones: readonly Lesson[];
    /** La primera lección aún sin superar: de ahí parte la prueba. */
    desde: number;
    layout: Layout;
    /** Guarda el tramo como una sesión normal de su lección. */
    onTramo: (sesion: Sesion) => Promise<void> | void;
    /** Al acabar: la lección por la que seguir. */
    onSeguir: (indice: number) => void;
    // Lo que se le pasa al Drill, igual que en una lección.
    activo?: boolean;
    pausado?: boolean;
    onPausar?: () => void;
    onReanudar?: () => void;
    dominios?: MapaDominio;
    espacioJusto?: boolean;
    movimiento?: 'auto' | 'reducido';
    ignorarRepeticion?: boolean;
    onTecla?: (code: string, acierto: boolean, ms: number) => void;
    onStats?: (s: Stats) => void;
  }

  let {
    lecciones, desde, layout, onTramo, onSeguir,
    activo = true, pausado = false, onPausar, onReanudar, dominios,
    espacioJusto = false, movimiento = 'auto', ignorarRepeticion = false, onTecla, onStats,
  }: Props = $props();

  // Se fija al empezar: `desde` cambia en cuanto se guarda el primer tramo.
  // svelte-ignore state_referenced_locally
  const inicio = desde;
  let fase = $state<'antes' | 'tramo' | 'fin'>('antes');
  let actual = $state(inicio);
  let abiertas = $state(0);
  let guardando = $state(false);

  /** Dónde seguir al terminar: la primera que no se demostró. */
  const seguirEn = $derived(Math.min(inicio + abiertas, lecciones.length - 1));
  const completo = $derived(inicio + abiertas >= lecciones.length);

  async function terminado(stats: Stats): Promise<void> {
    if (guardando) return;
    guardando = true;
    const sesion = sesionDeTramo(lecciones[actual].id, stats, new Date().toISOString());
    try {
      await onTramo(sesion);
    } finally {
      guardando = false;
    }
    if (abreLeccion(sesion)) {
      abiertas++;
      if (actual + 1 < lecciones.length) {
        actual++;
        return;
      }
    }
    fase = 'fin';
  }
</script>

{#if fase === 'antes'}
  <section class="centrado prueba" aria-labelledby="prueba-tit">
    <h2 id="prueba-tit">Prueba de colocación</h2>
    <p>
      Vas a escribir tramos cortos, uno de cada lección, empezando por
      «{lecciones[inicio].title}». Cada tramo que salga con buena precisión
      abre su lección y te lleva al siguiente. Escribe sin prisa: aquí no cuenta
      la velocidad.
    </p>
    <p>
      En cuanto un tramo cueste, la prueba se para y te dice por dónde seguir.
      Lo que ya tengas abierto no se cierra.
    </p>
    <div class="botones">
      <button class="primario" onclick={() => (fase = 'tramo')}>Empezar la prueba</button>
      <button class="secundario" onclick={() => onSeguir(inicio)}>Mejor empiezo por las lecciones</button>
    </div>
  </section>
{:else if fase === 'tramo'}
  {#key actual}
    <Drill
      {layout}
      activo={activo && !guardando}
      {pausado}
      {onPausar}
      {onReanudar}
      {ignorarRepeticion}
      target={tramoDe(lecciones[actual])}
      titulo={`Prueba de colocación · ${lecciones[actual].title}`}
      explicacion={`Tramo ${actual - inicio + 1}: palabras de la lección «${lecciones[actual].title}». Sin prisa.`}
      {espacioJusto}
      {movimiento}
      animaciones={movimiento === 'reducido' ? 'reducidas' : 'normales'}
      {dominios}
      onDone={terminado}
      {onTecla}
      {onStats}
    />
  {/key}
{:else}
  <section class="centrado prueba" aria-labelledby="prueba-fin" role="status">
    <h2 id="prueba-fin">Prueba terminada</h2>
    {#if completo}
      <p>Has abierto todo el temario. Puedes ir a la lección que quieras desde el temario.</p>
    {:else if abiertas === 0}
      <p>
        Lo mejor es empezar por «{lecciones[seguirEn].title}»: así no te saltas
        nada de lo que viene después.
      </p>
    {:else}
      <p>
        {abiertas === 1 ? 'Se ha abierto una lección' : `Se han abierto ${abiertas} lecciones`}.
        Sigue por «{lecciones[seguirEn].title}», que es donde está lo nuevo para ti.
      </p>
    {/if}
    <div class="botones">
      <button class="primario" onclick={() => onSeguir(seguirEn)}>
        Ir a «{lecciones[seguirEn].title}»
      </button>
    </div>
  </section>
{/if}

<style>
  /* Antes y después de la prueba, una tarjeta centrada como el resto de
     pantallas de entrada; durante, el Drill de siempre. */
  .centrado { align-self: center; justify-self: center; width: min(72ch, 100%); }
  .prueba {
    display: grid;
    gap: var(--space-3);
    padding: var(--space-6);
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--radius-panel);
  }
  h2 {
    margin: 0;
    font-size: calc(1.875rem * var(--ui-scale));
    line-height: 1.2;
  }
  p { margin: 0; font-size: calc(1.0625rem * var(--ui-scale)); line-height: 1.6; }
  .botones {
    display: flex;
    gap: var(--space-3);
    flex-wrap: wrap;
    margin-top: var(--space-2);
  }
  button { border-radius: var(--radius); }
</style>
