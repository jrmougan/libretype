<script lang="ts">
  import {
    formatearDuracion, resumirEvolucion, resumirGlobal, resumirLecciones, type Sesion,
  } from "../storage/progreso";
  import { tituloRetirada } from "../storage/equivalencias";
  import type { Lesson } from "../lessons";
  import type { Almacen } from "../storage/almacen";
  import type { EstadoTecla } from "../keyboard/dominio";
  import {
    generarEjercicioRefuerzo, obtenerTeclasOrdenadas, type EjercicioRefuerzo,
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
  }: Props = $props();

  const esDegradado = $derived(errorAlmacen || Boolean(almacen?.errorAlmacen));
  const porLeccion = $derived(resumirLecciones(sesiones));
  const global = $derived(resumirGlobal(sesiones));
  const evolucion = $derived(resumirEvolucion(sesiones));
  const listaTeclas = $derived(teclas ? obtenerTeclasOrdenadas(teclas) : []);
  const teclasFlojas = $derived(listaTeclas.filter((t) => t.esFloja));
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

      const blob = new Blob([json], { type: "application/json;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const enlace = document.createElement("a");
      const fechaHoy = new Date().toISOString().slice(0, 10);
      enlace.href = url;
      enlace.download = `libretype-progreso-${fechaHoy}.json`;
      document.body.appendChild(enlace);
      enlace.click();
      document.body.removeChild(enlace);
      URL.revokeObjectURL(url);
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
      const texto = await archivo.text();
      if (sesiones.length > 0) {
        archivoPendiente = texto;
        confirmandoImportar = true;
      } else {
        await procesarImportacion(texto);
      }
    } catch {
      mensajeEstado = {
        tipo: "error",
        texto: "No se pudo leer el archivo seleccionado.",
      };
      if (inputArchivo) inputArchivo.value = "";
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
    const ej = generarEjercicioRefuerzo(teclas);
    if (ej) onPracticarRefuerzo(ej);
  }
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
      <div><dt>Días practicados</dt><dd>{evolucion.diasPracticados}</dd></div>
      <div><dt>Racha</dt><dd>{evolucion.rachaActual} <small>{evolucion.rachaActual === 1 ? 'día' : 'días'}</small></dd></div>
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
            <td>{r ? r.intentos : "—"}</td>
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
              {:else}
                {tituloRetirada(r.leccion) ?? r.leccion}
                <small>lección retirada</small>
              {/if}
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

    {#if retiradas.some(r => r.leccion !== 'practica-continua' && r.leccion !== 'texto-propio')}
      <p class="nota">
        Las lecciones retiradas son de una versión anterior de LibreType. El
        temario cambió, pero lo que practicaste sigue contando aquí.
      </p>
    {/if}

    <p class="nota">
      Solo cuentan para la marca los intentos con 90% de acierto o más: ir
      rápido fallando no es escribir mejor.
    </p>

    {#if evolucion.dias.length > 0}
      <section class="seccion-bloque" aria-labelledby="titulo-evolucion">
        <h3 id="titulo-evolucion">Evolución temporal</h3>
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
      </section>
    {/if}
  {/if}

  {#if listaTeclas.length > 0}
    <section class="seccion-bloque" aria-labelledby="titulo-teclas">
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
        onclick={() => inputArchivo?.click()}
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
  }
  .copia {
    display: flex;
    gap: var(--space-3);
    flex-wrap: wrap;
  }
  .copia button, .borrar button, .confirmacion button {
    min-height: var(--target-min);
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
    gap: var(--space-2);
    margin-top: var(--space-2);
  }
  .seccion-bloque h3 {
    font-size: var(--text-md, 1rem);
    margin: 0;
  }
  .cab-bloque {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: var(--space-2);
    flex-wrap: wrap;
  }
  .btn-refuerzo {
    min-height: var(--target-min);
    background: var(--accent);
    color: var(--accent-fg);
    border: 1px solid var(--accent);
    border-radius: var(--radius);
    padding: 0 var(--space-3);
    font-weight: 500;
    cursor: pointer;
  }
  .rejilla-teclas {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(64px, 1fr));
    gap: var(--space-2);
  }
  .tecla-card {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    min-height: var(--target-min);
    padding: var(--space-1) var(--space-2);
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    font-variant-numeric: tabular-nums;
  }
  .tecla-char {
    font-weight: 600;
    font-size: var(--text-md, 1rem);
  }
  .tecla-pct {
    font-size: var(--text-xs);
    color: var(--fg-muted);
  }
  .tecla-card.tecla-floja {
    border: 2px double var(--pending);
    background: var(--pending-bg);
  }
  .badge-floja {
    font-size: 0.65rem;
    color: var(--pending);
    font-weight: bold;
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }
</style>
