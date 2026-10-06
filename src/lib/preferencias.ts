/**
 * Preferencias de la interfaz.
 *
 * Se guardan siempre, y esto no es un extra: alguien que necesita el texto al
 * 200% o el alto contraste no puede tener que volver a configurarlo cada vez
 * que abre la aplicación. Perder ese ajuste convierte la app en inusable para
 * quien depende de él.
 *
 * Van en localStorage y no en la base de datos a propósito: son preferencias de
 * este equipo y esta pantalla, no progreso del alumno.
 */

/**
 * El tono cambia **cómo habla y se ve** la aplicación, no cuánto se ve.
 *
 * Es la respuesta a un problema real: la investigación de usabilidad con
 * personas mayores le llama «design disqualification», la sensación de quedarse
 * fuera al ver una interfaz hecha para gente joven. Un tutor lleno de premios y
 * confeti le está diciendo a un adulto que la aplicación no es para él; uno
 * gris y serio no engancha a un niño de ocho años.
 *
 * La salida no es un punto medio, que sale soso para el niño y aún infantil
 * para el adulto. Es una base común y una capa de tono elegible. Y cambia el
 * tono, **nunca el tamaño**: el tamaño lo necesitan los dos y vive en sus
 * propios ajustes.
 */
export type Tono = 'juego' | 'sobrio';

import { LESSONS } from './lessons';

export interface Preferencias {
  /** Escala del texto, de 1 a 2. */
  escala: number;
  tema: 'auto' | 'claro' | 'oscuro';
  movimiento: 'auto' | 'reducido';
  fuente: 'normal' | 'dislexia';
  /** null = todavía no ha elegido; hay que preguntárselo. */
  tono: Tono | null;
  /** Si el teclado en pantalla retira las letras dominadas. */
  ayudaTeclado: 'auto' | 'siempre';
  /**
   * Si la app mira al arrancar si hay una versión nueva.
   *
   * Es la única petición de red que hace LibreType, así que tiene que poder
   * apagarse: en un aula puede no interesar, y la promesa de no hablar con
   * ningún servidor es parte de lo que se le ofrece a quien la instala.
   *
   * Viene activada porque el público al que sirve esto —personas mayores,
   * niños, ordenadores compartidos de un colegio— no va a ir a mirar si hay
   * versión nueva, y quedarse con un fallo ya arreglado es peor que la
   * consulta. Sin ella la actualización sigue siendo posible a mano.
   */
  buscarActualizaciones: boolean;
  /** Última lección seleccionada por el alumno para recordar por dónde iba. */
  ultimaLeccion?: string;
  /** Identificador de la distribución seleccionada (p. ej. 'es-iso'). */
  layout: string;

  // --- Fase 2: para cualquier edad -----------------------------------------

  /**
   * Alto contraste propio. En Linux y macOS no existe `forced-colors`, así que
   * si la app no lo trae, quien lo necesita no lo tiene. 'auto' sigue a
   * `prefers-contrast: more` del sistema; 'normal' lo apaga aunque el sistema
   * lo pida, por si alguien lo tiene activado para otras aplicaciones.
   */
  contraste: 'auto' | 'normal' | 'alto';
  /**
   * Longitud de los textos de práctica generados. Ver `palabrasPorTexto()`:
   * es el único sitio del que debe sacar la cifra cualquier generador.
   */
  longitudTexto: LongitudTexto;
  /**
   * Minutos de práctica tras los que se sugiere una pausa; 0 lo apaga. Nunca
   * bloquea: es un aviso que se cierra y ya.
   */
  recordatorioPausa: number;
  /**
   * Ignorar la repetición involuntaria de un mismo carácter en muy poco
   * tiempo (temblor). Viene apagado: a quien no lo necesita le podría comer
   * una doble letra legítima tecleada muy rápido. Ver `keyboard/temblor.ts`.
   */
  ignorarRepeticion: boolean;
}

/**
 * Longitud de los textos de práctica.
 *
 * Con temblor, fatiga o poca atención sostenida, un texto largo cansa antes de
 * terminar; a quien ya va suelto, uno corto se le queda en nada.
 */
export type LongitudTexto = 'corto' | 'normal' | 'largo';

/**
 * Palabras por texto generado según la longitud elegida.
 *
 * **Contrato para los generadores de texto** (práctica continua, fluidez y el
 * generador de lecciones de la fase 1): la cantidad de palabras sale de aquí,
 * con `palabrasPorTexto(prefs.longitudTexto)`, y no de una cifra propia. Así la
 * preferencia vale igual en todos los modos.
 */
export const PALABRAS_POR_LONGITUD: Readonly<Record<LongitudTexto, number>> = {
  corto: 10,
  normal: 20,
  largo: 40,
};

export function palabrasPorTexto(longitud: LongitudTexto): number {
  return PALABRAS_POR_LONGITUD[longitud] ?? PALABRAS_POR_LONGITUD.normal;
}

/** Opciones del recordatorio de pausa, en minutos. 0 es «no avisar». */
export const MINUTOS_PAUSA = [0, 15, 20, 30, 45] as const;

export const POR_DEFECTO: Preferencias = {
  escala: 1,
  tema: 'auto',
  movimiento: 'auto',
  fuente: 'normal',
  tono: null,
  ayudaTeclado: 'auto',
  buscarActualizaciones: true,
  ultimaLeccion: LESSONS[0]?.id ?? 'reposo',
  layout: 'es-iso',
  contraste: 'auto',
  longitudTexto: 'normal',
  recordatorioPausa: 20,
  ignorarRepeticion: false,
};

const CLAVE = 'libretype.preferencias';

const enRango = (n: unknown, min: number, max: number, sino: number): number =>
  typeof n === 'number' && Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : sino;

const unaDe = <T extends string>(v: unknown, opciones: readonly T[], sino: T): T =>
  typeof v === 'string' && (opciones as readonly string[]).includes(v) ? (v as T) : sino;

/**
 * Normaliza lo que venga de disco. Un valor corrupto o de una versión anterior
 * no puede dejar la aplicación en un estado raro: se cae al valor por defecto.
 */
export function normalizar(crudo: unknown): Preferencias {
  const o = (typeof crudo === 'object' && crudo !== null ? crudo : {}) as Record<string, unknown>;
  const movimientoCrudo = o.movimiento ?? (o.animaciones === 'reducidas' ? 'reducido' : undefined);
  const leccionValida =
    typeof o.ultimaLeccion === 'string' &&
    LESSONS.some((l) => l.id === o.ultimaLeccion);

  return {
    escala: enRango(o.escala, 1, 2, POR_DEFECTO.escala),
    tema: unaDe(o.tema, ['auto', 'claro', 'oscuro'] as const, POR_DEFECTO.tema),
    movimiento: unaDe(movimientoCrudo, ['auto', 'reducido'] as const, POR_DEFECTO.movimiento),
    fuente: unaDe(o.fuente, ['normal', 'dislexia'] as const, POR_DEFECTO.fuente),
    tono: o.tono === 'juego' || o.tono === 'sobrio' ? o.tono : null,
    ayudaTeclado: unaDe(o.ayudaTeclado, ['auto', 'siempre'] as const, POR_DEFECTO.ayudaTeclado),
    // Solo un `false` explícito apaga la búsqueda. Un valor corrupto vuelve al
    // de por defecto como todo lo demás, pero aquí importa el otro lado: quien
    // la desactivó a propósito no puede encontrársela encendida otra vez.
    buscarActualizaciones:
      typeof o.buscarActualizaciones === 'boolean'
        ? o.buscarActualizaciones
        : POR_DEFECTO.buscarActualizaciones,
    ultimaLeccion: leccionValida ? (o.ultimaLeccion as string) : (POR_DEFECTO.ultimaLeccion ?? LESSONS[0].id),
    layout: typeof o.layout === 'string' && o.layout.trim() ? o.layout.trim() : POR_DEFECTO.layout,
    contraste: unaDe(o.contraste, ['auto', 'normal', 'alto'] as const, POR_DEFECTO.contraste),
    longitudTexto: unaDe(o.longitudTexto, ['corto', 'normal', 'largo'] as const, POR_DEFECTO.longitudTexto),
    recordatorioPausa: (MINUTOS_PAUSA as readonly unknown[]).includes(o.recordatorioPausa)
      ? (o.recordatorioPausa as number)
      : POR_DEFECTO.recordatorioPausa,
    ignorarRepeticion:
      typeof o.ignorarRepeticion === 'boolean' ? o.ignorarRepeticion : POR_DEFECTO.ignorarRepeticion,
  };
}

export function cargar(): Preferencias {
  try {
    const crudo = localStorage.getItem(CLAVE);
    return normalizar(crudo ? JSON.parse(crudo) : null);
  } catch {
    return { ...POR_DEFECTO };
  }
}

export function guardar(p: Preferencias): void {
  try {
    localStorage.setItem(CLAVE, JSON.stringify(p));
  } catch { /* modo privado o cuota llena: se sigue pudiendo practicar */ }
}

/** Vuelca las preferencias al elemento raíz, que es de donde leen los tokens. */
export function aplicar(p: Preferencias, raiz: HTMLElement): void {
  raiz.style.setProperty('--ui-scale', String(p.escala));

  const atributo = (nombre: string, valor: string | null) =>
    valor === null ? raiz.removeAttribute(nombre) : raiz.setAttribute(nombre, valor);

  atributo('data-theme', p.tema === 'auto' ? null : p.tema === 'claro' ? 'light' : 'dark');
  const reducido = p.movimiento === 'reducido' || (p as unknown as Record<string, unknown>).animaciones === 'reducidas';
  atributo('data-motion', reducido ? 'reducido' : null);
  atributo('data-font', p.fuente === 'dislexia' ? 'dyslexic' : null);
  atributo('data-tono', p.tono);
  // Sin atributo manda `prefers-contrast` del sistema (ver tokens.css).
  atributo('data-contrast', p.contraste === 'auto' ? null : p.contraste);
}
