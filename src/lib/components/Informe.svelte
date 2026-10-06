<script lang="ts">
  /**
   * Informes para el docente, sin servidor (ROADMAP 3.3).
   *
   * Dos cosas: el informe del perfil que practica ahora, para imprimir o
   * guardar; y «Abrir copias de varios alumnos», que junta las copias de
   * seguridad que el docente ha recogido en una tabla de la clase. La tabla
   * va por orden alfabético, no se puede ordenar y no lleva velocidad: no
   * hay clasificaciones (ver `storage/informe.ts`).
   */
  import { tick } from 'svelte';
  import InformeAlumno, { HOJA_CSS } from './InformeAlumno.svelte';
  import {
    juntarCopias, resumirAlumno, type InformeAlumno as Informe, type ResultadoClase,
  } from '../storage/informe';
  import { formatearDuracion, type Sesion } from '../storage/progreso';
  import type { EstadoTecla } from '../keyboard/dominio';
  import {
    abrirCopiasNativas, guardarArchivo, leerArchivos, nombreCopia, type ArchivoLeido,
  } from '../storage/copia';

  interface Props {
    alias: string;
    sesiones: readonly Sesion[];
    teclas: ReadonlyMap<string, EstadoTecla>;
  }

  let { alias, sesiones, teclas }: Props = $props();

  /** El informe que se está viendo: el del perfil activo o uno de la clase. */
  let viendo = $state<Informe | null>(null);
  let clase = $state<ResultadoClase | null>(null);
  let inputArchivos = $state<HTMLInputElement | null>(null);
  let hoja = $state<HTMLElement | null>(null);
  let contenedor = $state<HTMLElement | null>(null);
  let estado = $state('');

  const fecha = (iso: string | null) =>
    iso ? new Date(iso).toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' }) : '—';

  async function mostrar(informe: Informe): Promise<void> {
    viendo = informe;
    await tick();
    contenedor?.querySelector<HTMLElement>('.informe h2')?.focus();
  }

  function verPropio(): void {
    void mostrar(resumirAlumno(alias, sesiones, teclas));
  }

  async function volver(): Promise<void> {
    viendo = null;
    await tick();
    contenedor?.querySelector<HTMLElement>('.volver-foco')?.focus();
  }

  function cargarClase(archivos: ArchivoLeido[]): void {
    if (archivos.length === 0) return;
    clase = juntarCopias(archivos);
    estado = `${clase.alumnos.length} ${clase.alumnos.length === 1 ? 'alumno' : 'alumnos'} en la tabla.`;
  }

  async function abrirVarias(): Promise<void> {
    estado = '';
    try {
      const elegidos = await abrirCopiasNativas(true);
      if (elegidos === null) inputArchivos?.click();
      else cargarClase(elegidos);
    } catch {
      estado = 'No se pudieron leer los archivos.';
    }
  }

  async function alElegirArchivos(e: Event): Promise<void> {
    const input = e.currentTarget as HTMLInputElement;
    cargarClase(await leerArchivos(input.files));
    input.value = '';
  }

  /** Una página que se abre en cualquier navegador, para imprimirla allí. */
  function paginaHtml(): string {
    const cuerpo = hoja?.querySelector('.informe')?.outerHTML ?? '';
    const titulo = viendo ? `Informe de práctica de ${viendo.alias}` : 'Informe de práctica';
    const escapar = (s: string) => s.replace(/[&<>"]/g, (c) => `&#${c.charCodeAt(0)};`);
    return `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>${escapar(titulo)}</title>`
      + `<style>body{margin:0;background:#fff}${HOJA_CSS}</style></head><body>${cuerpo}</body></html>`;
  }

  async function guardarPagina(): Promise<void> {
    if (!viendo) return;
    const nombre = nombreCopia(viendo.alias).replace(/^libretype-/, 'informe-').replace(/\.json$/, '.html');
    try {
      if (await guardarArchivo(paginaHtml(), nombre, 'html')) estado = 'Informe guardado.';
    } catch {
      estado = 'No se pudo guardar el informe.';
    }
  }

  /**
   * Imprime solo el informe. Se copia a una hoja colgada de <body>, porque el
   * panel es un <dialog> modal dentro de una app de altura fija, y al imprimir
   * eso se recortaría. La hoja no se ve en pantalla (ver el CSS de impresión).
   */
  function imprimir(): void {
    document.querySelectorAll('body > .hoja-impresion').forEach((n) => n.remove());
    const copia = document.createElement('div');
    copia.className = 'hoja-impresion';
    copia.innerHTML = `<style>${HOJA_CSS}</style>${hoja?.querySelector('.informe')?.outerHTML ?? ''}`;
    document.body.appendChild(copia);
    window.addEventListener('afterprint', () => copia.remove(), { once: true });
    window.print();
  }
</script>

<section class="docente" aria-labelledby="docente-tit" bind:this={contenedor}>
  <h3 id="docente-tit">Para el docente</h3>

  {#if viendo}
    <div class="acciones">
      <button type="button" onclick={imprimir}>Imprimir</button>
      <button type="button" onclick={guardarPagina}>Guardar como página</button>
      <button type="button" onclick={volver}>Volver</button>
    </div>
    <div class="hoja" bind:this={hoja}>
      <InformeAlumno informe={viendo} />
    </div>
  {:else}
    <p class="nota">
      Un resumen de la evolución de cada alumno, sin enviar nada a ningún sitio.
      Para ver a toda la clase, pide a cada alumno que exporte su copia de
      seguridad y ábrelas aquí juntas.
    </p>
    <div class="acciones">
      <button type="button" class="volver-foco" onclick={verPropio}>
        Informe de {alias} para imprimir
      </button>
      <button type="button" onclick={abrirVarias}>Abrir copias de varios alumnos</button>
      <input
        bind:this={inputArchivos}
        type="file"
        accept=".json,application/json"
        multiple
        class="sr-only"
        tabindex="-1"
        aria-hidden="true"
        onchange={alElegirArchivos}
      />
    </div>

    {#if clase}
      {#if clase.alumnos.length > 0}
        <div class="tabla">
          <table>
            <caption>
              La clase, por orden alfabético. Cada alumno se compara solo consigo
              mismo: esta tabla no clasifica a nadie.
            </caption>
            <thead>
              <tr>
                <th scope="col">Alumno</th>
                <th scope="col">Lecciones superadas</th>
                <th scope="col">Teclas sin mirar</th>
                <th scope="col">Días de práctica</th>
                <th scope="col">Tiempo</th>
                <th scope="col">Última vez</th>
                <th scope="col"><span class="sr-only">Informe</span></th>
              </tr>
            </thead>
            <tbody>
              {#each clase.alumnos as a (a.alias)}
                <tr>
                  <th scope="row">
                    {a.alias}
                    {#if a.archivos.length > 1}<small>{a.archivos.length} copias juntas</small>{/if}
                  </th>
                  <td>{a.superadas.length} de {a.totalLecciones}</td>
                  <td>{a.teclasSinMirar.length}</td>
                  <td>{a.diasPracticados}</td>
                  <td>{formatearDuracion(a.msTotales)}</td>
                  <td>{fecha(a.ultimaPractica)}</td>
                  <td>
                    <button type="button" onclick={() => mostrar(a)}>
                      Ver <span class="sr-only">el informe de {a.alias}</span>
                    </button>
                  </td>
                </tr>
              {/each}
            </tbody>
          </table>
        </div>
      {/if}
      {#if clase.errores.length > 0}
        <div class="errores" role="alert">
          <p>No se pudieron abrir estas copias:</p>
          <ul>
            {#each clase.errores as e, i (i)}<li><strong>{e.nombre}</strong>: {e.motivo}</li>{/each}
          </ul>
        </div>
      {/if}
    {/if}
  {/if}
  <p class="sr-only" role="status">{estado}</p>
</section>

<style>
  /* Bloque del panel de progreso, separado de lo anterior por una línea. */
  .docente {
    display: grid;
    gap: var(--space-3);
    padding-top: var(--space-6);
    border-top: 1px solid var(--border);
  }
  h3 { margin: 0; font-size: var(--text-lg); }
  .nota { margin: 0; font-size: var(--text-sm); color: var(--fg-muted); }
  .acciones { display: flex; flex-wrap: wrap; gap: var(--space-2); }
  .acciones button, td button { border-radius: var(--radius-control, 12px); }
  /* En pantalla, la hoja es una tarjeta; en papel manda HOJA_CSS. */
  .hoja {
    padding: var(--space-4) var(--space-6);
    border: 1px solid var(--border-strong);
    border-radius: var(--radius-card, 16px);
    background: var(--surface);
  }
  .tabla {
    overflow-x: auto;
    border: 1px solid var(--border);
    border-radius: var(--radius-control, 12px);
  }
  table { border-collapse: collapse; width: 100%; font-variant-numeric: tabular-nums; }
  caption {
    text-align: left;
    font-size: var(--text-sm);
    color: var(--fg-muted);
    padding: var(--space-2) var(--space-3);
  }
  th, td { text-align: left; padding: var(--space-2) var(--space-3); border-bottom: 1px solid var(--border); }
  thead th { font-size: var(--text-sm); color: var(--fg-muted); font-weight: 700; background: var(--surface-sunken); }
  tbody tr:last-child > * { border-bottom: 0; }
  th small { display: block; font-weight: 400; color: var(--fg-muted); }
  .errores {
    padding: var(--space-2) var(--space-3);
    border-left: 4px solid var(--error);
    background: var(--error-bg);
    border-radius: 0 var(--radius) var(--radius) 0;
  }
  .errores p, .errores ul { margin: 0; }

  /* Al imprimir solo sale la hoja del informe. En pantalla no se ve nunca. */
  :global(.hoja-impresion) { display: none; }
  @media print {
    :global(body > :not(.hoja-impresion)), :global(dialog) { display: none !important; }
    :global(.hoja-impresion) { display: block; }
  }
</style>
