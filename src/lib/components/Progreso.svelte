<script lang="ts">
  import {
    formatearDuracion, resumirEvolucion, resumirGlobal, resumirLecciones, type Sesion,
  } from "../storage/progreso";
  import { resumirDificultad } from "../storage/dificultad";
  import { tituloRetirada } from "../storage/equivalencias";
  import {
    FILA_DISPONIBLE, leccionesSuperadas, nivelDisponible, NOTA_MARCA, OBJETIVO_PANEL,
  } from "../storage/objetivos";
  import type { Lesson } from "../lessons";
  import { ES_ISO, type Layout } from "../keyboard/layouts";
  import {
    comparacionPropia, fraseResumen, serieGrafica, teclasSinMirar,
  } from "../storage/comparacion";
  import GraficaEvolucion from "./GraficaEvolucion.svelte";
  import { ID_FLUIDEZ } from "../fluidez";
  import type { Almacen } from "../storage/almacen";
  import { abrirCopiasNativas, guardarCopia } from "../storage/copia";
  import type { EstadoTecla } from "../keyboard/dominio";
  import {
    generarEjercicioRefuerzo, nivelEnsenado, obtenerTeclasOrdenadas, type EjercicioRefuerzo,
  } from "../refuerzo";

  interface Props {
    sesiones: readonly Sesion[];
    lecciones: readonly Lesson[];
    /** 'local' avisa de que el progreso no está en la base de datos. */
    tipoAlmacen: "sqlite" | "local";
    /** Avisa de que falló SQLite en entorno de escritorio y se degradó a local. */
    errorAlmacen?: boolean;
    almacen?: Almacen | null;
    teclas?: ReadonlyMap<string, EstadoTecla>;
    onBorrar: () => void;
    onExportar?: () => Promise<string> | string;
    onImportar?: (json: string) => Promise<void> | void;
    onPracticarRefuerzo?: (ejercicio: EjercicioRefuerzo) => void;
    /** Para saber qué teclas pide el temario; ES-ISO si no se dice. */
    layout?: Layout;
    /** Índice de la lección en curso, para marcar su fila; null si no hay. */
    leccionActual?: number | null;
    /** Tono con celebración: la tarjeta de constancia lleva su color. */
    celebra?: boolean;
  }

  let {
    sesiones,
    lecciones,
    tipoAlmacen,
    errorAlmacen = false,
    almacen = null,
    teclas,
    onBorrar,
    onExportar,
    onImportar,
    onPracticarRefuerzo,
    layout = ES_ISO,
    leccionActual = null,
    celebra = false,
  }: Props = $props();

  const esDegradado = $derived(errorAlmacen || Boolean(almacen?.errorAlmacen));
  const porLeccion = $derived(resumirLecciones(sesiones));
  /** Cuánto costó superar cada lección, sin el repaso posterior a lograrlo. */
  const dificultad = $derived(resumirDificultad(sesiones));
  const superadas = $derived(leccionesSuperadas(sesiones));
  const nivel = $derived(nivelDisponible(sesiones));
  const global = $derived(resumirGlobal(sesiones));
  const evolucion = $derived(resumirEvolucion(sesiones));
  const listaTeclas = $derived(teclas ? obtenerTeclasOrdenadas(teclas) : []);
  const teclasFlojas = $derived(listaTeclas.filter((t) => t.esFloja));
  const idsActuales = $derived(new Set(lecciones.map((l) => l.id)));
  const sinMirar = $derived(teclasSinMirar(teclas ?? new Map(), nivel, layout));
  /** Contra medias y contra los comienzos, nunca contra la última sesión. */
  const comparacion = $derived(comparacionPropia(sesiones));

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


  let confirmando = $state(false);
  let inputArchivo = $state<HTMLInputElement | null>(null);
  let confirmandoImportar = $state(false);
  let archivoPendiente = $state<string | null>(null);
  let mensajeEstado = $state<{ tipo: "exito" | "error"; texto: string } | null>(null);

  const fecha = (iso: string) =>
    new Date(iso).toLocaleDateString("es-ES", { day: "numeric", month: "short" });

  async function descargarCopia(): Promise<void> {
    mensajeEstado = null;
    try {
      let json = "";
      if (onExportar) {
        json = await onExportar();
      } else if (almacen) {
        json = await almacen.exportar();
      } else {
        throw new Error("No hay almacén disponible para exportar.");
      }

      if (!json) return;

      if (!(await guardarCopia(json))) return;
      mensajeEstado = {
        tipo: "exito",
        texto: "Copia de seguridad exportada correctamente.",
      };
    } catch (err) {
      mensajeEstado = {
        tipo: "error",
        texto: err instanceof Error ? err.message : "Error al exportar la copia de seguridad.",
      };
    }
  }

  async function procesarImportacion(contenido: string): Promise<void> {
    try {
      if (onImportar) {
        await onImportar(contenido);
      } else if (almacen) {
        await almacen.importar(contenido);
      } else {
        throw new Error("No hay almacén disponible para importar.");
      }
      mensajeEstado = {
        tipo: "exito",
        texto: "Copia de seguridad importada con éxito.",
      };
    } catch (err) {
      mensajeEstado = {
        tipo: "error",
        texto: err instanceof Error ? err.message : "Error al importar la copia de seguridad.",
      };
    } finally {
      archivoPendiente = null;
      confirmandoImportar = false;
      if (inputArchivo) inputArchivo.value = "";
    }
  }

  async function subirArchivo(evento: Event): Promise<void> {
    mensajeEstado = null;
    const input = evento.target as HTMLInputElement;
    const archivo = input?.files?.[0];
    if (!archivo) return;

    try {
      await recibirCopia(await archivo.text());
    } catch {
      mensajeEstado = {
        tipo: "error",
        texto: "No se pudo leer el archivo seleccionado.",
      };
      if (inputArchivo) inputArchivo.value = "";
    }
  }

  async function recibirCopia(texto: string): Promise<void> {
    if (sesiones.length > 0) {
      archivoPendiente = texto;
      confirmandoImportar = true;
    } else {
      await procesarImportacion(texto);
    }
  }

  /** En escritorio, el diálogo nativo; en el navegador, el `<input type="file">`. */
  async function elegirArchivo(): Promise<void> {
    mensajeEstado = null;
    try {
      const elegidos = await abrirCopiasNativas(false);
      if (elegidos === null) inputArchivo?.click();
      else if (elegidos[0]) await recibirCopia(elegidos[0].contenido);
    } catch {
      mensajeEstado = { tipo: "error", texto: "No se pudo leer el archivo seleccionado." };
    }
  }

  function confirmarImportar(): void {
    if (archivoPendiente) {
      void procesarImportacion(archivoPendiente);
    }
  }

  function cancelarImportar(): void {
    archivoPendiente = null;
    confirmandoImportar = false;
    if (inputArchivo) inputArchivo.value = "";
  }

  function iniciarRefuerzo(): void {
    if (!teclas || !onPracticarRefuerzo) return;
    // Solo con las teclas enseñadas hasta la lección a la que ha llegado.
    const ej = generarEjercicioRefuerzo(teclas, undefined, { nivel: nivelEnsenado(sesiones) });
    if (ej) onPracticarRefuerzo(ej);
  }
</script>

<!-- Sin <h2> propio: el panel ya lo pone en su cabecera, y repetido se
     anunciaba dos veces. -->
<section class="progreso" aria-label="Tu progreso">
  <!-- Subtítulo del panel: el umbral se explica una vez, aquí, y siempre con
       la frase de objetivos.ts. Las filas de la tabla ya no lo repiten. -->
  <p class="nota subtitulo">{OBJETIVO_PANEL}</p>
  {#if global.sesiones === 0}
    <p class="vacio">
      Todavía no has terminado ninguna lección. En cuanto acabes una, aquí
      aparecerá cómo vas.
    </p>
  {:else}
    <!-- Lo primero, en una frase: cuatro cifras sueltas no dicen si vas bien. -->
    <p class="resumen">{fraseResumen({
      superadas: superadas.size, lecciones: lecciones.length, sinMirar,
      diasEstaSemana: evolucion.diasEstaSemana,
    })}</p>

    <!-- Constancia de la semana y total de días: nada de racha que se pierde. -->
    <dl class="global">
      <div><dt>Lecciones superadas</dt><dd>{superadas.size} <small>de {lecciones.length}</small></dd></div>
      <div><dt>Teclas que ya escribes sin mirar</dt><dd>{sinMirar.dominadas} <small>de {sinMirar.total}</small></dd></div>
      <div class:constancia={celebra}><dt>Esta semana</dt><dd>{evolucion.diasEstaSemana} <small>{evolucion.diasEstaSemana === 1 ? 'día' : 'días'}</small></dd></div>
      <div><dt>Días practicados</dt><dd>{evolucion.diasPracticados}</dd></div>
      <div><dt>Tiempo total</dt><dd>{formatearDuracion(global.msTotales)}</dd></div>
      <div><dt>Tu mejor marca</dt><dd>{#if global.mejorPpm > 0}{global.mejorPpm} <small>ppm</small>{:else}—{/if}</dd></div>
    </dl>

    <div class="fila-bloques">

    {#if comparacion.length > 0}
      <section class="seccion-bloque" aria-labelledby="titulo-comparacion">
        <h3 id="titulo-comparacion">Frente a tus comienzos</h3>
        <ul class="comparacion">
          {#each comparacion as frase (frase)}<li>{frase}</li>{/each}
        </ul>
      </section>
    {/if}

    {#if evolucion.dias.length > 0}
      <section class="seccion-bloque bloque-ancho" aria-labelledby="titulo-evolucion">
        <h3 id="titulo-evolucion">Evolución temporal</h3>
        <GraficaEvolucion dias={serieGrafica(evolucion.dias)} />
        <!-- La misma información en tabla: la alternativa textual de la gráfica
             y el detalle para quien lo quiera. -->
        <details>
          <summary>Ver los datos de cada día</summary>
        <div class="tabla">
          <table>
            <caption class="sr-only">Evolución de velocidad y práctica por día</caption>
            <thead>
              <tr>
                <th scope="col">Fecha</th>
                <th scope="col">Sesiones</th>
                <th scope="col">Mejor</th>
                <th scope="col">Media</th>
                <th scope="col">Tiempo</th>
              </tr>
            </thead>
            <tbody>
              {#each [...evolucion.dias].reverse() as d (d.fecha)}
                <tr>
                  <th scope="row">{fecha(d.fecha)}</th>
                  <td>{d.sesiones}</td>
                  <td>
                    {#if d.mejorPpm > 0}
                      <strong>{d.mejorPpm}</strong> ppm
                    {:else}
                      <span class="nota">sin marca limpia</span>
                    {/if}
                  </td>
                  <td>{d.ppmMedia} ppm · {d.pctMedio}%</td>
                  <td>{formatearDuracion(d.msTotales)}</td>
                </tr>
              {/each}
            </tbody>
          </table>
        </div>
        </details>
      </section>
    {/if}
    </div>
  {/if}

  <div class="fila-bloques">
  {#if global.sesiones > 0}
    <section class="seccion-bloque bloque-lecciones" aria-labelledby="titulo-lecciones">
      <h3 id="titulo-lecciones">Lecciones</h3>

    <!-- Al 200% las seis columnas no caben en el panel. Que se desplace la
         tabla dentro de su caja, no que se recorten la marca y la fecha. -->
    <div class="tabla">
      <table>
      <caption class="sr-only">Marca por lección</caption>
      <thead>
        <tr>
          <th scope="col">Lección</th>
          <th scope="col">Intentos</th>
          <th scope="col">Hasta superar</th>
          <th scope="col">Mejor</th>
          <th scope="col">Última</th>
          <th scope="col">Cuándo</th>
        </tr>
      </thead>
      <tbody>
        {#each lecciones as l, i (l.id)}
          {@const r = porLeccion.get(l.id)}
          {@const d = dificultad.get(l.id)}
          {@const estado = i > nivel ? 'cerrada' : superadas.has(l.id) ? 'superada' : 'abierta'}
          <tr class:sin-hacer={!r} class:actual={leccionActual === i}>
            <!-- La insignia acompaña a la etiqueta escrita: no es lo único que
                 dice el estado. -->
            <th scope="row"><span class="fila-tit"><span class="insignia {estado}" aria-hidden="true">{estado === 'superada' ? '✓' : estado === 'abierta' ? '›' : ''}</span><span class="nombre">{l.title}{#if leccionActual === i} <span class="aqui">Estás aquí</span>{/if}</span></span><small>{estado === 'cerrada' ? 'Bloqueada · supera las anteriores' : estado === 'superada' ? 'Superada' : FILA_DISPONIBLE}</small></th>
            <td>{r ? r.intentos : "—"}</td>
            <td>
              {#if d}
                {d.intentosHastaSuperar}{#if !d.superada} <span class="nota">sin superar</span>{/if}
              {:else}—{/if}
            </td>
            <td>
              {#if r && r.mejorPpm > 0}
                <strong>{r.mejorPpm}</strong> ppm · {r.mejorPct}%
              {:else if r}
                <span class="nota">sin marca limpia</span>
              {:else}—{/if}
            </td>
            <td>{r ? `${r.ultimaPpm} ppm · ${r.ultimaPct}%` : "—"}</td>
            <td>{r ? fecha(r.ultimaEn) : "—"}</td>
          </tr>
        {/each}
        {#each retiradas as r (r.leccion)}
          <tr class="retirada">
            <th scope="row">
              {#if r.leccion === 'practica-continua'}
                Práctica continua
                <small>práctica libre</small>
              {:else if r.leccion === 'texto-propio'}
                Texto propio
                <small>práctica libre</small>
              {:else if r.leccion === ID_FLUIDEZ}
                Fluidez
                <small>práctica libre</small>
              {:else}
                {tituloRetirada(r.leccion) ?? r.leccion}
                <small>lección retirada</small>
              {/if}
            </th>
            <td>{r.intentos}</td>
            <!-- Ni la práctica libre ni las retiradas tienen objetivo que
                 superar; el porqué está en `storage/dificultad.ts`. -->
            <td>—</td>
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

    {#if retiradas.some(r => r.leccion !== 'practica-continua' && r.leccion !== 'texto-propio' && r.leccion !== ID_FLUIDEZ)}
      <p class="nota">
        Las lecciones retiradas son de una versión anterior de LibreType. El
        temario cambió, pero lo que practicaste sigue contando aquí.
      </p>
    {/if}

    <p class="nota">{NOTA_MARCA}</p>

    <p class="nota">
      «Hasta superar» cuenta los intentos que costó llegar al objetivo la
      primera vez: seguir practicando una lección ya superada no suma ahí. Es lo
      que permite ver cuál está costando más que las demás. Si faltan sesiones
      antiguas en el historial, el recuento puede ser menor que el real.
    </p>
    </section>
  {/if}

  {#if listaTeclas.length > 0}
    <section class="seccion-bloque bloque-teclas" aria-labelledby="titulo-teclas">
      <div class="cab-bloque">
        <h3 id="titulo-teclas">Teclas y precisión</h3>
        {#if onPracticarRefuerzo}
          <button
            type="button"
            class="btn-refuerzo"
            onclick={iniciarRefuerzo}
            aria-label="Iniciar práctica con las teclas que más te cuestan"
          >
            Reforzar teclas flojas
          </button>
        {/if}
      </div>
      {#if teclasFlojas.length > 0}
        <p class="nota aviso">
          Teclas destacadas que necesitan más práctica para consolidar el hábito.
        </p>
      {/if}
      <div class="rejilla-teclas" role="list" aria-label="Lista de teclas practicadas ordenadas por dificultad">
        {#each listaTeclas as t (t.code)}
          <div class="tecla-card" class:tecla-floja={t.esFloja} role="listitem">
            <span class="tecla-char">{t.char.toUpperCase()}</span>
            <span class="tecla-pct">{t.precision}%</span>
            {#if t.esFloja}
              <span class="badge-floja">reforzar</span>
            {/if}
          </div>
        {/each}
      </div>
    </section>
  {/if}
  </div>

  {#if esDegradado}
    <p class="nota aviso aviso-error" role="alert">
      No se pudo abrir la base de datos local. Se está usando el almacenamiento
      del navegador temporalmente, por lo que tu progreso se guardará aquí mientras tanto.
    </p>
  {:else if tipoAlmacen === "local"}
    <p class="nota aviso">
      Guardando en el navegador. En la app de escritorio el progreso va a una
      base de datos en tu equipo.
    </p>
  {/if}

  <div class="acciones">
    <div class="copia">
      <button
        type="button"
        onclick={descargarCopia}
        disabled={sesiones.length === 0}
        aria-label="Exportar copia de seguridad del progreso en formato JSON"
      >
        Exportar copia de seguridad
      </button>

      <button
        type="button"
        onclick={elegirArchivo}
        aria-label="Importar copia de seguridad desde un archivo JSON"
      >
        Importar copia de seguridad
      </button>

      <input
        bind:this={inputArchivo}
        type="file"
        accept=".json,application/json"
        class="sr-only"
        tabindex="-1"
        aria-hidden="true"
        onchange={subirArchivo}
      />
    </div>

    {#if confirmandoImportar}
      <div class="confirmacion" role="alert">
        <span>Al importar la copia se sustituirá el progreso actual. ¿Deseas continuar?</span>
        <button type="button" onclick={confirmarImportar}>Sí, importar</button>
        <button type="button" onclick={cancelarImportar}>Cancelar</button>
      </div>
    {/if}

    {#if mensajeEstado}
      <p
        class="nota aviso"
        class:aviso-error={mensajeEstado.tipo === "error"}
        class:aviso-exito={mensajeEstado.tipo === "exito"}
        role={mensajeEstado.tipo === "error" ? "alert" : "status"}
      >
        {mensajeEstado.texto}
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
  </div>
</section>

<style>
  /* El panel ya es la tarjeta: aquí dentro no hay otra caja alrededor. */
  .progreso {
    display: grid;
    gap: var(--space-6);
  }
  .subtitulo { font-size: var(--text-base); margin-top: calc(-1 * var(--space-2)); }
  .resumen { margin: 0; font-size: var(--text-lg); line-height: 1.4; }
  .comparacion { margin: 0; padding-left: var(--space-4); display: grid; gap: var(--space-1); }
  details summary { cursor: pointer; padding-block: var(--space-3); min-height: var(--target-min); }
  .vacio { margin: 0; color: var(--fg-muted); }

  /* Tarjetas de cifra: hundidas, con la cifra grande y su unidad al lado. */
  .global {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(min(100%, calc(9.5rem * var(--ui-scale))), 1fr));
    gap: var(--space-3);
    margin: 0;
  }
  .global div {
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
    padding: var(--space-3) var(--space-4);
    background: var(--surface-sunken);
    border-radius: var(--radius);
  }
  /* La constancia de la semana, con el color de la celebración cuando el tono
     lo pide. La cifra y su texto dicen lo mismo sin el color. */
  .global div.constancia { background: var(--celebracion-soft); }
  .global dt { font-size: var(--text-sm); color: var(--fg-muted); }
  .global .constancia dt { color: var(--fg); }
  .global dd {
    margin: 0;
    font-size: var(--text-xl);
    font-weight: 700;
    line-height: 1.1;
    font-variant-numeric: tabular-nums;
  }
  .global small { font-size: var(--text-sm); font-weight: 400; color: var(--fg-muted); }
  .global .constancia small { color: var(--fg); }

  /* Dos bloques por fila mientras quepan; la base escala con --ui-scale, así
     que al 200% van uno debajo de otro sin recortar nada. */
  .fila-bloques {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-6);
    align-items: start;
  }
  .fila-bloques > * { flex: 1 1 calc(22rem * var(--ui-scale)); min-width: 0; }
  .fila-bloques > .bloque-lecciones { flex: 3 1 calc(30rem * var(--ui-scale)); }
  .fila-bloques > .bloque-teclas { flex: 2 1 calc(18rem * var(--ui-scale)); }
  .fila-bloques > .bloque-ancho { flex-grow: 2; }

  .tabla {
    overflow-x: auto;
    border: 1px solid var(--border);
    border-radius: var(--radius);
  }
  table { border-collapse: collapse; width: 100%; font-variant-numeric: tabular-nums; }
  caption { text-align: left; }
  th, td {
    text-align: left;
    padding: var(--space-2) var(--space-3);
    border-bottom: 1px solid var(--border);
  }
  tbody tr:last-child > * { border-bottom: 0; }
  thead th {
    font-size: var(--text-sm);
    color: var(--fg-muted);
    font-weight: 700;
    background: var(--surface-sunken);
  }
  tbody th { font-weight: 500; }
  tbody th small {
    display: block;
    padding-left: calc(1.75em + var(--space-2));
    font-size: var(--text-xs);
    font-weight: 400;
    color: var(--fg-muted);
  }
  .fila-tit { display: flex; align-items: center; gap: var(--space-2); }
  .nombre { min-width: 0; }

  /* Insignia redonda del estado de la lección: ✓ superada, › abierta y vacía
     con borde si sigue cerrada. Siempre con la etiqueta escrita debajo. */
  .insignia {
    flex: none;
    display: inline-grid;
    place-items: center;
    width: 1.75em;
    height: 1.75em;
    border-radius: 50%;
    font-size: var(--text-xs);
    font-weight: 700;
    line-height: 1;
    border: 2px solid var(--border-strong);
  }
  .insignia.superada { background: var(--ok); border-color: var(--ok); color: var(--surface); }
  .insignia.abierta { background: var(--accent); border-color: var(--accent); color: var(--accent-fg); }
  .insignia.cerrada { background: transparent; }

  /* La fila en curso se marca con fondo y con el texto «Estás aquí». */
  tr.actual > * { background: var(--accent-soft); }
  .aqui {
    display: inline-block;
    font-size: var(--text-xs);
    font-weight: 700;
    padding: 0 var(--space-2);
    border-radius: var(--radius-chip);
    background: var(--accent);
    color: var(--accent-fg);
  }

  /* Las lecciones sin hacer se distinguen también por el guion de cada celda,
     no solo por el atenuado. */
  .sin-hacer td { color: var(--fg-muted); }
  /* Y las retiradas por su etiqueta, no por el borde: la línea más gruesa solo
     separa el bloque del temario de ahora, no una fila de la siguiente. */
  .retirada { border-top: 2px solid var(--border); }
  .retirada + .retirada { border-top: 0; }
  .retirada th small { padding-left: 0; }

  .nota { margin: 0; font-size: var(--text-sm); color: var(--fg-muted); }
  .aviso {
    background: var(--pending-bg);
    color: var(--pending);
    border-left: 4px solid var(--pending);
    padding: var(--space-2) var(--space-3);
    border-radius: 0 var(--radius) var(--radius) 0;
  }
  .aviso-error {
    background: var(--error-bg);
    color: var(--error);
    border-left: 4px solid var(--error);
  }
  .aviso-exito {
    background: var(--ok-bg);
    color: var(--ok);
    border-left: 4px solid var(--ok);
  }

  .acciones {
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
    padding-top: var(--space-4);
    border-top: 1px solid var(--border);
  }
  .copia {
    display: flex;
    gap: var(--space-3);
    flex-wrap: wrap;
  }
  .copia button, .borrar button, .confirmacion button {
    min-height: var(--target-min);
    border-radius: var(--radius);
  }
  .confirmacion {
    display: flex;
    align-items: center;
    gap: var(--space-3);
    flex-wrap: wrap;
    background: var(--pending-bg);
    color: var(--pending);
    border-left: 4px solid var(--pending);
    padding: var(--space-2) var(--space-3);
    border-radius: 0 var(--radius) var(--radius) 0;
  }

  .borrar { display: flex; align-items: center; gap: var(--space-3); flex-wrap: wrap; }

  .seccion-bloque {
    display: grid;
    gap: var(--space-3);
    align-content: start;
  }
  .seccion-bloque h3 {
    font-size: var(--text-lg);
    margin: 0;
  }
  .cab-bloque {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: var(--space-2);
    flex-wrap: wrap;
  }
  /* Botón primario de la maqueta. */
  .btn-refuerzo {
    min-height: var(--target-min);
    background: var(--accent);
    color: var(--accent-fg);
    border: 1px solid var(--accent);
    border-radius: var(--radius);
    box-shadow: 0 3px 0 var(--accent-deep);
    padding: 0 var(--space-4);
    font-weight: 700;
    cursor: pointer;
  }
  .btn-refuerzo:hover { background: var(--accent); filter: brightness(1.05); }
  .rejilla-teclas {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(calc(4.25rem * var(--ui-scale)), 1fr));
    gap: var(--space-2);
  }
  .tecla-card {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    min-height: var(--target-min);
    padding: var(--space-2);
    background: var(--surface);
    border: 1px solid var(--border-strong);
    border-radius: var(--radius);
    font-variant-numeric: tabular-nums;
  }
  .tecla-char {
    font-family: var(--font-key);
    font-weight: 700;
    font-size: calc(1.375rem * var(--ui-scale));
    line-height: 1.2;
  }
  .tecla-pct {
    font-size: var(--text-xs);
    color: var(--fg-muted);
  }
  /* Floja: borde grueso, fondo, cifra en negrita y la palabra «reforzar».
     El color es lo último que la distingue, no lo único. */
  .tecla-card.tecla-floja {
    border: 2px solid var(--error);
    background: var(--error-bg);
  }
  .tecla-floja .tecla-pct { color: var(--fg); font-weight: 700; }
  .badge-floja {
    font-size: var(--text-xs);
    color: var(--error);
    font-weight: 700;
  }
</style>
