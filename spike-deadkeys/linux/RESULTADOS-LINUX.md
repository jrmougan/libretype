# Spike dead keys — Linux / WebKitGTK

**Entorno:** Ubuntu 24.04 arm64 en OrbStack · WebKitGTK **2.52.6** · GTK **3.24.41**
**Módulo IM:** `gtk-im-context-simple` (el contenedor no tiene IBus) · Xvfb

## Resultado: 8/8 coinciden

| Caso | Secuencia | macOS | GTK nativo | WebKitGTK | |
|---|---|---|---|---|---|
| T1 | `´`+`a` | `á` | `á` | `á` | = |
| **T2** | **`´`+`t` — dead key cancelada** | `´t` | `´t` | `´t` | **=** |
| T3 | `´`+espacio | `´` | `'` | `'` | = |
| T4 | `´`+`´` | `´´` | `´` | `´` | = |
| T5 | `ñ` | `ñ` | `ñ` | `ñ` | = |
| T6 | `¨`+`u` | `ü` | `ü` | `ü` | = |
| T7 | `@` | `@` | `@` | `@` | = |
| T8 | `€` | `€` | `€` | `€` | = |

**WebKitGTK no diverge de GTK nativo en ningún caso.** El riesgo que los cuatro
análisis señalaban en Linux no aparece en el manejo de caracteres.

## Método

`driver_linux.py` levanta una ventana GTK con un `WebKitWebView` y un
`GtkTextView` nativo, inyecta los mismos eventos en ambos y compara.

Los eventos se inyectan como `GdkEventKey` en la cola de GDK (`ev.put()`), no
por la capa X. Es el mismo enfoque que en macOS con `NSApp.postEvent`: entran
por la cola del toolkit y pasan por el `GtkIMContext` del widget, que es donde
vive el compose de dead keys. **La prueba de que es fiel: `dead_acute`+`a`
produce `á`**, imposible sin que la máquina de composición haya corrido.

Se descartó la vía X (`setxkbmap`/`xkbcomp`/`xmodmap`): en este Xvfb el keymap
no se deja modificar — `setxkbmap` construye el mapa correcto y `xkbcomp` sale
con 0, pero los keysyms siguen siendo los de `us`. Con `xdotool` sobre keysyms
no mapeados el remapeo temporal llega tarde y GTK ve `Unidentified`.

## Dos diferencias reales entre plataformas (no son fallos)

`T3` y `T4` difieren entre macOS y Linux, y **los dos motores de Linux coinciden
entre sí**, así que es la tabla de compose de GTK, no un bug:

| Secuencia | macOS | GTK/Linux |
|---|---|---|
| `´` + espacio | `´` | `'` (apóstrofo) |
| `´` + `´` | `´´` | `´` |

**Implicación de producto:** el carácter esperado para una misma secuencia de
teclas *depende de la plataforma*. Un tutor de mecanografía no puede llevar una
tabla única de "esta pulsación produce este carácter". O se valida contra lo que
el sistema realmente entrega, o hay lecciones que darán error en Linux y no en
macOS.

## Diferencia de orden de eventos

En Linux el `keydown` precede a la composición:

```
keydown  compositionstart  compositionupdate('´')  beforeinput('´')  input('´')  keyup
```

En macOS es al revés: la composición precede al `keydown` (WebKit #165004).

**Dos motores, dos órdenes.** Confirma que los dos canales —resaltado de tecla
física y captura del carácter— tienen que ser independientes del orden, no solo
estar separados.

## Lo que este spike NO valida

- **`.code` (identidad de tecla física) en Linux.** La inyección sintética no
  lleva un `hardware_keycode` real, así que el DOM reporta `Unidentified`. Es
  artefacto del arnés, no de WebKitGTK — pero significa que la fidelidad de
  `.code` en Linux sigue **sin comprobar**, y es justo el canal del que depende
  el resaltado del teclado en pantalla.
- **IBus.** El contenedor usa `gtk-im-context-simple`. Un Ubuntu de escritorio
  real corre IBus, que maneja las dead keys por otro camino.

Ambas cosas se cierran ejecutando esto en un portátil Linux real con teclado
físico español. Ver `README.md` de esta carpeta.

## Reproducir

    orb create ubuntu:24.04 spike
    orb -m spike sudo apt-get install -y python3-gi gir1.2-webkit2-4.1 xvfb
    orb -m spike bash spike-deadkeys/linux/run.sh
