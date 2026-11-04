<script lang="ts">
  import { tick } from "svelte";
  import {
    formatearDuracion, resumirEvolucion, resumirGlobal, resumirLecciones, type Sesion,
  } from "../storage/progreso";
  import { resumirDificultad } from "../storage/dificultad";
  import { tituloRetirada } from "../storage/equivalencias";
  import {
    FILA_DISPONIBLE, leccionesSuperadas, OBJETIVO_PANEL,
  } from "../storage/objetivos";
  import { catalogo } from "../lecciones/catalogo";
  import { guardarFichero } from "../ficheros";
  import { esIdPropio, ID_PRACTICA_CONTINUA, ID_REFUERZO, ID_REFUERZO_SUELTO, ID_TEXTO_PROPIO } from "../lecciones/ids";
  import { LIMITES, type LeccionPropia } from "../lecciones/personalizadas";
  import type { Lesson } from "../lecciones/tipos";
  import type { Almacen, ResultadoRestauracion } from "../storage/almacen";
  import type { EstadoTecla } from "../keyboard/dominio";
  import {
    generarEjercicioRefuerzo, obtenerTeclasOrdenadas, type EjercicioRefuerzo,
  } from "../refuerzo";

  interface Props {
    sesiones: readonly Sesion[];
    lecciones: readonly Lesson[];
    /** Las del alumno, lápidas incluidas: de ahí sale el nombre de lo ya borrado. */
    leccionesPropias?: readonly LeccionPropia[];
    /** 'local' avisa de que el progreso no está en la base de datos. */
    tipoAlmacen: "sqlite" | "local";
    /** Avisa de que falló SQLite en entorno de escritorio y se degradó a local. */
    errorAlmacen?: boolean;
    almacen?: Almacen | null;
    teclas?: ReadonlyMap<string, EstadoTecla>;
    /** El curso que se está siguiendo: el refuerzo solo pide lo que se ha visto en él. */
    cursoActual?: string;
    onBorrar: () => void;
    onExportar?: () => Promise<string> | string;
    onImportar?: (json: string) => Promise<ResultadoRestauracion | void> | ResultadoRestauracion | void;
    onPracticarRefuerzo?: (ejercicio: EjercicioRefuerzo) => void;
    onGestionarLecciones?: () => void;
    /** Salida del estado vacío: cerrar esto y ponerse a practicar. */
    onIrAPracticar?: () => void;
  }

  let {
    sesiones,
    lecciones,
    leccionesPropias = [],
    tipoAlmacen,
    errorAlmacen = false,
    almacen = null,
    teclas,
    cursoActual,
    onBorrar,
    onExportar,
    onImportar,
    onPracticarRefuerzo,
    onGestionarLecciones,
    onIrAPracticar,
  }: Props = $props();

  const esDegradado = $derived(errorAlmacen || Boolean(almacen?.errorAlmacen));
  const porLeccion = $derived(resumirLecciones(sesiones));
  /** Cuánto costó superar cada lección, sin el repaso posterior a lograrlo. */
  const dificultad = $derived(resumirDificultad(sesiones));
  const superadas = $derived(leccionesSuperadas(sesiones));
  const global = $derived(resumirGlobal(sesiones));
  const evolucion = $derived(resumirEvolucion(sesiones));
  const listaTeclas = $derived(teclas ? obtenerTeclasOrdenadas(teclas) : []);
  const teclasFlojas = $derived(listaTeclas.filter((t) => t.esFloja));
  const idsActuales = $derived(new Set(lecciones.map((l) => l.id)));

  /**
   * Los modos de práctica también salen aquí abajo, pero no son lecciones retiradas.
   * Un `Map` y no un objeto: el id viene de los datos, y con uno de una copia dañada
   * como «constructor» un objeto contestaría con lo que hereda de `Object.prototype`.
   */
  const MODOS_PRACTICA: ReadonlyMap<string, string> = new Map([
    [ID_PRACTICA_CONTINUA, "Práctica continua"],
    [ID_TEXTO_PROPIO, "Texto propio"],
    [ID_REFUERZO, "Refuerzo de teclas"],
    [ID_REFUERZO_SUELTO, "Refuerzo con texto repetido"],
  ]);

  /**
   * Lo practicado en versiones anteriores en lecciones que ya no existen. Se
   * enseña aparte en vez de esconderlo: sale en los totales, así que si no
   * apareciera en ninguna fila los números no cuadrarían y parecería un fallo.
   */
  const retiradas = $derived(
    [...porLeccion.values()]
      .filter((r) => !idsActuales.has(r.leccion) && !esIdPropio(r.leccion))
      .sort((a, b) => (a.ultimaEn < b.ultimaEn ? 1 : -1)),
  );
  /**
   * Las lecciones del alumno van aparte: no son temario y no tienen objetivo. Una
   * ya borrada sigue aquí con su nombre, porque sigue en los totales; si esa fila
   * falta (una copia antigua, datos dañados) se dice sin más que no se conoce.
   */
  const conPropias = $derived(
    [...porLeccion.values()]
      .filter((r) => esIdPropio(r.leccion))
      .map((r) => {
        const l = leccionesPropias.find((x) => x.id === r.leccion);
        return { r, titulo: l?.titulo ?? "Lección sin nombre", borrada: !l || l.borradaEn !== null };
      })
      .sort((a, b) => (a.r.ultimaEn < b.r.ultimaEn ? 1 : -1)),
  );
  /** El denominador es el temario de ahora, así que el numerador también. */
  const tocadasActuales = $derived(
    [...porLeccion.keys()].filter((id) => idsActuales.has(id)).length,
  );

  let confirmando = $state(false);
  let inputArchivo = $state<HTMLInputElement | null>(null);
  let raiz = $state<HTMLElement | null>(null);
  let confirmandoImportar = $state(false);
  let archivoPendiente = $state<string | null>(null);
  let mensajeEstado = $state<{ tipo: "exito" | "error" | "curso"; texto: string } | null>(null);

  /**
   * El botón pulsado desaparece al pedir confirmación, y con él se iría el foco al
   * documento: quien va con teclado volvería al principio del panel. Se lleva a la
   * salida segura, y al confirmar o cancelar, a donde se estaba.
   */
  async function enfocar(selector: string): Promise<void> {
    await tick();
    raiz?.querySelector<HTMLElement>(selector)?.focus();
  }

  function pedirBorrado(): void {
    confirmando = true;
    void enfocar('.borrar .cancelar');
  }

  function cancelarBorrado(): void {
    confirmando = false;
    void enfocar('.borrar .pedir');
  }

  function borrarDeVerdad(): void {
    onBorrar();
    confirmando = false;
    void enfocar('.importar');
  }

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
        throw new Error("El progreso aún no está disponible. Prueba de nuevo en un momento.");
      }

      if (!json) return;

      const fechaHoy = new Date().toISOString().slice(0, 10);
      const { ruta } = await guardarFichero(`libretype-progreso-${fechaHoy}.json`, json);
      mensajeEstado = {
        tipo: "exito",
        texto: ruta
          ? `Copia de seguridad guardada en ${ruta}`
          : "Copia de seguridad exportada correctamente.",
      };
    } catch (err) {
      mensajeEstado = {
        tipo: "error",
        texto: err instanceof Error ? err.message : "No se ha podido exportar la copia de seguridad.",
      };
    }
  }

  /**
   * Las personas mayores suelen hacer doble clic, y restaurar no es instantáneo.
   * Una sola a la vez, y nada de lo que hay alrededor responde mientras dura.
   */
  let importando = $state(false);

  async function procesarImportacion(contenido: string): Promise<void> {
    if (importando) return;
    importando = true;
    mensajeEstado = { tipo: "curso", texto: "Importando la copia de seguridad…" };
    try {
      let resultado: ResultadoRestauracion | void;
      if (onImportar) {
        resultado = await onImportar(contenido);
      } else if (almacen) {
        resultado = await almacen.importar(contenido);
      } else {
        throw new Error("El progreso aún no está disponible. Prueba de nuevo en un momento.");
      }
      const fuera = resultado?.leccionesSinSitio ?? 0;
      mensajeEstado = {
        tipo: "exito",
        texto: "Copia de seguridad importada con éxito."
          + (fuera > 0
            ? ` ${fuera === 1 ? "Una lección no ha cabido" : `${fuera} lecciones no han cabido`}, porque el límite son ${LIMITES.lecciones}. Si borras alguna y la importas otra vez, entrarán.`
            : ""),
      };
    } catch (err) {
      mensajeEstado = {
        tipo: "error",
        texto: err instanceof Error ? err.message : "No se ha podido importar la copia de seguridad.",
      };
    } finally {
      importando = false;
      archivoPendiente = null;
      confirmandoImportar = false;
      if (inputArchivo) inputArchivo.value = "";
      // El botón pulsado acaba de desaparecer con la confirmación.
      void enfocar('.importar');
    }
  }

  async function subirArchivo(evento: Event): Promise<void> {
    mensajeEstado = null;
    const input = evento.target as HTMLInputElement;
    const archivo = input?.files?.[0];
    if (!archivo) return;

    try {
      if (archivo.size > LIMITES.copiaBytes) {
        mensajeEstado = {
          tipo: "error",
          texto: "Ese fichero es demasiado grande para ser una copia de seguridad de LibreType.",
        };
        input.value = "";
        return;
      }
      const texto = await archivo.text();
      if (sesiones.length > 0) {
        archivoPendiente = texto;
        confirmandoImportar = true;
        void enfocar('.confirmacion .cancelar');
      } else {
        await procesarImportacion(texto);
      }
    } catch {
      mensajeEstado = {
        tipo: "error",
        texto: "No se ha podido leer ese fichero.",
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
    void enfocar('.importar');
  }

  /** Un botón que no hace nada no se distingue de uno roto, así que se dice por qué. */
  let sinRefuerzo = $state(false);

  function iniciarRefuerzo(): void {
    if (!teclas || !onPracticarRefuerzo || importando) return;
    const ej = generarEjercicioRefuerzo(teclas, superadas, undefined, cursoActual);
    sinRefuerzo = ej === null;
    if (ej) onPracticarRefuerzo(ej);
  }
</script>

<!-- El título lo pone el panel: dos seguidos y una caja dentro de otra eran ruido. -->
<section class="progreso" aria-label="Tu progreso" bind:this={raiz}>
  <p class="nota">{superadas.size} de {lecciones.length} lecciones superadas. {OBJETIVO_PANEL}</p>

  {#if global.sesiones === 0}
    <p class="vacio">
      Todavía no has terminado ninguna lección. En cuanto acabes una, aquí
      aparecerá tu marca.
    </p>
    {#if onIrAPracticar}
      <button class="primario empezar" onclick={onIrAPracticar}>Ir a practicar</button>
    {/if}
  {:else}
    <dl class="global">
      <div><dt>Lecciones practicadas</dt><dd>{tocadasActuales} <small>de {lecciones.length}</small></dd></div>
      <div><dt>Sesiones</dt><dd>{global.sesiones}</dd></div>
      <div><dt>Días practicados</dt><dd>{evolucion.diasPracticados}</dd></div>
      <div><dt>Racha</dt><dd>{evolucion.rachaActual} <small>{evolucion.rachaActual === 1 ? 'día' : 'días'}</small></dd></div>
      <div><dt>Tiempo total</dt><dd>{formatearDuracion(global.msTotales)}</dd></div>
      <div><dt>Mejor marca</dt><dd>{global.mejorPpm} <small>ppm</small></dd></div>
    </dl>

    <!-- Al 200% las seis columnas no caben en el panel. Que se desplace la
         tabla dentro de su caja, no que se recorten la marca y la fecha. -->
    <!-- Enfocable porque no tiene nada enfocable dentro y se desplaza de lado: sin
         esto, en WebKit no habría forma de hacerlo con el teclado. -->
    <!-- svelte-ignore a11y_no_noninteractive_tabindex -->
    <div class="tabla" role="region" aria-label="Marca por lección" tabindex="0">
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
        {#each lecciones as l (l.id)}
          {@const r = porLeccion.get(l.id)}
          {@const d = dificultad.get(l.id)}
          <tr class:sin-hacer={!r}>
            <th scope="row">{l.title}<small>{!catalogo.estaDesbloqueada(l.id, superadas) ? 'Bloqueada · supera las anteriores' : superadas.has(l.id) ? 'Superada' : FILA_DISPONIBLE}</small></th>
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
                <span class="nota">sin marca todavía</span>
              {:else}—{/if}
            </td>
            <td>{r ? `${r.ultimaPpm} ppm · ${r.ultimaPct}%` : "—"}</td>
            <td>{r ? fecha(r.ultimaEn) : "—"}</td>
          </tr>
        {/each}
        {#each retiradas as r (r.leccion)}
          <tr class="retirada">
            <th scope="row">
              {#if MODOS_PRACTICA.has(r.leccion)}
                {MODOS_PRACTICA.get(r.leccion)}
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
                <span class="nota">sin marca todavía</span>
              {/if}
            </td>
            <td>{r.ultimaPpm} ppm · {r.ultimaPct}%</td>
            <td>{fecha(r.ultimaEn)}</td>
          </tr>
        {/each}
      </tbody>
      </table>
    </div>

    {#if retiradas.some((r) => !MODOS_PRACTICA.has(r.leccion))}
      <p class="nota">
        Las lecciones retiradas son de una versión anterior de LibreType. El
        temario cambió, pero lo que practicaste sigue contando aquí.
      </p>
    {/if}

    <p class="nota">
      Solo cuentan para la marca los intentos con al menos un 90% de precisión,
      sin prisa: ir rápido con muchos fallos no es escribir mejor.
    </p>

    <p class="nota">
      «Hasta superar» cuenta los intentos que costó llegar al objetivo la
      primera vez: seguir practicando una lección ya superada no suma ahí. Es lo
      que permite ver cuál está costando más que las demás. Si faltan sesiones
      antiguas en el historial, el recuento puede ser menor que el real.
    </p>

    {#if conPropias.length > 0}
      <section class="seccion-bloque" aria-labelledby="titulo-propias">
        <div class="cab-bloque">
          <h3 id="titulo-propias">Tus lecciones</h3>
          {#if onGestionarLecciones}
            <button type="button" disabled={importando} onclick={onGestionarLecciones}>Gestionar</button>
          {/if}
        </div>
        <p class="nota">
          Cuentan en las sesiones y en el tiempo, y cada una tiene su marca. No
          desbloquean el temario, ni fijan la mejor marca, ni entran en la media
          diaria, ni hacen que el teclado retire letras.
        </p>
        <!-- svelte-ignore a11y_no_noninteractive_tabindex -->
        <div class="tabla" role="region" aria-label="Marca por lección tuya" tabindex="0">
          <table>
            <caption class="sr-only">Marca por lección tuya</caption>
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
              {#each conPropias as { r, titulo, borrada } (r.leccion)}
                <tr>
                  <th scope="row">{titulo}{#if borrada}<small>lección borrada</small>{/if}</th>
                  <td>{r.intentos}</td>
                  <td>
                    {#if r.mejorPpm > 0}
                      <strong>{r.mejorPpm}</strong> ppm · {r.mejorPct}%
                    {:else}
                      <span class="nota">sin marca todavía</span>
                    {/if}
                  </td>
                  <td>{r.ultimaPpm} ppm · {r.ultimaPct}%</td>
                  <td>{fecha(r.ultimaEn)}</td>
                </tr>
              {/each}
            </tbody>
          </table>
        </div>
      </section>
    {/if}

    {#if evolucion.dias.length > 0}
      <section class="seccion-bloque" aria-labelledby="titulo-evolucion">
        <h3 id="titulo-evolucion">Evolución por días</h3>
        <!-- svelte-ignore a11y_no_noninteractive_tabindex -->
        <div class="tabla" role="region" aria-label="Evolución por días" tabindex="0">
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
                      <span class="nota">sin marca todavía</span>
                    {/if}
                  </td>
                  <td>
                    {#if d.comparables > 0}
                      {d.ppmMedia} ppm · {d.pctMedio}%
                    {:else}
                      <!-- También el refuerzo con texto repetido, que no lo escribió el alumno. -->
                      <span class="nota">solo textos a medida</span>
                    {/if}
                  </td>
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
            class="primario btn-refuerzo"
            onclick={iniciarRefuerzo}
          >
            Practicar las teclas que más cuestan
          </button>
        {/if}
      </div>
      <!-- Siempre en el DOM: un lector de pantalla solo anuncia una región que ya existía. -->
      <div role="status" class="estado-refuerzo">
        {#if sinRefuerzo}
          <p class="nota aviso">
            Todavía no hay palabras para practicar estas teclas. Saldrán a medida
            que avances por las lecciones.
          </p>
        {/if}
      </div>
      {#if teclasFlojas.length > 0}
        <p class="nota aviso">
          Las teclas marcadas piden algo más de práctica.
        </p>
      {/if}
      <div class="rejilla-teclas" role="list" aria-label="Lista de teclas practicadas ordenadas por dificultad">
        {#each listaTeclas as t (t.code)}
          <div class="tecla-card" class:tecla-floja={t.esFloja} role="listitem">
            <span class="tecla-char">{t.char === " " ? "Espacio" : t.char.toUpperCase()}</span>
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
      No se ha podido abrir la base de datos de este equipo. Mientras tanto, tu
      progreso se guarda en un almacén provisional de la aplicación.
    </p>
  {:else if tipoAlmacen === "local"}
    <p class="nota aviso">
      Tu progreso se guarda en este navegador. En la aplicación de escritorio va
      a una base de datos en tu equipo.
    </p>
  {/if}

  <div class="acciones">
    <div class="copia">
      <button
        type="button"
        onclick={descargarCopia}
        disabled={sesiones.length === 0 || importando}
        aria-label="Exportar copia de seguridad del progreso en un fichero JSON"
      >
        Exportar copia de seguridad
      </button>

      <button
        type="button"
        class="importar"
        disabled={importando}
        onclick={() => inputArchivo?.click()}
        aria-label="Importar copia de seguridad desde un fichero JSON"
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
        <span>Al importar la copia se sustituirá el progreso actual. ¿Quieres continuar?</span>
        <button type="button" disabled={importando} onclick={confirmarImportar}>Sí, importar</button>
        <button type="button" class="cancelar" disabled={importando} onclick={cancelarImportar}>Cancelar</button>
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
          <span role="alert">¿Seguro? Se borra todo el historial y no se puede deshacer.{#if leccionesPropias.some((l) => l.borradaEn === null)} Tus lecciones se conservan.{/if}</span>
          <button class="peligro" disabled={importando} onclick={borrarDeVerdad}>Sí, borrar</button>
          <button class="cancelar" disabled={importando} onclick={cancelarBorrado}>Cancelar</button>
        {:else}
          <button class="pedir" disabled={importando} onclick={pedirBorrado}>Borrar progreso</button>
        {/if}
      </div>
    {/if}
  </div>
</section>

<style>
  .progreso {
    display: grid;
    gap: var(--space-4);
    /* Sin esto, una tabla ancha estira la rejilla en vez de desplazarse en su caja. */
    min-width: 0;
    grid-template-columns: minmax(0, 1fr);
  }
  .empezar { justify-self: start; }
  .vacio { margin: 0; color: var(--fg-muted); }

  .global { display: flex; flex-wrap: wrap; gap: var(--space-6); margin: 0; }
  .global div { display: flex; flex-direction: column; }
  .global dt { font-size: var(--text-sm); color: var(--fg-muted); }
  .global dd { margin: 0; font-size: var(--text-xl); font-variant-numeric: tabular-nums; }
  .global small { font-size: var(--text-sm); color: var(--fg-muted); }

  .tabla { overflow-x: auto; }
  /* Se puede enfocar para desplazarla con las flechas, y eso tiene que verse. */
  .tabla:focus-visible { outline-offset: -3px; }
  table { border-collapse: collapse; width: 100%; font-variant-numeric: tabular-nums; }
  caption { text-align: left; }
  th, td {
    text-align: left;
    padding: var(--space-2) var(--space-3);
    border-bottom: 1px solid var(--border);
  }
  /* Las cifras no se parten: «22 ppm · 96%» en dos líneas cuesta más de leer. */
  td { white-space: nowrap; }
  /* Con la letra grande no caben ni así; mejor partidas que desplazar de lado. */
  :global(.compacta) td { white-space: normal; }
  :global(.compacta) th, :global(.compacta) td { padding: var(--space-1) var(--space-2); }
  thead th { font-size: var(--text-sm); color: var(--fg-muted); font-weight: 600; }
  tbody th { font-weight: 500; }
  /* Las lecciones sin hacer se distinguen también por el guion de cada celda,
     no solo por el atenuado. */
  .sin-hacer { color: var(--fg-muted); }
  /* Y las retiradas por su etiqueta, no por el borde: la línea más gruesa solo
     separa el bloque del temario de ahora, no una fila de la siguiente. */
  .retirada { border-top: 2px solid var(--border); }
  .retirada + .retirada { border-top: 0; }
  /* Debajo del nombre: en línea se pegaban los dos, «Fila de reposoSuperada». */
  tbody th small {
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
  /* Vacía compensa el `gap`; con `display: none` dejaría de anunciar. */
  .estado-refuerzo:empty { margin-bottom: calc(-1 * var(--space-2)); }
  .seccion-bloque h3 {
    font-size: var(--text-base);
    margin: 0;
  }
  .cab-bloque {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: var(--space-2);
    flex-wrap: wrap;
  }
  .rejilla-teclas {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(calc(5rem * var(--ui-scale)), 1fr));
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
    font-size: var(--text-base);
  }
  .tecla-pct {
    font-size: var(--text-xs);
    color: var(--fg-muted);
  }
  .tecla-card.tecla-floja {
    border: 3px double var(--pending);
    background: var(--pending-bg);
  }
  .badge-floja {
    font-size: var(--text-xs);
    color: var(--pending);
    font-weight: bold;
  }
</style>
