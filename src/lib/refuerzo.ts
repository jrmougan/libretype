import { dominioDe, DOMINADA, INTENTOS_MINIMOS, type EstadoTecla } from './keyboard/dominio';
import { ES_ISO, type Layout } from './keyboard/layouts';
import { alfabetoHasta, LESSONS, vocabularioHasta } from './lessons';
import { construirTexto, semillaNueva } from './generador';
import { idCanonico } from './storage/equivalencias';

export interface InfoTeclaDificultad {
  code: string;
  char: string;
  intentos: number;
  aciertos: number;
  precision: number; // 0–100
  msMedio: number;
  dominio: number; // 0–1
  esFloja: boolean;
}

export function charDeCodigo(code: string, layout: Layout = ES_ISO): string {
  for (const row of layout.rows) {
    for (const key of row) {
      if (key.code === code) {
        return key.base ?? key.label ?? code;
      }
    }
  }
  return code;
}

/**
 * Devuelve la lista de teclas practicadas ordenadas por dificultad:
 * primero las de menor dominio/precisión (las que más cuestan).
 */
export function obtenerTeclasOrdenadas(
  estados: ReadonlyMap<string, EstadoTecla>,
  layout: Layout = ES_ISO,
): InfoTeclaDificultad[] {
  const lista: InfoTeclaDificultad[] = [];

  for (const [code, e] of estados) {
    if (e.intentos <= 0) continue;
    const dominio = dominioDe(e);
    const precision = Math.round((e.aciertos / e.intentos) * 100);
    const msMedio = Math.round(e.msTotal / e.intentos);
    const char = charDeCodigo(code, layout);
    // Es floja si tiene menos del 90% de aciertos o dominio menor que DOMINADA
    const esFloja = precision < 90 || dominio < DOMINADA;

    lista.push({
      code,
      char,
      intentos: e.intentos,
      aciertos: e.aciertos,
      precision,
      msMedio,
      dominio,
      esFloja,
    });
  }

  // Ordenar: primero menor dominio; si empatan, menor precisión; si empatan, más intentos
  lista.sort((a, b) => {
    if (a.dominio !== b.dominio) return a.dominio - b.dominio;
    if (a.precision !== b.precision) return a.precision - b.precision;
    return b.intentos - a.intentos;
  });

  return lista;
}

export interface EjercicioRefuerzo {
  id: string;
  titulo: string;
  focus: string;
  text: string;
  teclasFlojas: string[];
}

export interface OpcionesRefuerzo {
  /**
   * Hasta qué lección ha llegado el alumno (índice en `LESSONS`). El texto
   * solo usa teclas enseñadas hasta ahí. Sin él se supone el temario entero,
   * que solo tiene sentido para quien ya lo ha recorrido.
   */
  nivel?: number;
  /** Para que el texto cambie de una vez a otra y se pueda reproducir en los tests. */
  semilla?: number;
}

/**
 * Hasta qué lección ha llegado alguien: la más alta con algún intento
 * terminado, haya superado el objetivo o no. Es lo que se le ha enseñado, que
 * no es lo mismo que lo desbloqueado: la siguiente lección se desbloquea al
 * superar la anterior, pero sus teclas todavía no las ha visto nadie.
 */
export function nivelEnsenado(sesiones: readonly { leccion: string }[]): number {
  let max = 0;
  for (const s of sesiones) {
    const i = LESSONS.findIndex((l) => l.id === idCanonico(s.leccion));
    if (i > max) max = i;
  }
  return max;
}

/** Vocales con tilde o diéresis → la vocal que hay que pulsar después del acento. */
const VOCAL_BASE: Record<string, string> = { á: 'a', é: 'e', í: 'i', ó: 'o', ú: 'u', ü: 'u' };
const CON_TILDE = 'áéíóú';

/**
 * Qué caracteres del texto ejercitan una tecla. Una vocal con tilde son dos
 * pulsaciones, `´` y la vocal, así que la `á` practica la tecla del acento y
 * también la de la `a`. Buscar solo la letra literal dejaría al alumno que
 * falla el acento sin una sola palabra con la que practicarlo.
 */
export function caracteresDeTecla(tecla: string): string {
  if (tecla === '´') return CON_TILDE;
  if (tecla === '¨') return 'ü';
  const conAcento = Object.entries(VOCAL_BASE)
    .filter(([, base]) => base === tecla)
    .map(([ch]) => ch)
    .join('');
  return tecla + conAcento;
}

/** Si la tecla se ha enseñado ya con el alfabeto dado (el acento cuenta si hay tildes). */
function teclaEnsenada(tecla: string, alfabeto: ReadonlySet<string>): boolean {
  if (tecla === '´') return [...CON_TILDE].some((v) => alfabeto.has(v));
  if (tecla === '¨') return alfabeto.has('ü');
  return alfabeto.has(tecla);
}

/** Teclas que de verdad se pueden reforzar con palabras: letras y los dos acentos. */
const esReforzable = (tecla: string) => tecla === '´' || tecla === '¨' || /^\p{Ll}$/u.test(tecla);

/**
 * Las teclas flojas que se pueden practicar con lo enseñado hasta `nivel`, de
 * la que más cuesta a la que menos. Con menos de `INTENTOS_MINIMOS` no se
 * sabe si una tecla cuesta, así que no entra: la oferta del diálogo de
 * resultado no puede salir por tres pulsaciones.
 */
export function teclasParaReforzar(
  estados: ReadonlyMap<string, EstadoTecla>,
  nivel: number = LESSONS.length - 1,
  layout: Layout = ES_ISO,
): InfoTeclaDificultad[] {
  const alfabeto = alfabetoHasta(Math.min(Math.max(0, nivel), LESSONS.length - 1));
  return obtenerTeclasOrdenadas(estados, layout).filter((t) => {
    const tecla = t.char.toLowerCase();
    return t.esFloja && t.intentos >= INTENTOS_MINIMOS
      && esReforzable(tecla) && teclaEnsenada(tecla, alfabeto);
  });
}

/**
 * Genera un ejercicio de práctica cargado con las teclas que más le cuestan al
 * alumno, **sin salirse de lo enseñado**: un refuerzo que pide una tecla que
 * nadie le ha explicado rompe la misma regla que vigila `lessons.test.ts`.
 */
export function generarEjercicioRefuerzo(
  estados: ReadonlyMap<string, EstadoTecla>,
  layout: Layout = ES_ISO,
  { nivel = LESSONS.length - 1, semilla = semillaNueva() }: OpcionesRefuerzo = {},
): EjercicioRefuerzo | null {
  const tope = Math.min(Math.max(0, nivel), LESSONS.length - 1);
  const alfabeto = alfabetoHasta(tope);
  const enseñadas = obtenerTeclasOrdenadas(estados, layout).filter((t) => {
    const tecla = t.char.toLowerCase();
    return esReforzable(tecla) && teclaEnsenada(tecla, alfabeto);
  });
  if (enseñadas.length === 0) return null;

  const flojas = enseñadas.filter((t) => t.esFloja);
  const seleccionadas = (flojas.length > 0 ? flojas : enseñadas).slice(0, 4);
  const letrasFlojas = [...new Set(seleccionadas.map((t) => t.char.toLowerCase()))];

  const objetivo = letrasFlojas.map(caracteresDeTecla).join('');
  const vocabulario = vocabularioHasta(tope);
  const conFlojas = vocabulario.filter((w) => [...w].some((ch) => objetivo.includes(ch)));
  // Con muy pocas palabras el texto se repetiría entero; se completa con el
  // resto del vocabulario, que el peso deja en segundo plano.
  const piezas = conFlojas.length >= 6 ? conFlojas : vocabulario;
  const texto = construirTexto(piezas, semilla, { largo: 80, nuevas: objetivo });

  const listaLetras = letrasFlojas
    .map((l) => (l === '´' ? 'la tilde (´)' : l === '¨' ? 'la diéresis (¨)' : l.toUpperCase()))
    .join(', ');

  return {
    id: 'refuerzo',
    titulo: `Refuerzo de teclas (${listaLetras})`,
    focus: `Práctica de las teclas que más te cuestan: ${listaLetras}. Sin prisa: se trata de afianzarlas.`,
    text: texto,
    teclasFlojas: letrasFlojas,
  };
}
