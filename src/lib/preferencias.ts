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
}

export const POR_DEFECTO: Preferencias = {
  escala: 1,
  tema: 'auto',
  movimiento: 'auto',
  fuente: 'normal',
  tono: null,
  ayudaTeclado: 'auto',
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
  return {
    escala: enRango(o.escala, 1, 2, POR_DEFECTO.escala),
    tema: unaDe(o.tema, ['auto', 'claro', 'oscuro'] as const, POR_DEFECTO.tema),
    movimiento: unaDe(o.movimiento, ['auto', 'reducido'] as const, POR_DEFECTO.movimiento),
    fuente: unaDe(o.fuente, ['normal', 'dislexia'] as const, POR_DEFECTO.fuente),
    tono: o.tono === 'juego' || o.tono === 'sobrio' ? o.tono : null,
    ayudaTeclado: unaDe(o.ayudaTeclado, ['auto', 'siempre'] as const, POR_DEFECTO.ayudaTeclado),
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
  atributo('data-motion', p.movimiento === 'reducido' ? 'reducido' : null);
  atributo('data-font', p.fuente === 'dislexia' ? 'dyslexic' : null);
  atributo('data-tono', p.tono);
}
