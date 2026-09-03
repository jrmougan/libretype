# Spike dead keys — resultado

**Fecha:** 2026-09-03 · **Máquina:** macOS 26 (Darwin 25.5), Apple Silicon
**Layout:** Spanish - ISO · **Motor probado:** WKWebView (el que usaría Tauri en macOS)

## Pregunta

El debate de stack se decidía sobre una única afirmación verificada: que WKWebView
arrastra un bug confirmado de dead keys que duplica el acento y se come la tecla
siguiente, corrompiendo el núcleo funcional de un tutor de mecanografía en español.

## Método

`Driver.swift` levanta una ventana con **WKWebView y un `NSTextView` nativo de AppKit**,
inyecta los mismos eventos de teclado sintéticos en ambos y compara. El `NSTextView`
es la referencia: es la implementación de referencia del input de texto de macOS.

Los eventos se postean como `NSEvent` en la cola de la app (`NSApp.postEvent`), con
45 ms entre `keyDown` y `keyUp` y 110 ms entre teclas. Van por el camino normal
(`interpretKeyEvents:` → `NSTextInputContext` → TSM), así que la máquina de estados
de dead keys se ejercita de verdad — lo prueba que `´`+`a` produzca `á`, imposible
traduciendo cada evento por separado.

## Resultado: 8/8 coinciden

| Caso | Secuencia | Nativo | WKWebView | |
|---|---|---|---|---|
| T1 | `´` + `a` | `á` | `á` | = |
| T2 | **`´` + `t` (dead key cancelada)** | `´t` | `´t` | **=** |
| T3 | `´` + espacio | `´` | `´` | = |
| T4 | `´` + `´` | `´´` | `´´` | = |
| T5 | `ñ` | `ñ` | `ñ` | = |
| T6 | `Shift+´` + `u` | `ü` | `ü` | = |
| T7 | `Option+2` | `@` | `@` | = |
| T8 | `Option+e` | `€` | `€` | = |

**El bug no reproduce.** WKWebView se comporta exactamente como un campo de texto
nativo de macOS. El argumento que descartaba a Tauri no se sostiene en macOS.

## Hallazgo secundario (este sí importa, y es de implementación)

Orden real de eventos en WKWebView para `´` + `a`:

```
compositionstart('')  compositionupdate('´')  beforeinput('´')  input('´')
keydown(´)  keyup(´)
beforeinput(null)  input(null)  beforeinput('á')  input('á')  compositionend('á')
keydown(a)  keyup(a)
```

**Los eventos de composición preceden al `keydown` que los provoca.** Es el
WebKit #165004: en macOS el orden keydown/composición está invertido respecto a
la especificación. Estable en 3 pasadas.

Consecuencia para LibreType: no puedes correlacionar "carácter confirmado" con
"tecla que lo produjo" asumiendo que el `keydown` llega primero. Los dos canales
—resaltado físico por `.code`, carácter por `compositionend`/`input`— deben ser
**independientes de verdad**, no solo estar separados por limpieza. Esto vale
para cualquier stack web, y con Tauri (tres motores, tres órdenes posibles) es
obligatorio.

## Descartado durante el spike

- Una inversión `keyup` antes de `keydown` que observé al principio era **artefacto
  del arnés** (posteaba down y up sin separación), no de WebKit. Desapareció con
  45 ms de hueco.
- `UCKeyTranslate` como oráculo: no modela el texto sin confirmar, así que añade
  espacios espurios. Se mantiene en el informe solo como columna informativa.

## Lo que este spike NO responde

**Linux / WebKitGTK está sin probar** y no se puede probar desde esta máquina.
Los cuatro agentes coincidieron en que Linux es el punto de fallo de todos los
stacks. Repetir este mismo `Driver` (adaptado a GTK) en una VM antes de cerrar
la decisión de empaquetado.

## Reproducir

    swiftc -O Driver.swift -o driver && ./driver
