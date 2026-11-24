/** Una lección del temario. Son datos: nada aquí sabe de progreso ni de vistas. */
export interface Lesson {
  id: string;
  title: string;
  /** Qué se practica y por qué, en una línea, para que el alumno lo sepa. */
  focus: string;
  /**
   * Teclas que estrena esta lección. El texto solo usa estas y las anteriores
   * del mismo curso; `garantias.ts` lo comprueba.
   */
  nuevas: string;
  /** Porcentaje de palabras del idioma escribibles al terminarla. */
  cobertura: number;
  /**
   * Texto revisado a mano. Es el del primer intento y el de referencia de los
   * tests; a partir del segundo, `generador.ts` saca uno nuevo cada vez.
   */
  text: string;
  /**
   * Frases completas con las que componer los intentos siguientes, para las
   * lecciones en las que las palabras sueltas no sirven (mayúsculas, signos,
   * cifras). Solo usan teclas ya enseñadas; `garantias.ts` lo comprueba. Sin
   * ellas, una lección que ya no estrena letras conserva siempre su texto.
   */
  frases?: readonly string[];
}

/**
 * Un recorrido completo. Cada curso se desbloquea por su cuenta y acumula sus
 * propias teclas: lo aprendido en otro curso no le cuenta al alfabeto de este.
 */
export interface Curso {
  /** Único entre cursos. No se guarda en el histórico; las lecciones sí. */
  id: string;
  titulo: string;
  /** Nombre del idioma tras «del» y «en»: «45% del español». */
  idioma: string;
  lecciones: readonly Lesson[];
  /** Palabras extra para la práctica continua, aparte de las de las lecciones. */
  vocabulario?: readonly string[];
  /** Palabras extra para el refuerzo de teclas, aparte de las de las lecciones. */
  palabrasRefuerzo?: readonly string[];
  /**
   * Última lección en la que se estrenan letras. Hasta ella la cobertura debe
   * subir y no se estrenan más de cinco teclas de golpe. Sin este campo, esas
   * dos garantías se aplican a todo el curso.
   */
  finAlfabeto?: string;
}
