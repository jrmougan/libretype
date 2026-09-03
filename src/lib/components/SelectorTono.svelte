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

  <div class="opciones">
    <button class="opcion" onclick={() => onElegir('juego')}>
      <span class="muestra juego" aria-hidden="true">
        <span class="chip">¡Lección superada!</span>
      </span>
      <span class="nombre">Con celebración</span>
      <span class="detalle">
        Colores vivos y una felicitación cada vez que terminas algo.
      </span>
    </button>

    <button class="opcion" onclick={() => onElegir('sobrio')}>
      <span class="muestra sobrio" aria-hidden="true">
        <span class="chip">Lección terminada.</span>
      </span>
      <span class="nombre">Tranquila</span>
      <span class="detalle">
        Sin adornos ni celebraciones. Te dice lo que ha pasado y ya está.
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
  h2 { margin: 0; font-size: var(--text-xl); }
  .intro { margin: 0; color: var(--fg-muted); font-size: var(--text-lg); }

  .opciones {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
    gap: var(--space-4);
  }

  /* Objetivo de pulsación amplio: aquí se decide con el ratón o con el dedo, y
     el público incluye a quien tiene menos precisión motora. */
  .opcion {
    display: grid;
    gap: var(--space-2);
    text-align: left;
    padding: var(--space-4);
    min-height: calc(var(--target-min) * 3);
    align-content: start;
    border: 2px solid var(--border-strong);
    border-radius: var(--radius);
  }
  .opcion:hover { border-color: var(--accent); }

  .muestra {
    display: flex;
    align-items: center;
    justify-content: center;
    height: 64px;
    border-radius: var(--radius);
    margin-bottom: var(--space-1);
  }
  /* La muestra enseña el resultado, no lo describe: se ve el color y el texto
     que va a usar cada tono. */
  .muestra.juego { background: var(--muestra-juego-bg); }
  .muestra.sobrio { background: var(--surface-sunken); }
  .chip {
    font-size: var(--text-sm);
    font-weight: 600;
    padding: var(--space-1) var(--space-3);
    border-radius: 999px;
  }
  .muestra.juego .chip {
    background: var(--muestra-juego-chip);
    color: var(--muestra-juego-texto);
  }
  .muestra.sobrio .chip {
    background: var(--surface);
    color: var(--fg);
    border: 1px solid var(--border-strong);
  }

  .nombre { font-size: var(--text-lg); font-weight: 700; }
  .detalle { color: var(--fg-muted); font-size: var(--text-base); line-height: 1.5; }
</style>
