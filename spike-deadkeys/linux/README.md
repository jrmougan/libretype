# Ejecutar en un portátil Linux real

El spike en contenedor (ver `RESULTADOS-LINUX.md`) deja dos cosas sin cerrar:
IBus y la fidelidad de `.code`. Las dos necesitan hardware y escritorio reales.

## Preparación

    sudo apt-get install -y python3-gi gir1.2-webkit2-4.1
    # Teclado español en Ajustes → Región e idioma

## Prueba manual (3 minutos, la que cierra el asunto)

Abre `../logger.html` en el navegador del sistema y teclea los 9 casos que la
página va pidiendo, con el teclado físico. Fíjate en dos cosas:

1. **La columna `code`** debe mostrar la tecla física real (`KeyA`, `Quote`...),
   nunca `Unidentified`. Eso valida el canal de resaltado del teclado.
2. **T2** (`´` seguido de `t`) debe dar `´t`, sin duplicar el acento ni perder
   la `t`.

Anota también qué da `´`+espacio: en GTK sale apóstrofo (`'`), no `´`.

## Prueba automática

    bash run.sh

Compara WebKitGTK contra un `GtkTextView` nativo. Con IBus activo el resultado
es más significativo que en contenedor.
