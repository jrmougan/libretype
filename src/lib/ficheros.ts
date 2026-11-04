/**
 * Guardar un fichero en el equipo del alumno.
 *
 * `<a download>` no sirve en la aplicación de escritorio: WebKitGTK y WKWebView
 * no tienen gestor de descargas salvo que la aplicación lo implemente, así que el
 * clic puede no hacer nada y encima parecer que ha ido bien. Por eso en Tauri se
 * llama al comando `guardar_en_descargas` de `lib.rs`, que escribe en la carpeta
 * de descargas y devuelve la ruta para poder decirle a la persona dónde está.
 *
 * Se descartó `tauri-plugin-dialog` + `tauri-plugin-fs`: elegir carpeta sería algo
 * mejor, pero a cambio de dos dependencias, una en cada lado, y permisos más
 * amplios en las capacidades, para algo que Descargas resuelve. Leer no necesita
 * nada de esto: `<input type="file">` abre el selector nativo en los tres motores.
 *
 * Como `actualizacion.ts`, no importa `@tauri-apps/*` en el cuerpo: `pnpm dev` en
 * el navegador tiene que seguir vivo, y en tests la API entra por parámetro.
 */
export type Invocar = (comando: string, argumentos: Record<string, unknown>) => Promise<unknown>;

export interface Guardado {
  /** Ruta completa en escritorio; null en el navegador, donde la decide él. */
  ruta: string | null;
}

async function invocarDeTauri(): Promise<Invocar | null> {
  try {
    const { invoke, isTauri } = await import('@tauri-apps/api/core');
    return isTauri() ? (invoke as Invocar) : null;
  } catch {
    return null;
  }
}

function descargarEnNavegador(nombre: string, contenido: string): void {
  const blob = new Blob([contenido], { type: 'application/json;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const enlace = document.createElement('a');
  enlace.href = url;
  enlace.download = nombre;
  document.body.appendChild(enlace);
  enlace.click();
  document.body.removeChild(enlace);
  URL.revokeObjectURL(url);
}

/** Lanza si en escritorio no se ha podido escribir: hay que poder contarlo. */
export async function guardarFichero(
  nombre: string,
  contenido: string,
  cargarInvocar: () => Promise<Invocar | null> = invocarDeTauri,
): Promise<Guardado> {
  const invocar = await cargarInvocar();
  if (!invocar) {
    descargarEnNavegador(nombre, contenido);
    return { ruta: null };
  }
  const ruta = await invocar('guardar_en_descargas', { nombre, contenido });
  return { ruta: String(ruta) };
}
