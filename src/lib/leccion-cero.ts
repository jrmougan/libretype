/**
 * Contenido de la lección cero.
 *
 * Va aparte del componente para poder probarlo: un `code` mal escrito dejaría
 * al alumno atascado en un paso que no se puede completar, y en una pantalla
 * pensada justamente para quien no sabe qué está pasando eso es grave.
 */
import type { Finger } from './keyboard/layouts';

export interface PasoPide {
  code: string;
  comoSeLlama: string;
  dedo: Finger;
}

export interface Paso {
  titulo: string;
  cuerpo: string[];
  /** Teclas señaladas en el teclado de la pantalla, por `code`. */
  guia: string[];
  /** Si el paso pide pulsar algo, qué espera. */
  pide?: PasoPide[];
}

/** La fila de reposo del teclado español. */
export const REPOSO = [
  'KeyA', 'KeyS', 'KeyD', 'KeyF',
  'KeyJ', 'KeyK', 'KeyL', 'Semicolon',
];

export const PASOS: Paso[] = [
  {
    titulo: 'Antes de teclear, siéntate bien',
    cuerpo: [
      'La espalda apoyada en el respaldo y los pies planos en el suelo. Si no llegan, ponles debajo una caja o un libro grueso.',
      'La pantalla más o menos a la altura de los ojos, para no bajar la cabeza.',
      'Los codos cerca del cuerpo, formando un ángulo recto, y las muñecas rectas: no las apoyes en la mesa mientras escribes.',
      'Esto no es una formalidad. Teclear con la postura torcida cansa en diez minutos y a la larga hace daño.',
    ],
    guia: [],
  },
  {
    titulo: 'Los ocho dedos tienen su sitio',
    cuerpo: [
      'Esta hilera se llama la fila de reposo, y es la casa de tus dedos. Cada uno tiene la suya y siempre vuelve a ella.',
      'Mano izquierda: el meñique en la A, el anular en la S, el corazón en la D y el índice en la F.',
      'Mano derecha: el índice en la J, el corazón en la K, el anular en la L y el meñique en la Ñ.',
      'Los pulgares se quedan flotando sobre la barra espaciadora. No hacen nada más.',
    ],
    guia: REPOSO,
  },
  {
    titulo: 'La F y la J tienen un relieve',
    cuerpo: [
      'Pasa la yema del índice por encima de la F y de la J. Notarás una rayita en relieve que las otras teclas no tienen.',
      'No es un defecto: está puesta a propósito, y es el truco entero de escribir sin mirar. Te permite colocar las manos a tientas y saber que están bien.',
      'Pruébalo ahora: aparta la vista del teclado, busca los dos relieves con los índices y coloca los otros dedos a los lados.',
    ],
    guia: ['KeyF', 'KeyJ'],
    pide: [
      { code: 'KeyF', comoSeLlama: 'F', dedo: 'l-index' },
      { code: 'KeyJ', comoSeLlama: 'J', dedo: 'r-index' },
    ],
  },
  {
    titulo: 'El espacio es cosa de los pulgares',
    cuerpo: [
      'La barra espaciadora se pulsa con un pulgar, el que te resulte cómodo. Nunca con otro dedo, porque eso obliga a sacar la mano de su sitio.',
      'Prueba a darle una vez sin mover el resto de los dedos de la fila de reposo.',
    ],
    guia: ['Space'],
    pide: [{ code: 'Space', comoSeLlama: 'la barra espaciadora', dedo: 'thumb' }],
  },
  {
    titulo: 'Y ahora, lo difícil: no mirar',
    cuerpo: [
      'Al principio vas a ir lento y vas a querer mirar el teclado. Es normal y le pasa a todo el mundo.',
      'Mirar es justo lo que impide aprender: mientras los ojos buscan la tecla, los dedos no memorizan dónde estaba. Se avanza más yendo despacio sin mirar que rápido mirando.',
      'Si te pierdes, busca los relieves de la F y la J con los índices y vuelve a empezar. Para eso están.',
      'Ya puedes ir a la primera lección. Esta pantalla se queda aquí por si quieres repasarla.',
    ],
    guia: REPOSO,
  },
];
