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
    /** Quien vuelve a repasar esto no va a la primera lección, sino a la suya. */
    textoTerminar?: string;
  }

  let { layout = ES_ISO, onTerminar, textoTerminar = 'Ir a la primera lección' }: Props = $props();

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
  <div class="texto">
  <!-- El paso cambia sin que se mueva el foco: al pulsar «Siguiente» sigue en ese
       botón, y sin esto un lector de pantalla no diría nada. -->
  <header aria-live="polite">
    <p class="etapa">Antes de empezar · paso {i + 1} de {PASOS.length}</p>
    <h2 id="cero-tit">{paso.titulo}</h2>
  </header>

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
        <p class="ok">Eso es. Los dedos ya saben dónde están.</p>
      {:else}
        <p class="pide">
          Pulsa
          {#each pendientes as p, n (p.code)}
            {n > 0 ? ' y luego ' : ''}<strong>{p.comoSeLlama}</strong>
            <span class="dedo">({FINGER_NAMES[p.dedo]})</span>
          {/each}
        </p>
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
      guia={new Set(paso.guia)}
      etiqueta={paso.guia.length
        ? `Teclado en pantalla con ${paso.guia.length === 1 ? 'una tecla señalada' : `${paso.guia.length} teclas señaladas`}.`
        : 'Teclado en pantalla.'}
    />
  </div>

  <nav class="pasos" aria-label="Pasos de «Antes de empezar»">
    <button onclick={() => ir(i - 1)} disabled={i === 0}>Anterior</button>

    <ol class="puntos" aria-hidden="true">
      {#each PASOS as p, n (p.titulo)}
        <li class:hecho={n < i} class:actual={n === i}></li>
      {/each}
    </ol>

    {#if ultimo}
      <button class="primario" onclick={() => onTerminar?.()}>
        {textoTerminar}
      </button>
    {:else}
      <button class="primario" onclick={() => ir(i + 1)}>Siguiente</button>
    {/if}
  </nav>

  {#if paso.pide && !listo}
    <p class="saltar">
      <button class="enlace" onclick={() => ir(i + 1)}>
        Saltar esta comprobación
      </button>
      — por si alguna tecla no responde.
    </p>
  {/if}
</section>

<style>
  /* En pantallas anchas, el texto a un lado y el teclado al otro: así cabe
     todo sin desplazarse, que es el punto. En estrechas se apila y el texto se
     desplaza dentro de su caja. */
  .cero {
    display: grid;
    gap: var(--space-3) var(--space-6);
    grid-template-areas: 'texto teclado' 'pasos pasos' 'saltar saltar';
    /* El límite aquí es el ancho, no el alto: la columna tiene que ser lo bastante
       ancha para que el teclado alcance su suelo a lo alto. El `min(100%, …)` es para
       una ventana estrecha, donde además esto ya va apilado. */
    grid-template-columns: minmax(0, 1fr)
      minmax(min(100%, calc(min(34vh, 230px) * var(--teclado-proporcion))), 1.1fr);
    grid-template-rows: minmax(0, 1fr) auto auto;
    min-height: 0;
  }
  .texto {
    grid-area: texto;
    display: grid;
    gap: var(--space-3);
    align-content: start;
    /* Sin esto, las filas se encogen hasta el mínimo de cada hijo en vez de dejar
       que se desplace la caja: la zona de prueba tiene un `min-height` y su texto se
       salía por debajo del recuadro. */
    grid-auto-rows: max-content;
    min-height: 0;
    overflow-y: auto;
    /* El contorno de foco de la zona de prueba sale de su caja; sin este margen lo
       recortaba el desplazamiento y solo se veía arriba y abajo. */
    padding: var(--space-1) var(--margen-foco);
    margin-inline: calc(-1 * var(--margen-foco));
  }
  /* La fila 1fr le da altura definida a la columna, que es lo que permite al
     SVG escalarse para llenarla en vez de quedarse a tamaño intrínseco. */
  .teclado {
    grid-area: teclado;
    min-height: 0;
    display: grid;
    grid-template-rows: minmax(0, 1fr);
    align-items: center;
  }
  .pasos { grid-area: pasos; }
  .saltar { grid-area: saltar; }

  /* Por debajo de esto, con el teclado en su suelo, al texto le quedaría una columna
     de unas cuarenta letras: mejor uno encima del otro. */
  @media (max-width: 1120px) {
    .cero {
      grid-template-areas: 'texto' 'teclado' 'pasos' 'saltar';
      grid-template-columns: minmax(0, 1fr);
      /* Aquí el texto se lleva lo que sobra, que se lee; el teclado, su suelo y algo más. */
      grid-template-rows: minmax(0, 2fr) minmax(min(34vh, 230px), 1fr) auto auto;
    }
  }
  /* Letra grande: en dos columnas el texto no cabe ni en una palabra por línea y el
     teclado queda diminuto. El teclado no baja de la mitad de su caja a lo ancho, y
     «Saltar» sube a la fila de los botones para no gastar otra. */
  :global(.app.compacta) .cero {
    grid-template-areas: 'texto' 'teclado' 'pasos' 'saltar';
    grid-template-columns: minmax(0, 1fr);
    grid-template-rows: minmax(0, 1fr) minmax(0, auto) auto auto;
    gap: var(--space-1);
  }
  :global(.app.compacta) .cero .teclado { height: min(33vw, 34vh); }
  :global(.app.compacta) .etapa { margin: 0; }
  :global(.app.compacta) .pasos button { padding-block: 0; }
  :global(.app.compacta) .saltar, :global(.app.compacta) .enlace { min-height: var(--target-min); }

  .etapa {
    margin: 0 0 var(--space-1);
    font-size: var(--text-sm);
    color: var(--fg-muted);
    font-variant-numeric: tabular-nums;
  }
  h2 { margin: 0; font-size: var(--text-xl); }

  /* Texto generoso y ancho de lectura cómodo: esta pantalla se lee, no se
     escanea. */
  .cuerpo { max-width: 68ch; display: grid; gap: var(--space-2); }
  .cuerpo p { margin: 0; font-size: var(--text-base); line-height: 1.55; }

  /* El campo está fuera de pantalla pero es enfocable de verdad: es lo que
     recibe las pulsaciones. */
  .captura { position: absolute; width: 1px; height: 1px; opacity: 0; }

  .prueba {
    position: relative;
    cursor: text;
    border: 2px dashed var(--border-strong);
    border-radius: var(--radius);
    padding: var(--space-4);
    background: var(--surface);
    display: grid;
    gap: var(--space-2);
    min-height: var(--target-min);
  }
  .prueba:has(.captura:focus-visible) {
    border-style: solid;
    outline: 3px solid var(--accent);
    outline-offset: 2px;
  }
  /* El estado no depende solo del color: cambia el borde y el texto. */
  .prueba.completa { border-style: solid; border-color: var(--ok); background: var(--ok-bg); }

  .pide { margin: 0; font-size: var(--text-lg); }
  .pide strong {
    font-family: var(--font-drill);
    background: var(--accent);
    color: var(--accent-fg);
    padding: 0 var(--space-2);
    border-radius: var(--radius-key);
  }
  .dedo { color: var(--fg-muted); font-size: var(--text-base); }
  .ok { margin: 0; font-size: var(--text-lg); color: var(--ok); font-weight: 600; }
  .sugerencia, .eco { margin: 0; font-size: var(--text-sm); color: var(--fg-muted); }

  /* Volver a un lado y seguir al otro, como en cualquier asistente. */
  .pasos { display: flex; align-items: center; justify-content: space-between; gap: var(--space-3); flex-wrap: wrap; }

  .puntos { display: flex; gap: var(--space-2); list-style: none; margin: 0; padding: 0; }
  .puntos li {
    width: var(--space-2); height: var(--space-2); border-radius: 50%;
    border: 1px solid var(--border-strong); background: transparent;
  }
  .puntos li.hecho { background: var(--border-strong); }
  .puntos li.actual { background: var(--accent); border-color: var(--accent); transform: scale(1.3); }

  .saltar {
    margin: 0;
    font-size: var(--text-sm);
    color: var(--fg-muted);
    display: flex;
    align-items: center;
    gap: var(--space-1);
    flex-wrap: wrap;
    min-height: var(--target-min);
  }
  .enlace {
    background: none;
    border: none;
    padding: 0 var(--space-1);
    min-height: var(--target-min);
    min-width: var(--target-min);
    display: inline-flex;
    align-items: center;
    color: var(--accent);
    text-decoration: underline;
    cursor: pointer;
    font-size: inherit;
  }
</style>
