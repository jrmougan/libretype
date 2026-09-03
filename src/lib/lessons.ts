/**
 * Lecciones.
 *
 * El orden **no** es el tradicional (fila de reposo, superior, inferior). Ese
 * viene de las academias de mecanografía en inglés y no sirve igual para el
 * español. Este sale de contar frecuencias sobre un corpus real: ver
 * `investigacion/frecuencias.py` y el documento de diseño.
 *
 * Dos consecuencias que se ven en la tabla de abajo:
 *
 * - **Las tildes están en la quinta lección, no en la penúltima.** El 12,97% de
 *   las palabras que se escriben en español llevan tilde, diéresis o eñe, y la
 *   tecla `´` se pulsa más que la `p`. No son un remate avanzado.
 * - **Se sale pronto de la fila de reposo.** Con `asdfjklñ` solo se puede
 *   escribir el 5,5% de las palabras: contiene cuatro de las letras más raras
 *   del idioma y ninguna de las que lo sostienen. Sigue siendo el ancla
 *   anatómica correcta, pero quedarse ahí es teclear sílabas sin sentido.
 *
 * Los textos son palabras reales del español ordenadas por frecuencia, no
 * inventadas: los genera `investigacion/generar_lecciones.py` y luego se
 * revisan a mano.
 */
export interface Lesson {
  id: string;
  title: string;
  /** Qué se practica y por qué, en una línea, para que el alumno lo sepa. */
  focus: string;
  /**
   * Teclas que estrena esta lección. El texto solo usa estas y las anteriores;
   * hay un test que lo comprueba.
   */
  nuevas: string;
  /** Porcentaje de palabras del español escribibles al terminarla. */
  cobertura: number;
  text: string;
}

export const LESSONS: Lesson[] = [
  {
    id: 'reposo',
    title: 'Fila de reposo',
    focus:
      'Los ocho dedos sobre asdf y jklñ. Busca con el dedo el relieve de la F y ' +
      'la J: es lo que te deja volver a la posición sin mirar.',
    nuevas: 'asdfjklñ',
    cobertura: 5.5,
    text: 'la las al sal sala salsa falda alas asa la las al sal sala',
  },
  {
    id: 'vocales-1',
    title: 'Las vocales que mandan',
    focus:
      'La E y la O son la primera y la tercera letra más usadas del español. ' +
      'Con solo estas dos ya escribes palabras de verdad.',
    nuevas: 'eo',
    cobertura: 18.8,
    text: 'de el es lo los se eso del le ella sed sola',
  },
  {
    id: 'nasales',
    title: 'Las nasales y la erre',
    focus: 'N y R, dos de las consonantes más frecuentes. Y llega la eñe a una palabra.',
    nuevas: 'nr',
    cobertura: 25.7,
    text: 'no en nos nada ser era son eres señor donde dejar renos',
  },
  {
    id: 'vocales-2',
    title: 'Se cierran las vocales',
    focus: 'Con la I, la T y la U tienes ya las cinco vocales y cuatro de cada diez palabras.',
    nuevas: 'itu',
    cobertura: 39.1,
    text: 'un una te si su tu esto todo tiene fue usted tan salir',
  },
  {
    id: 'tildes',
    title: 'Tildes',
    focus:
      'Acento muerto: pulsas ´ y no aparece nada hasta que escribes la vocal. ' +
      'Una de cada ocho palabras del español lleva tilde, así que esto no es un ' +
      'extra: es el idioma.',
    nuevas: 'áéíóú',
    cobertura: 43.4,
    text: 'está sí así él sé tú dónde día tenía adiós aún salió',
  },
  {
    id: 'oclusivas',
    title: 'Las oclusivas',
    focus: 'C, M y P. Con ellas se pasa de cuatro de cada diez palabras a casi siete.',
    nuevas: 'cmp',
    cobertura: 67.7,
    text: 'por me con para mi pero como más cuando cómo puedo creo',
  },
  {
    id: 'consonantes',
    title: 'Más consonantes',
    focus: 'B, G y V completan casi todo lo que se escribe a diario.',
    nuevas: 'bgv',
    cobertura: 81.6,
    text: 'bien vamos algo bueno tengo gracias sabes estaba verdad va favor también',
  },
  {
    id: 'dificiles',
    title: 'Las que faltaban',
    focus:
      'H, Q e Y son raras como letras sueltas, pero aparecen en algunas de las ' +
      'palabras más comunes que existen: que, hay, muy.',
    nuevas: 'hqy',
    cobertura: 98.1,
    text: 'que qué yo aquí ya estoy ahora muy ha hay he quiero',
  },
  {
    id: 'raras',
    title: 'Las raras',
    focus:
      'Z, X, W y la diéresis. Entre las cuatro no llegan al 0,5% de lo que se ' +
      'escribe, pero sin ellas no puedes escribir pingüino.',
    nuevas: 'zxwü',
    cobertura: 100,
    text: 'vez razón hizo cabeza quizá feliz corazón conozco pingüino vergüenza taxi kilo',
  },
];

/** Alfabeto disponible al empezar cada lección, incluidas las suyas. */
export function alfabetoHasta(indice: number): Set<string> {
  const s = new Set<string>();
  for (let i = 0; i <= indice; i++) {
    for (const ch of LESSONS[i].nuevas) s.add(ch);
  }
  return s;
}
