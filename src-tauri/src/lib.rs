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
        // Perfiles: un equipo de aula lo comparten varios alumnos. Todo lo que
        // ya había pasa al perfil 1, «Principal». Va en una transacción (sqlx
        // envuelve cada migración en una), así que o se aplica entera o no se
        // aplica. `teclas` se rehace porque su clave pasa de `code` a
        // `(perfil, code)`, y en SQLite eso no se puede cambiar con un ALTER.
        // La columna `perfil` de `sesiones` no lleva REFERENCES: con las claves
        // foráneas activas, SQLite no deja añadir una con valor por defecto.
        Migration {
            version: 3,
            description: "perfiles locales",
            sql: "
            CREATE TABLE IF NOT EXISTS perfiles (
                id         INTEGER PRIMARY KEY AUTOINCREMENT,
                alias      TEXT    NOT NULL,
                creado_en  TEXT    NOT NULL
            );
            INSERT INTO perfiles (id, alias, creado_en)
                VALUES (1, 'Principal', strftime('%Y-%m-%dT%H:%M:%fZ', 'now'));
            ALTER TABLE sesiones ADD COLUMN perfil INTEGER NOT NULL DEFAULT 1;
            CREATE INDEX IF NOT EXISTS idx_sesiones_perfil
                ON sesiones (perfil, leccion);
            CREATE TABLE teclas_por_perfil (
                perfil    INTEGER NOT NULL,
                code      TEXT    NOT NULL,
                intentos  INTEGER NOT NULL,
                aciertos  INTEGER NOT NULL,
                ms_total  INTEGER NOT NULL,
                PRIMARY KEY (perfil, code)
            );
            INSERT INTO teclas_por_perfil (perfil, code, intentos, aciertos, ms_total)
                SELECT 1, code, intentos, aciertos, ms_total FROM teclas;
            DROP TABLE teclas;
            ALTER TABLE teclas_por_perfil RENAME TO teclas;
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
fn copiar_antes_de_migrar(dir: &Path, version: i64) -> std::io::Result<Option<PathBuf>> {
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

/// El contenido de la política del sistema, o "" si no hay.
///
/// Solo lee: interpretar el JSON se hace en `src/lib/politica.ts`, que se
/// puede probar sin compilar Rust. La ruta es fija y fuera del alcance del
/// usuario normal a propósito: una variable de entorno la podría cambiar
/// cualquiera, y entonces no sería una política.
#[tauri::command]
fn politica_del_sistema() -> String {
    let ruta = ruta_politica();
    std::fs::read_to_string(ruta).unwrap_or_default()
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
            politica_del_sistema
        ])
        // Guardar y abrir copias de seguridad con el diálogo del sistema. El
        // `<a download>` de siempre no guarda nada en WKWebView ni en
        // WebKitGTK. El diálogo añade al ámbito de fs solo el fichero elegido.
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
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

        // Versión 3: perfiles
        assert_eq!(migs[2].version, 3);
        assert!(migs[2].sql.contains("CREATE TABLE IF NOT EXISTS perfiles"));
        assert_eq!(version_esquema(), 3);

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
}
