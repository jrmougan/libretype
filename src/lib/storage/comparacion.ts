/**
 * Progreso comparado con uno mismo.
 *
 * Seis métricas sueltas no dicen si vas bien. Lo que motiva sin presionar es
 * verse avanzar respecto a uno mismo: «teclas que ya escribes sin mirar: 18 de
 * 33», «al empezar te costaban 6 intentos; ahora, 2». Reglas que vienen del
 * roadmap y no son decoración:
 *
 * - **Nunca contra la última sesión.** Una mala tarde contra una buena da una
 *   bajada que no significa nada y desanima. Se compara contra medias de
 *   periodos (los primeros días frente a esta semana) o contra el mejor.
 * - **Solo se cuenta lo que mejora o se mantiene.** Si esta semana va peor no
 *   se dice nada: no hay frase que reprenda.
 * - **Sin clasificaciones**: aquí no hay nadie más con quien compararse.
 *
 * Como el resto de la agregación, vive en TypeScript para poder probarse sin
 * base de datos ni componentes.
 */
import { DOMINADA, dominioDe, type EstadoTecla } from '../keyboard/dominio';
import { buildIndex, type Layout } from '../keyboard/layouts';
import { alfabetoHasta, LESSONS } from '../lessons';
import { charDeCodigo } from '../refuerzo';
import { resumirDificultad } from './dificultad';
import { PCT_MINIMO_PARA_RECORD, type ResumenDia, type Sesion } from './progreso';

/** Teclas (por `code`) que hacen falta para el temario abierto hasta `nivel`. */
export function teclasDelTemario(nivel: number, layout: Layout): Set<string> {
  const index = buildIndex(layout);
  const codigos = new Set<string>();
  for (const ch of alfabetoHasta(Math.min(Math.max(nivel, 0), LESSONS.length - 1))) {
    for (const paso of index.get(ch) ?? []) codigos.add(paso.code);
  }
  return codigos;
}

export interface SinMirar {
  /** Teclas del temario abierto que ya han perdido la letra. */
  dominadas: number;
  /** Teclas que pide el temario abierto. */
  total: number;
}

/**
 * «Teclas que ya escribes sin mirar: X de N». Usa el mismo criterio que retira
 * la ayuda visual (`dominio.ts`), sin tocarlo: lo que aquí cuenta como «sin
 * mirar» es exactamente lo que el teclado en pantalla ya no enseña.
 */
export function teclasSinMirar(
  teclas: ReadonlyMap<string, EstadoTecla>,
  nivel: number,
  layout: Layout,
): SinMirar {
  const temario = teclasDelTemario(nivel, layout);
  let dominadas = 0;
  for (const code of temario) if (dominioDe(teclas.get(code)) >= DOMINADA) dominadas++;
  return { dominadas, total: temario.size };
}

/**
 * Teclas que acaban de pasar a escribirse sin mirar entre dos momentos, como
 * etiquetas legibles. Es un logro y se cuenta al terminar la lección.
 */
export function recienDominadas(
  antes: ReadonlyMap<string, EstadoTecla>,
  despues: ReadonlyMap<string, EstadoTecla>,
  layout: Layout,
): string[] {
  const nuevas: string[] = [];
  for (const [code, e] of despues) {
    if (dominioDe(e) >= DOMINADA && dominioDe(antes.get(code)) < DOMINADA) {
      nuevas.push(charDeCodigo(code, layout));
    }
  }
  return nuevas;
}

const DIA_MS = 86400000;
const diaDe = (iso: string) => Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10));
const media = (ns: number[]) => ns.reduce((a, b) => a + b, 0) / ns.length;

/** Días que abarca cada periodo que se compara. */
export const DIAS_PERIODO = 7;

/**
 * Frases que comparan los primeros días con esta semana, y las primeras
 * lecciones con las últimas. Vacío si todavía no hay historia suficiente para
 * que la comparación signifique algo (dos periodos de una semana que no se
 * solapen) o si nada ha mejorado.
 */
export function comparacionPropia(sesiones: readonly Sesion[], hoyISO?: string): string[] {
  const validas = sesiones.filter((s) => s.escritos > 0 && Number.isFinite(s.pctAcierto));
  if (validas.length === 0) return [];
  const frases: string[] = [];

  const hoy = diaDe((hoyISO ?? new Date().toISOString()).slice(0, 10));
  const primerDia = Math.min(...validas.map((s) => diaDe(s.terminadaEn)));
  const finPrimeros = primerDia + DIAS_PERIODO * DIA_MS;
  const inicioRecientes = hoy - (DIAS_PERIODO - 1) * DIA_MS;

  if (inicioRecientes >= finPrimeros) {
    const primeros = validas.filter((s) => diaDe(s.terminadaEn) < finPrimeros);
    const recientes = validas.filter((s) => diaDe(s.terminadaEn) >= inicioRecientes);
    if (primeros.length > 0 && recientes.length > 0) {
      const pctAntes = Math.round(media(primeros.map((s) => s.pctAcierto)));
      const pctAhora = Math.round(media(recientes.map((s) => s.pctAcierto)));
      if (pctAhora > pctAntes) {
        frases.push(`Tu precisión media ha pasado del ${pctAntes}% de tus primeros días al ${pctAhora}% de esta semana.`);
      } else if (pctAhora === pctAntes) {
        frases.push(`Mantienes la precisión de tus primeros días: un ${pctAhora}% de media.`);
      }

      // El ritmo solo con intentos limpios, como la marca: ir rápido fallando
      // no es escribir mejor.
      const limpios = (ss: Sesion[]) => ss.filter((s) => s.pctAcierto >= PCT_MINIMO_PARA_RECORD);
      const [lAntes, lAhora] = [limpios(primeros), limpios(recientes)];
      if (lAntes.length > 0 && lAhora.length > 0) {
        const ppmAntes = Math.round(media(lAntes.map((s) => s.ppm)));
        const ppmAhora = Math.round(media(lAhora.map((s) => s.ppm)));
        if (ppmAhora > ppmAntes && pctAhora >= pctAntes) {
          frases.push(`Y vas más suelto sin perder precisión: de ${ppmAntes} a ${ppmAhora} palabras por minuto de media.`);
        }
      }
    }
  }

  // Lo que costaba superar una lección al principio frente a ahora.
  const dificultad = resumirDificultad(sesiones);
  const costes = LESSONS
    .map((l) => dificultad.get(l.id))
    .filter((d) => d?.superada)
    .map((d) => d!.intentosHastaSuperar);
  if (costes.length >= 4) {
    const antes = Math.round(media(costes.slice(0, 2)));
    const ahora = Math.round(media(costes.slice(-2)));
    if (ahora < antes) {
      frases.push(
        `Las primeras lecciones te costaron de media ${antes} intentos; las dos últimas, ` +
        `${ahora === 1 ? 'uno' : ahora}.`,
      );
    }
  }
  return frases;
}

export interface DatosResumen {
  superadas: number;
  lecciones: number;
  sinMirar: SinMirar;
  diasEstaSemana: number;
}

/** El resumen en una frase que encabeza el panel de progreso. */
export function fraseResumen(d: DatosResumen): string {
  const lecciones = d.superadas === 0
    ? 'Todavía no has superado ninguna lección, y no hay prisa'
    : `Has superado ${d.superadas} de ${d.lecciones} ${d.lecciones === 1 ? 'lección' : 'lecciones'}`;
  const teclas = d.sinMirar.dominadas === 0
    ? ''
    : ` y ya escribes ${d.sinMirar.dominadas} de ${d.sinMirar.total} teclas sin mirar`;
  const semana = d.diasEstaSemana === 0
    ? ''
    : d.diasEstaSemana === 1
      ? '. Esta semana has practicado un día'
      : `. Esta semana has practicado ${d.diasEstaSemana} días`;
  return `${lecciones}${teclas}${semana}.`;
}

/** Los últimos días con práctica, para la gráfica. */
export function serieGrafica(dias: readonly ResumenDia[], max = 14): ResumenDia[] {
  return dias.slice(-max);
}
