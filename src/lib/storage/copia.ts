/**
 * Guardar y abrir copias de seguridad en disco.
 *
 * En el navegador basta con un `Blob` y un `<a download>`. En la aplicación de
 * escritorio no: WKWebView y WebKitGTK no tienen una carpeta de descargas a la
 * que mandar ese enlace, y el clic puede no guardar nada sin avisar. Como la
 * copia es la única salida de los datos del alumno (y lo que el docente
 * recoge para el informe), en escritorio se usa el diálogo nativo «Guardar
 * como» y se escribe el fichero elegido con `plugin-fs`; el diálogo añade al
 * ámbito de fs solo ese fichero.
 *
 * Igual que `actualizacion.ts`, este módulo no importa `@tauri-apps/*` en el
 * cuerpo: lo carga en diferido y recibe la API por parámetro en los tests.
 */

export interface ArchivoLeido {
  nombre: string;
  contenido: string;
}

/** Lo que hace falta del sistema de ficheros. */
export interface ApiArchivos {
  /** Pregunta dónde guardar y escribe. Devuelve la ruta, o null si se canceló. */
  guardar(nombreSugerido: string, contenido: string, tipo?: TipoArchivo): Promise<string | null>;
  /** Pregunta qué abrir. Devuelve [] si se canceló. */
  abrir(multiple: boolean): Promise<ArchivoLeido[]>;
}

/** Copias de seguridad (JSON) o informes para el docente (una página HTML). */
export type TipoArchivo = 'json' | 'html';

const FILTROS: Record<TipoArchivo, { name: string; extensions: string[] }[]> = {
  json: [{ name: 'Copia de LibreType', extensions: ['json'] }],
  html: [{ name: 'Página web', extensions: ['html'] }],
};
const MIME: Record<TipoArchivo, string> = {
  json: 'application/json;charset=utf-8',
  html: 'text/html;charset=utf-8',
};

/** `libretype-progreso-2026-10-06.json`, o con el alias si lo hay. */
export function nombreCopia(alias?: string, hoy = new Date()): string {
  const fecha = hoy.toISOString().slice(0, 10);
  const limpio = alias
    ?.normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/[^A-Za-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase();
  return limpio ? `libretype-${limpio}-${fecha}.json` : `libretype-progreso-${fecha}.json`;
}

/** El alias que lleva dentro una copia, para ponerlo en el nombre del fichero. */
function aliasDe(json: string): string | undefined {
  try {
    const alias = (JSON.parse(json) as { perfil?: { alias?: unknown } })?.perfil?.alias;
    return typeof alias === 'string' ? alias : undefined;
  } catch {
    return undefined;
  }
}

/** El nombre de fichero de una ruta, con barras de Windows o de Unix. */
const nombreDe = (ruta: string) => ruta.split(/[\\/]/).pop() ?? ruta;

/**
 * La API nativa si estamos en escritorio y los plugins responden; si no, null
 * y quien llama usa lo del navegador.
 */
export async function cargarApiNativa(): Promise<ApiArchivos | null> {
  try {
    const { isTauri } = await import('@tauri-apps/api/core');
    if (!isTauri()) return null;
    const dialogo = await import('@tauri-apps/plugin-dialog');
    const fs = await import('@tauri-apps/plugin-fs');
    return {
      async guardar(nombreSugerido, contenido, tipo = 'json') {
        const ruta = await dialogo.save({ defaultPath: nombreSugerido, filters: FILTROS[tipo] });
        if (!ruta) return null;
        await fs.writeTextFile(ruta, contenido);
        return ruta;
      },
      async abrir(multiple) {
        const elegido = (await dialogo.open({ multiple, directory: false, filters: FILTROS.json })) as
          string | string[] | null;
        if (!elegido) return [];
        const rutas = Array.isArray(elegido) ? elegido : [elegido];
        return Promise.all(rutas.map(async (r) => ({
          nombre: nombreDe(r),
          contenido: await fs.readTextFile(r),
        })));
      },
    };
  } catch {
    return null;
  }
}

/** La descarga de siempre, que en el navegador funciona. */
function descargarEnNavegador(nombre: string, contenido: string, tipo: TipoArchivo): void {
  const blob = new Blob([contenido], { type: MIME[tipo] });
  const url = URL.createObjectURL(blob);
  const enlace = document.createElement('a');
  enlace.href = url;
  enlace.download = nombre;
  document.body.appendChild(enlace);
  enlace.click();
  document.body.removeChild(enlace);
  URL.revokeObjectURL(url);
}

/**
 * Guarda una copia. Devuelve `false` si la persona canceló el diálogo, para no
 * decirle que se guardó algo que no se guardó.
 */
export async function guardarCopia(
  contenido: string,
  nombre = nombreCopia(aliasDe(contenido)),
  api?: ApiArchivos | null,
): Promise<boolean> {
  return guardarArchivo(contenido, nombre, 'json', api);
}

/** Lo mismo para cualquier fichero que la app ofrezca guardar. */
export async function guardarArchivo(
  contenido: string,
  nombre: string,
  tipo: TipoArchivo,
  api?: ApiArchivos | null,
): Promise<boolean> {
  const nativa = api === undefined ? await cargarApiNativa() : api;
  if (!nativa) {
    descargarEnNavegador(nombre, contenido, tipo);
    return true;
  }
  return (await nativa.guardar(nombre, contenido, tipo)) !== null;
}

/**
 * Abre una o varias copias con el diálogo nativo.
 *
 * Devuelve null si no hay diálogo nativo (navegador): entonces quien llama
 * usa su `<input type="file">`, que ahí funciona y es accesible por teclado.
 */
export async function abrirCopiasNativas(
  multiple: boolean,
  api?: ApiArchivos | null,
): Promise<ArchivoLeido[] | null> {
  const nativa = api === undefined ? await cargarApiNativa() : api;
  if (!nativa) return null;
  return nativa.abrir(multiple);
}

/** Lee los ficheros de un `<input type="file">`. */
export async function leerArchivos(archivos: FileList | readonly File[] | null | undefined): Promise<ArchivoLeido[]> {
  return Promise.all([...(archivos ?? [])].map(async (f) => ({ nombre: f.name, contenido: await f.text() })));
}
