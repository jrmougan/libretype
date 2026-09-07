/**
 * Buscar e instalar actualizaciones de la aplicación.
 *
 * Es lo único de LibreType que habla con un servidor remoto, así que conviene
 * decir con precisión qué hace y qué no: pide un fichero JSON público en
 * GitHub y compara versiones. No envía progreso, ni identificadores, ni nada
 * del alumno; lo único que ve el otro lado es lo que ve cualquier descarga
 * (una IP y la versión que se pide). Se puede desactivar en Ajustes.
 *
 * Dos reglas de producto que están aquí dentro y no son parámetros a tocar:
 *
 * - **Nunca instala sola.** Instalar reinicia la app, y reiniciar a mitad de
 *   una lección tira por la borda el intento. La descarga arranca solo cuando
 *   la persona la pide, y el reinicio también.
 * - **Fallar es silencioso.** Sin red, con GitHub caído o con la clave de
 *   firma mal puesta, aquí no pasa nada: se puede practicar igual. El error
 *   solo se enseña si alguien pulsó «Buscar actualizaciones» y por tanto está
 *   esperando una respuesta.
 *
 * La lógica no importa `@tauri-apps/*` directamente: recibe la API por
 * parámetro. Así se prueba entera en jsdom, que es donde corre `pnpm test`,
 * sin necesitar el escritorio. Es el mismo motivo por el que `almacen.ts`
 * tiene dos backends.
 */

/** Lo que la interfaz necesita saber. Un solo valor, sin banderas sueltas que puedan contradecirse. */
export type EstadoActualizacion =
  /** Ni se ha buscado ni se va a buscar (navegador, o desactivado en Ajustes). */
  | { fase: 'inactivo' }
  | { fase: 'buscando' }
  | { fase: 'al-dia'; version: string }
  | { fase: 'disponible'; version: string; notas: string }
  /** `pct` es -1 cuando el servidor no dice el tamaño: entonces la barra va indeterminada. */
  | { fase: 'descargando'; version: string; pct: number }
  | { fase: 'lista'; version: string }
  | { fase: 'error'; mensaje: string };

/** Los eventos de descarga del plugin, reducidos a lo que usamos. */
export type EventoDescarga =
  | { event: 'Started'; data?: { contentLength?: number } }
  | { event: 'Progress'; data?: { chunkLength?: number } }
  | { event: 'Finished' };

/** Una actualización encontrada, lista para descargar. */
export interface ActualizacionDisponible {
  readonly version: string;
  /** Notas de la release. Puede venir vacío. */
  readonly notas?: string;
  descargarEInstalar(alProgresar: (ev: EventoDescarga) => void): Promise<void>;
}

/**
 * La parte que depende de Tauri. En los tests se sustituye por un doble; en el
 * navegador no existe y el actualizador se queda en 'inactivo'.
 */
export interface ApiActualizador {
  /** La versión que corre ahora, para poder decir «estás al día en la 0.2.0». */
  versionActual(): Promise<string>;
  comprobar(): Promise<ActualizacionDisponible | null>;
  reiniciar(): Promise<void>;
}

export interface Actualizador {
  /**
   * Busca una actualización.
   *
   * @param manual `true` si lo ha pedido la persona desde Ajustes. Cambia solo
   * una cosa: si falla, se cuenta. Una comprobación de arranque que falla no
   * puede llenar la barra de avisos que nadie pidió.
   */
  comprobar(manual?: boolean): Promise<void>;
  /** Descarga e instala. Solo se llama desde un clic explícito. */
  instalar(): Promise<void>;
  /** Reinicia para que la versión nueva entre. También desde un clic. */
  reiniciar(): Promise<void>;
}

/** Un mensaje legible a partir de lo que sea que nos hayan lanzado. */
function mensajeDe(e: unknown): string {
  if (e instanceof Error && e.message.trim()) return e.message;
  if (typeof e === 'string' && e.trim()) return e;
  return 'No se ha podido comprobar si hay una versión nueva.';
}

/**
 * El actualizador, como máquina de estados sin interfaz.
 *
 * Publica los cambios por `onEstado` en vez de guardarlos: el estado reactivo
 * vive en el componente, y así este fichero se puede probar con una función
 * que apunte los estados en un array.
 */
export function crearActualizador(
  api: ApiActualizador,
  onEstado: (e: EstadoActualizacion) => void,
): Actualizador {
  /** La actualización encontrada, que hace falta guardar para poder instalarla luego. */
  let pendiente: ActualizacionDisponible | null = null;
  /** Evita que dos clics seguidos lancen dos descargas del mismo fichero. */
  let ocupado = false;

  async function comprobar(manual = false): Promise<void> {
    if (ocupado) return;
    ocupado = true;
    if (manual) onEstado({ fase: 'buscando' });
    try {
      const encontrada = await api.comprobar();
      if (!encontrada) {
        pendiente = null;
        // Sin novedad y sin que nadie pregunte, no se dice nada: un «estás al
        // día» que aparece solo es ruido en una barra que comparte sitio con
        // las métricas de la lección.
        if (manual) onEstado({ fase: 'al-dia', version: await api.versionActual() });
        else onEstado({ fase: 'inactivo' });
        return;
      }
      pendiente = encontrada;
      onEstado({
        fase: 'disponible',
        version: encontrada.version,
        notas: encontrada.notas ?? '',
      });
    } catch (e) {
      pendiente = null;
      onEstado(manual ? { fase: 'error', mensaje: mensajeDe(e) } : { fase: 'inactivo' });
    } finally {
      ocupado = false;
    }
  }

  async function instalar(): Promise<void> {
    const act = pendiente;
    if (!act || ocupado) return;
    ocupado = true;

    // El tamaño llega en el primer evento y puede no llegar nunca. Mientras no
    // se sepa, pct es -1 y la barra va indeterminada en vez de mentir con un 0%
    // que no se mueve.
    let total = 0;
    let hechos = 0;
    const publicar = () =>
      onEstado({
        fase: 'descargando',
        version: act.version,
        pct: total > 0 ? Math.min(100, Math.round((hechos / total) * 100)) : -1,
      });

    publicar();
    try {
      await act.descargarEInstalar((ev) => {
        if (ev.event === 'Started') {
          total = ev.data?.contentLength ?? 0;
          hechos = 0;
          publicar();
        } else if (ev.event === 'Progress') {
          hechos += ev.data?.chunkLength ?? 0;
          publicar();
        } else if (ev.event === 'Finished') {
          onEstado({ fase: 'lista', version: act.version });
        }
      });
      // Hay plataformas donde no llega 'Finished'. Si la promesa se resuelve,
      // la instalación terminó: se anuncia igual o se quedaría descargando
      // para siempre a ojos de quien mira.
      onEstado({ fase: 'lista', version: act.version });
    } catch (e) {
      // Aquí sí se cuenta aunque no fuera manual: hubo un clic y una espera.
      onEstado({ fase: 'error', mensaje: mensajeDe(e) });
    } finally {
      ocupado = false;
    }
  }

  async function reiniciar(): Promise<void> {
    try {
      await api.reiniciar();
    } catch (e) {
      onEstado({ fase: 'error', mensaje: mensajeDe(e) });
    }
  }

  return { comprobar, instalar, reiniciar };
}

/**
 * Dónde estamos y quién se encarga de actualizar.
 *
 * No son tres estados por gusto: en un paquete instalado con apt o dnf, el
 * actualizador de Tauri intenta `dpkg -i` / `rpm -U`, que como usuario normal
 * falla por permisos. Y si funcionara sería peor: estaría tocando por detrás
 * un fichero del que manda el gestor de paquetes. Ahí no se ofrece el botón,
 * se dice quién se encarga.
 */
export type Entorno =
  /** Navegador: no hay nada que actualizar. */
  | { tipo: 'sin-actualizador' }
  /** Instalado con apt o dnf; actualiza el sistema. */
  | { tipo: 'gestionado'; gestor: 'deb' | 'rpm' }
  /** AppImage, .app, msi o nsis: se actualiza a sí misma. */
  | { tipo: 'propio'; api: ApiActualizador };

/** Empaquetados donde el gestor de paquetes es el dueño del fichero. */
const GESTIONADOS = ['deb', 'rpm'] as const;

/**
 * Averigua el entorno, con todo cargado en diferido.
 *
 * Los imports van dentro por eso: en `pnpm dev` (navegador)
 * `@tauri-apps/plugin-updater` no tiene con quién hablar, y cargarlo arriba
 * rompería el arranque en el sitio donde se desarrolla el frontend.
 */
export async function detectarEntorno(): Promise<Entorno> {
  try {
    const { isTauri, invoke } = await import('@tauri-apps/api/core');
    if (!isTauri()) return { tipo: 'sin-actualizador' };

    // Lo estampa el bundler al empaquetar, así que dice cómo se instaló esto
    // de verdad y no lo que se pueda deducir del sistema operativo.
    const empaquetado = await invoke<string>('tipo_de_paquete');
    const gestionado = GESTIONADOS.find((g) => g === empaquetado);
    if (gestionado) return { tipo: 'gestionado', gestor: gestionado };

    const { check } = await import('@tauri-apps/plugin-updater');
    const { getVersion } = await import('@tauri-apps/api/app');

    const api: ApiActualizador = {
      versionActual: () => getVersion(),
      async comprobar() {
        const u = await check();
        if (!u) return null;
        return {
          version: u.version,
          notas: u.body ?? '',
          descargarEInstalar: (alProgresar) => u.downloadAndInstall(alProgresar),
        };
      },
      async reiniciar() {
        const { relaunch } = await import('@tauri-apps/plugin-process');
        await relaunch();
      },
    };
    return { tipo: 'propio', api };
  } catch {
    // Sin plugin instalado o sin permisos en la capability. Que no se pueda
    // actualizar no puede impedir practicar.
    return { tipo: 'sin-actualizador' };
  }
}
