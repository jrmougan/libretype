<script lang="ts">
  /**
   * Se pregunta por **preferencia, nunca por edad**.
   *
   * «¿Eres niño o mayor?» sería cometer exactamente el error que esta pantalla
   * viene a evitar: hacer que alguien se sienta clasificado y fuera de sitio.
   * Se describe lo que va a pasar y que la persona elija.
   */
  import type { Tono } from '../preferencias';

  interface Props {
    onElegir: (tono: Tono) => void;
  }

  let { onElegir }: Props = $props();
</script>

<section class="selector" aria-labelledby="tono-tit">
  <h2 id="tono-tit">¿Cómo prefieres que sea la aplicación?</h2>
  <p class="intro">
    Solo cambia cómo se ve y cómo te habla. Todo lo demás —las lecciones, el
    tamaño de la letra, los ajustes— es igual en las dos. Puedes cambiarlo
    cuando quieras.
  </p>

  <!-- Cada tarjeta enseña una muestra real de lo que se va a ver, no una
       descripción: la franja, el color y la frase son los de verdad. -->
  <div class="opciones">
    <button class="opcion juego" onclick={() => onElegir('juego')}>
      <span class="franja" aria-hidden="true"></span>
      <span class="contenido">
        <span class="muestra juego" aria-hidden="true">
          <span class="chip">★ ¡Lección superada!</span>
        </span>
        <span class="nombre">Con celebración</span>
        <span class="detalle">
          Colores vivos y una felicitación cada vez que terminas algo.
        </span>
      </span>
    </button>

    <button class="opcion sobrio" onclick={() => onElegir('sobrio')}>
      <span class="franja" aria-hidden="true"></span>
      <span class="contenido">
        <span class="muestra sobrio" aria-hidden="true">
          <span class="chip">Lección terminada.</span>
        </span>
        <span class="nombre">Tranquila</span>
        <span class="detalle">
          Sin adornos ni celebraciones. Te dice lo que ha pasado y ya está.
        </span>
      </span>
    </button>
  </div>
</section>

<style>
  .selector {
    display: grid;
    gap: var(--space-4);
    max-width: 72ch;
  }
  h2 {
    margin: 0;
    font-size: calc(2.125rem * var(--ui-scale));
    line-height: 1.2;
  }
  .intro {
    margin: 0;
    color: var(--fg-muted);
    font-size: calc(1.1875rem * var(--ui-scale));
    line-height: 1.5;
  }

  .opciones {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(min(100%, 17.5rem), 1fr));
    gap: var(--space-4);
    /* Hueco para la sombra inferior de la tarjeta de celebración. */
    padding-bottom: var(--space-1);
  }

  /* Objetivo de pulsación amplio: aquí se decide con el ratón o con el dedo, y
     el público incluye a quien tiene menos precisión motora. La tarjeta entera
     es el botón. */
  .opcion {
    display: grid;
    grid-template-rows: auto 1fr;
    padding: 0;
    overflow: hidden;
    text-align: left;
    min-height: calc(var(--target-min) * 3);
    border: 2px solid var(--border-strong);
    border-radius: var(--radius-panel);
    background: var(--surface);
    color: var(--fg);
    transition:
      transform var(--motion-fast) var(--ease),
      border-color var(--motion-fast) var(--ease);
  }
  .opcion:hover { background: var(--surface); border-color: var(--accent); }
  .opcion:focus-visible { outline-offset: 4px; border-radius: var(--radius-panel); }

  /* «Con celebración» se anuncia ya desde el borde: color y sombra de
     celebración, como el diálogo que se verá al terminar una lección. */
  .opcion.juego {
    border-color: var(--celebracion);
    box-shadow: 0 4px 0 var(--celebracion-deep);
  }
  .opcion.juego:hover {
    border-color: var(--celebracion);
    transform: translateY(-2px);
  }

  /* La franja de arriba: los nueve colores de dedo en la de celebración, una
     línea neutra en la tranquila. Es decoración (aria-hidden): el nombre y la
     muestra ya dicen qué es cada una. */
  .franja { display: block; height: 0.5rem; background: var(--border); }
  .opcion.juego .franja {
    background: linear-gradient(
      to right,
      var(--finger-l-pinky) 0 11.11%,
      var(--finger-l-ring) 11.11% 22.22%,
      var(--finger-l-middle) 22.22% 33.33%,
      var(--finger-l-index) 33.33% 44.44%,
      var(--finger-thumb) 44.44% 55.55%,
      var(--finger-r-index) 55.55% 66.66%,
      var(--finger-r-middle) 66.66% 77.77%,
      var(--finger-r-ring) 77.77% 88.88%,
      var(--finger-r-pinky) 88.88% 100%
    );
  }

  .contenido {
    display: grid;
    gap: var(--space-2);
    align-content: start;
    padding: var(--space-4) var(--space-4) var(--space-6);
  }

  .muestra {
    display: flex;
    align-items: center;
    justify-content: center;
    min-height: calc(4rem * var(--ui-scale));
    border-radius: var(--radius);
    margin-bottom: var(--space-2);
  }
  /* La muestra enseña el resultado, no lo describe: se ve el color y el texto
     que va a usar cada tono. */
  .muestra.juego { background: var(--celebracion-soft); }
  .muestra.sobrio { background: var(--surface-sunken); }
  .chip {
    font-size: var(--text-base);
    font-weight: 700;
    padding: var(--space-1) var(--space-4);
    border-radius: var(--radius-chip);
  }
  .muestra.juego .chip {
    background: var(--celebracion);
    color: var(--on-celebracion);
  }
  .muestra.sobrio .chip {
    font-weight: 400;
    background: var(--surface);
    color: var(--fg);
    border: 1px solid var(--border-strong);
  }

  .nombre { font-size: calc(1.375rem * var(--ui-scale)); font-weight: 700; }
  .detalle { color: var(--fg-muted); font-size: var(--text-base); line-height: 1.5; }

  @media (prefers-reduced-motion: reduce) {
    .opcion.juego:hover { transform: none; }
  }
  :global(:root[data-motion="reducido"]) .opcion.juego:hover,
  :global(:root[data-motion="reduced"]) .opcion.juego:hover { transform: none; }
</style>
