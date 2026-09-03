# LibreType

Tutor de mecanografía multiplataforma para escritorio. Muy visual y accesible,
pensado para todo el mundo: de niños a mayores.

Estado: **eligiendo stack**. Nada implementado todavía.

## Decisión de stack en curso

Candidatos: Tauri v2 + web · Electron · Flutter desktop.

El criterio que decide no es el peso del binario sino dos ejes:

1. **Fidelidad de teclado.** Es un tutor de mecanografía en español: las tildes
   se escriben con *dead keys* (`´` + `a` = `á`) y eso es el núcleo funcional
   del producto, no un detalle de i18n.
2. **Accesibilidad real.** Lectores de pantalla, escalado del SO al 200%, alto
   contraste, movimiento reducido. Además, EN 301 549 (vía RD 1112/2018) aplica
   a software de escritorio, no solo a web — relevante si algún colegio público
   lo adopta.

## Hallazgos

### macOS / WKWebView — resuelto

Se sospechaba que WKWebView (el motor que usaría Tauri en macOS) arrastraba un
bug de dead keys que duplicaba el acento y se comía la tecla siguiente. Si fuera
cierto, descartaría Tauri.

**No reproduce.** 8/8 casos idénticos a un `NSTextView` nativo de AppKit.
Ver [`spike-deadkeys/RESULTADOS.md`](spike-deadkeys/RESULTADOS.md).

Hallazgo secundario que sí condiciona el diseño: en WKWebView **los eventos de
composición preceden al `keydown`** que los provoca (WebKit #165004). El carácter
llega confirmado antes de saber qué tecla lo produjo. Por eso el resaltado de
tecla física y la captura del carácter deben ser canales **independientes**, no
solo separados.

### Linux / WebKitGTK — resuelto en lo esencial

Era el punto de fallo que señalaban todos los análisis. **8/8 casos idénticos a
un `GtkTextView` nativo** (Ubuntu 24.04, WebKitGTK 2.52.6).
Ver [`spike-deadkeys/linux/RESULTADOS-LINUX.md`](spike-deadkeys/linux/RESULTADOS-LINUX.md).

Queda pendiente en hardware real: la fidelidad de `.code` y el comportamiento
con IBus, que un contenedor no tiene.

### Dos cosas que condicionan el diseño

**El carácter esperado depende de la plataforma.** `´`+espacio da `´` en macOS y
`'` en GTK; `´`+`´` da `´´` en macOS y `´` en GTK. No puede haber una tabla única
de "esta pulsación produce este carácter" o habrá lecciones que den error en
Linux y no en macOS.

**El orden de eventos difiere entre motores.** En Linux el `keydown` precede a la
composición; en macOS es al revés. Los dos canales tienen que ser independientes
del orden.

## Reproducir el spike de macOS

    cd spike-deadkeys
    swiftc -O Driver.swift -o driver && ./driver
