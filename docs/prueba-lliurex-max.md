# Prueba del `.deb` en LliureX y MAX

LliureX 23 (Comunitat Valenciana) y MAX 12 (Comunidad de Madrid) son las
distribuciones de los centros públicos donde LibreType tiene más
posibilidades de llegar. Las dos se basan en Ubuntu 22.04 (jammy). Que el
`.deb` funcione en Ubuntu 22.04 lo indica, pero no lo garantiza:

- traen escritorios y métodos de entrada configurados de otra manera;
- algunos equipos llevan perfiles de usuario obligatorios o carpetas
  personales que se borran al cerrar sesión;
- en las aulas hay proxies y repositorios propios.

Esta prueba no se puede hacer en CI: necesita la distribución instalada y,
para el teclado, una sesión gráfica de verdad con IBus. Se apunta aquí para
que quien tenga acceso a un equipo la siga igual cada vez, y para que el
resultado quede registrado.

## Qué hace falta

- Un equipo (o una máquina virtual con aceleración 3D) con LliureX 23 o
  MAX 12 recién instalado, en español y con el teclado «Español».
- El `.deb` de la release que se prueba (`libre-type_X.Y.Z_amd64.deb`) y
  su SHA256 de la página de la release.
- Una cuenta de alumno normal, sin `sudo`, además de la de administración.
- Una memoria USB, para probar exportar e importar.

En una máquina virtual, WebKitGTK funciona sin aceleración, pero mucho más
lento. Si el teclado en pantalla va a saltos, se apunta y se repite en un
equipo real antes de darlo por fallo.

## 1. Instalación

Con la cuenta de administración:

```sh
sha256sum libre-type_*_amd64.deb      # compara con la release
sudo apt install ./libre-type_*_amd64.deb
```

Comprobar:

- [ ] `apt` resuelve las dependencias sin pedir repositorios extra
  (`libwebkit2gtk-4.1-0` está en jammy).
- [ ] Aparece «LibreType» en el menú, en la categoría Educación, con su icono.
- [ ] `dpkg -L libre-type` no instala nada fuera de `/usr`.

Si apt no encuentra `libwebkit2gtk-4.1-0`, apuntar qué repositorios tiene la
distribución (`apt policy libwebkit2gtk-4.1-0`).

## 2. Primer arranque, con la cuenta de alumno

- [ ] Abre en menos de 5 segundos en un equipo de aula normal.
- [ ] Pregunta cómo prefieres la aplicación y luego enseña la colocación de
  manos.
- [ ] En Ajustes → Actualizaciones dice que se instaló con apt y que no
  consulta nada por internet. **No tiene que aparecer el botón «Buscar
  ahora».**
- [ ] Existe `~/.config/io.github.jrmougan.libretype/libretype.db` después de
  terminar un ejercicio.
- [ ] En Progreso **no** sale el aviso «No se pudo abrir la base de datos
  local». Si sale, SQLite ha fallado y se está usando el respaldo: apuntar
  los permisos de `~/.config`.

## 3. Teclado y acentos (lo más importante)

Es lo que no se puede probar en CI: el método de entrada real de la
distribución. Ver «Al tocar el teclado» en `AGENTS.md`.

Antes, apuntar el método de entrada activo: `echo $GTK_IM_MODULE`,
`ibus engine` si responde, y el escritorio (`echo $XDG_CURRENT_DESKTOP`).

En la lección «Tildes»:

- [ ] Al pulsar `´` el cursor **no avanza** y la tecla se resalta.
- [ ] Al pulsar después la vocal aparece `á` y el cursor salta.
- [ ] `´` + espacio y `´` + `´` dan lo que da el sistema en un editor de texto
  normal (gedit o el de la distribución). Comparar con él, no con lo que uno
  espera.
- [ ] `ñ`, `ü` (con `Mayús`+`´` y `u`) y `¿` `¡` se escriben y cuentan bien.
- [ ] El teclado en pantalla resalta la tecla física correcta en las filas
  numérica e inferior (la `<` junto a la `Z` existe en ES-ISO).

Si algo falla, repetir la misma secuencia en gedit. Si gedit hace lo mismo,
es el método de entrada y no LibreType. Si no, abrir una issue con la
secuencia exacta y la salida de las órdenes anteriores.

## 4. Perfiles y equipo compartido

- [ ] Crear dos perfiles desde Progreso. Al cerrar y volver a abrir, pregunta
  «¿Quién practica?».
- [ ] Cada perfil conserva su lección y sus teclas aprendidas.
- [ ] Con la política `/etc/libretype/politica.json` y
  `{ "perfilPorDefecto": "Aula" }`, abre directamente con el perfil «Aula».

En MAX, comprobar además si la carpeta personal del alumno se conserva al
cerrar sesión. Si se borra (perfil obligatorio), el progreso se pierde cada
día. No es un fallo de LibreType, pero hay que decirlo en la ficha técnica
para centros.

## 5. Copias y diálogos

- [ ] Exportar copia de seguridad abre el diálogo «Guardar como» del sistema
  y se puede guardar en el USB.
- [ ] Importar abre el diálogo «Abrir» y recupera el progreso.
- [ ] Para el docente → Abrir copias de varios alumnos permite elegir varios
  ficheros a la vez y los junta en la tabla.
- [ ] Imprimir el informe abre el diálogo de impresión de GTK y solo imprime
  el informe, no la aplicación.

## 6. Tamaño y accesibilidad

- [ ] Al 200% (Ajustes → Tamaño del texto), en una pantalla de 1366×768,
  se ven a la vez el texto, la pista y el teclado.
- [ ] Con el lector de pantalla Orca activo, los menús, Ajustes y Progreso se
  leen y se manejan solo con teclado.

## 7. Desinstalación

```sh
sudo apt remove libre-type
```

- [ ] Desaparece del menú.
- [ ] El progreso del alumno en `~/.config/io.github.jrmougan.libretype/`
  **sigue ahí**: apt no toca la carpeta personal, y reinstalar lo recupera.

## Registro de resultados

Copiar esta tabla en la issue de la release:

| Fecha | Distribución y versión | Equipo / VM | Escritorio e IME | Release | Resultado | Notas |
|---|---|---|---|---|---|---|
| | LliureX 23 | | | | | |
| | MAX 12 | | | | | |
