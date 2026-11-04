<script lang="ts">
  /** Contenido del panel de ajustes. Quien lo monta decide qué hacer con cada cambio. */
  import { LAYOUTS } from '../keyboard/layouts';
  import type { Preferencias } from '../preferencias';
  import type { Actualizador, EstadoActualizacion } from '../actualizacion';

  interface Props {
    prefs: Preferencias;
    onCambiar: (cambios: Partial<Preferencias>) => void;
    layoutId: string;
    /** Teclas que ya no muestran su letra. */
    aprendidas: number;
    gestorDelSistema: 'deb' | 'rpm' | null;
    actualizador: Actualizador | null;
    estadoAct: EstadoActualizacion;
  }

  let { prefs, onCambiar, layoutId, aprendidas, gestorDelSistema, actualizador, estadoAct }: Props = $props();

  const TEMAS = [['auto', 'Sistema'], ['claro', 'Claro'], ['oscuro', 'Oscuro']] as const;
  const pct = $derived(`${Math.round(prefs.escala * 100)}%`);
</script>

<div class="field">
  <label for="scale">Tamaño del texto: {pct}</label>
  <input id="scale" type="range" min="1" max="2" step="0.1"
         value={prefs.escala}
         aria-valuetext={pct}
         oninput={(e) => onCambiar({ escala: +e.currentTarget.value })} />
</div>

<div class="field">
  <span id="theme-l">Tema</span>
  <div class="group" role="group" aria-labelledby="theme-l">
    {#each TEMAS as [v, l] (v)}
      <button aria-pressed={prefs.tema === v} onclick={() => onCambiar({ tema: v })}>{l}</button>
    {/each}
  </div>
</div>

<div class="field">
  <span id="tono-l">Cómo te habla</span>
  <div class="group" role="group" aria-labelledby="tono-l">
    <button aria-pressed={prefs.tono === 'juego'} onclick={() => onCambiar({ tono: 'juego' })}>
      Con celebración
    </button>
    <button aria-pressed={prefs.tono !== 'juego'} onclick={() => onCambiar({ tono: 'sobrio' })}>
      Tranquila
    </button>
  </div>
  <p class="note">Cambia los colores y los mensajes. No cambia el tamaño ni las lecciones.</p>
</div>

<div class="field">
  <span id="motion-l">Animaciones</span>
  <div class="group" role="group" aria-labelledby="motion-l">
    <button aria-pressed={prefs.movimiento === 'auto'} onclick={() => onCambiar({ movimiento: 'auto' })}>Normales</button>
    <button aria-pressed={prefs.movimiento === 'reducido'} onclick={() => onCambiar({ movimiento: 'reducido' })}>Reducidas</button>
  </div>
</div>

<div class="field">
  <span id="font-l">Tipografía</span>
  <div class="group" role="group" aria-labelledby="font-l">
    <button aria-pressed={prefs.fuente === 'normal'} onclick={() => onCambiar({ fuente: 'normal' })}>Normal</button>
    <button aria-pressed={prefs.fuente === 'dislexia'} onclick={() => onCambiar({ fuente: 'dislexia' })}>Para dislexia</button>
  </div>
</div>

<div class="field">
  <span id="ayuda-l">Letras del teclado en pantalla</span>
  <div class="group" role="group" aria-labelledby="ayuda-l">
    <button aria-pressed={prefs.ayudaTeclado === 'auto'} onclick={() => onCambiar({ ayudaTeclado: 'auto' })}>Se van quitando</button>
    <button aria-pressed={prefs.ayudaTeclado === 'siempre'} onclick={() => onCambiar({ ayudaTeclado: 'siempre' })}>Siempre visibles</button>
  </div>
  <p class="note">
    Las teclas que ya dominas dejan de mostrar su letra, para que dejes de
    mirar el teclado. {#if aprendidas > 0}Llevas {aprendidas}
    {aprendidas === 1 ? 'tecla aprendida' : 'teclas aprendidas'}.{/if}
  </p>
</div>

<div class="field">
  <label for="layout">Distribución del teclado</label>
  <select
    id="layout"
    value={layoutId}
    onchange={(e) => onCambiar({ layout: e.currentTarget.value })}
  >
    {#each LAYOUTS as l (l.id)}<option value={l.id}>{l.name}</option>{/each}
  </select>
  <p class="note">
    Elige la que coincida con tu teclado. LibreType no puede averiguarla por
    su cuenta: solo algunos sistemas permiten preguntarlo.
  </p>
</div>

{#if gestorDelSistema}
  <div class="field">
    <span id="act-l">Actualizaciones</span>
    <p class="note">
      LibreType se instaló con
      {gestorDelSistema === 'deb' ? 'apt' : 'dnf'}, así que las
      actualizaciones llegan con las del resto del sistema. La
      aplicación no las descarga por su cuenta ni consulta nada por
      internet.
    </p>
  </div>
{:else if actualizador}
  <div class="field">
    <span id="act-l">Actualizaciones</span>
    <div class="group" role="group" aria-labelledby="act-l">
      <button aria-pressed={prefs.buscarActualizaciones} onclick={() => onCambiar({ buscarActualizaciones: true })}>
        Avisarme
      </button>
      <button aria-pressed={!prefs.buscarActualizaciones} onclick={() => onCambiar({ buscarActualizaciones: false })}>
        No buscar
      </button>
    </div>
    <p class="note">
      Es lo único que LibreType consulta por internet: un fichero público
      en GitHub con el número de la última versión. No se envía nada de
      tu progreso ni de quién eres. Nunca se instala sola.
    </p>
    <div class="act-manual">
      <button
        onclick={() => void actualizador?.comprobar(true)}
        disabled={estadoAct.fase === 'buscando' || estadoAct.fase === 'descargando'}
      >
        Buscar ahora
      </button>
      <!-- Aquí sí se cuentan todas las fases: alguien acaba de preguntar. -->
      <p class="note" role="status">
        {#if estadoAct.fase === 'buscando'}Buscando…
        {:else if estadoAct.fase === 'al-dia'}Estás en la última versión, la {estadoAct.version}.
        {:else if estadoAct.fase === 'disponible'}Hay una versión nueva, la {estadoAct.version}.
        {:else if estadoAct.fase === 'descargando'}Descargando{estadoAct.pct >= 0 ? ` ${estadoAct.pct}%` : '…'}
        {:else if estadoAct.fase === 'lista'}La {estadoAct.version} está lista. Se aplica al reiniciar.
        {:else if estadoAct.fase === 'error'}No se ha podido comprobar. {estadoAct.mensaje}
        {/if}
      </p>
    </div>
  </div>
{/if}

<style>
  .field { display: grid; gap: var(--space-2); align-content: start; }
  .group { display: flex; gap: var(--space-2); flex-wrap: wrap; }
  /* El estado va en `aria-pressed` y en el color, y también en la marca: quien no
     distinga el relleno ve cuál está elegida. */
  .group button[aria-pressed='true'] {
    background: var(--accent); color: var(--accent-fg); border-color: var(--accent);
  }
  .group button[aria-pressed='true']::before { content: '✓ '; }
  .note { margin: 0; font-size: var(--text-sm); color: var(--fg-muted); }
  .act-manual { display: flex; align-items: center; gap: var(--space-3); flex-wrap: wrap; }
  .act-manual .note { margin: 0; }
  #layout { width: 100%; }
  span[id] { font-weight: 600; }
  label { font-weight: 600; }
</style>
