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
  /**
   * Texto revisado a mano. Es el del primer intento y el de referencia de los
   * tests; a partir del segundo, `generador.ts` saca uno nuevo cada vez.
   */
  text: string;
  /**
   * Frases cortas y reales que el generador mezcla con las palabras sueltas.
   * Van en minúscula y sin puntuación hasta que esas teclas se enseñan: el
   * generador pone la mayúscula inicial y el punto cuando ya están dadas.
   */
  frases?: readonly string[];
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
    frases: [
      'ella tiene sed', 'esto es todo', 'no es tan tarde', 'es la una',
      'tu tienda es esa', 'eso fue todo', 'ella tiene tres', 'el tren sale tarde',
      'nada es tan fuerte', 'todo tiene su lado',
    ],
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
    frases: [
      'así es', 'no lo sé', 'sí lo sé', 'dónde está', 'él no está',
      'ella salió sola', 'todo está en orden', 'el sol salió tarde',
      'tú eres así', 'aún es de día', 'ella está allí',
    ],
  },
  {
    id: 'oclusivas',
    title: 'Las oclusivas',
    focus: 'C, M y P. Con ellas se pasa de cuatro de cada diez palabras a casi siete.',
    nuevas: 'cmp',
    cobertura: 67.7,
    text: 'por me con para mi pero como más cuando cómo puedo creo',
    frases: [
      'mi casa es tu casa', 'como todos los días', 'no puedo creerlo',
      'es poco tiempo', 'cada día un poco más', 'pon la mesa', 'mira el mar',
      'tiene un perro', 'el tren sale a las cinco', 'toma un café',
      'cuando puedas me llamas', 'esto es para ti', 'lo siento', 'este es mi sitio',
    ],
  },
  {
    id: 'consonantes',
    title: 'Más consonantes',
    focus: 'B, G y V completan casi todo lo que se escribe a diario.',
    nuevas: 'bgv',
    cobertura: 81.6,
    text: 'bien vamos algo bueno tengo gracias sabes estaba verdad va favor también',
    frases: [
      'vamos a casa', 'buenas tardes', 'gracias por todo', 'tengo un gato negro',
      'nos vemos mañana', 'me gusta leer', 'abre la ventana', 'es una buena idea',
      'bebe agua', 'la vida es bella', 'todo va bien', 'tengo algo para ti',
    ],
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
    frases: [
      'hoy hace buen día', 'qué hora es', 'muchas gracias', 'hasta mañana',
      'yo quiero ir', 'hay que ir', 'ahora no puedo', 'estoy muy bien',
      'aquí hay mucho que hacer', 'quién es', 'ya lo he hecho', 'hoy es mi cumpleaños',
    ],
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
    frases: [
      'feliz cumpleaños', 'la luz del sol', 'a veces llueve', 'el pingüino come pez',
      'un zumo de naranja', 'toma un taxi', 'el wifi no va', 'tienes razón',
      'es la última vez', 'un kilo de arroz', 'qué vergüenza', 'el examen fue fácil',
    ],
  },
  {
    id: 'mayusculas',
    title: 'Mayúsculas',
    focus:
      'Usa la tecla Mayús con la mano contraria a la letra. Practica nombres ' +
      'propios e inicios de frase.',
    nuevas: 'ABCDEFGHIJKLMNÑOPQRSTUVWXYZÁÉÍÓÚ',
    cobertura: 100,
    text:
      'El sol brilla en Madrid y Ana pasea por el Retiro Carlos y Elena viajan a ' +
      'Toledo Mañana sale el tren hacia Sevilla Pedro visita a Laura en Valencia ' +
      'Todo está listo para salir',
    frases: [
      'Ana vive en Madrid', 'Mañana voy a Sevilla', 'Hoy cena Pedro en casa',
      'El tren sale de Toledo', 'Elena y Carlos viajan a Bilbao',
      'Laura estudia en Valencia', 'Mi hermano vive en Zaragoza', 'Ya llega el verano',
      'Quiero ir a Granada', 'Juan come con Lucía', 'Óscar visita Málaga',
      'Él vive en Murcia', 'Úrsula trabaja en Cádiz', 'Iván juega en Oviedo',
    ],
  },
  {
    id: 'puntuacion',
    title: 'Puntuación',
    focus:
      'El punto y la coma dan ritmo al texto. Los signos de interrogación y ' +
      'exclamación abren y cierran en español.',
    nuevas: '.,¿?¡!',
    cobertura: 100,
    text:
      'Hola, ¿cómo estás? ¡Qué alegría verte! Sí, todo va bien por aquí. ' +
      '¿Vienes hoy al cine? ¡Claro que sí, me apunto! Uno, dos, tres. ' +
      '¿Dónde vamos? ¡Espera, ya voy!',
    frases: [
      'Hola, ¿cómo estás?', '¡Qué alegría verte!', 'Sí, todo va bien por aquí.',
      '¿Vienes hoy al cine?', '¡Claro que sí, me apunto!', 'Uno, dos, tres.',
      '¿Dónde vamos?', '¡Espera, ya voy!', 'Buenos días, ¿qué tal?',
      'Mañana llueve, coge el paraguas.', '¡Qué bien, ya es viernes!',
      '¿Tienes un momento?', 'Gracias, eres muy amable.', 'Luego te llamo, ¿vale?',
      '¡Feliz cumpleaños, Marta!', 'No pasa nada, otra vez será.',
    ],
  },
  /*
   * «Números» estrenaba las diez cifras de golpe, el doble de lo que se le pide
   * a cualquier otra lección. Se parte en dos por manos: la izquierda llega del
   * 1 al 5 y la derecha del 6 al 0.
   *
   * La primera mitad conserva el identificador `numeros` y no hay entrada en
   * `storage/equivalencias.ts`, a propósito: no es un renombre. Quien superó la
   * lección antigua escribió las diez cifras, así que dar por hechas las del 1
   * al 5 no le regala nada que no practicara; la segunda mitad (`numeros-2`) es
   * nueva y se hace como cualquier otra.
   */
  {
    id: 'numeros',
    title: 'Números con la izquierda',
    focus:
      'Del 1 al 5, en la fila de arriba. Estira los dedos de la mano izquierda ' +
      'desde la fila de reposo sin mover la muñeca, y vuelve a casa.',
    nuevas: '12345',
    cobertura: 100,
    text:
      'Tengo 3 hermanos y 2 primos. Somos 5 en casa. Vivo en el piso 4. ' +
      'La clase empieza a las 11. Compré 12 huevos y 3 panes.',
    frases: [
      'Tengo 3 hermanos.', 'Vivo en el piso 4.', 'Son las 2 y cuarto.',
      'Somos 5 en casa.', 'Compré 12 huevos.', 'La clase es a las 11.',
      'Enero tiene 31 días.', 'Nací el 15 de mayo.', 'Llegó el 24 de abril.',
      'Cuesta 45 euros.', 'Lee la página 132.', 'Quedan 3 días.',
      '¿Vienes a las 4?', '¡Faltan 2 minutos!',
    ],
  },
  {
    id: 'numeros-2',
    title: 'Números con la derecha',
    focus:
      'Del 6 al 0, con la mano derecha. El 6 lo pulsa el índice derecho aunque ' +
      'quede cerca de la izquierda: así cada mano tiene su mitad.',
    nuevas: '67890',
    cobertura: 100,
    text:
      'En el año 2024 nacieron 15 niños en el pueblo. Hay 365 días en 1 año y 24 ' +
      'horas en 1 día. Compró 7 libros por 49 euros y 8 libretas por 10 euros.',
    frases: [
      'Hay 365 días en un año.', 'El día tiene 24 horas.', 'Mi número es el 678.',
      'Compró 7 libros por 49 euros.', 'Somos 8 en la mesa.', 'Son las 9 y media.',
      'El tren sale a las 10.', 'Tengo 60 años.', 'Hay 100 sillas.',
      'Nació en 2009.', 'Corre 6 kilómetros.', 'En 1990 todo era distinto.',
      '¿Quedamos a las 7?', '¡Ya son las 8!',
    ],
  },
  {
    id: 'simbolos',
    title: 'Dos puntos, guion y paréntesis',
    focus:
      'Los dos puntos y el punto y coma salen con Mayús sobre el punto y la ' +
      'coma; el guion está al lado; los paréntesis, con Mayús sobre el 8 y el 9.',
    nuevas: ':;-()',
    cobertura: 100,
    text:
      'Para la cena: pan, queso y fruta. Hoy no puedo; mañana sí. Es un libro ' +
      'corto (y muy bueno). El tren Madrid-Toledo sale a las 10:30. Somos tres: Ana, Luis y yo.',
    frases: [
      'Para la cena: pan, queso y fruta.', 'Hoy no puedo; mañana sí.',
      'Es un libro corto (y muy bueno).', 'El tren Madrid-Toledo sale a las 10:30.',
      'Somos tres: Ana, Luis y yo.', 'Hora de salida: 8:15.',
      'Llegó tarde; el autobús iba lleno.', 'Lo dijo ella (eso creo).',
      'Está a 5 km; vamos a pie.', 'Necesito tres cosas: harina, agua y sal.',
      'Es mi número de socio: 12-345.', 'Abre de lunes a viernes (no festivos).',
    ],
  },
  {
    id: 'simbolos-2',
    title: 'Correo, precios y porcentajes',
    focus:
      'La arroba y el euro salen con AltGr; el tanto por ciento, la barra y las ' +
      'comillas, con Mayús sobre los números. Con esto ya puedes escribir tu correo.',
    nuevas: '@€%/"',
    cobertura: 100,
    text:
      'Mi correo es ana.ruiz@correo.es y el de Luis, luis@ejemplo.org. El menú ' +
      'cuesta 12 €. Hay un 20% de descuento. Nació el 3/10/2015. Me dijo: "vuelvo enseguida".',
    frases: [
      'Mi correo es ana.ruiz@correo.es.', 'Escríbeme a luis@ejemplo.org.',
      'El menú cuesta 12 €.', 'Hay un 20% de descuento.', 'Nació el 3/10/2015.',
      'Me dijo: "vuelvo enseguida".', 'Un café cuesta 1,50 €.',
      'El 30% de la clase vino.', 'La reunión es el 14/02.', 'Usa y/o según el caso.',
      'El IVA es del 21%.', 'Ponía "cerrado por vacaciones".',
      'Mi correo nuevo es marta@libretype.org.', 'Son 25 € por persona.',
    ],
  },
];

/**
 * Banco de vocabulario frecuente, para que el texto cambie en cada intento.
 * Va ordenado por la lección a partir de la cual se puede escribir cada
 * palabra, pero no hace falta: `vocabularioHasta` filtra por las teclas dadas.
 * Son palabras reales y frecuentes; nada de sílabas inventadas.
 */
export const BANCO_VOCABULARIO: readonly string[] = [
  // reposo
  'la', 'las', 'al', 'sal', 'sala', 'salsa', 'falda', 'alas', 'asa', 'faldas',
  'da', 'das', 'ala', 'falla', 'fallas', 'falsa', 'falsas', 'salas', 'salsas', 'asas',
  // vocales-1
  'de', 'el', 'es', 'lo', 'los', 'se', 'eso', 'del', 'le', 'ella', 'sed', 'sola', 'solo', 'dos', 'les', 'ese', 'esa', 'esos', 'esas',
  'desde', 'ellos', 'ellas', 'ello', 'lejos', 'deja', 'dejo', 'dejas', 'lado', 'lados', 'feo', 'fea', 'fe',
  'oso', 'osa', 'osos', 'olas', 'ola', 'sello', 'dedo', 'dedos', 'seda', 'jefe', 'jefa', 'ojo', 'ojos', 'falso', 'solas', 'deseo', 'leo', 'lee',
  // nasales
  'no', 'en', 'nos', 'nada', 'ser', 'era', 'son', 'eres', 'señor', 'donde', 'dejar', 'renos', 'dar', 'red', 'ranas', 'orden', 'nena', 'año',
  'años', 'ando', 'onda', 'rosa', 'rosas', 'reloj', 'sano', 'sana', 'llena', 'lleno', 'eran', 'eras', 'leer', 'flor', 'flores',
  'señora', 'arena', 'rana', 'nadar', 'dolor', 'enero', 'oreja', 'sonar', 'soñar', 'llenar', 'lejano', 'llorar', 'ordenar',
  // vocales-2
  'un', 'una', 'te', 'si', 'su', 'tu', 'esto', 'todo', 'tiene', 'fue', 'usted', 'tan', 'salir', 'este', 'entre', 'tanto', 'tus', 'sus', 'uno', 'unos', 'unas',
  'tienen', 'tener', 'todos', 'todas', 'nuestro', 'nuestra', 'sin', 'fin', 'fiesta', 'tierra', 'tarde', 'tarea',
  'siete', 'otro', 'otra', 'otros', 'otras', 'dijo', 'dije', 'fuera', 'fuerte', 'tienda', 'idea', 'ideas', 'tren', 'tres',
  'alto', 'alta', 'lunes', 'dientes', 'silla', 'luna', 'fruta', 'frutas', 'ruido', 'unir', 'usar',
  // tildes
  'está', 'sí', 'así', 'él', 'sé', 'tú', 'dónde', 'día', 'tenía', 'adiós', 'aún', 'salió', 'están', 'más', 'aquí', 'allí', 'será', 'esté',
  'días', 'tenías', 'sofá', 'después', 'según', 'dará', 'irá', 'útil', 'fácil', 'difícil', 'jardín', 'león', 'salón', 'tendrá',
  // oclusivas
  'por', 'me', 'con', 'para', 'mi', 'pero', 'como', 'cuando', 'cómo', 'puedo', 'creo', 'casa', 'poco', 'tiempo', 'parte', 'mismo', 'cada', 'país', 'poder',
  'momento', 'mujer', 'mano', 'manos', 'madre', 'padre', 'camino', 'comer', 'comida', 'campo', 'cosa', 'cosas', 'claro',
  'primero', 'primera', 'mientras', 'cuatro', 'cinco', 'cien', 'mil', 'mes', 'meses', 'mesa', 'mar', 'amor', 'además',
  'pronto', 'tampoco', 'siempre', 'menos', 'comprar', 'precio', 'tema', 'música', 'película', 'número',
  // consonantes
  'bien', 'vamos', 'algo', 'bueno', 'tengo', 'gracias', 'sabes', 'estaba', 'verdad', 'va', 'favor', 'también', 'gran', 'vida', 'ver', 'gobierno', 'buen', 'volver',
  'bajo', 'vivir', 'visto', 'bonito', 'grande', 'general', 'gente', 'luego', 'amigo', 'amiga', 'agua', 'lugar',
  'viejo', 'vieja', 'nuevo', 'nueva', 'libro', 'libros', 'bastante', 'pregunta', 'gusta', 'juego', 'verde', 'sabor',
  'abrir', 'deber', 'beber', 'vino', 'grupo', 'árbol', 'último', 'gato', 'perro', 'ventana',
  // dificiles
  'que', 'qué', 'yo', 'ya', 'estoy', 'ahora', 'muy', 'ha', 'hay', 'he', 'quiero', 'hoy', 'hacer', 'hasta', 'hijo', 'mayor', 'hace',
  'hombre', 'hora', 'horas', 'hecho', 'mucho', 'mucha', 'muchos', 'noche', 'leche', 'ocho', 'ayer', 'ayuda', 'hablar',
  'quien', 'quién', 'porque', 'hermano', 'hermana', 'hija', 'hacia', 'hola', 'mayo', 'playa', 'ahí', 'haya', 'haber',
  'había', 'queso', 'parque', 'pequeño', 'pequeña', 'equipo', 'hielo', 'huevo', 'coche', 'chico', 'chica',
  // raras
  'vez', 'razón', 'hizo', 'cabeza', 'quizá', 'feliz', 'corazón', 'conozco', 'pingüino', 'vergüenza', 'taxi', 'kilo', 'voz', 'diez', 'paz', 'zona',
  'zapato', 'azul', 'cruz', 'luz', 'veces', 'empezar', 'taza', 'zumo', 'plaza', 'lápiz', 'cerveza', 'fuerza', 'pez',
  'arroz', 'raíz', 'exacto', 'texto', 'éxito', 'examen', 'sexto', 'próximo', 'extraño', 'wifi', 'web', 'bilingüe', 'cigüeña',
];

/** Palabras del vocabulario escribibles con las teclas aprendidas hasta la lección dada */
export function vocabularioHasta(indice: number): string[] {
  const permitidas = alfabetoHasta(indice);
  const palabrasLecciones = LESSONS.slice(0, indice + 1)
    .flatMap((l) => l.text.split(' '))
    .map((w) => w.replace(/[.,¿?¡!]/g, ''))
    .filter((w) => w.length >= 2);

  const todas = [...new Set([...palabrasLecciones, ...BANCO_VOCABULARIO])];
  const validas = todas.filter((w) => [...w].every((ch) => permitidas.has(ch)));
  return validas.length > 0 ? validas : ['la', 'las', 'al', 'sal', 'sala'];
}

/** Calcula el nivel de lección más alto desbloqueado según lecciones completadas */
export function nivelDesbloqueado(leccionesCompletadas: Iterable<string>): number {
  const completadas = new Set(leccionesCompletadas);
  let max = 0;
  for (let i = 0; i < LESSONS.length; i++) {
    if (completadas.has(LESSONS[i].id)) {
      max = Math.min(LESSONS.length - 1, i + 1);
    } else {
      break;
    }
  }
  return max;
}

/** Limpia y normaliza texto libre para la práctica */
export function normalizarTextoLibre(texto: string, caracteresPermitidos?: Set<string>): string {
  const limpio = texto.replace(/\s+/g, ' ').trim();
  if (!caracteresPermitidos) return limpio;
  return [...limpio].filter((c) => c === ' ' || caracteresPermitidos.has(c)).join('');
}

/** Alfabeto disponible al empezar cada lección, incluidas las suyas. */
export function alfabetoHasta(indice: number): Set<string> {
  const s = new Set<string>();
  for (let i = 0; i <= indice; i++) {
    for (const ch of LESSONS[i].nuevas) s.add(ch);
  }
  return s;
}
