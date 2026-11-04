<script lang="ts">
  /**
   * Contenido del panel «Tus lecciones»: crear, editar, duplicar, borrar,
   * practicar, exportar e importar. Vive en un panel superpuesto, así que abrirlo
   * no mueve el teclado. Habla directamente con el almacén y le cuenta a `App` lo
   * que cambia, para que `App` no tenga que saber nada de esto.
   */
  import { onMount, tick } from 'svelte';
  import { guardarFichero } from '../ficheros';
  import type { Layout } from '../keyboard/layouts';
  import {
    activas, avisosDeImportacion, crearLeccion, duplicarLeccion, editarLeccion, fusionarImportadas, lapidaDe, LIMITES,
    nombreFichero, parsearExportacion, problemasDeTexto, serializarExportacion, validarBorrador,
    type Borrador, type ErrorCampo, type LeccionPropia,
  } from '../lecciones/personalizadas';
  import type { Almacen } from '../storage/almacen';
  import type { ResumenLeccion } from '../storage/progreso';

  interface Props {
    almacen: Almacen | null;
    /** Todas, lápidas incluidas. */
    lecciones: readonly LeccionPropia[];
    layout: Layout;
    porLeccion: ReadonlyMap<string, ResumenLeccion>;
    /** Abre directamente el formulario con este contenido. */
    borradorInicial?: Partial<Borrador> | null;
    onCambio: (lista: LeccionPropia[]) => void;
    onBorrada?: (id: string) => void;
    onPracticar: (id: string) => void;
    /** Cierra el panel de verdad, cuando la persona ya ha decidido qué hacer con lo escrito. */
    onCerrar?: () => void;
  }

  let {
    almacen, lecciones, layout, porLeccion, borradorInicial = null,
    onCambio, onBorrada, onPracticar, onCerrar,
  }: Props = $props();

  const VACIO: Borrador = { titulo: '', descripcion: '', texto: '' };

  // Solo el valor con el que se abre: después el formulario es de quien escribe.
  // svelte-ignore state_referenced_locally
  let modo = $state<'lista' | 'nueva' | 'editar'>(borradorInicial ? 'nueva' : 'lista');
  // svelte-ignore state_referenced_locally
  let form = $state<Borrador>({ ...VACIO, ...borradorInicial });
  let editando = $state<LeccionPropia | null>(null);
  /** Un fallo al guardar: no sale de validar, así que no se recalcula al escribir. */
  let errorAlmacen = $state<ErrorCampo | null>(null);
  /** Los campos por los que ya ha pasado: no se regaña a quien aún no ha escrito. */
  let tocados = $state<ReadonlySet<keyof Borrador>>(new Set());
  let intentoEnviar = $state(false);
  /** Ha pedido cerrar con cambios sin guardar. */
  let avisoCierre = $state(false);
  let raiz = $state<HTMLElement | null>(null);
  /** Lo que había al abrir el formulario, para saber si hay algo que perder. */
  let formInicial = $state<Borrador>({ ...VACIO });
  let confirmarBorrado = $state<string | null>(null);
  let aviso = $state<{ tipo: 'ok' | 'problema'; textos: string[] } | null>(null);
  let inputFichero = $state<HTMLInputElement | null>(null);
  let campoNombre = $state<HTMLInputElement | null>(null);

  // El diálogo lleva el foco a su primer control al abrirse; si venimos a escribir,
  // el primer control útil es el nombre.
  onMount(async () => {
    if (modo === 'lista') return;
    await tick();
    campoNombre?.focus();
  });

  const lista = $derived(activas(lecciones));
  const sinSitio = $derived(lista.length >= LIMITES.lecciones);
  /**
   * Validación en vivo, pero amable: a quien está escribiendo no se le dice que le
   * falta algo hasta que sale del campo o intenta guardar. Lo que ya está mal y no
   * se arregla escribiendo más (una letra que no existe, pasarse del límite) se
   * dice en cuanto ocurre.
   */
  const validacion = $derived(validarBorrador(form, layout));
  const pegasEnVivo = $derived(problemasDeTexto(form.texto, layout));
  function erroresDe(campo: keyof Borrador): ErrorCampo[] {
    const todos = validacion.ok ? [] : validacion.errores.filter((e) => e.campo === campo);
    const propio = errorAlmacen?.campo === campo ? [errorAlmacen] : [];
    if (intentoEnviar || tocados.has(campo)) return [...todos, ...propio];
    const excedido = (campo === 'titulo' && contar(form.titulo) > LIMITES.titulo)
      || (campo === 'descripcion' && contar(form.descripcion) > LIMITES.descripcion)
      || (campo === 'texto' && contar(form.texto) > LIMITES.textoMax);
    if (excedido) return [...todos, ...propio];
    const visibles = campo === 'texto' ? todos.filter((e) => pegasEnVivo.includes(e.mensaje)) : [];
    return [...visibles, ...propio];
  }
  const tocar = (campo: keyof Borrador) => { tocados = new Set([...tocados, campo]); };
  const hayCambios = $derived(
    modo !== 'lista' && (form.titulo !== formInicial.titulo
      || form.descripcion !== formInicial.descripcion
      || form.texto !== formInicial.texto),
  );
  const ahora = () => new Date().toISOString();
  const contar = (s: string) => [...s].length;

  /**
   * Devuelve si el panel se puede cerrar ya. Con cambios sin guardar pregunta antes:
   * un Escape no puede tirar un texto largo que la persona acaba de pegar.
   */
  export function intentarCerrar(): boolean {
    if (!hayCambios) return true;
    avisoCierre = true;
    void enfocar('.aviso-cierre .seguir');
    return false;
  }

  /**
   * Cuando el botón pulsado desaparece hay que decir adónde va el foco: si no, se va
   * al documento y quien va con teclado vuelve al principio del panel.
   */
  async function enfocar(selector: string): Promise<void> {
    await tick();
    raiz?.querySelector<HTMLElement>(selector)?.focus();
  }

  function decir(tipo: 'ok' | 'problema', ...textos: string[]): void {
    aviso = { tipo, textos };
  }

  async function abrirFormulario(l: LeccionPropia | null): Promise<void> {
    editando = l;
    form = l ? { titulo: l.titulo, descripcion: l.descripcion, texto: l.texto } : { ...VACIO };
    formInicial = { ...form };
    reiniciarValidacion();
    aviso = null;
    confirmarBorrado = null;
    modo = l ? 'editar' : 'nueva';
    await tick();
    campoNombre?.focus();
  }

  function reiniciarValidacion(): void {
    errorAlmacen = null;
    tocados = new Set();
    intentoEnviar = false;
    avisoCierre = false;
  }

  function volverALista(): void {
    const venia = editando;
    modo = 'lista';
    reiniciarValidacion();
    editando = null;
    void enfocar(venia ? `[data-editar="${venia.id}"]` : '.nueva');
  }

  function pedirBorrado(id: string): void {
    confirmarBorrado = id;
    void enfocar('.confirmar .cancelar');
  }

  function cancelarBorrado(id: string): void {
    confirmarBorrado = null;
    void enfocar(`[data-borrar="${id}"]`);
  }

  /** Sustituye en la lista completa, que incluye las lápidas. */
  function conCambios(cambiadas: readonly LeccionPropia[]): LeccionPropia[] {
    const ids = new Set(cambiadas.map((l) => l.id));
    return [...lecciones.filter((l) => !ids.has(l.id)), ...cambiadas];
  }

  async function guardar(e: Event): Promise<void> {
    e.preventDefault();
    errorAlmacen = null;
    intentoEnviar = true;
    const v = validacion;
    if (!v.ok) {
      // El panel se desplaza: el aviso puede quedar fuera de la vista y el foco lo trae.
      await tick();
      document.getElementById(`propia-${v.errores[0].campo}`)?.focus();
      return;
    }
    // «Guardar como lección» llega aquí sin pasar por el botón que se desactiva.
    if (!editando && sinSitio) {
      errorAlmacen = {
        campo: 'texto',
        mensaje: `Ya tienes ${lista.length} lecciones, que es el máximo. Para guardar esta, borra antes alguna; copia tu texto si no quieres perderlo.`,
      };
      return;
    }
    const leccion = editando
      ? editarLeccion(editando, v.limpio, ahora())
      : crearLeccion(v.limpio, ahora());
    try {
      await almacen?.guardarLeccion(leccion);
    } catch {
      errorAlmacen = { campo: 'texto', mensaje: 'No se ha podido guardar en este equipo. Tu texto sigue aquí, puedes volver a intentarlo.' };
      return;
    }
    onCambio(conCambios([leccion]));
    volverALista();
    decir('ok', `«${leccion.titulo}» está guardada.`);
  }

  /** Un doble clic haría dos copias, y luego habría que borrar una a mano. */
  let duplicando = $state(false);

  async function duplicar(l: LeccionPropia): Promise<void> {
    if (duplicando) return;
    duplicando = true;
    const copia = duplicarLeccion(l, ahora());
    try {
      await almacen?.guardarLeccion(copia);
      onCambio(conCambios([copia]));
      decir('ok', `Se ha creado «${copia.titulo}».`);
    } catch {
      decir('problema', 'No se ha podido guardar la copia en este equipo.');
    } finally {
      duplicando = false;
    }
  }

  async function borrar(l: LeccionPropia): Promise<void> {
    const momento = ahora();
    confirmarBorrado = null;
    try {
      await almacen?.borrarLeccion(l.id, momento);
      onCambio(conCambios([lapidaDe(l, momento)]));
      onBorrada?.(l.id);
      decir('ok', `«${l.titulo}» se ha borrado.`);
      void enfocar('.nueva');
    } catch {
      decir('problema', 'No se ha podido borrar en este equipo. Puedes volver a intentarlo.');
    }
  }

  async function exportar(de: readonly LeccionPropia[], titulo?: string): Promise<void> {
    const momento = ahora();
    try {
      const { ruta } = await guardarFichero(
        nombreFichero(momento, titulo),
        serializarExportacion(de, momento),
      );
      decir('ok', ruta ? `Guardado en ${ruta}` : 'Fichero preparado: lo encontrarás en tus descargas.');
    } catch (err) {
      decir('problema', err instanceof Error ? err.message : String(err));
    }
  }

  async function alElegirFichero(e: Event): Promise<void> {
    const input = e.currentTarget as HTMLInputElement;
    const fichero = input.files?.[0];
    if (!fichero) return;
    try {
      if (fichero.size > LIMITES.ficheroBytes) {
        decir('problema', 'Ese fichero es demasiado grande para ser una exportación de lecciones.');
        return;
      }
      await importar(await fichero.text());
    } catch (err) {
      decir('problema', err instanceof Error ? err.message : 'No se ha podido leer el fichero.');
    } finally {
      // Sin esto, elegir otra vez el mismo fichero no dispara `change`.
      input.value = '';
    }
  }

  async function importar(contenido: string): Promise<void> {
    const leido = parsearExportacion(contenido, layout);
    const fusion = fusionarImportadas(lecciones, leido.validas, ahora());
    const guardadas: LeccionPropia[] = [];
    try {
      for (const l of fusion.aGuardar) {
        await almacen?.guardarLeccion(l);
        guardadas.push(l);
      }
    } catch {
      throw new Error(`No se ha podido guardar todo en este equipo. Han entrado ${guardadas.length} de ${fusion.aGuardar.length}.`);
    } finally {
      // Si falla a medias, la lista tiene que enseñar lo que sí quedó guardado.
      onCambio(conCambios(guardadas));
    }

    const textos: string[] = [];
    const n = fusion.aGuardar.length;
    if (n === 1) textos.push('Se ha importado 1 lección.');
    else if (n > 1) textos.push(`Se han importado ${n} lecciones.`);
    if (fusion.repetidas > 0) {
      textos.push(fusion.repetidas === 1 ? '1 ya la tenías.' : `${fusion.repetidas} ya las tenías.`);
    }
    textos.push(...avisosDeImportacion(leido, fusion));
    if (textos.length === 0) textos.push('Ese fichero no trae ninguna lección.');
    decir(leido.rechazadas.length > 0 || fusion.sinSitio.length > 0 ? 'problema' : 'ok', ...textos);
  }
</script>

<div class="propias" bind:this={raiz}>
  <!-- Siempre en el DOM: un lector de pantalla solo anuncia cambios en una región
       que ya existía, no una que aparece de golpe. -->
  <div role="status" class="estado">
    {#if aviso}
      <div class="aviso" class:problema={aviso.tipo === 'problema'}>
        {#each aviso.textos as texto, i (i)}<p>{texto}</p>{/each}
      </div>
    {/if}
  </div>

  {#if modo === 'lista'}
    <p class="note">
      Lecciones con el texto que tú quieras. Son para practicar a tu ritmo: no
      desbloquean el temario ni hacen que el teclado retire letras.
    </p>

    <div class="fila">
      <button class="primario nueva" onclick={() => abrirFormulario(null)} disabled={sinSitio}>Nueva lección</button>
      <button onclick={() => inputFichero?.click()}>Importar…</button>
      <button onclick={() => exportar(lista)} disabled={lista.length === 0}>Exportar todas</button>
      <input
        bind:this={inputFichero}
        class="sr-only"
        type="file"
        accept=".json,application/json"
        tabindex="-1"
        aria-label="Fichero de lecciones para importar"
        onchange={alElegirFichero}
      />
    </div>
    {#if sinSitio}
      <p class="note">Tienes {lista.length} lecciones, que es el máximo. Para crear otra, borra alguna antes.</p>
    {/if}

    {#if lista.length === 0}
      <p class="vacio">Todavía no tienes ninguna. Puedes crear la primera o importar un fichero.</p>
    {:else}
      <ul class="lista">
        {#each lista as l (l.id)}
          {@const marca = porLeccion.get(l.id)}
          {@const pegas = problemasDeTexto(l.texto, layout)}
          <li>
            <h3>{l.titulo}</h3>
            <p class="note">
              {[
                `${contar(l.texto)} caracteres`,
                marca && `${marca.intentos} ${marca.intentos === 1 ? 'intento' : 'intentos'}`,
                marca && marca.mejorPpm > 0 && `mejor ${marca.mejorPpm} ppm`,
              ].filter(Boolean).join(' · ')}
            </p>
            {#if l.descripcion}<p class="note">{l.descripcion}</p>{/if}
            {#if pegas.length > 0}
              <p class="note">Con este teclado no se puede practicar todavía. {pegas[0]}</p>
            {/if}
            {#if confirmarBorrado === l.id}
              <div class="confirmar" role="group" aria-label={`Confirmar borrado de ${l.titulo}`}>
                <p>¿Borrar «{l.titulo}»? Su texto se perderá. Tus intentos seguirán en Progreso, con este nombre, hasta que borres el progreso.</p>
                <div class="fila">
                  <button class="peligro" onclick={() => borrar(l)}>Sí, borrar</button>
                  <button class="cancelar" onclick={() => cancelarBorrado(l.id)}>No, conservarla</button>
                </div>
              </div>
            {:else}
              <div class="fila">
                <button class="primario" disabled={pegas.length > 0} onclick={() => onPracticar(l.id)} aria-label={`Practicar ${l.titulo}`}>Practicar</button>
                <button data-editar={l.id} onclick={() => abrirFormulario(l)} aria-label={`Editar ${l.titulo}`}>Editar</button>
                <button onclick={() => duplicar(l)} disabled={sinSitio || duplicando} aria-label={`Duplicar ${l.titulo}`}>Duplicar</button>
                <button onclick={() => exportar([l], l.titulo)} aria-label={`Exportar ${l.titulo}`}>Exportar</button>
                <button class="al-final" data-borrar={l.id} onclick={() => pedirBorrado(l.id)} aria-label={`Borrar ${l.titulo}`}>Borrar</button>
              </div>
            {/if}
          </li>
        {/each}
      </ul>
    {/if}
  {:else}
    <form onsubmit={guardar} novalidate>
      <h3>{modo === 'editar' ? 'Editar lección' : 'Nueva lección'}</h3>

      {#if avisoCierre}
        <div class="aviso problema aviso-cierre" role="alert">
          <p>Tienes cambios sin guardar. ¿Qué hacemos con ellos?</p>
          <div class="fila">
            <button type="button" class="seguir" onclick={() => { avisoCierre = false; campoNombre?.focus(); }}>Seguir escribiendo</button>
            <button type="button" class="peligro" onclick={() => onCerrar?.()}>Cerrar sin guardar</button>
          </div>
        </div>
      {/if}

      <div class="campo">
        <label for="propia-titulo">Nombre</label>
        <input id="propia-titulo" bind:this={campoNombre} bind:value={form.titulo}
               onblur={() => tocar('titulo')}
               aria-invalid={erroresDe('titulo').length > 0}
               aria-describedby="propia-titulo-err" autocomplete="off" />
        <div id="propia-titulo-err" aria-live="polite">
          {#each erroresDe('titulo') as e (e.mensaje)}<p class="error">{e.mensaje}</p>{/each}
        </div>
      </div>

      <div class="campo">
        <label for="propia-descripcion">Qué se practica <small>(opcional)</small></label>
        <input id="propia-descripcion" bind:value={form.descripcion}
               onblur={() => tocar('descripcion')}
               aria-invalid={erroresDe('descripcion').length > 0}
               aria-describedby="propia-descripcion-err" autocomplete="off" />
        <div id="propia-descripcion-err" aria-live="polite">
          {#each erroresDe('descripcion') as e (e.mensaje)}<p class="error">{e.mensaje}</p>{/each}
        </div>
      </div>

      <div class="campo">
        <label for="propia-texto">Texto <small>({contar(form.texto)} de {LIMITES.textoMax} caracteres)</small></label>
        <textarea id="propia-texto" rows="6" bind:value={form.texto}
                  onblur={() => tocar('texto')}
                  aria-invalid={erroresDe('texto').length > 0}
                  aria-describedby="propia-texto-ayuda propia-texto-err"></textarea>
        <p class="note" id="propia-texto-ayuda">Hacen falta al menos {LIMITES.textoMin} caracteres. Los saltos de línea se practican como espacios, y las comillas y rayas de un procesador de textos se cambian por las del teclado.</p>
        <div id="propia-texto-err" aria-live="polite">
          {#each erroresDe('texto') as e (e.mensaje)}<p class="error">{e.mensaje}</p>{/each}
        </div>
      </div>

      <div class="fila">
        <button type="submit" class="primario">Guardar</button>
        <button type="button" onclick={volverALista}>Cancelar</button>
      </div>
    </form>
  {/if}
</div>

<style>
  .propias, form { display: grid; gap: var(--space-4); align-content: start; }
  /* Vacía compensa el `gap`. Con `display: none` saldría del árbol de accesibilidad
     y dejaría de anunciar. */
  .estado:empty { margin-bottom: calc(-1 * var(--space-4)); }
  .fila { display: flex; flex-wrap: wrap; gap: var(--space-2); }
  .note { margin: 0; font-size: var(--text-sm); color: var(--fg-muted); overflow-wrap: anywhere; }
  .vacio { margin: 0; color: var(--fg-muted); }
  /* Borrar, apartado de los demás: lejos de donde se pulsa sin mirar. */
  .al-final { margin-left: auto; }
  .lista { list-style: none; margin: 0; padding: 0; display: grid; gap: var(--space-3); }
  .lista li {
    display: grid; gap: var(--space-2);
    padding: var(--space-3);
    border: 1px solid var(--border);
    border-radius: var(--radius);
  }
  h3 { margin: 0; font-size: var(--text-base); overflow-wrap: anywhere; }
  .campo { display: grid; gap: var(--space-1); }
  .campo label { font-weight: 600; }
  .campo label small { font-weight: 400; color: var(--fg-muted); }
  input:not([type='file']), textarea { width: 100%; }
  textarea { font-family: var(--font-drill); resize: vertical; }
  .error { margin: 0; font-size: var(--text-sm); color: var(--error); overflow-wrap: anywhere; }
  .aviso {
    display: grid; gap: var(--space-1);
    padding: var(--space-3);
    border: 1px solid var(--ok);
    border-radius: var(--radius);
    background: var(--ok-bg);
    color: var(--fg);
    overflow-wrap: anywhere;
  }
  .aviso p { margin: 0; }
  .confirmar p { margin: 0; overflow-wrap: anywhere; }
  /* Se distingue por lo que dice, no solo por el color. */
  .aviso.problema { border-color: var(--pending); background: var(--pending-bg); }
  .confirmar { display: grid; gap: var(--space-2); }
</style>
