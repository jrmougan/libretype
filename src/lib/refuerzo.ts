import { dominioDe, DOMINADA, type EstadoTecla } from './keyboard/dominio';
import { ES_ISO, type Layout } from './keyboard/layouts';
import { LESSONS } from './lessons';

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

const PALABRAS_BASE = [
  'de', 'la', 'que', 'el', 'en', 'los', 'se', 'del', 'las', 'un', 'por', 'con',
  'no', 'una', 'su', 'para', 'es', 'al', 'lo', 'como', 'más', 'pero', 'sus',
  'le', 'ya', 'fue', 'este', 'ha', 'sí', 'porque', 'esta', 'son', 'entre',
  'está', 'cuando', 'muy', 'sin', 'sobre', 'ser', 'tiene', 'también', 'me',
  'hasta', 'hay', 'donde', 'quien', 'desde', 'todo', 'nos', 'todos', 'uno',
  'les', 'ni', 'contra', 'otros', 'ese', 'eso', 'ante', 'ellos', 'esto', 'mí',
  'antes', 'algunos', 'qué', 'unos', 'yo', 'otro', 'otras', 'otra', 'él', 'tanto',
  'esa', 'estos', 'mucho', 'quienes', 'nada', 'muchos', 'cual', 'sea', 'poco',
  'ella', 'estar', 'haber', 'estas', 'estaba', 'día', 'cada', 'menos', 'bueno',
  'bien', 'tiempo', 'vida', 'mano', 'hacer', 'saber', 'cosa', 'año', 'vez',
  'hombre', 'parte', 'mundo', 'caso', 'lugar', 'trabajo', 'casa', 'punto',
  'forma', 'lado', 'camino', 'verdad', 'razón', 'cabeza', 'corazón', 'feliz',
  'taxi', 'kilo', 'reloj', 'hoja', 'hijo', 'ayer', 'agua', 'sol', 'aire',
];

/**
 * Genera un ejercicio de práctica cargado con las teclas que más le cuestan al alumno.
 */
export function generarEjercicioRefuerzo(
  estados: ReadonlyMap<string, EstadoTecla>,
  layout: Layout = ES_ISO,
): EjercicioRefuerzo | null {
  const teclasOrdenadas = obtenerTeclasOrdenadas(estados, layout);
  if (teclasOrdenadas.length === 0) return null;

  const flojas = teclasOrdenadas.filter((t) => t.esFloja);
  const seleccionadas = (flojas.length > 0 ? flojas : teclasOrdenadas).slice(0, 4);
  const letrasFlojas = [...new Set(seleccionadas.map((t) => t.char.toLowerCase()).filter((c) => c.length === 1))];

  if (letrasFlojas.length === 0) return null;

  const todasLasPalabras = [
    ...new Set([
      ...PALABRAS_BASE,
      ...LESSONS.flatMap((l) => l.text.split(' ')),
    ]),
  ];

  const puntuadas = todasLasPalabras
    .map((palabra) => {
      const p = palabra.toLowerCase();
      let coincidencias = 0;
      for (const letra of letrasFlojas) {
        for (const char of p) {
          if (char === letra) coincidencias++;
        }
      }
      return { palabra, coincidencias };
    })
    .filter((item) => item.coincidencias > 0)
    .sort((a, b) => b.coincidencias - a.coincidencias);

  let palabrasElegidas: string[] = [];
  if (puntuadas.length >= 10) {
    palabrasElegidas = puntuadas.slice(0, 15).map((p) => p.palabra);
  } else if (puntuadas.length > 0) {
    while (palabrasElegidas.length < 12) {
      for (const p of puntuadas) {
        if (palabrasElegidas.length < 12) palabrasElegidas.push(p.palabra);
      }
    }
  } else {
    palabrasElegidas = letrasFlojas;
  }

  const texto = palabrasElegidas.join(' ');
  const listaLetras = letrasFlojas.map((l) => l.toUpperCase()).join(', ');

  return {
    id: 'refuerzo',
    titulo: `Refuerzo de teclas (${listaLetras})`,
    focus: `Práctica intensiva de las teclas que más te cuestan: ${listaLetras}.`,
    text: texto,
    teclasFlojas: letrasFlojas,
  };
}
