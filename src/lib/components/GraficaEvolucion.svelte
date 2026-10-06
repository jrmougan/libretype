<script lang="ts">
  /**
   * Gráfica sencilla de evolución: una barra por día practicado con la media
   * de palabras por minuto de ese día.
   *
   * Una sola serie, así que no lleva leyenda: el título la nombra. Accesible de
   * tres maneras, porque el panel de progreso es *chrome* y ahí el lector de
   * pantalla sí importa: `role="img"` con un título y una descripción que dicen
   * lo esencial en una frase, un `<title>` por barra (que también da el aviso al
   * pasar el ratón) y, debajo, la tabla con los mismos datos.
   *
   * Sin metas ni líneas de objetivo: es tu evolución, no una comparación con
   * nadie ni con una cifra que haya que alcanzar.
   */
  import type { ResumenDia } from '../storage/progreso';

  interface Props {
    dias: readonly ResumenDia[];
  }

  let { dias }: Props = $props();

  const W = 320;
  const H = 140;
  const M = { arriba: 18, abajo: 22, lado: 8 };
  const alto = H - M.arriba - M.abajo;

  const fecha = (iso: string) =>
    new Date(`${iso}T12:00:00Z`).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' });

  const maximo = $derived(Math.max(1, ...dias.map((d) => d.ppmMedia)));
  const paso = $derived((W - 2 * M.lado) / Math.max(dias.length, 1));
  const ancho = $derived(Math.max(2, paso - 2));
  const barras = $derived(dias.map((d, i) => {
    const h = Math.max(2, (d.ppmMedia / maximo) * alto);
    return { d, x: M.lado + i * paso + 1, y: M.arriba + alto - h, h };
  }));

  const descripcion = $derived.by(() => {
    if (dias.length === 0) return '';
    const [primero, ultimo] = [dias[0], dias[dias.length - 1]];
    return dias.length === 1
      ? `${fecha(primero.fecha)}: ${primero.ppmMedia} palabras por minuto de media.`
      : `Del ${fecha(primero.fecha)} al ${fecha(ultimo.fecha)}, ${dias.length} días con práctica. ` +
        `El primero, ${primero.ppmMedia} palabras por minuto de media; el último, ${ultimo.ppmMedia}. ` +
        `El día más alto, ${maximo}.`;
  });
</script>

{#if dias.length > 0}
  <figure class="grafica">
    <svg viewBox="0 0 {W} {H}" role="img" aria-labelledby="graf-tit graf-desc">
      <title id="graf-tit">Palabras por minuto, media de cada día</title>
      <desc id="graf-desc">{descripcion}</desc>
      <line class="base" x1={M.lado} x2={W - M.lado} y1={M.arriba + alto} y2={M.arriba + alto} />
      {#each barras as b, i (b.d.fecha)}
        <rect class="barra" x={b.x} y={b.y} width={ancho} height={b.h} rx="3">
          <title>{fecha(b.d.fecha)}: {b.d.ppmMedia} palabras por minuto de media, {b.d.pctMedio}% de precisión</title>
        </rect>
        <!-- Etiquetas directas solo en el primero y el último: un número en
             cada barra no se lee. -->
        {#if i === 0 || i === barras.length - 1}
          <text class="valor" x={b.x + ancho / 2} y={b.y - 4} text-anchor="middle">{b.d.ppmMedia}</text>
          <text class="eje" x={b.x + ancho / 2} y={H - 6}
                text-anchor={barras.length === 1 ? 'middle' : i === 0 ? 'start' : 'end'}>{fecha(b.d.fecha)}</text>
        {/if}
      {/each}
    </svg>
    <figcaption aria-hidden="true">Palabras por minuto, media de cada día</figcaption>
  </figure>
{/if}

<style>
  /* Tarjeta hundida, como las de cifra del panel. */
  .grafica {
    margin: 0;
    display: grid;
    gap: var(--space-2);
    padding: var(--space-4);
    background: var(--surface-sunken);
    border-radius: var(--radius-card);
  }
  /* Con todo el ancho del panel, la proporción del viewBox daría una gráfica
     más alta que la ventana: se acota la altura y se centra. */
  svg {
    width: 100%;
    height: auto;
    max-height: calc(11rem * var(--ui-scale));
    display: block;
    overflow: visible;
  }
  /* Barras en acento pleno: atenuadas no llegarían a 3:1 sobre el fondo. */
  .barra { fill: var(--accent); }
  .barra:hover { fill: var(--accent-deep); }
  .base { stroke: var(--border-strong); stroke-width: 1; }
  /* El texto lleva tinta de texto, nunca el color de la serie. */
  .valor { fill: var(--fg); font-size: 11px; font-weight: 700; font-variant-numeric: tabular-nums; }
  .eje { fill: var(--fg-muted); font-size: 10px; }
  figcaption { font-size: var(--text-sm); color: var(--fg-muted); }
</style>
