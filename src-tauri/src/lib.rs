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
    }]
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(
            tauri_plugin_sql::Builder::default()
                .add_migrations("sqlite:libretype.db", migraciones())
                .build(),
        )
        .setup(|app| {
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
