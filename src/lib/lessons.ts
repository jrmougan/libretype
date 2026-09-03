/** Lecciones. El orden importa: fila de reposo primero, tildes al final. */
export interface Lesson {
  id: string;
  title: string;
  /** Qué se practica, en una línea, para que el alumno sepa por qué. */
  focus: string;
  text: string;
}

export const LESSONS: Lesson[] = [
  {
    id: 'home',
    title: 'Fila de reposo',
    focus: 'Los ocho dedos en asdf y jklñ, sin mirar',
    text: 'asdf jklñ asdf jklñ ada sal fas jal las fad',
  },
  {
    id: 'home-words',
    title: 'Primeras palabras',
    focus: 'Palabras reales sin salir de la fila de reposo',
    text: 'sala falda ajo dala salsa lada faja kola',
  },
  {
    id: 'top',
    title: 'Fila superior',
    focus: 'Subir a qwerty sin perder la posición',
    text: 'que pero todo tiene otro puerta quiere reporte',
  },
  {
    id: 'bottom',
    title: 'Fila inferior',
    focus: 'Bajar a zxcvbnm, la fila que más cuesta',
    text: 'zumo vez cabe mano nube boca vamos cancion',
  },
  {
    id: 'enye',
    title: 'La eñe',
    focus: 'Meñique derecho a la tecla de la ñ, junto a la l',
    text: 'niño año mañana señor pequeño España cariño uña',
  },
  {
    id: 'tildes',
    title: 'Tildes',
    focus:
      'Acento muerto: pulsa ´ y no aparece nada hasta que escribes la vocal. ' +
      'Es lo que separa escribir en español de escribir en inglés.',
    text: 'papá café aquí canción música árbol después según jamás',
  },
  {
    id: 'dieresis',
    title: 'Diéresis y mayúsculas',
    focus: 'Mayús + ´ da la diéresis; luego la u',
    text: 'pingüino vergüenza Ángel Óscar Úrsula bilingüe',
  },
  {
    id: 'mixed',
    title: 'Texto corrido',
    focus: 'Todo junto, con puntuación',
    text: 'El pingüino comió después de la reunión, según decía Ángel.',
  },
];
