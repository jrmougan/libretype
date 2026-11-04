import { dominioDe, DOMINADA, type EstadoTecla } from './keyboard/dominio';
import { buildIndex, ES_ISO, type KeyStep, type Layout } from './keyboard/layouts';
import { catalogo as catalogoApp, type Catalogo } from './lecciones/catalogo';
import { ID_REFUERZO } from './lecciones/ids';
import type { Curso } from './lecciones/tipos';

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
  /**
   * El texto es relleno: la tecla sola, o tan pocas palabras que hay que repetirlas.
   * No demuestra nada, así que se apunta aparte; ver `ids.ts`.
   */
  suelto?: boolean;
}

/**
 * Lo que hace falta saber de una tecla para reforzarla. Un carácter no basta: la
 * tecla del acento no se puede pedir suelta (`´`+`´` da `´´` en macOS y `´` en GTK,
 * hallazgo 2 de AGENTS.md), así que se practica en las vocales que acentúa; y el
 * espacio ya está entre dos palabras cualesquiera.
 */
interface Objetivo {
  /** La tecla, tal como se le nombra al alumno. */
  nombre: string;
  /** El carácter que la representa en `teclasFlojas`. */
  char: string;
  /** Los caracteres que se teclean pulsándola: las palabras se eligen por ellos. */
  caracteres: ReadonlySet<string>;
  esEspacio: boolean;
  esAcento: boolean;
  pasos: ReadonlyMap<string, readonly KeyStep[]>;
}

function objetivoDe(t: InfoTeclaDificultad, index: ReadonlyMap<string, readonly KeyStep[]>): Objetivo | null {
  const propios = index.get(t.char);
  if (!propios) return null; // Intro, Mayús…: ningún carácter de una palabra se apunta a ellas.
  const esEspacio = t.char === ' ';
  const esAcento = propios.length === 1 && propios[0].dead;
  const caracteres = new Set<string>();
  const pasos = new Map<string, readonly KeyStep[]>();
  for (const [ch, p] of index) {
    if (esEspacio || !p.some((paso) => paso.code === t.code)) continue;
    if (p.length === 1 && p[0].dead) continue;
    caracteres.add(ch);
    pasos.set(ch, p);
  }
  const nombre = esEspacio ? 'espacio' : esAcento ? 'acento' : t.char.toUpperCase();
  return { nombre, char: t.char, caracteres, esEspacio, esAcento, pasos };
}

/**
 * Las palabras que se le pueden pedir a esta persona: solo con lo que ya ha visto
 * (las lecciones abiertas) y las teclas que se van a reforzar, que por algo tienen
 * intentos. Sin esto, a quien solo ha hecho la fila de reposo le pediría mayúsculas
 * y letras que nadie le ha enseñado. Cada palabra una sola vez aunque aparezca con
 * mayúscula y sin ella, y sin ella si se puede.
 *
 * Solo del curso que se está siguiendo: la primera lección de cualquier curso está
 * siempre abierta, y sin este límite se pedirían letras de un curso ni empezado.
 */
function vocabularioAlcanzable(
  superadas: ReadonlySet<string>,
  objetivos: readonly Objetivo[],
  curso: Curso,
  catalogo: Catalogo,
): string[] {
  const abiertas = curso.lecciones.filter((l) => catalogo.estaDesbloqueada(l.id, superadas));
  const alcanzables = new Set([' ', ...abiertas.flatMap((l) => [...l.text])]);
  for (const o of objetivos) if (!o.esAcento) alcanzables.add(o.char);
  // Con el acento, las vocales que ya se conocen: la tilde no enseña la `u` a nadie.
  for (const o of objetivos) {
    if (!o.esAcento) continue;
    for (const [ch, p] of o.pasos) {
      if (p.every((paso) => paso.dead || alcanzables.has(paso.char))) alcanzables.add(ch);
    }
  }

  const porClave = new Map<string, string>();
  for (const palabra of [...(curso.palabrasRefuerzo ?? []), ...abiertas.flatMap((l) => l.text.split(' '))]) {
    if (![...palabra].every((c) => alcanzables.has(c))) continue;
    const clave = palabra.toLowerCase();
    if (!porClave.has(clave) || palabra === clave) porClave.set(clave, palabra);
  }
  return [...porClave.values()];
}

/** Las palabras que más ejercitan esta tecla, de más a menos. */
function palabrasPara(o: Objetivo, vocabulario: readonly string[]): string[] {
  return vocabulario
    .map((palabra) => ({ palabra, veces: [...palabra].filter((c) => o.caracteres.has(c)).length }))
    .filter((p) => p.veces > 0)
    .sort((a, b) => b.veces - a.veces)
    .map((p) => p.palabra);
}

/**
 * Por turnos: si se ordenaran todas juntas, las palabras llenas de `a` dejarían
 * fuera a las de la tecla que se pide a su lado, y el título prometería algo que
 * el texto no trae.
 */
function repartir(listas: readonly (readonly string[])[], cuantas: number): string[] {
  const elegidas = new Set<string>();
  for (let vuelta = 0; elegidas.size < cuantas && listas.some((l) => vuelta < l.length); vuelta++) {
    for (const lista of listas) {
      if (vuelta < lista.length && elegidas.size < cuantas) elegidas.add(lista[vuelta]);
    }
  }
  return [...elegidas];
}

/** Por debajo de esto el texto se repite, y lo repetido no demuestra destreza. */
const MIN_PALABRAS_DISTINTAS = 10;

/**
 * Genera un ejercicio de práctica cargado con las teclas que más le cuestan al
 * alumno, dentro de un curso (el principal si no se dice). Devuelve null si ninguna
 * se puede practicar con lo que ya ha visto.
 */
export function generarEjercicioRefuerzo(
  estados: ReadonlyMap<string, EstadoTecla>,
  superadas: ReadonlySet<string> = new Set(),
  layout: Layout = ES_ISO,
  cursoId?: string,
  catalogo: Catalogo = catalogoApp,
): EjercicioRefuerzo | null {
  const curso = catalogo.cursos.find((c) => c.id === cursoId) ?? catalogo.principal;
  const index = buildIndex(layout);
  const practicables = obtenerTeclasOrdenadas(estados, layout)
    .map((t) => ({ t, objetivo: objetivoDe(t, index) }))
    .filter((x): x is { t: InfoTeclaDificultad; objetivo: Objetivo } => x.objetivo !== null);
  if (practicables.length === 0) return null;

  const flojas = practicables.filter((x) => x.t.esFloja);
  const objetivos = (flojas.length > 0 ? flojas : practicables).slice(0, 4).map((x) => x.objetivo);
  const vocabulario = vocabularioAlcanzable(superadas, objetivos, curso, catalogo);

  const conPalabras = objetivos
    .filter((o) => !o.esEspacio)
    .map((o) => ({ o, palabras: palabrasPara(o, vocabulario) }))
    .filter((x) => x.palabras.length > 0);
  const hayEspacio = objetivos.some((o) => o.esEspacio);

  let palabras: string[];
  let cubiertos: Objetivo[];
  let suelto = false;
  if (conPalabras.length > 0) {
    palabras = repartir(conPalabras.map((x) => x.palabras), 15);
    cubiertos = objetivos.filter((o) => o.esEspacio || conPalabras.some((x) => x.o === o));
  } else if (hayEspacio && vocabulario.length > 0) {
    // Las palabras cortas, que son las que más espacios piden por letra.
    // Sin las de una letra ni las cifras sueltas, si hay de sobra: «y a 3 7» no es leer.
    const conLetras = vocabulario.filter((p) => /^\p{L}{2,}$/u.test(p));
    const base = conLetras.length >= 10 ? conLetras : vocabulario;
    palabras = [...base].sort((a, b) => [...a].length - [...b].length).slice(0, 15);
    cubiertos = objetivos.filter((o) => o.esEspacio);
  } else {
    // Sin ninguna palabra posible se practica la tecla sola, pero sigue siendo un
    // ejercicio: una letra suelta se acabaría antes de poder medir nada. Con el
    // acento no se puede (ver `Objetivo`), y como esto no es vocabulario, va con su
    // propio identificador: no retira letras ni fija marcas.
    cubiertos = objetivos.filter((o) => !o.esAcento && !o.esEspacio);
    if (cubiertos.length === 0) return null;
    palabras = cubiertos.map((o) => o.char.repeat(3));
    suelto = true;
  }

  // Muy pocas palabras se acabarían antes de poder medir nada. Pero «ka kas ka kas»
  // tampoco es vocabulario, aunque sean palabras: seis repeticiones de lo mismo
  // retirarían la K de un solo ejercicio. Se apunta aparte, igual que la tecla sola.
  const hayQueRepetir = palabras.length < MIN_PALABRAS_DISTINTAS;
  if (hayQueRepetir) suelto = true;
  const texto = hayQueRepetir
    ? Array.from({ length: 12 }, (_, i) => palabras[i % palabras.length])
    : palabras;
  const lista = cubiertos.map((o) => o.nombre).join(', ');

  return {
    id: ID_REFUERZO,
    titulo: `Refuerzo de teclas (${lista})`,
    focus: `Práctica intensiva de las teclas que más te cuestan: ${lista}.`,
    text: texto.join(' '),
    teclasFlojas: cubiertos.map((o) => o.char),
    suelto,
  };
}
