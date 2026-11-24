# Instalación gestionada: aulas, bibliotecas y centros de mayores

Esta guía es para quien instala LibreType en equipos que usan varias
personas: un aula de informática, el ordenador de una biblioteca, la sala de
un centro de mayores. Lo que se cuenta aquí:

- cómo apagar las actualizaciones automáticas;
- cómo instalar en Windows sin red;
- dónde están los datos.

LibreType no tiene cuentas ni servidor. Ningún dato del alumno sale del
equipo. La única petición de red es la comprobación de actualizaciones, y en
una instalación gestionada se puede apagar.

## La política del equipo

Es un fichero JSON en una ruta del sistema que un usuario normal no puede
modificar. LibreType lo lee al arrancar; si no existe, todo funciona como
siempre.

| Sistema | Ruta |
|---|---|
| Linux | `/etc/libretype/politica.json` |
| Windows | `%ProgramData%\LibreType\politica.json` (normalmente `C:\ProgramData\LibreType\politica.json`) |
| macOS | `/Library/Application Support/LibreType/politica.json` |

La ruta es fija a propósito. No hay variable de entorno ni opción de línea de
comandos para cambiarla, porque cualquier usuario podría usarla para saltarse
la política.

### Contenido

```json
{
  "actualizaciones": false
}
```

- **`actualizaciones`**: con `false`, LibreType no comprueba si hay versiones
  nuevas ni ofrece el botón de actualizar. En Ajustes dice que las
  actualizaciones las gestiona quien administra el equipo. Cualquier otro
  valor, o no ponerlo, deja el comportamiento normal: comprobar al arrancar,
  si la persona no lo ha desactivado en Ajustes.

**Si el fichero existe pero no es JSON válido, o no se puede leer, las
actualizaciones se apagan.** Alguien quiso configurar el equipo y no se sabe
qué. De las dos formas de equivocarse, no conectar con ningún servidor es la
que no sorprende a nadie.

### Linux

```sh
sudo mkdir -p /etc/libretype
echo '{ "actualizaciones": false }' | sudo tee /etc/libretype/politica.json
sudo chmod 644 /etc/libretype/politica.json
```

Instalado desde el `.deb` o el repositorio apt, LibreType ya no se actualiza
solo: las versiones nuevas llegan con `apt upgrade`. La política sirve para el
AppImage.

### Windows

Se crea `C:\ProgramData\LibreType\politica.json`. Los usuarios necesitan
permiso de lectura; solo los administradores deberían poder escribir. En un
dominio se puede repartir con una preferencia de fichero de directiva de
grupo (GPO → Preferencias → Archivos) o con Intune.

Instalación desatendida:

```bat
msiexec /i LibreType_<versión>_x64_en-US.msi /qn
:: o con el instalador NSIS
LibreType_<versión>_x64-setup.exe /S
```

### macOS

```sh
sudo mkdir -p "/Library/Application Support/LibreType"
echo '{ "actualizaciones": false }' | sudo tee "/Library/Application Support/LibreType/politica.json"
```

Con un MDM, el fichero se reparte como cualquier otro fichero de
configuración.

## Windows sin red: WebView2 incluido

LibreType usa WebView2, el motor web de Edge. Windows 10 y 11 actualizados
ya lo traen, pero los equipos de un aula sin red o con una imagen antigua
pueden no tenerlo. Por eso el instalador de Windows lleva el instalador
completo de WebView2 (`webviewInstallMode: offlineInstaller` en
`tauri.conf.json`) y lo instala sin preguntar si hace falta.

El coste es el tamaño: el instalador pasa de unos pocos MB a unos 130 MB, y
lo mismo cada actualización automática en Windows. Si algún día pesa
demasiado para quien instala en casa, la salida es publicar dos
instaladores, no quitar este.

## Dónde están los datos

El progreso vive en un SQLite en el directorio de configuración de la
aplicación, de cada usuario del sistema:

| Sistema | Directorio |
|---|---|
| Linux | `~/.config/io.github.jrmougan.libretype/` |
| Windows | `%APPDATA%\io.github.jrmougan.libretype\` |
| macOS | `~/Library/Application Support/io.github.jrmougan.libretype/` |

Ahí están:

- `libretype.db`: la base de datos.
- `libretype-antes-de-esquema-N.db`: la copia que hace la aplicación antes
  de aplicar una migración nueva de la base de datos. Si una actualización
  saliera mal, basta con cerrar LibreType, sustituir `libretype.db` por esa
  copia y volver a abrir una versión anterior.
- `libretype.db.esquema`: la última versión del esquema copiada. No hay que
  tocarlo.

Las copias de seguridad que exporta cada persona (Progreso → Exportar copia de
seguridad) se guardan en su carpeta de Descargas, como un fichero `.json`. Para
juntar en un equipo lo practicado en otro, se importa esa copia eligiendo
**Combinar con lo que hay**: no se pierde nada ni se repite lo que ya estaba.

## Lo que queda por probar

- En macOS, la política se lee pero no se ha probado con un MDM real.
- En Windows, falta probar el instalador sin red en una máquina sin WebView2
  (Windows 10 LTSC, por ejemplo).
