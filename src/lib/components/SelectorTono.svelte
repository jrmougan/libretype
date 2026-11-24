<script lang="ts">
  /**
   * Se pregunta por **preferencia, nunca por edad**.
   *
   * «¿Eres niño o mayor?» sería cometer exactamente el error que esta pantalla
   * viene a evitar: hacer que alguien se sienta clasificado y fuera de sitio.
   * Se describe lo que va a pasar y que la persona elija.
   */
  import type { Tono } from '../preferencias';
  import { VOCES } from '../voz';

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
          <span class="chip">{VOCES.juego.terminada}</span>
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
          <span class="chip">{VOCES.sobrio.terminada}</span>
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
  h2 { margin: 0; font-size: var(--text-2xl); line-height: 1.2; }
  .intro { margin: 0; color: var(--fg-muted); font-size: var(--text-md); line-height: 1.5; }

  .opciones {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(min(100%, 17.5rem), 1fr));
    gap: var(--space-4);
    /* Hueco para el canto de la tarjeta de celebración. */
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
  }
  .opcion:hover:not(:disabled) { background: var(--surface); border-color: var(--accent); }

  /* «Con celebración» se anuncia ya desde el borde: color y canto de
     celebración, como el chip de récord que se verá al terminar una lección. */
  .opcion.juego {
    border-color: var(--muestra-juego-chip);
    box-shadow: 0 4px 0 var(--celebracion-deep);
  }
  .opcion.juego:hover:not(:disabled) {
    border-color: var(--muestra-juego-chip);
    transform: translateY(-2px);
  }

  /* La franja de arriba: los nueve colores de dedo en la de celebración, una
     línea neutra en la tranquila. Es decoración (aria-hidden): el nombre y la
     muestra ya dicen qué es cada una. */
  .franja { display: block; height: var(--space-2); background: var(--border); }
  .opcion.juego .franja {
    background: linear-gradient(90deg,
      var(--finger-l-pinky) 0 11.11%, var(--finger-l-ring) 0 22.22%,
      var(--finger-l-middle) 0 33.33%, var(--finger-l-index) 0 44.44%,
      var(--finger-thumb) 0 55.55%, var(--finger-r-index) 0 66.66%,
      var(--finger-r-middle) 0 77.77%, var(--finger-r-ring) 0 88.88%,
      var(--finger-r-pinky) 0 100%);
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
    min-height: calc(var(--target-min) * 1.25);
    padding: var(--space-2);
    border-radius: var(--radius);
    margin-bottom: var(--space-2);
  }
  /* La muestra enseña el resultado, no lo describe: se ve el color y el texto
     que va a usar cada tono. */
  .muestra.juego { background: var(--muestra-juego-bg); }
  .muestra.sobrio { background: var(--surface-sunken); }
  .chip {
    font-size: var(--text-base);
    font-weight: 700;
    padding: var(--space-1) var(--space-4);
    border-radius: var(--radius-chip);
    text-align: center;
  }
  .muestra.juego .chip {
    background: var(--muestra-juego-chip);
    color: var(--muestra-juego-texto);
  }
  .muestra.sobrio .chip {
    font-weight: 500;
    background: var(--surface);
    color: var(--fg);
    border: 1px solid var(--border-strong);
  }

  .nombre { font-size: var(--text-cifra); font-weight: 700; }
  .detalle { color: var(--fg-muted); font-size: var(--text-base); font-weight: 400; line-height: 1.5; }

  /* Con la letra grande cada línea cuesta el doble: el título y la entrada bajan
     un escalón y las tarjetas pierden aire, para que se llegue antes a elegir. */
  :global(.app.compacta) .selector { gap: var(--space-3); }
  :global(.app.compacta) .selector h2 { font-size: var(--text-xl); }
  :global(.app.compacta) .intro { font-size: var(--text-base); line-height: 1.35; }
  :global(.app.compacta) .contenido { padding: var(--space-2) var(--space-3) var(--space-3); gap: var(--space-1); }
  :global(.app.compacta) .muestra { margin-bottom: 0; min-height: var(--target-min); }
  :global(.app.compacta) .detalle { line-height: 1.35; }

  @media (prefers-reduced-motion: reduce) {
    .opcion.juego:hover:not(:disabled) { transform: none; }
  }
  :global(:root[data-motion="reducido"]) .opcion.juego:hover:not(:disabled),
  :global(:root[data-motion="reduced"]) .opcion.juego:hover:not(:disabled) { transform: none; }
  @media (forced-colors: active) {
    .franja { display: none; }
  }
</style>
