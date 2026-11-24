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
        <p class="ok"><span aria-hidden="true">✓ </span>Eso es. Los dedos ya saben dónde están.</p>
      {:else}
        <!-- Cada tecla, en una teja del color de su dedo, como en el teclado de
             al lado. El nombre del dedo va también escrito: el color solo
             refuerza. Sigue siendo una frase: «Pulsa la F (índice) y luego…». -->
        <p class="pide">
          <span class="verbo">Pulsa</span>
          {#each pendientes as p, n (p.code)}
            {#if n > 0}{' '}{/if}<span class="pedida">
              {#if n > 0}<span class="luego">y luego</span>{/if}
              <strong
                class="teja"
                class:larga={p.comoSeLlama.length > 6}
                style:--dedo="var(--finger-{p.dedo})"
              >{p.comoSeLlama}</strong>
              <span class="dedo">({FINGER_NAMES[p.dedo]})</span>
            </span>
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
      variante="reposo"
      guia={new Set(paso.guia)}
      objetivos={paso.guia.length <= 2 ? new Set(paso.guia) : undefined}
      etiqueta={paso.guia.length
        ? `Teclado en pantalla con ${paso.guia.length === 1 ? 'una tecla señalada' : `${paso.guia.length} teclas señaladas`}.`
        : 'Teclado en pantalla.'}
    />
  </div>

  <nav class="pasos" aria-label="Pasos de «Antes de empezar»">
    <button onclick={() => ir(i - 1)} disabled={i === 0}>Anterior</button>

    <!-- Los puntos no dependen del color: los hechos van rellenos, el actual es
         una píldora más ancha y los pendientes son un aro. Y el texto lo dice;
         para el lector de pantalla ya lo dice la cabecera. -->
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
    font-weight: 700;
    color: var(--accent-ink);
    font-variant-numeric: tabular-nums;
  }
  h2 { margin: 0; font-size: var(--text-2xl); line-height: 1.2; }
  /* Con la letra grande el título no puede comerse la pantalla. */
  :global(.app.compacta) .cero h2 { font-size: var(--text-xl); }

  /* Texto generoso y ancho de lectura cómodo: esta pantalla se lee, no se
     escanea. */
  .cuerpo { max-width: 68ch; display: grid; gap: var(--space-2); }
  .cuerpo p { margin: 0; font-size: var(--text-base); line-height: 1.6; }

  /* El campo está fuera de pantalla pero es enfocable de verdad: es lo que
     recibe las pulsaciones. */
  .captura { position: absolute; width: 1px; height: 1px; opacity: 0; }

  /* El recuadro de acción: discontinuo mientras espera, continuo y en verde al
     completarse. */
  .prueba {
    position: relative;
    cursor: text;
    border: 2px dashed var(--accent);
    border-radius: var(--radius-card);
    padding: var(--space-4);
    background: var(--accent-soft);
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

  .pide {
    margin: 0;
    font-size: var(--text-lg);
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--space-2);
  }
  .verbo { font-weight: 700; }
  .luego { font-size: var(--text-base); }
  .pedida { display: inline-flex; align-items: center; gap: var(--space-2); flex-wrap: wrap; }
  /* La teja repite la tecla del teclado: del color de su dedo y con la letra en
     el tono que contrasta con él. */
  .teja {
    display: inline-grid;
    place-items: center;
    min-width: calc(3rem * var(--ui-scale));
    min-height: calc(3rem * var(--ui-scale));
    padding: 0 var(--space-2);
    font-family: var(--font-key);
    font-size: var(--text-cifra);
    font-weight: 700;
    background: var(--dedo);
    color: var(--on-finger);
    border-radius: var(--radius);
    box-shadow: 0 3px 0 var(--scrim), 0 3px 0 var(--dedo);
  }
  /* «La barra espaciadora» no es una letra: va en la letra de la interfaz y más
     pequeña, para que la teja no ocupe medio recuadro. */
  .teja.larga { font-family: inherit; font-size: var(--text-base); padding: 0 var(--space-4); }
  :global(.app.compacta) .teja { min-width: calc(1.75rem * var(--ui-scale)); min-height: calc(1.75rem * var(--ui-scale)); }
  /* Sobre el fondo de acento suave el texto secundario va en tinta plena. */
  .dedo { color: var(--fg); font-size: var(--text-base); }
  .ok { margin: 0; font-size: var(--text-lg); color: var(--ok); font-weight: 700; }
  .sugerencia, .eco { margin: 0; font-size: var(--text-sm); color: var(--fg); }
  @media (forced-colors: active) {
    .teja { border: 2px solid CanvasText; box-shadow: none; }
  }

  /* Volver a un lado y seguir al otro, como en cualquier asistente. */
  .pasos { display: flex; align-items: center; justify-content: space-between; gap: var(--space-3); flex-wrap: wrap; }

  .progreso-pasos { display: flex; align-items: center; gap: var(--space-3); }
  .cuenta {
    font-size: var(--text-sm);
    color: var(--fg-muted);
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
  }
  .puntos { display: flex; align-items: center; gap: var(--space-2); list-style: none; margin: 0; padding: 0; }
  .puntos li {
    box-sizing: border-box;
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
  /* Con la letra grande la fila de botones va justa: se queda la cuenta escrita. */
  :global(.app.compacta) .puntos { display: none; }
  @media (forced-colors: active) {
    .puntos li.hecho, .puntos li.actual { background: CanvasText; }
  }

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
  /* El aspecto es el de `.enlace` de base.css; aquí solo se fija que, por mucho
     que parezca un enlace, mida lo que un botón. */
  .enlace {
    min-height: var(--target-min);
    min-width: var(--target-min);
    padding: 0 var(--space-1);
    display: inline-flex;
    align-items: center;
    font-size: inherit;
  }
</style>
