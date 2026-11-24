<script lang="ts" module>
  /**
   * Estilos de la hoja impresa y de la página guardada. Van aparte de los del
   * componente porque se usan fuera de la app: en papel y en un .html que el
   * docente abre en cualquier navegador, donde no existen los tokens de
   * `tokens.css`. Negro sobre blanco, que es lo que se imprime bien.
   */
  export const HOJA_CSS = `
    .informe { font-family: system-ui, -apple-system, "Segoe UI", sans-serif; color: #000; background: #fff;
      max-width: 48rem; margin: 0 auto; padding: 1rem; line-height: 1.5; font-size: 12pt; }
    .informe h2 { font-size: 1.5em; margin: 0 0 .25em; }
    .informe h3 { font-size: 1.15em; margin: 1.2em 0 .4em; }
    .informe p, .informe ul, .informe ol { margin: .3em 0; }
    .informe table { border-collapse: collapse; width: 100%; }
    .informe th, .informe td { border: 1px solid #444; padding: .2em .5em; text-align: left; }
    .informe .chips { list-style: none; padding: 0; display: flex; flex-wrap: wrap; gap: .3em; }
    .informe .chips li { border: 1px solid #444; border-radius: 4px; padding: 0 .45em; font-family: monospace; }
    .informe .nota { font-size: .9em; }
    .informe .lecciones li span { font-weight: 600; }
  `;
</script>

<script lang="ts">
  /**
   * El resumen de un alumno, para leer en pantalla, imprimir o guardar. Sale
   * de `storage/informe.ts`; aquí solo se pinta.
   */
  import { formatearDuracion } from '../storage/progreso';
  import { OBJETIVO_PANEL } from '../storage/objetivos';
  import { LESSONS } from '../lessons';
  import type { InformeAlumno } from '../storage/informe';

  interface Props {
    informe: InformeAlumno;
    /** Para enlazar el título desde quien lo contiene. */
    idTitulo?: string;
  }

  let { informe, idTitulo = 'informe-tit' }: Props = $props();

  const fechaLarga = (iso: string) =>
    new Date(iso).toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' });
  const hoy = fechaLarga(new Date().toISOString());
  const idsSuperadas = $derived(new Set(informe.superadas.map((l) => l.id)));
</script>

<article class="informe" aria-labelledby={idTitulo}>
  <h2 id={idTitulo} tabindex="-1">Informe de práctica de {informe.alias}</h2>
  <p>
    Hecho el {hoy}.
    {#if informe.primeraPractica && informe.ultimaPractica}
      Practica desde el {fechaLarga(informe.primeraPractica)}; la última vez fue el
      {fechaLarga(informe.ultimaPractica)}.
    {:else}
      Todavía no hay práctica registrada.
    {/if}
  </p>

  <h3>Resumen</h3>
  <ul>
    <li>
      {informe.diasPracticados} {informe.diasPracticados === 1 ? 'día' : 'días'} de práctica,
      {informe.sesiones} {informe.sesiones === 1 ? 'ejercicio' : 'ejercicios'} y
      {formatearDuracion(informe.msTotales)} en total.
    </li>
    <li>{informe.superadas.length} de {informe.totalLecciones} lecciones superadas.</li>
    <li>
      Escribe sin mirar {informe.teclasSinMirar.length}
      {informe.teclasSinMirar.length === 1 ? 'tecla' : 'teclas'}.
    </li>
  </ul>

  <h3>Lecciones</h3>
  <p class="nota">{OBJETIVO_PANEL}</p>
  <ol class="lecciones">
    {#each LESSONS as l (l.id)}
      <li>{l.title} — <span>{idsSuperadas.has(l.id) ? 'superada' : 'pendiente'}</span></li>
    {/each}
  </ol>

  <h3>Teclas que ya escribe sin mirar</h3>
  {#if informe.teclasSinMirar.length > 0}
    <ul class="chips" aria-label="Teclas que ya escribe sin mirar">
      {#each informe.teclasSinMirar as t (t)}<li>{t === ' ' ? 'espacio' : t.toUpperCase()}</li>{/each}
    </ul>
    <p class="nota">
      Son las teclas en las que el teclado de la pantalla ya no le enseña la
      letra, porque las acierta con seguridad.
    </p>
  {:else}
    <p class="nota">
      Todavía ninguna. El teclado de la pantalla deja de enseñar la letra de
      cada tecla cuando se acierta con seguridad, y eso lleva su tiempo.
    </p>
  {/if}

  {#if informe.semanas.length > 0}
    <h3>Semana a semana</h3>
    <table>
      <caption class="nota">Comparado con sus propias semanas anteriores, no con nadie más.</caption>
      <thead>
        <tr>
          <th scope="col">Semana del</th>
          <th scope="col">Días</th>
          <th scope="col">Tiempo</th>
          <th scope="col">Precisión media</th>
          <th scope="col">Velocidad media</th>
        </tr>
      </thead>
      <tbody>
        {#each informe.semanas as s (s.semana)}
          <tr>
            <th scope="row">{fechaLarga(s.semana)}</th>
            <td>{s.diasPracticados}</td>
            <td>{formatearDuracion(s.msTotales)}</td>
            <td>{s.pctMedio}%</td>
            <td>{s.ppmMedia} ppm</td>
          </tr>
        {/each}
      </tbody>
    </table>
  {/if}
</article>

<style>
  /* Solo pantalla: en papel y en la página guardada manda HOJA_CSS, que no
     puede usar los tokens. */
  .informe { display: grid; gap: var(--space-2); }
  h2 { margin: 0; font-size: var(--text-xl); line-height: 1.2; }
  h3 { margin: var(--space-3) 0 0; font-size: var(--text-lg); }
  p, ul, ol { margin: 0; }
  .nota { font-size: var(--text-sm); color: var(--fg-muted); }
  .chips { list-style: none; padding: 0; display: flex; flex-wrap: wrap; gap: var(--space-1); }
  .chips li {
    font-family: var(--font-key);
    font-weight: 700;
    padding: 0 var(--space-2);
    border: 1px solid var(--border-strong);
    border-radius: var(--radius);
    background: var(--surface-sunken);
  }
  table { border-collapse: collapse; width: 100%; font-variant-numeric: tabular-nums; }
  caption { text-align: left; }
  th, td { text-align: left; padding: var(--space-1) var(--space-2); border-bottom: 1px solid var(--border); }
  thead th { background: var(--surface-sunken); }
</style>
