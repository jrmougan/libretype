/**
 * Política del equipo, para instalaciones gestionadas (aula, biblioteca,
 * centro de mayores).
 *
 * Quien administra los equipos deja un JSON en una ruta del sistema que el
 * usuario normal no puede tocar (ver `docs/instalacion-gestionada.md`):
 *
 *     { "actualizaciones": false, "perfilPorDefecto": "Aula 2" }
 *
 * - `actualizaciones: false` apaga el actualizador entero: ni comprueba ni
 *   ofrece el botón. En un aula las versiones las decide el centro, y la
 *   comprobación es la única petición de red de la app.
 * - `perfilPorDefecto` abre la aplicación directamente con ese perfil (y lo
 *   crea si no existe), sin preguntar «¿Quién practica?». Sirve para el
 *   ordenador de una biblioteca donde nadie quiere un perfil propio. Cambiar de
 *   perfil sigue siendo posible desde el panel de progreso.
 *
 * Rust solo lee el fichero (`politica_del_sistema` en `lib.rs`); interpretarlo
 * se hace aquí para poder probarlo sin compilar.
 */

export interface Politica {
  /** `false` si el administrador apagó las actualizaciones. */
  actualizaciones: boolean;
  /** Alias del perfil con el que se abre la app, o null para preguntar. */
  perfilPorDefecto: string | null;
}

export const SIN_POLITICA: Politica = { actualizaciones: true, perfilPorDefecto: null };

/**
 * Interpreta el contenido del fichero.
 *
 * Vacío es que no hay política. Un fichero que existe pero no se entiende
 * se toma con las actualizaciones apagadas: alguien quiso configurar el equipo
 * y no sabemos qué, y de las dos formas de equivocarse, no hablar con ningún
 * servidor es la que no sorprende a nadie.
 */
export function normalizarPolitica(texto: string): Politica {
  if (!texto.trim()) return { ...SIN_POLITICA };
  let datos: unknown;
  try {
    datos = JSON.parse(texto);
  } catch {
    console.warn('[libretype] la política del sistema no es un JSON válido; se apagan las actualizaciones');
    return { ...SIN_POLITICA, actualizaciones: false };
  }
  if (!datos || typeof datos !== 'object' || Array.isArray(datos)) {
    return { ...SIN_POLITICA, actualizaciones: false };
  }
  const o = datos as Record<string, unknown>;
  const perfil = typeof o.perfilPorDefecto === 'string' ? o.perfilPorDefecto.trim() : '';
  return {
    actualizaciones: o.actualizaciones !== false,
    perfilPorDefecto: perfil || null,
  };
}

let enCurso: Promise<Politica> | null = null;

/**
 * Lee la política una vez por arranque. Fuera del escritorio, o si el binario
 * es anterior al comando, no hay política.
 *
 * @param invocar sustituye a `invoke` de Tauri en los tests.
 */
export function leerPolitica(invocar?: (comando: string) => Promise<string>): Promise<Politica> {
  if (invocar) return leer(invocar);
  enCurso ??= leer();
  return enCurso;
}

async function leer(invocar?: (comando: string) => Promise<string>): Promise<Politica> {
  try {
    if (!invocar) {
      const { isTauri, invoke } = await import('@tauri-apps/api/core');
      if (!isTauri()) return { ...SIN_POLITICA };
      invocar = (comando) => invoke<string>(comando);
    }
    return normalizarPolitica(await invocar('politica_del_sistema'));
  } catch {
    return { ...SIN_POLITICA };
  }
}
