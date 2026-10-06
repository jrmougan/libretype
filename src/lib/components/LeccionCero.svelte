<script lang="ts">
  /**
   * Lección cero: dónde van las manos.
   *
   * Antes existía este agujero: la aplicación abría directamente en un
   * ejercicio. Quien nunca ha tecleado al tacto se perdía ahí mismo, porque
   * nadie le había dicho que los dedos van sobre `asdf` y `jklñ` ni que la F y
   * la J llevan un relieve para encontrar la posición sin mirar.
   *
   * Sin cronómetro y sin puntuación a propósito: aquí no se mide nada. Y con
   * texto explicativo generoso, porque al contrario que el tópico del
   * onboarding, las personas mayores sí leen las instrucciones.
   */
  import { onMount, tick } from 'svelte';
  import Keyboard from './Keyboard.svelte';
  import { ES_ISO, FINGER_NAMES, type Layout } from '../keyboard/layouts';
  import { PASOS } from '../leccion-cero';

  interface Props {
    layout?: Layout;
    onTerminar?: () => void;
  }

  let { layout = ES_ISO, onTerminar }: Props = $props();

  let i = $state(0);
  let campo = $state<HTMLTextAreaElement | null>(null);
  let pulsadas = $state<Set<string>>(new Set());
  let hechas = $state<Set<string>>(new Set());
  let aviso = $state('');

  const paso = $derived(PASOS[i]);
  const pendientes = $derived(
    (paso.pide ?? []).filter((p) => !hechas.has(p.code)),
  );
  const listo = $derived(pendientes.length === 0);
  const ultimo = $derived(i === PASOS.length - 1);

  function alPulsar(ev: KeyboardEvent): void {
    // Solo el canal físico: aquí no se escribe texto, se comprueba posición.
    if (!paso.pide) return;
    if (ev.code === 'Tab') return; // se deja pasar para poder navegar
    ev.preventDefault();

    pulsadas = new Set([...pulsadas, ev.code]);
    const esperada = paso.pide.find((p) => p.code === ev.code);
    if (esperada && !hechas.has(ev.code)) {
      hechas = new Set([...hechas, ev.code]);
      aviso = `Bien, esa es la ${esperada.comoSeLlama}.`;
    } else if (!esperada) {
      const q = paso.pide.map((p) => p.comoSeLlama).join(' y la ');
      aviso = `Esa no es. Busca la ${q} con el relieve, sin prisa.`;
    }
  }

  function soltar(ev: KeyboardEvent): void {
    const s = new Set(pulsadas);
    s.delete(ev.code);
    pulsadas = s;
  }

  function alPerderFoco(): void {
    pulsadas = new Set();
  }

  onMount(() => {
    window.addEventListener('blur', alPerderFoco);
    return () => window.removeEventListener('blur', alPerderFoco);
  });

  async function ir(n: number): Promise<void> {
    i = Math.max(0, Math.min(PASOS.length - 1, n));
    hechas = new Set();
    pulsadas = new Set();
    aviso = '';

    // Hay que esperar a que el paso nuevo esté en el DOM: el campo se renderiza
    // condicionalmente y antes de esto no existe. Sin el foco automático habría
    // que adivinar que hay que hacer clic en el recuadro, que es justo la
    // fricción que esta pantalla viene a quitar.
    if (PASOS[i].pide) {
      await tick();
      campo?.focus();
    }
  }
</script>

<section class="cero" aria-labelledby="cero-tit">
  <header class="cab">
    <p class="etapa">Antes de empezar · paso {i + 1} de {PASOS.length}</p>
    <h2 id="cero-tit">{paso.titulo}</h2>
  </header>

  <!-- A la izquierda se lee; a la derecha, si el paso pide algo, se hace. Los
       pasos que solo explican se quedan con todo el ancho. -->
  <div class="contenido" class:con-accion={!!paso.pide}>
    <div class="cuerpo">
      {#each paso.cuerpo as parrafo (parrafo)}
        <p>{parrafo}</p>
      {/each}
    </div>

    {#if paso.pide}
      <!-- Mismo patrón que Drill: un campo real, enfocable, dentro de una
           etiqueta. Al hacer clic en cualquier parte del recuadro se enfoca solo,
           sin JavaScript, y el lector de pantalla lo anuncia como un control. No
           hay manejador global de teclado, que es lo que este proyecto evita. -->
      <label class="prueba" class:completa={listo}>
        <textarea
          class="captura"
          bind:this={campo}
          readonly
          aria-label="Zona de prueba: pulsa las teclas que se te indiquen"
          onkeydown={alPulsar}
          onkeyup={soltar}
          onblur={alPerderFoco}
        ></textarea>

        {#if listo}
          <p class="ok"><span aria-hidden="true">✓ </span>Eso es. Los dedos ya saben dónde están.</p>
        {:else}
          <p class="pide">Pulsa</p>
          <!-- Cada tecla, en una teja del color de su dedo, como en el teclado
               de abajo. El nombre del dedo va también escrito: el color solo
               refuerza. -->
          <ul class="tejas">
            {#each pendientes as p, n (p.code)}
              <li>
                {#if n > 0}<span class="luego">y luego</span>{/if}
                <strong
                  class="teja"
                  class:larga={p.comoSeLlama.length > 2}
                  style:--dedo="var(--finger-{p.dedo})"
                >{p.comoSeLlama}</strong>
                <span class="dedo">({FINGER_NAMES[p.dedo]})</span>
              </li>
            {/each}
          </ul>
          <p class="sugerencia">Si no responde, haz clic dentro de este recuadro.</p>
        {/if}
        <p class="sr-only" aria-live="polite">{aviso}</p>
        {#if aviso}<p class="eco" aria-hidden="true">{aviso}</p>{/if}
      </label>
    {/if}
  </div>

  <div class="teclado">
    <Keyboard
      {layout}
      held={pulsadas}
      variante="reposo"
      guia={new Set(paso.guia)}
      objetivos={paso.guia.length <= 2 ? new Set(paso.guia) : undefined}
      etiqueta={paso.guia.length
        ? `Teclado en pantalla con la posición de reposo señalada: ${paso.guia.length} teclas.`
        : 'Teclado en pantalla.'}
    />
  </div>

  <nav class="pasos" aria-label="Pasos de la lección cero">
    <button class="secundario" onclick={() => ir(i - 1)} disabled={i === 0}>Anterior</button>

    <!-- Siempre en el mismo sitio, aparezca o no: así el resto de la
         navegación no salta de un paso a otro. -->
    <p class="saltar">
      {#if paso.pide && !listo}
        <button class="enlace" onclick={() => ir(i + 1)}>
          Saltar esta comprobación
        </button>
        <span class="por-si">— por si alguna tecla no responde.</span>
      {/if}
    </p>

    <!-- Los puntos no dependen del color: los hechos van rellenos, el actual es
         una píldora más ancha y los pendientes son un aro. Y el texto lo dice. -->
    <div class="progreso-pasos" aria-hidden="true">
      <ol class="puntos">
        {#each PASOS as p, n (p.titulo)}
          <li class:hecho={n < i} class:actual={n === i}></li>
        {/each}
      </ol>
      <span class="cuenta">paso {i + 1} de {PASOS.length}</span>
    </div>

    {#if ultimo}
      <button class="primario" onclick={() => onTerminar?.()}>
        Ir a la primera lección
      </button>
    {:else}
      <button class="primario" onclick={() => ir(i + 1)}>Siguiente</button>
    {/if}
  </nav>
</section>

<style>
  /* Arriba se lee y se prueba, debajo está el teclado y al pie se navega. El
     teclado se lleva el espacio que sobra, pero no baja del mismo suelo que en
     las lecciones; si el texto no cabe, se desplaza dentro de su caja: todo
     tiene que verse a la vez, sin desplazar la pantalla. */
  .cero {
    display: grid;
    gap: var(--space-4);
    grid-template-areas: 'cab' 'contenido' 'teclado' 'pasos';
    /* El contenido mide lo que su texto, con tope: con minmax(0, …) la rejilla
       lo aplastaba a nada al 200% antes de dejar que .escena se desplazara, y
       las instrucciones desaparecían sin rastro. */
    grid-template-rows: auto auto minmax(min(34vh, 230px), 1fr) auto;
    min-height: 0;
  }
  .cab { grid-area: cab; }
  .contenido {
    grid-area: contenido;
    display: grid;
    gap: var(--space-4) var(--space-6);
    grid-template-columns: minmax(0, 1fr);
    align-items: start;
    /* Un contenedor con desplazamiento tiene mínimo automático 0: sin este
       suelo, la fila `auto` también se encogía a nada. Al 100% queda por debajo
       de lo que ya mide el texto, así que no añade hueco. */
    min-height: min(40vh, 10rem);
    max-height: 40vh;
    overflow-y: auto;
    /* Hueco para el anillo de foco del recuadro de acción, que el
       desplazamiento recortaría. */
    padding: var(--space-1);
  }
  .contenido.con-accion { grid-template-columns: minmax(0, 1.25fr) minmax(0, 1fr); }
  /* La fila 1fr le da altura definida, que es lo que permite al SVG escalarse
     para llenarla en vez de quedarse a tamaño intrínseco. */
  .teclado {
    grid-area: teclado;
    min-height: 0;
    display: grid;
    grid-template-rows: minmax(0, 1fr);
    align-items: center;
  }
  .pasos { grid-area: pasos; }

  @media (max-width: 900px) {
    .contenido.con-accion { grid-template-columns: minmax(0, 1fr); }
  }

  .etapa {
    margin: 0 0 var(--space-1);
    font-size: var(--text-sm);
    font-weight: 700;
    color: var(--accent-ink);
    font-variant-numeric: tabular-nums;
  }
  h2 {
    margin: 0;
    font-size: calc(1.875rem * var(--ui-scale));
    line-height: 1.2;
  }

  /* Texto generoso y ancho de lectura cómodo: esta pantalla se lee, no se
     escanea. */
  .cuerpo { max-width: 68ch; display: grid; gap: var(--space-2); }
  .cuerpo p {
    margin: 0;
    font-size: calc(1.0625rem * var(--ui-scale));
    line-height: 1.6;
  }

  /* El campo está fuera de pantalla pero es enfocable de verdad: es lo que
     recibe las pulsaciones. */
  .captura { position: absolute; width: 1px; height: 1px; opacity: 0; }

  /* El recuadro de acción: discontinuo mientras espera, continuo y en verde
     al completarse. El estado no depende solo del color: cambia el borde y el
     texto. */
  .prueba {
    position: relative;
    display: grid;
    gap: var(--space-3);
    align-content: start;
    cursor: text;
    border: 2px dashed var(--accent);
    border-radius: var(--radius-card);
    padding: var(--space-4);
    background: var(--accent-soft);
    min-height: var(--target-min);
  }
  .prueba:has(.captura:focus-visible) {
    border-style: solid;
    outline: 3px solid var(--accent);
    outline-offset: 2px;
  }
  .prueba.completa { border-style: solid; border-color: var(--ok); background: var(--ok-bg); }

  .pide { margin: 0; font-size: var(--text-lg); font-weight: 700; }
  .tejas {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--space-3);
  }
  .tejas li { display: flex; align-items: center; gap: var(--space-2); flex-wrap: wrap; }
  .luego { font-size: var(--text-base); color: var(--fg-muted); }
  /* La teja repite la tecla del teclado: del color de su dedo y con la letra
     en el tono que contrasta con él. */
  .teja {
    display: inline-grid;
    place-items: center;
    min-width: calc(3.25rem * var(--ui-scale));
    min-height: calc(3.25rem * var(--ui-scale));
    padding: 0 var(--space-2);
    font-family: var(--font-drill);
    font-size: calc(1.625rem * var(--ui-scale));
    font-weight: 700;
    background: var(--dedo);
    color: var(--on-finger);
    border-radius: var(--radius);
  }
  /* «La barra espaciadora» no es una letra: va en la letra de la interfaz y
     más pequeña, para que la teja no ocupe medio recuadro. */
  .teja.larga {
    font-family: inherit;
    font-size: var(--text-base);
    padding: 0 var(--space-4);
  }
  .dedo { color: var(--fg-muted); font-size: var(--text-base); }
  .ok { margin: 0; font-size: var(--text-lg); color: var(--ok); font-weight: 700; }
  .sugerencia, .eco { margin: 0; font-size: var(--text-sm); color: var(--fg-muted); }

  /* --- Navegación ------------------------------------------------------ */
  .pasos {
    display: flex;
    align-items: center;
    gap: var(--space-3) var(--space-4);
    flex-wrap: wrap;
  }
  .pasos button { border-radius: var(--radius); }
  button:disabled { opacity: 0.45; cursor: default; }

  /* El enlace ocupa el hueco central: empuja los puntos y «Siguiente» a la
     derecha tanto si está como si no. */
  .saltar {
    flex: 1 1 auto;
    margin: 0;
    font-size: var(--text-sm);
    color: var(--fg-muted);
    display: flex;
    align-items: center;
    gap: var(--space-1);
    flex-wrap: wrap;
  }

  .progreso-pasos { display: flex; align-items: center; gap: var(--space-3); }
  .cuenta {
    font-size: var(--text-sm);
    color: var(--fg-muted);
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
  }
  .puntos {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    list-style: none;
    margin: 0;
    padding: 0;
  }
  .puntos li {
    width: calc(0.625rem * var(--ui-scale));
    height: calc(0.625rem * var(--ui-scale));
    border-radius: var(--radius-chip);
    border: 2px solid var(--border-strong);
    background: transparent;
  }
  .puntos li.hecho { background: var(--ok); border-color: var(--ok); }
  .puntos li.actual {
    width: calc(1.75rem * var(--ui-scale));
    background: var(--accent);
    border-color: var(--accent);
  }
</style>
