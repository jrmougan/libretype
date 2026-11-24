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

/// El fichero que abre tauri-plugin-sql, dentro de `app_config_dir()`.
const BASE_DE_DATOS: &str = "libretype.db";
/// Junto a la base de datos: la versión del esquema que ya tiene copia hecha.
const MARCA_ESQUEMA: &str = "libretype.db.esquema";

/// La versión más alta del esquema que conoce este binario (van en orden).
fn version_esquema() -> i64 {
    migraciones().last().map_or(0, |m| m.version)
}

/// Copia la base de datos antes de que una migración nueva la toque.
///
/// Las migraciones las aplica tauri-plugin-sql al cargar la base de datos
/// desde la interfaz, que es después de `setup`. Aquí no se puede preguntar a
/// SQLite qué versión tiene sin abrirla, así que se lleva la cuenta en un
/// fichero al lado: si este binario trae un esquema más nuevo que el último
/// copiado, se copia `libretype.db` (y su `-wal`/`-shm`, si los hay) a
/// `libretype-antes-de-esquema-N.db`. Una copia que ya existe no se pisa: si
/// escribir la marca falla, el siguiente arranque no puede sustituir la copia
/// buena por una ya migrada.
///
/// Devuelve la ruta de la copia, si se hizo.
fn copiar_antes_de_migrar(dir: &Path, version: i64) -> io::Result<Option<PathBuf>> {
    let marca = dir.join(MARCA_ESQUEMA);
    let copiada: i64 = std::fs::read_to_string(&marca)
        .ok()
        .and_then(|s| s.trim().parse().ok())
        .unwrap_or(0);
    if copiada >= version {
        return Ok(None);
    }

    let db = dir.join(BASE_DE_DATOS);
    let mut copia = None;
    if db.is_file() {
        let destino = dir.join(format!("libretype-antes-de-esquema-{version}.db"));
        if !destino.exists() {
            std::fs::copy(&db, &destino)?;
            for sufijo in ["-wal", "-shm"] {
                let origen = dir.join(format!("{BASE_DE_DATOS}{sufijo}"));
                if origen.is_file() {
                    let nombre = format!("libretype-antes-de-esquema-{version}.db{sufijo}");
                    std::fs::copy(&origen, dir.join(nombre))?;
                }
            }
        }
        copia = Some(destino);
    }
    std::fs::create_dir_all(dir)?;
    std::fs::write(&marca, version.to_string())?;
    Ok(copia)
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

/// Dónde deja el administrador la política del equipo. Ver
/// `docs/instalacion-gestionada.md`.
#[cfg(target_os = "windows")]
fn ruta_politica() -> PathBuf {
    std::env::var_os("ProgramData")
        .map(PathBuf::from)
        .unwrap_or_else(|| PathBuf::from(r"C:\ProgramData"))
        .join("LibreType")
        .join("politica.json")
}

#[cfg(target_os = "macos")]
fn ruta_politica() -> PathBuf {
    PathBuf::from("/Library/Application Support/LibreType/politica.json")
}

#[cfg(not(any(target_os = "windows", target_os = "macos")))]
fn ruta_politica() -> PathBuf {
    PathBuf::from("/etc/libretype/politica.json")
}

/// Una política es un JSON de un par de campos: más que esto no es una política.
const MAX_BYTES_POLITICA: u64 = 64 * 1024;

/// Lee la política de una ruta: "" si no hay fichero, y un texto que no es JSON
/// si existe pero no se puede leer o es desmesurado, para que la interfaz lo
/// trate como ilegible (apaga las actualizaciones) y no como ausente.
fn leer_politica(ruta: &Path) -> String {
    match std::fs::metadata(ruta) {
        Err(e) if e.kind() == ErrorKind::NotFound => String::new(),
        Ok(m) if m.is_file() && m.len() <= MAX_BYTES_POLITICA => {
            std::fs::read_to_string(ruta).unwrap_or_else(|_| "ilegible".into())
        }
        _ => "ilegible".into(),
    }
}

/// El contenido de la política del sistema, o "" si no hay.
///
/// Solo lee: interpretar el JSON se hace en `src/lib/politica.ts`, que se
/// puede probar sin compilar Rust. La ruta es fija y fuera del alcance del
/// usuario normal a propósito: una variable de entorno la podría cambiar
/// cualquiera, y entonces no sería una política.
#[tauri::command]
fn politica_del_sistema() -> String {
    leer_politica(&ruta_politica())
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
            guardar_en_descargas,
            politica_del_sistema
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

            // Antes de que la interfaz cargue la base de datos y se apliquen
            // las migraciones. Que falle la copia no impide practicar.
            match app.path().app_config_dir() {
                Ok(dir) => match copiar_antes_de_migrar(&dir, version_esquema()) {
                    Ok(Some(copia)) => log::info!("copia previa a la migración en {copia:?}"),
                    Ok(None) => {}
                    Err(e) => log::warn!("no se pudo copiar la base de datos: {e}"),
                },
                Err(e) => log::warn!("sin directorio de configuración para la copia: {e}"),
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
        assert_eq!(version_esquema(), migs.len() as i64);

        // Invariantes generales
        for (idx, m) in migs.iter().enumerate() {
            assert_eq!(m.version as usize, idx + 1);
            assert!(!m.sql.trim().is_empty());
            assert!(!m.description.trim().is_empty());
        }
    }

    /// Un directorio temporal propio de cada test, para que no se pisen.
    fn dir_de_prueba(nombre: &str) -> PathBuf {
        let nombre = format!("libretype-test-{}-{nombre}", std::process::id());
        let dir = std::env::temp_dir().join(nombre);
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        dir
    }

    #[test]
    fn copia_la_base_de_datos_antes_de_un_esquema_nuevo_y_solo_una_vez() {
        let dir = dir_de_prueba("copia");
        let db = dir.join(BASE_DE_DATOS);
        std::fs::write(&db, b"version 2").unwrap();
        let wal_original = dir.join("libretype.db-wal");
        std::fs::write(&wal_original, b"wal").unwrap();

        let hecha = copiar_antes_de_migrar(&dir, 3).unwrap();
        let copia = hecha.expect("debe copiar");
        assert_eq!(std::fs::read(&copia).unwrap(), b"version 2");
        let wal = dir.join("libretype-antes-de-esquema-3.db-wal");
        assert_eq!(std::fs::read(wal).unwrap(), b"wal");

        // Ya migrada: el siguiente arranque no vuelve a copiar.
        std::fs::write(&db, b"version 3").unwrap();
        assert!(copiar_antes_de_migrar(&dir, 3).unwrap().is_none());
        assert_eq!(std::fs::read(&copia).unwrap(), b"version 2");

        // Si la marca se perdió, la copia buena tampoco se pisa.
        std::fs::remove_file(dir.join(MARCA_ESQUEMA)).unwrap();
        copiar_antes_de_migrar(&dir, 3).unwrap();
        assert_eq!(std::fs::read(&copia).unwrap(), b"version 2");

        // Un esquema posterior sí hace su propia copia, con lo que haya entonces.
        let siguiente = copiar_antes_de_migrar(&dir, 4)
            .unwrap()
            .expect("debe copiar");
        assert!(siguiente.ends_with("libretype-antes-de-esquema-4.db"));
        assert_eq!(std::fs::read(&siguiente).unwrap(), b"version 3");
        assert_eq!(std::fs::read(&copia).unwrap(), b"version 2");

        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn en_una_instalacion_nueva_no_hay_nada_que_copiar() {
        let dir = dir_de_prueba("nueva");
        assert!(copiar_antes_de_migrar(&dir, 3).unwrap().is_none());
        let marca = std::fs::read_to_string(dir.join(MARCA_ESQUEMA)).unwrap();
        assert_eq!(marca, "3");
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn la_politica_ausente_es_vacia_y_la_ilegible_no() {
        let dir = dir_de_prueba("politica");
        let ruta = dir.join("politica.json");

        // Sin fichero no hay política: todo sigue como siempre.
        assert_eq!(leer_politica(&ruta), "");

        std::fs::write(&ruta, r#"{ "actualizaciones": false }"#).unwrap();
        assert_eq!(leer_politica(&ruta), r#"{ "actualizaciones": false }"#);

        // Bytes que no son UTF-8, o un directorio en su lugar: existe pero no se
        // entiende, y eso no puede confundirse con que no haya política.
        std::fs::write(&ruta, [0xff, 0xfe, 0x00]).unwrap();
        assert_eq!(leer_politica(&ruta), "ilegible");
        std::fs::remove_file(&ruta).unwrap();
        std::fs::create_dir(&ruta).unwrap();
        assert_eq!(leer_politica(&ruta), "ilegible");

        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn la_ruta_de_la_politica_es_fija_y_del_sistema() {
        let ruta = ruta_politica();
        assert!(ruta.is_absolute());
        assert!(ruta.ends_with("politica.json"));
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
