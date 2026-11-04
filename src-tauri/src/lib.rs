use std::fs::OpenOptions;
use std::io::{self, ErrorKind, Write};
use std::path::{Path, PathBuf};

use tauri::Manager;
use tauri_plugin_sql::{Migration, MigrationKind};

/// El progreso vive en un SQLite local, en el directorio de datos de la app.
/// No hay cuentas ni servidor: con menores de por medio, lo que no se recoge
/// no hay que protegerlo.
fn migraciones() -> Vec<Migration> {
    vec![
        Migration {
            version: 1,
            description: "sesiones de practica",
            sql: "
            CREATE TABLE IF NOT EXISTS sesiones (
                id            INTEGER PRIMARY KEY AUTOINCREMENT,
                leccion       TEXT    NOT NULL,
                ppm           INTEGER NOT NULL,
                pct_acierto   INTEGER NOT NULL,
                aciertos      INTEGER NOT NULL,
                escritos      INTEGER NOT NULL,
                ms            INTEGER NOT NULL,
                terminada_en  TEXT    NOT NULL
            );
            CREATE INDEX IF NOT EXISTS idx_sesiones_leccion
                ON sesiones (leccion);
        ",
            kind: MigrationKind::Up,
        },
        Migration {
            version: 2,
            description: "dominio por tecla",
            sql: "
            CREATE TABLE IF NOT EXISTS teclas (
                code      TEXT    PRIMARY KEY,
                intentos  INTEGER NOT NULL,
                aciertos  INTEGER NOT NULL,
                ms_total  INTEGER NOT NULL
            );
        ",
            kind: MigrationKind::Up,
        },
        Migration {
            version: 3,
            description: "lecciones personalizadas",
            sql: "
            CREATE TABLE IF NOT EXISTS lecciones_propias (
                id              TEXT PRIMARY KEY,
                titulo          TEXT NOT NULL,
                descripcion     TEXT NOT NULL DEFAULT '',
                texto           TEXT NOT NULL,
                creada_en       TEXT NOT NULL,
                actualizada_en  TEXT NOT NULL,
                borrada_en      TEXT
            );
        ",
            kind: MigrationKind::Up,
        },
    ]
}

/// Tope de lo que se puede escribir de una vez. Una copia de seguridad enorme
/// sigue siendo unos pocos megas; más que esto no sale de esta aplicación.
const MAX_BYTES_FICHERO: usize = 64 * 1024 * 1024;

/// El nombre lo pone la interfaz, pero por aquí no puede pasar una ruta: solo un
/// nombre plano `.json`. Con esto el comando no sabe escribir fuera de la carpeta
/// que se le da, ni crear otra cosa que un JSON.
fn nombre_valido(nombre: &str) -> bool {
    let plano = nombre
        .chars()
        .all(|c| c.is_ascii_alphanumeric() || matches!(c, '-' | '_' | '.'));
    plano && nombre.len() <= 128 && !nombre.starts_with('.') && nombre.ends_with(".json")
}

/// Crea el fichero sin pisar ninguno: si ya existe, prueba con `-1`, `-2`...
/// `create_new` lo hace atómico, sin el hueco entre comprobar y escribir.
fn escribir_sin_pisar(carpeta: &Path, nombre: &str, contenido: &str) -> io::Result<PathBuf> {
    let base = nombre.trim_end_matches(".json");
    for intento in 0..1000 {
        let candidato = if intento == 0 {
            carpeta.join(nombre)
        } else {
            carpeta.join(format!("{base}-{intento}.json"))
        };
        match OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(&candidato)
        {
            Ok(mut fichero) => {
                fichero.write_all(contenido.as_bytes())?;
                return Ok(candidato);
            }
            Err(e) if e.kind() == ErrorKind::AlreadyExists => continue,
            Err(e) => return Err(e),
        }
    }
    Err(io::Error::new(
        ErrorKind::AlreadyExists,
        "hay demasiados ficheros con ese nombre",
    ))
}

/// Guarda un JSON en la carpeta de descargas y devuelve la ruta para enseñarla.
///
/// Existe porque `<a download>` no es fiable dentro de un WebView: WebKitGTK y
/// WKWebView no tienen gestor de descargas propio. La alternativa eran dos
/// plugins (`dialog` y `fs`) con permisos más amplios; el razonamiento completo
/// está en `src/lib/ficheros.ts`.
#[tauri::command]
fn guardar_en_descargas(
    app: tauri::AppHandle,
    nombre: String,
    contenido: String,
) -> Result<String, String> {
    if !nombre_valido(&nombre) {
        return Err("El nombre del fichero no es válido.".into());
    }
    if contenido.len() > MAX_BYTES_FICHERO {
        return Err("El fichero es demasiado grande.".into());
    }
    let rutas = app.path();
    let carpeta = rutas
        .download_dir()
        .or_else(|_| rutas.document_dir())
        .or_else(|_| rutas.home_dir())
        .map_err(|_| "No se ha encontrado una carpeta donde guardar.".to_string())?;
    std::fs::create_dir_all(&carpeta)
        .and_then(|_| escribir_sin_pisar(&carpeta, &nombre, &contenido))
        .map(|ruta| ruta.to_string_lossy().into_owned())
        .map_err(|e| format!("No se ha podido guardar el fichero: {e}"))
}

/// Cómo se empaquetó este binario: "deb", "rpm", "appimage", "msi", "nsis",
/// "app" o "" si no se sabe.
///
/// Hace falta porque el actualizador de Tauri, en un paquete instalado con
/// apt o dnf, intenta `dpkg -i` / `rpm -U`, y eso como usuario normal falla
/// por permisos. Peor aún si funcionara: instalaría a espaldas del gestor de
/// paquetes, que es quien manda sobre ese fichero.
///
/// Con este dato la interfaz no llega a ofrecer el botón, y dice quién se
/// encarga en su lugar. El bundler estampa el valor al empaquetar, así que es
/// lo que de verdad se instaló y no una suposición a partir del sistema.
#[tauri::command]
fn tipo_de_paquete() -> String {
    use tauri::utils::config::BundleType;
    use tauri::utils::platform::bundle_type;
    match bundle_type() {
        Some(BundleType::Deb) => "deb",
        Some(BundleType::Rpm) => "rpm",
        Some(BundleType::AppImage) => "appimage",
        Some(BundleType::Msi) => "msi",
        Some(BundleType::Nsis) => "nsis",
        Some(BundleType::App) => "app",
        _ => "",
    }
    .to_string()
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            tipo_de_paquete,
            guardar_en_descargas
        ])
        .plugin(
            tauri_plugin_sql::Builder::default()
                .add_migrations("sqlite:libretype.db", migraciones())
                .build(),
        )
        .setup(|app| {
            // El actualizador solo en escritorio, y solo se registra: buscar,
            // descargar y reiniciar los decide la persona desde la interfaz.
            // Reiniciar a mitad de una lección tiraría el intento por la
            // borda, así que nada de esto pasa solo.
            #[cfg(desktop)]
            {
                app.handle()
                    .plugin(tauri_plugin_updater::Builder::new().build())?;
                app.handle().plugin(tauri_plugin_process::init())?;
            }

            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn migraciones_tienen_versiones_validas_y_sql_no_vacio() {
        let migs = migraciones();
        assert_eq!(migs.len(), 3, "debe haber 3 migraciones");

        // Versión 1: sesiones de práctica
        assert_eq!(migs[0].version, 1);
        assert!(migs[0].sql.contains("CREATE TABLE IF NOT EXISTS sesiones"));
        assert!(migs[0].sql.contains("idx_sesiones_leccion"));

        // Versión 2: dominio por tecla
        assert_eq!(migs[1].version, 2);
        assert!(migs[1].sql.contains("CREATE TABLE IF NOT EXISTS teclas"));

        // Versión 3: lecciones personalizadas
        assert_eq!(migs[2].version, 3);
        assert!(migs[2]
            .sql
            .contains("CREATE TABLE IF NOT EXISTS lecciones_propias"));
        assert!(migs[2].sql.contains("borrada_en"));

        // Invariantes generales
        for (idx, m) in migs.iter().enumerate() {
            assert_eq!(m.version as usize, idx + 1);
            assert!(!m.sql.trim().is_empty());
            assert!(!m.description.trim().is_empty());
        }
    }

    #[test]
    fn nombre_valido_solo_admite_un_json_plano() {
        assert!(nombre_valido("libretype-lecciones-2026-11-04.json"));
        for malo in [
            "../fuera.json",
            "a/b.json",
            "a\\b.json",
            "/etc/passwd",
            ".oculto.json",
            "script.sh",
            "lecciones.json.exe",
            "",
            "ñu.json",
        ] {
            assert!(!nombre_valido(malo), "{malo} no debería valer");
        }
        assert!(!nombre_valido(&format!("{}.json", "a".repeat(130))));
    }

    #[test]
    fn escribir_sin_pisar_conserva_lo_que_ya_habia() {
        let carpeta = std::env::temp_dir().join(format!("libretype-test-{}", std::process::id()));
        std::fs::create_dir_all(&carpeta).unwrap();

        let primero = escribir_sin_pisar(&carpeta, "copia.json", "uno").unwrap();
        let segundo = escribir_sin_pisar(&carpeta, "copia.json", "dos").unwrap();

        assert_ne!(primero, segundo);
        assert!(segundo.ends_with("copia-1.json"));
        assert_eq!(std::fs::read_to_string(&primero).unwrap(), "uno");
        assert_eq!(std::fs::read_to_string(&segundo).unwrap(), "dos");

        std::fs::remove_dir_all(&carpeta).unwrap();
    }
}
