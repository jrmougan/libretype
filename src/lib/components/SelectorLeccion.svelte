<script lang="ts">
  /**
   * El selector de la barra: sustituye a los diez botones que ocupaban dos filas.
   * Cada curso del catálogo es un grupo, y añadir uno no toca nada aquí.
   */
  import { catalogo } from '../lecciones/catalogo';
  import { activas, type LeccionPropia } from '../lecciones/personalizadas';
  import type { ResumenLeccion } from '../storage/progreso';
  import SelectConfirmado from './SelectConfirmado.svelte';

  interface Props {
    valor: string;
    deshabilitado?: boolean;
    superadas: ReadonlySet<string>;
    porLeccion: ReadonlyMap<string, ResumenLeccion>;
    /**
     * La lección por la que iba, si ya ha practicado algo. Solo se señala si no es
     * la que está abierta: ahí ya lo dice el propio selector.
     */
    seguiaEn?: string | null;
    /** Título del refuerzo en curso, que solo aparece mientras dura. */
    tituloRefuerzo?: string | null;
    propias: readonly LeccionPropia[];
    onElegir: (valor: string) => void;
  }

  let {
    valor, deshabilitado = false, superadas, porLeccion,
    seguiaEn = null, tituloRefuerzo = null, propias, onElegir,
  }: Props = $props();

  const lista = $derived(activas(propias));
  const marca = (id: string) => {
    const m = porLeccion.get(id);
    return m && m.mejorPpm > 0 ? ` · ${m.mejorPpm} ppm` : '';
  };

  const seguias = (id: string) => (id === seguiaEn && id !== valor ? ' · Seguías por aquí' : '');
</script>

<div class="selector">
  <label for="selector-leccion" class="sr-only">Lección o modo de práctica</label>
  <SelectConfirmado
    id="selector-leccion"
    {valor}
    {deshabilitado}
    pista="Pulsa Intro para abrirla · Esc para volver"
    {onElegir}
  >
    <option value="cero">Antes de empezar · dónde van las manos</option>
    {#if tituloRefuerzo}
      <option value="refuerzo">{tituloRefuerzo}</option>
    {/if}
    {#each catalogo.cursos as curso (curso.id)}
      <optgroup label={curso.titulo}>
        {#each curso.lecciones as l, i (l.id)}
          {@const abierta = catalogo.estaDesbloqueada(l.id, superadas)}
          <option value={l.id} disabled={!abierta}>
            {i + 1}. {l.title}{!abierta ? ' · Bloqueada' : superadas.has(l.id) ? ' · Superada' : ''}{marca(l.id)}{seguias(l.id)}
          </option>
        {/each}
      </optgroup>
    {/each}
    <optgroup label="Práctica libre">
      <option value="continua">Práctica continua · vocabulario acumulado</option>
      <option value="propio">Texto propio · sin guardar</option>
    </optgroup>
    <optgroup label="Tus lecciones">
      {#each lista as l (l.id)}
        <option value={l.id}>{l.titulo}{marca(l.id)}{seguias(l.id)}</option>
      {/each}
      <option value="gestionar">{lista.length > 0 ? 'Gestionar tus lecciones…' : 'Crear una lección…'}</option>
    </optgroup>
  </SelectConfirmado>
</div>

<style>
  /* Cede antes que los botones: la barra envuelve lo menos posible. */
  .selector { flex: 1 1 var(--selector-base); min-width: 0; }
</style>
