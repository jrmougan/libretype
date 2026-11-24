<script lang="ts">
  /**
   * Informes para el docente, sin servidor.
   *
   * Dos cosas: el informe del perfil que practica ahora, para imprimir o
   * guardar; y «Abrir copias de varios alumnos», que junta las copias de
   * seguridad que el docente ha recogido en una tabla de la clase. La tabla
   * va por orden alfabético, no se puede ordenar y no lleva velocidad: no
   * hay clasificaciones (ver `storage/informe.ts`).
   */
  import { tick } from 'svelte';
  import InformeAlumno, { HOJA_CSS } from './InformeAlumno.svelte';
  import { guardarFichero } from '../ficheros';
  import type { EstadoTecla } from '../keyboard/dominio';
  import { LIMITES } from '../lecciones/personalizadas';
  import {
    aliasParaFichero, juntarCopias, MAX_COPIAS, resumirAlumno,
    type ArchivoLeido, type InformeAlumno as Informe, type ResultadoClase,
  } from '../storage/informe';
  import { formatearDuracion, type Sesion } from '../storage/progreso';

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
  let leyendo = $state(false);

  const fecha = (iso: string | null) =>
    iso ? new Date(iso).toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' }) : '—';

  async function mostrar(informe: Informe): Promise<void> {
    viendo = informe;
    estado = '';
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

  /** Lee lo elegido, fichero a fichero: uno ilegible o enorme no impide abrir los demás. */
  async function alElegirArchivos(e: Event): Promise<void> {
    const input = e.currentTarget as HTMLInputElement;
    const elegidos = [...(input.files ?? [])];
    if (elegidos.length === 0 || leyendo) return;
    leyendo = true;
    estado = 'Abriendo las copias…';
    try {
      const leidos: ArchivoLeido[] = [];
      const grandes: ResultadoClase['errores'] = [];
      for (const f of elegidos.slice(0, MAX_COPIAS + 1)) {
        if (f.size > LIMITES.copiaBytes) {
          grandes.push({ nombre: f.name, motivo: 'Es demasiado grande para ser una copia de seguridad de LibreType.' });
          continue;
        }
        try {
          leidos.push({ nombre: f.name, contenido: await f.text() });
        } catch {
          grandes.push({ nombre: f.name, motivo: 'No se ha podido leer ese fichero.' });
        }
      }
      const resultado = juntarCopias(leidos);
      clase = { alumnos: resultado.alumnos, errores: [...grandes, ...resultado.errores] };
      estado = `${clase.alumnos.length} ${clase.alumnos.length === 1 ? 'alumno' : 'alumnos'} en la tabla.`;
    } finally {
      leyendo = false;
      input.value = '';
    }
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
    const quien = aliasParaFichero(viendo.alias);
    const nombre = `informe-${quien ? `${quien}-` : ''}${new Date().toISOString().slice(0, 10)}.html`;
    try {
      const { ruta } = await guardarFichero(nombre, paginaHtml());
      estado = ruta ? `Informe guardado en ${ruta}` : 'Informe guardado.';
    } catch (err) {
      estado = err instanceof Error ? err.message : 'No se ha podido guardar el informe.';
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
    <p class="nota">
      «Guardar como página» deja un fichero que se abre en cualquier navegador y
      se imprime desde allí, por si «Imprimir» no responde en este equipo.
    </p>
    <div class="hoja" bind:this={hoja}>
      <InformeAlumno informe={viendo} />
    </div>
  {:else}
    <p class="nota">
      Un resumen de la evolución de cada alumno, sin enviar nada a ningún sitio.
      Para ver a toda la clase, pide a cada alumno que exporte su copia de
      seguridad y ábrelas aquí juntas: no se importan ni cambian nada de este equipo.
    </p>
    <div class="acciones">
      <button type="button" class="volver-foco" onclick={verPropio}>
        Informe de {alias} para imprimir
      </button>
      <button type="button" disabled={leyendo} onclick={() => inputArchivos?.click()}>
        Abrir copias de varios alumnos
      </button>
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
        <!-- svelte-ignore a11y_no_noninteractive_tabindex -->
        <div class="tabla" role="region" aria-label="La clase" tabindex="0">
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
                  <td>{a.superadas} de {a.totalLecciones}</td>
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
          <p>No se han podido abrir estas copias:</p>
          <ul>
            {#each clase.errores as e, i (i)}<li><strong>{e.nombre}</strong>: {e.motivo}</li>{/each}
          </ul>
        </div>
      {/if}
    {/if}
  {/if}
  <p class="nota estado" role="status">{estado}</p>
</section>

<style>
  /* Bloque del panel de progreso, separado de lo anterior por una línea. */
  .docente {
    display: grid;
    gap: var(--space-3);
    padding-top: var(--space-4);
    border-top: 1px solid var(--border);
  }
  h3 { margin: 0; font-size: var(--text-base); }
  .nota { margin: 0; font-size: var(--text-sm); color: var(--fg-muted); overflow-wrap: anywhere; }
  .estado:empty { display: none; }
  .acciones { display: flex; flex-wrap: wrap; gap: var(--space-2); }
  /* En pantalla, la hoja es una tarjeta; en papel manda HOJA_CSS. */
  .hoja {
    padding: var(--space-3) var(--space-4);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    background: var(--surface);
  }
  .tabla {
    overflow-x: auto;
    border: 1px solid var(--border);
    border-radius: var(--radius);
  }
  table { border-collapse: collapse; width: 100%; font-variant-numeric: tabular-nums; }
  caption {
    text-align: left;
    font-size: var(--text-sm);
    color: var(--fg-muted);
    padding: var(--space-2) var(--space-3);
  }
  th, td { text-align: left; padding: var(--space-2) var(--space-3); border-bottom: 1px solid var(--border); }
  thead th { font-size: var(--text-sm); color: var(--fg-muted); font-weight: 600; background: var(--surface-sunken); }
  tbody tr:last-child > * { border-bottom: 0; }
  th small { display: block; font-weight: 400; color: var(--fg-muted); }
  .errores {
    padding: var(--space-2) var(--space-3);
    border: var(--borde-grueso) solid var(--error);
    border-radius: var(--radius);
    overflow-wrap: anywhere;
  }
  .errores p, .errores ul { margin: 0; }

  /* Al imprimir solo sale la hoja del informe. En pantalla no se ve nunca. */
  :global(.hoja-impresion) { display: none; }
  @media print {
    :global(body > :not(.hoja-impresion)), :global(dialog) { display: none !important; }
    :global(.hoja-impresion) { display: block; }
  }
</style>
