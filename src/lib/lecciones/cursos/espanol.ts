/**
 * Curso de español: solo datos. La lógica vive en `../catalogo.ts`.
 *
 * El orden **no** es el tradicional (fila de reposo, superior, inferior). Ese
 * viene de las academias de mecanografía en inglés y no sirve igual para el
 * español. Este sale de contar frecuencias sobre un corpus real: ver
 * `investigacion/frecuencias.py` y el documento de diseño.
 *
 * Dos consecuencias que se ven en la tabla de abajo:
 *
 * - **Las tildes están en la quinta lección, no en la penúltima.** El 13% de
 *   las palabras que se escriben en español llevan tilde, diéresis o eñe, y la
 *   tecla `´` se pulsa más que la `p`. No son un remate avanzado.
 * - **Se sale pronto de la fila de reposo.** Con `asdfjklñ` solo se puede
 *   escribir el 5,5% de las palabras: contiene cuatro de las letras más raras
 *   del idioma y solo dos de las cinco más usadas. Sigue siendo el ancla
 *   anatómica correcta, pero quedarse ahí es teclear sílabas sin sentido.
 *
 * Los textos son palabras reales del español ordenadas por frecuencia, no
 * inventadas: los genera `investigacion/generar_lecciones.py` y luego se
 * revisan a mano.
 */
import type { Curso, Lesson } from '../tipos';

const LECCIONES: Lesson[] = [
  {
    id: 'reposo',
    title: 'Fila de reposo',
    focus:
      'Los ocho dedos sobre asdf y jklñ. Busca con el dedo el relieve de la F y ' +
      'la J: es lo que te deja volver a la posición sin mirar.',
    nuevas: 'asdfjklñ',
    cobertura: 5.5,
    // Pocas palabras caben en estas ocho teclas: «ka» (el nombre de la letra) es
    // la única corriente con k, y sin ella esa tecla no se practicaría.
    text:
      'la las al da sal ala sala alas das ja falda salsa ka lasaña faja dada asa ' +
      'falsa kas fallas daña salada jala alfa faldas añada',
  },
  {
    id: 'vocales-1',
    title: 'Las vocales que mandan',
    focus:
      'La E y la O son la primera y la tercera letra más usadas del español. ' +
      'Con ellas y la fila de reposo ya escribes palabras de verdad.',
    nuevas: 'eo',
    cobertura: 18.8,
    text:
      'de el es lo los se eso del le ella ese solo dos esa año sea ellos desde ' +
      'les lado deja ojos sola lejos edad sol sale señal dedos jefe',
  },
  {
    id: 'nasales',
    title: 'La N y la R',
    focus:
      'La N y la R, dos de las consonantes más frecuentes. Con ellas ya salen ' +
      'palabras tan comunes como no, en, nada o ser.',
    nuevas: 'nr',
    cobertura: 25.7,
    text:
      'no en nos nada ser era son eres señor señora donde dejar dar eran real ' +
      'orden anda oro leer lleno rojo flores reloj rosa arena nadar flor enseñar',
  },
  {
    id: 'vocales-2',
    title: 'Las cinco vocales',
    focus: 'Con la I, la T y la U tienes ya las cinco vocales y casi cuatro de cada diez palabras.',
    nuevas: 'itu',
    cobertura: 39.1,
    text:
      'un una te si su tu esto todo tiene fue usted tan sus sin ir antes otra ' +
      'uno dijo nadie tres idea tarde entre salir dentro juntos niños suerte ' +
      'tierra fiesta seis',
  },
  {
    id: 'tildes',
    title: 'Tildes',
    focus:
      'Son dos pulsaciones: primero la tecla del acento (´), que todavía no ' +
      'escribe nada, y luego la vocal. Una de cada ocho palabras del español ' +
      'lleva tilde, así que no es un extra: es el idioma.',
    nuevas: 'áéíóú',
    cobertura: 43.4,
    text:
      'está sí así él estás sé tú dónde están día tenía allí días será aún ' +
      'adiós tío allá teléfono atrás detrás línea reunión salió frío río jardín ' +
      'interés área útil',
  },
  {
    id: 'oclusivas',
    title: 'La C, la M y la P',
    focus: 'Con la C, la M y la P pasas de cuatro de cada diez palabras a casi siete.',
    nuevas: 'cmp',
    cobertura: 67.7,
    text:
      'por me con para mi pero como más cuando cómo puedo creo casa tiempo nunca ' +
      'mejor decir siempre poco acuerdo padre madre mundo claro momento mañana ' +
      'familia amor parte semana',
  },
  {
    id: 'consonantes',
    title: 'La B, la G y la V',
    focus: 'Con la B, la G y la V ya puedes escribir ocho de cada diez palabras.',
    nuevas: 'bgv',
    cobertura: 81.6,
    text:
      'bien vamos algo bueno tengo gracias sabes estaba verdad va favor también ' +
      'sobre ver vida alguien trabajo gente vale lugar nuevo amigo luego buena ' +
      'nombre veces todavía agua grande juego',
  },
  {
    id: 'dificiles',
    title: 'La H, la Q y la Y',
    focus:
      'La H, la Q y la Y salen poco, pero están en palabras muy comunes: que, hay, muy.',
    nuevas: 'hqy',
    cobertura: 98.1,
    text:
      'que qué yo aquí ya estoy ahora muy ha hay he quiero hacer soy porque voy ' +
      'hola quién mucho hasta noche hablar hijo hoy hora ayuda historia coche ' +
      'pequeño hermano',
  },
  {
    id: 'raras',
    title: 'Las raras',
    focus:
      'La Z, la X, la W y la diéresis (Ü). Entre las cuatro no llegan al 0,5% de ' +
      'lo que se escribe, pero sin ellas no puedes escribir pingüino.',
    nuevas: 'zxwü',
    cobertura: 100,
    text:
      'vez razón hizo cabeza quizá feliz corazón luz paz diez empezar voz zapatos ' +
      'azul taza pizza azúcar taxi éxito texto examen extra kiwi web wifi pingüino ' +
      'cigüeña vergüenza bilingüe',
  },
  {
    id: 'mayusculas',
    title: 'Mayúsculas',
    focus:
      'Pulsa Mayús con la mano contraria a la de la letra. Salen nombres propios ' +
      'e inicios de frase.',
    nuevas: 'ABCDEFGHIJKLMNÑOPQRSTUVWXYZÁÉÍÓÚ',
    cobertura: 100,
    // Sin puntuación a propósito: todavía no se ha enseñado.
    text:
      'El sol brilla en Madrid y Ana pasea por el Retiro Carlos y Elena viajan a ' +
      'Toledo Mañana sale el tren hacia Sevilla Pedro visita a Laura en Valencia ' +
      'Beatriz y Diego viven en Bilbao Fernando e Irene estudian en Granada Hugo ' +
      'viaja a Jaén y a Oviedo Nuria conoce Kenia Una prima de Quito llama a Úrsula ' +
      'Óscar y Yolanda cenan en casa Ñoquis con salsa para Ángel e Íñigo Él y ' +
      'Xavier saludan a Wendy en Zaragoza',
    frases: [
      'El sol brilla en Madrid y Ana pasea por el Retiro', 'Carlos y Elena viajan a Toledo',
      'Mañana sale el tren hacia Sevilla', 'Pedro visita a Laura en Valencia',
      'Beatriz y Diego viven en Bilbao', 'Fernando e Irene estudian en Granada',
      'Hugo viaja a Jaén y a Oviedo', 'Nuria conoce Kenia', 'Una prima de Quito llama a Úrsula',
      'Óscar y Yolanda cenan en casa', 'Ñoquis con salsa para Ángel e Íñigo',
      'Él y Xavier saludan a Wendy en Zaragoza', 'Ana vive en Madrid', 'Mañana voy a Sevilla',
      'Hoy cena Pedro en casa', 'El tren sale de Toledo', 'Laura estudia en Valencia',
      'Mi hermano vive en Zaragoza', 'Ya llega el verano', 'Quiero ir a Granada',
      'Juan come con Lucía', 'Óscar visita Málaga', 'Úrsula trabaja en Cádiz', 'Iván juega en Oviedo',
    ],
  },
  {
    id: 'puntuacion',
    title: 'Puntuación',
    focus:
      'El punto y la coma dan ritmo al texto. En español, las preguntas y las ' +
      'exclamaciones llevan signo al abrir y al cerrar: ¿así? ¡Y así!',
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
  {
    id: 'numeros',
    title: 'Números',
    focus:
      'La fila de arriba, del 1 al 0. Estira los dedos desde la fila de reposo ' +
      'moviendo la muñeca lo menos posible, y vuelve a tu sitio después.',
    nuevas: '1234567890',
    cobertura: 100,
    // Sin años: una cifra como «el año 2024» envejece; estas no.
    text:
      'Un año tiene 365 días y un día tiene 24 horas. En el pueblo viven 1280 ' +
      'personas y hay 3 colegios. Compró 7 libros por 49 euros y 8 libretas por ' +
      '10 euros. El tren sale a las 6 y llega a las 9.',
    // Tampoco aquí hay años.
    frases: [
      'Tengo 3 hermanos.', 'Vivo en el piso 4.', 'Son las 2 y cuarto.', 'Somos 5 en casa.',
      'Compré 12 huevos.', 'La clase es a las 11.', 'Enero tiene 31 días.', 'Nací el 15 de mayo.',
      'Llegó el 24 de abril.', 'Cuesta 45 euros.', 'Lee la página 132.', 'Quedan 3 días.',
      '¿Vienes a las 4?', '¡Faltan 2 minutos!', 'Un año tiene 365 días.', 'El día tiene 24 horas.',
      'Mi número es el 678.', 'Compró 7 libros por 49 euros.', 'Somos 8 en la mesa.',
      'Son las 9 y media.', 'El tren sale a las 10.', 'Tengo 60 años.', 'Hay 100 sillas.',
      'Corre 6 kilómetros.', '¿Quedamos a las 7?', '¡Ya son las 8!',
    ],
  },
  // Consolidación: textos seguidos con todo lo anterior. Cada una estrena los
  // signos que aún faltaban, para que escribir un texto real no deje a nadie sin
  // saber dónde están los dos puntos o las comillas.
  {
    id: 'un-dia',
    title: 'Un día cualquiera',
    focus:
      'Un texto seguido. Estrenas los signos : y ; que son Mayús con el punto y con la coma.',
    nuevas: ':;',
    cobertura: 100,
    text:
      'Hoy me he levantado temprano. Para desayunar había tres cosas: pan, fruta y ' +
      'leche. Después salí a la calle; hacía sol y apetecía andar. En el parque ' +
      'encontré a Marta, que paseaba con su perro. ¿Damos una vuelta?, me preguntó. ' +
      '¡Claro que sí! Volvimos a casa a las 12, con mucha hambre.',
  },
  {
    id: 'refranes',
    title: 'Refranes',
    focus:
      'Refranes de siempre. Estrenas las comillas y los paréntesis: Mayús con el 2, el 8 y el 9.',
    nuevas: '"()',
    cobertura: 100,
    text:
      'Dice mi abuela (y tiene razón) que "no por mucho madrugar amanece más ' +
      'temprano". Mi abuelo prefiere otro refrán: "a quien madruga, Dios le ayuda". ' +
      'Yo me quedo con este: "más vale tarde que nunca". Y si hoy no sale, mañana ' +
      'será otro día.',
  },
  /*
   * Lo que faltaba para escribir una fecha, un teléfono, un precio o un correo.
   *
   * Van al final a propósito, y no junto a «Números»: el desbloqueo recorre el
   * curso en orden, así que una lección nueva en medio volvería a cerrarle a
   * quien ya las superó todas las que vienen detrás. Por lo mismo «Números» no
   * se parte en dos: quien la superó escribió las diez cifras, y quitarle
   * cinco sería retirar algo ya acreditado. `numeros-2` es una segunda vuelta
   * a la fila de arriba con los dos signos que acompañan a las cifras.
   */
  {
    id: 'numeros-2',
    title: 'Fechas y teléfonos',
    focus:
      'Otra vuelta a la fila de números, ahora en fechas, horas y teléfonos. ' +
      'Estrenas el guion, que está junto a la Mayús derecha, y la barra: Mayús con el 7.',
    nuevas: '-/',
    cobertura: 100,
    // Fechas sin año, como en «Números».
    text:
      'Nació el 3/10 y su hermana el 25/12. El teléfono del centro es 912-345-678. ' +
      'La biblioteca abre de 9 a 14, de lunes a viernes; por la tarde, de 17-20. ' +
      'El tren Madrid-Toledo sale a las 10:30. Apunta la fecha: 6/4.',
    frases: [
      'Nació el 3/10.', 'La cita es el 14/02.', 'El teléfono es 912-345-678.',
      'El tren Madrid-Toledo sale a las 10:30.', 'Abre de 9 a 14, de lunes a viernes.',
      'El horario de tarde es 17-20.', 'Mi número de socio es el 12-345.',
      'La reunión es el 25/11 a las 18:00.', 'Usa y/o según el caso.',
      'Lee las páginas 40-45.', 'Quedamos el 6/4, ¿te viene bien?', 'El partido acabó 3-2.',
      'Vuelo Sevilla-Bilbao, puerta 7.', 'Del 1/7 al 15/8 cerramos por vacaciones.',
    ],
  },
  {
    id: 'simbolos',
    title: 'Correo, precios y porcentajes',
    focus:
      'La arroba sale con AltGr y el 2; el euro, con AltGr y el 5; el tanto por ' +
      'ciento, con Mayús y el 5. Con esto ya puedes escribir una dirección de correo.',
    nuevas: '@€%',
    cobertura: 100,
    text:
      'Mi correo es ana.ruiz@ejemplo.es y el de Luis es luis@ejemplo.org. El menú ' +
      'cuesta 12 € y hoy tiene un 20% de descuento. Un café cuesta 1,50 €. El 30% ' +
      'de la clase fue a la excursión, que costaba 8 € por persona.',
    frases: [
      'Mi correo es ana.ruiz@ejemplo.es.', 'Escríbeme a luis@ejemplo.org.',
      'El menú cuesta 12 €.', 'Hay un 20% de descuento.', 'Un café cuesta 1,50 €.',
      'El 30% de la clase vino.', 'El IVA es del 21%.', 'Son 25 € por persona.',
      'Mi correo nuevo es marta@ejemplo.org.', 'La entrada cuesta 6 €, con un 50% de descuento.',
      'Envía la foto a info@ejemplo.es.', 'Ahorra un 10% cada mes.',
      '¿Cuánto es el 15% de 200 €?', 'El billete sube un 3%.',
    ],
  },
];

/** Banco de vocabulario frecuente para práctica continua. */
const BANCO_VOCABULARIO: readonly string[] = [
  'la', 'las', 'al', 'sal', 'sala', 'salsa', 'falda', 'alas', 'asa', 'faldas',
  'de', 'el', 'es', 'lo', 'los', 'se', 'eso', 'del', 'le', 'ella', 'sed', 'sola', 'solo', 'dos', 'les', 'ese', 'esa', 'esos', 'esas',
  'no', 'en', 'nos', 'nada', 'ser', 'era', 'son', 'eres', 'señor', 'donde', 'dejar', 'dar', 'red', 'ranas', 'orden', 'año',
  'un', 'una', 'te', 'si', 'su', 'tu', 'esto', 'todo', 'tiene', 'fue', 'usted', 'tan', 'salir', 'este', 'entre', 'tanto', 'tus', 'sus', 'uno', 'unos', 'unas',
  'está', 'sí', 'así', 'él', 'sé', 'tú', 'dónde', 'día', 'tenía', 'adiós', 'aún', 'salió', 'están', 'más', 'aquí', 'allí', 'será', 'esté',
  'por', 'me', 'con', 'para', 'mi', 'pero', 'como', 'cuando', 'cómo', 'puedo', 'creo', 'casa', 'poco', 'tiempo', 'parte', 'mismo', 'cada', 'país', 'poder',
  'bien', 'vamos', 'algo', 'bueno', 'tengo', 'gracias', 'sabes', 'estaba', 'verdad', 'va', 'favor', 'también', 'gran', 'vida', 'ver', 'buen', 'volver',
  'que', 'qué', 'yo', 'ya', 'estoy', 'ahora', 'muy', 'ha', 'hay', 'he', 'quiero', 'hoy', 'hacer', 'hasta', 'hijo', 'mayor', 'hace',
  'vez', 'razón', 'hizo', 'cabeza', 'quizá', 'feliz', 'corazón', 'conozco', 'pingüino', 'vergüenza', 'taxi', 'kiwi', 'voz', 'diez', 'paz', 'zona',
];

/** Palabras corrientes con las que el refuerzo llena un ejercicio. */
export const PALABRAS_BASE: readonly string[] = [
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

export const CURSO_ESPANOL: Curso = {
  id: 'espanol',
  titulo: 'Temario de español',
  idioma: 'español',
  lecciones: LECCIONES,
  vocabulario: BANCO_VOCABULARIO,
  palabrasRefuerzo: PALABRAS_BASE,
  // Hasta aquí llega el alfabeto; después solo se añaden mayúsculas y signos.
  finAlfabeto: 'raras',
};
