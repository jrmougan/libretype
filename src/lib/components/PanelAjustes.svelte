<script lang="ts">
  /** Contenido del panel de ajustes. Quien lo monta decide qué hacer con cada cambio. */
  import TamanoTexto from './TamanoTexto.svelte';
  import { LAYOUTS } from '../keyboard/layouts';
  import { MINUTOS_PAUSA, type Preferencias } from '../preferencias';
  import { QUE_ES_PPM } from '../voz';
  import type { Actualizador, EstadoActualizacion } from '../actualizacion';

  interface Props {
    prefs: Preferencias;
    onCambiar: (cambios: Partial<Preferencias>) => void;
    layoutId: string;
    /** Teclas que ya no muestran su letra. */
    aprendidas: number;
    gestorDelSistema: 'deb' | 'rpm' | 'politica' | null;
    actualizador: Actualizador | null;
    estadoAct: EstadoActualizacion;
    /** Para que se oiga una muestra al encender el sonido o mover el volumen. */
    onProbarSonido?: (cual: 'acierto' | 'fin', volumen: number) => void;
  }

  let { prefs, onCambiar, layoutId, aprendidas, gestorDelSistema, actualizador, estadoAct, onProbarSonido }: Props = $props();

  const TEMAS = [['auto', 'Sistema'], ['claro', 'Claro'], ['oscuro', 'Oscuro']] as const;
  const LONGITUDES = [['corto', 'Cortos'], ['normal', 'Normales'], ['largo', 'Largos']] as const;
  const CONTRASTES = [['auto', 'Sistema'], ['normal', 'Normal'], ['alto', 'Alto']] as const;
</script>

<!-- Dos columnas al 100%; al crecer la letra, una. A la izquierda lo que se ve y
     se oye; a la derecha el teclado, la práctica y las actualizaciones. -->
<div class="ajustes">
  <div class="ajustes-col">
    <div class="field">
      <TamanoTexto escala={prefs.escala} conDeslizador onCambiar={(escala) => onCambiar({ escala })} />
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
      <span id="contraste-l">Contraste</span>
      <div class="group" role="group" aria-labelledby="contraste-l">
        {#each CONTRASTES as [v, l] (v)}
          <button aria-pressed={prefs.contraste === v} onclick={() => onCambiar({ contraste: v })}>{l}</button>
        {/each}
      </div>
      <p class="note">
        «Alto» pone negro sobre blanco (o al revés con el tema oscuro) y bordes
        marcados. En «Sistema» se activa solo si tu equipo pide más contraste.
      </p>
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
      <span id="metricas-l">Mientras practicas</span>
      <div class="group" role="group" aria-labelledby="metricas-l">
        <button aria-pressed={!prefs.ocultarMetricas} onclick={() => onCambiar({ ocultarMetricas: false })}>Ver velocidad y precisión</button>
        <button aria-pressed={prefs.ocultarMetricas} onclick={() => onCambiar({ ocultarMetricas: true })}>Ocultarlas</button>
      </div>
      <p class="note">
        Si ver los números a cada tecla te distrae o te agobia, puedes ocultarlos:
        al terminar se siguen enseñando. {QUE_ES_PPM}
      </p>
    </div>

    <div class="field">
      <span id="sonido-l">Sonido</span>
      <div class="group" role="group" aria-labelledby="sonido-l">
        <button aria-pressed={!prefs.sonido} onclick={() => onCambiar({ sonido: false })}>Sin sonido</button>
        <button aria-pressed={prefs.sonido}
                onclick={() => { onCambiar({ sonido: true }); onProbarSonido?.('fin', prefs.volumen); }}>
          Con sonido
        </button>
      </div>
      {#if prefs.sonido}
        <label for="volumen" class="eti-valor">Volumen: <span class="valor">{Math.round(prefs.volumen * 100)}%</span></label>
        <input id="volumen" type="range" min="0.1" max="1" step="0.1"
               value={prefs.volumen}
               aria-valuetext={`${Math.round(prefs.volumen * 100)}%`}
               oninput={(e) => onCambiar({ volumen: +e.currentTarget.value })}
               onchange={(e) => onProbarSonido?.('acierto', +e.currentTarget.value)} />
      {/if}
      <p class="note">
        Un toque suave al acertar, otro más grave al fallar y unas notas al
        terminar. Se genera en tu equipo: no se descarga nada.
      </p>
    </div>
  </div>

  <div class="ajustes-col">
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
      <span id="longitud-l">Longitud de los textos de práctica</span>
      <div class="group" role="group" aria-labelledby="longitud-l">
        {#each LONGITUDES as [v, l] (v)}
          <button aria-pressed={prefs.longitudTexto === v} onclick={() => onCambiar({ longitudTexto: v })}>{l}</button>
        {/each}
      </div>
      <p class="note">
        Cortos si cansa llegar al final; largos para coger ritmo. Vale para la
        práctica continua y para los textos nuevos de cada lección; la primera vez
        que abres una lección se usa siempre su texto original.
      </p>
    </div>

    <div class="field">
      <span id="pausa-l">Recordarme descansar</span>
      <div class="group" role="group" aria-labelledby="pausa-l">
        {#each MINUTOS_PAUSA as m (m)}
          <button aria-pressed={prefs.recordatorioPausa === m} onclick={() => onCambiar({ recordatorioPausa: m })}>
            {m === 0 ? 'No' : `Cada ${m} min`}
          </button>
        {/each}
      </div>
      <p class="note">Un aviso en una esquina, que no interrumpe ni se lleva el foco.</p>
    </div>

    <div class="field">
      <span id="temblor-l">Si a veces una tecla se repite sin querer</span>
      <div class="group" role="group" aria-labelledby="temblor-l">
        <button aria-pressed={!prefs.ignorarRepeticion} onclick={() => onCambiar({ ignorarRepeticion: false })}>Contar todo</button>
        <button aria-pressed={prefs.ignorarRepeticion} onclick={() => onCambiar({ ignorarRepeticion: true })}>Ignorar repeticiones muy rápidas</button>
      </div>
      <p class="note">
        Con temblor, el dedo puede rebotar y escribir dos veces la misma letra. Esto
        ignora la segunda si llega casi a la vez. Para algo más completo, el sistema
        tiene «teclas de rebote» (o «teclas lentas»): en Windows, en Configuración ›
        Accesibilidad › Teclado; en macOS, en Ajustes del Sistema › Accesibilidad ›
        Teclado; en GNOME, en Configuración › Accesibilidad › Escritura; en KDE, en
        Preferencias del sistema › Accesibilidad › Filtros de teclado.
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
          {#if gestorDelSistema === 'politica'}
            Las actualizaciones de este equipo las gestiona quien lo administra.
            La aplicación no las descarga por su cuenta ni consulta nada por
            internet.
          {:else}
            LibreType se instaló con
            {gestorDelSistema === 'deb' ? 'apt' : 'dnf'}, así que las
            actualizaciones llegan con las del resto del sistema. La
            aplicación no las descarga por su cuenta ni consulta nada por
            internet.
          {/if}
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
            class="enlace"
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
  </div>
</div>

<style>
  /* La base de cada columna escala con --ui-scale, así que es el propio tamaño
     de la letra el que decide cuándo dejan de caber dos. */
  .ajustes { display: flex; flex-wrap: wrap; gap: 0 var(--space-8); }
  .ajustes-col {
    flex: 1 1 calc(26rem * var(--ui-scale));
    min-width: 0;
    display: grid;
    align-content: start;
  }
  .field {
    display: grid; gap: var(--space-2); align-content: start;
    padding-block: var(--space-4);
    border-bottom: 1px solid var(--border);
  }
  .ajustes-col .field:last-child { border-bottom: 0; }
  .ajustes-col:first-child .field:first-child { padding-top: 0; }
  /* El grupo segmentado y el enlace-botón son globales (styles/base.css): la
     opción elegida lleva papel, contorno, negrita y «✓», nunca solo color. */
  .field .group { justify-self: start; max-width: 100%; }
  .note { margin: 0; font-size: var(--text-sm); color: var(--fg-muted); }
  .act-manual { display: flex; align-items: center; gap: var(--space-3); flex-wrap: wrap; }
  .act-manual .note { margin: 0; }
  #layout { width: 100%; }
  span[id] { font-weight: 700; }
  label { font-weight: 700; }
  .eti-valor .valor { color: var(--accent-ink); font-variant-numeric: tabular-nums; }
</style>
