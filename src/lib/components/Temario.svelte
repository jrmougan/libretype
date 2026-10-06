<script lang="ts" module>
  /** Qué se puede elegir en el temario, además de una lección concreta. */
  export type Modo = 'cero' | 'leccion' | 'continua' | 'propio' | 'fluidez' | 'colocacion';
</script>

<script lang="ts">
  /**
   * El temario como lista de tarjetas, dentro del panel superpuesto.
   *
   * Sustituye al `<select>` de la barra, que tenía dos problemas: con teclado
   * cambiaba de lección con cada flecha (WCAG 3.2.2: recorrer la lista no puede
   * hacer nada por sí solo) y no había sitio para decir por qué una lección
   * estaba cerrada. Aquí recorrer es solo recorrer: cada tarjeta es un botón y
   * nada cambia hasta pulsarlo.
   *
   * Las cerradas siguen siendo enfocables (`aria-disabled`, no `disabled`) para
   * que el lector de pantalla pueda leer el motivo; pulsarlas no hace nada.
   */
  import type { Lesson } from '../lessons';
  import type { Sesion } from '../storage/progreso';
  import {
    FILA_DISPONIBLE, leccionesSuperadas, motivoBloqueo, nivelDisponible, OBJETIVO_PANEL,
  } from '../storage/objetivos';

  interface Props {
    lecciones: readonly Lesson[];
    sesiones: readonly Sesion[];
    /** Lo que se está practicando ahora, para marcarlo. */
    modo: Modo | null;
    /** Índice de la lección en curso cuando `modo` es 'leccion'. */
    leccionActual?: number | null;
    onLeccion: (indice: number) => void;
    onModo: (modo: Exclude<Modo, 'leccion'>) => void;
  }

  let { lecciones, sesiones, modo, leccionActual = null, onLeccion, onModo }: Props = $props();

  const superadas = $derived(leccionesSuperadas(sesiones));
  const nivel = $derived(nivelDisponible(sesiones));
  const pct = (n: number) => n.toLocaleString('es-ES', { maximumFractionDigits: 1 });

  const libres: { modo: Exclude<Modo, 'leccion' | 'cero' | 'colocacion'>; titulo: string; detalle: string }[] = [
    {
      modo: 'continua',
      titulo: 'Práctica continua',
      detalle: 'Textos nuevos con todo el vocabulario que ya tienes abierto.',
    },
    {
      modo: 'fluidez',
      titulo: 'Fluidez',
      detalle: 'Tandas de las palabras más usadas, para ganar soltura sin perder precisión.',
    },
    {
      modo: 'propio',
      titulo: 'Texto propio',
      detalle: 'Pega o escribe el texto que quieras practicar.',
    },
  ];
</script>

<div class="temario">
  <p class="nota">
    {superadas.size} de {lecciones.length} lecciones superadas. {OBJETIVO_PANEL}
  </p>

  <section aria-labelledby="temario-antes">
    <h3 id="temario-antes">Antes de empezar</h3>
    <button
      type="button"
      class="tarjeta"
      data-modo="cero"
      aria-current={modo === 'cero' ? 'true' : undefined}
      onclick={() => onModo('cero')}
    >
      <span class="titulo">Dónde van las manos</span>
      <span class="detalle">Postura, la fila de reposo y los relieves de la F y la J.</span>
      {#if modo === 'cero'}<span class="aqui">Estás aquí</span>{/if}
    </button>
  </section>

  <section aria-labelledby="temario-lecciones">
    <h3 id="temario-lecciones">Lecciones</h3>
    <ol class="lista">
      {#each lecciones as l, i (l.id)}
        {@const cerrada = i > nivel}
        {@const superada = superadas.has(l.id)}
        {@const actual = modo === 'leccion' && leccionActual === i}
        <li>
          <button
            type="button"
            class="tarjeta"
            class:cerrada
            class:superada
            data-leccion={i}
            aria-disabled={cerrada ? 'true' : undefined}
            aria-current={actual ? 'true' : undefined}
            onclick={() => { if (!cerrada) onLeccion(i); }}
          >
            <!-- La insignia repite el estado que ya dice el texto de debajo:
                 ✓ superada, › abierta, vacía con borde si sigue cerrada. -->
            <span class="titulo">
              <span class="insignia" class:ins-superada={superada} class:ins-abierta={!cerrada && !superada}
                    aria-hidden="true">{superada ? '✓' : cerrada ? '' : '›'}</span>
              <span><span class="num">{i + 1}.</span> {l.title}</span>
            </span>
            <span class="estado">
              {#if cerrada}
                Cerrada. {motivoBloqueo(lecciones[nivel].title, i === nivel + 1)}
              {:else if superada}
                Superada
              {:else}
                {FILA_DISPONIBLE}
              {/if}
            </span>
            <span class="detalle">Al terminarla podrás escribir el {pct(l.cobertura)}% de las palabras del español.</span>
            {#if actual}<span class="aqui">Estás aquí</span>{/if}
          </button>
        </li>
      {/each}
    </ol>
  </section>

  <section aria-labelledby="temario-libre">
    <h3 id="temario-libre">Práctica libre</h3>
    <ul class="lista">
      {#each libres as p (p.modo)}
        <li>
          <button
            type="button"
            class="tarjeta"
            data-modo={p.modo}
            aria-current={modo === p.modo ? 'true' : undefined}
            onclick={() => onModo(p.modo)}
          >
            <span class="titulo">{p.titulo}</span>
            <span class="detalle">{p.detalle}</span>
            {#if modo === p.modo}<span class="aqui">Estás aquí</span>{/if}
          </button>
        </li>
      {/each}
    </ul>
  </section>


  <!-- Se ofrece a quien lo elija, nunca por edad: no hay pregunta sobre quién
       eres, solo sobre lo que ya sabes hacer. -->
  <section aria-labelledby="temario-colocacion">
    <h3 id="temario-colocacion">¿Ya escribes algo?</h3>
    <button
      type="button"
      class="tarjeta"
      data-modo="colocacion"
      aria-current={modo === 'colocacion' ? 'true' : undefined}
      onclick={() => onModo('colocacion')}
    >
      <span class="titulo">Prueba de colocación</span>
      <span class="detalle">
        Unos tramos cortos, de lección en lección, para abrir de una vez las que
        ya dominas. Se para en cuanto una cueste, sin nota ni prisa, y lo que ya
        tengas abierto no se cierra.
      </span>
      {#if modo === 'colocacion'}<span class="aqui">Estás aquí</span>{/if}
    </button>
  </section>
</div>

<style>
  .temario { display: grid; gap: var(--space-6); }
  section { display: grid; gap: var(--space-3); }
  h3 { margin: 0; font-size: var(--text-lg); }
  .nota { margin: 0; font-size: var(--text-base); color: var(--fg-muted); }

  .lista {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    gap: var(--space-3);
    /* Al 200% cabe una por fila; al 100%, dos o tres en el panel. */
    grid-template-columns: repeat(auto-fill, minmax(min(100%, calc(16rem * var(--ui-scale))), 1fr));
  }

  .tarjeta {
    width: 100%;
    height: 100%;
    display: grid;
    gap: var(--space-1);
    align-content: start;
    text-align: left;
    padding: var(--space-3) var(--space-4);
    border: 1px solid var(--border-strong);
    border-radius: var(--radius-card, 16px);
    background: var(--surface);
  }
  .titulo {
    display: flex;
    align-items: baseline;
    gap: var(--space-2);
    font-weight: 700;
    font-size: var(--text-base);
  }
  .num { font-variant-numeric: tabular-nums; }
  .estado { font-size: var(--text-sm); }
  .detalle { font-size: var(--text-sm); color: var(--fg-muted); }

  /* Insignia redonda, la misma que en la tabla del progreso. */
  .insignia {
    flex: none;
    align-self: center;
    display: inline-grid;
    place-items: center;
    width: 1.75em;
    height: 1.75em;
    border-radius: 50%;
    font-size: var(--text-xs);
    line-height: 1;
    border: 2px solid var(--border-strong);
  }
  .ins-superada { background: var(--ok); border-color: var(--ok); color: var(--surface); }
  .ins-abierta { background: var(--accent); border-color: var(--accent); color: var(--accent-fg); }

  /* Superada: la insignia ✓ y la palabra, con el texto en verde de acierto. */
  .superada .estado { color: var(--ok); font-weight: 700; }

  /* Cerrada: borde discontinuo, insignia vacía y el texto que lo explica. Se
     atenúa, pero el texto sigue siendo legible (--fg-muted cumple 4,5:1). */
  .cerrada {
    border-style: dashed;
    background: var(--surface-sunken);
    color: var(--fg-muted);
    cursor: not-allowed;
  }
  .cerrada:hover { background: var(--surface-sunken); }

  /* Lo que está en curso: fondo suave de acento, borde grueso y el texto
     «Estás aquí», que es lo que no depende del color. */
  .tarjeta[aria-current='true'] {
    background: var(--accent-soft);
    border-width: 2px;
    border-color: var(--accent);
  }
  .aqui {
    justify-self: start;
    font-size: var(--text-xs);
    font-weight: 700;
    padding: 0 var(--space-2);
    border-radius: var(--radius-pill, 999px);
    background: var(--accent);
    color: var(--accent-fg);
  }
</style>
