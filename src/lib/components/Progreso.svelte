<script lang="ts">
  import {
    formatearDuracion, resumirGlobal, resumirLecciones, type Sesion,
  } from '../storage/progreso';
  import { tituloRetirada } from '../storage/equivalencias';
  import type { Lesson } from '../lessons';

  interface Props {
    sesiones: readonly Sesion[];
    lecciones: readonly Lesson[];
    /** 'local' avisa de que el progreso no está en la base de datos. */
    tipoAlmacen: 'sqlite' | 'local';
    onBorrar: () => void;
  }

  let { sesiones, lecciones, tipoAlmacen, onBorrar }: Props = $props();

  const porLeccion = $derived(resumirLecciones(sesiones));
  const global = $derived(resumirGlobal(sesiones));
  const idsActuales = $derived(new Set(lecciones.map((l) => l.id)));

  /**
   * Lo practicado en versiones anteriores en lecciones que ya no existen. Se
   * enseña aparte en vez de esconderlo: sale en los totales, así que si no
   * apareciera en ninguna fila los números no cuadrarían y parecería un fallo.
   */
  const retiradas = $derived(
    [...porLeccion.values()]
      .filter((r) => !idsActuales.has(r.leccion))
      .sort((a, b) => (a.ultimaEn < b.ultimaEn ? 1 : -1)),
  );
  /** El denominador es el temario de ahora, así que el numerador también. */
  const tocadasActuales = $derived(
    [...porLeccion.keys()].filter((id) => idsActuales.has(id)).length,
  );

  let confirmando = $state(false);

  const fecha = (iso: string) =>
    new Date(iso).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' });
</script>

<section class="progreso" aria-label="Tu progreso">
  <h2>Tu progreso</h2>

  {#if global.sesiones === 0}
    <p class="vacio">
      Todavía no has terminado ninguna lección. En cuanto acabes una, aquí
      aparecerá tu marca.
    </p>
  {:else}
    <dl class="global">
      <div><dt>Lecciones practicadas</dt><dd>{tocadasActuales} <small>de {lecciones.length}</small></dd></div>
      <div><dt>Sesiones</dt><dd>{global.sesiones}</dd></div>
      <div><dt>Tiempo total</dt><dd>{formatearDuracion(global.msTotales)}</dd></div>
      <div><dt>Mejor marca</dt><dd>{global.mejorPpm} <small>ppm</small></dd></div>
    </dl>

    <!-- Al 200% las cinco columnas no caben en el panel. Que se desplace la
         tabla dentro de su caja, no que se recorten la marca y la fecha. -->
    <div class="tabla">
      <table>
      <caption class="sr-only">Marca por lección</caption>
      <thead>
        <tr>
          <th scope="col">Lección</th>
          <th scope="col">Intentos</th>
          <th scope="col">Mejor</th>
          <th scope="col">Última</th>
          <th scope="col">Cuándo</th>
        </tr>
      </thead>
      <tbody>
        {#each lecciones as l (l.id)}
          {@const r = porLeccion.get(l.id)}
          <tr class:sin-hacer={!r}>
            <th scope="row">{l.title}</th>
            <td>{r ? r.intentos : '—'}</td>
            <td>
              {#if r && r.mejorPpm > 0}
                <strong>{r.mejorPpm}</strong> ppm · {r.mejorPct}%
              {:else if r}
                <span class="nota">sin marca limpia</span>
              {:else}—{/if}
            </td>
            <td>{r ? `${r.ultimaPpm} ppm · ${r.ultimaPct}%` : '—'}</td>
            <td>{r ? fecha(r.ultimaEn) : '—'}</td>
          </tr>
        {/each}
        {#each retiradas as r (r.leccion)}
          <tr class="retirada">
            <th scope="row">
              {tituloRetirada(r.leccion) ?? r.leccion}
              <small>lección retirada</small>
            </th>
            <td>{r.intentos}</td>
            <td>
              {#if r.mejorPpm > 0}
                <strong>{r.mejorPpm}</strong> ppm · {r.mejorPct}%
              {:else}
                <span class="nota">sin marca limpia</span>
              {/if}
            </td>
            <td>{r.ultimaPpm} ppm · {r.ultimaPct}%</td>
            <td>{fecha(r.ultimaEn)}</td>
          </tr>
        {/each}
      </tbody>
      </table>
    </div>

    {#if retiradas.length > 0}
      <p class="nota">
        Las lecciones retiradas son de una versión anterior de LibreType. El
        temario cambió, pero lo que practicaste sigue contando aquí.
      </p>
    {/if}

    <p class="nota">
      Solo cuentan para la marca los intentos con 90% de acierto o más: ir
      rápido fallando no es escribir mejor.
    </p>
  {/if}

  {#if tipoAlmacen === 'local'}
    <p class="nota aviso">
      Guardando en el navegador. En la app de escritorio el progreso va a una
      base de datos en tu equipo.
    </p>
  {/if}

  {#if global.sesiones > 0}
    <div class="borrar">
      {#if confirmando}
        <span role="alert">¿Seguro? Se borra todo el histórico y no se puede deshacer.</span>
        <button onclick={() => { onBorrar(); confirmando = false; }}>Sí, borrar</button>
        <button onclick={() => (confirmando = false)}>Cancelar</button>
      {:else}
        <button onclick={() => (confirmando = true)}>Borrar progreso</button>
      {/if}
    </div>
  {/if}
</section>

<style>
  .progreso {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    padding: var(--space-4);
    display: grid;
    gap: var(--space-4);
  }
  h2 { font-size: var(--text-lg); margin: 0; }
  .vacio { margin: 0; color: var(--fg-muted); }

  .global { display: flex; flex-wrap: wrap; gap: var(--space-6); margin: 0; }
  .global div { display: flex; flex-direction: column; }
  .global dt { font-size: var(--text-sm); color: var(--fg-muted); }
  .global dd { margin: 0; font-size: var(--text-xl); font-variant-numeric: tabular-nums; }
  .global small { font-size: var(--text-sm); color: var(--fg-muted); }

  .tabla { overflow-x: auto; }
  table { border-collapse: collapse; width: 100%; font-variant-numeric: tabular-nums; }
  caption { text-align: left; }
  th, td {
    text-align: left;
    padding: var(--space-2) var(--space-3);
    border-bottom: 1px solid var(--border);
  }
  thead th { font-size: var(--text-sm); color: var(--fg-muted); font-weight: 600; }
  tbody th { font-weight: 500; }
  /* Las lecciones sin hacer se distinguen también por el guion de cada celda,
     no solo por el atenuado. */
  .sin-hacer { color: var(--fg-muted); }
  /* Y las retiradas por su etiqueta, no por el borde: la línea más gruesa solo
     separa el bloque del temario de ahora, no una fila de la siguiente. */
  .retirada { border-top: 2px solid var(--border); }
  .retirada + .retirada { border-top: 0; }
  .retirada th small {
    display: block;
    font-size: var(--text-sm);
    font-weight: 400;
    color: var(--fg-muted);
  }

  .nota { margin: 0; font-size: var(--text-sm); color: var(--fg-muted); }
  .aviso {
    background: var(--pending-bg);
    color: var(--pending);
    border-left: 4px solid var(--pending);
    padding: var(--space-2) var(--space-3);
    border-radius: 0 var(--radius) var(--radius) 0;
  }

  .borrar { display: flex; align-items: center; gap: var(--space-3); flex-wrap: wrap; }
</style>
