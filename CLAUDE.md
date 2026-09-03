# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

LibreType es un tutor de mecanografía multiplataforma para escritorio. Español
primero, muy visual, y accesible de niños a mayores. El código y los comentarios
están en español; mantenlo así.

## Comandos

    pnpm install
    pnpm dev           # frontend en el navegador (localhost:5173)
    pnpm tauri:dev     # la app de escritorio completa
    pnpm build         # bundle de producción
    pnpm tauri:build   # binario empaquetado
    pnpm check         # svelte-check + tsc; debe dar 0 errores

    cd src-tauri && cargo build    # solo el backend Rust

**No hay suite de tests.** La verificación es `pnpm check`, que compile, y —para
cualquier cosa que toque el teclado— ejecutar la app de verdad. Ver más abajo.

## Lo que decidió el stack (no re-litigar)

Se evaluaron Tauri, Electron y Flutter con un debate de agentes y **dos spikes
que se ejecutaron de verdad**, en `spike-deadkeys/`. Los resultados están en
`RESULTADOS.md` y `linux/RESULTADOS-LINUX.md`, y son la razón de varias
decisiones que de otro modo parecen arbitrarias.

Reproducir los spikes:

    cd spike-deadkeys
    swiftc -O Driver.swift -o driver && ./driver     # macOS: WKWebView vs NSTextView
    orb -m spike bash linux/run.sh                   # Linux: WebKitGTK vs GtkTextView

Cada uno compara el motor web contra el campo de texto **nativo** de esa
plataforma recibiendo los mismos eventos sintéticos. Si tocas el manejo de
teclado y quieres saber si algo es un bug tuyo o del motor, ese es el método:
comparar contra el nativo, no contra tus expectativas.

Hallazgos que restringen el diseño:

1. **El orden de los eventos difiere entre motores.** En macOS/WKWebView la
   composición precede al `keydown` (WebKit #165004); en Linux/WebKitGTK es al
   revés. En macOS el carácter `á` llega confirmado *antes* de que el DOM diga
   que se pulsó la `a`. Nada puede emparejar "carácter escrito" con "tecla que
   lo produjo" asumiendo un orden.

2. **El carácter esperado depende de la plataforma.** `´`+espacio da `´` en
   macOS y `'` en GTK; `´`+`´` da `´´` en macOS y `´` en GTK. **Nunca escribas
   una tabla de "esta pulsación produce este carácter"** — daría errores falsos
   en una plataforma u otra. Compara siempre contra lo que el sistema entrega.

3. `navigator.keyboard.getLayoutMap()` es solo de Chromium y no llegará a ser
   estándar. La distribución la elige el usuario; no intentes detectarla.

Sin validar todavía: la fidelidad de `.code` y el comportamiento con IBus en un
Linux de escritorio real (el spike corrió en contenedor, sin IBus). Instrucciones
en `spike-deadkeys/linux/README.md`.

## Arquitectura

`src/lib/keyboard/engine.ts` es el corazón. **Dos canales independientes**, que
es consecuencia directa del hallazgo 1:

- **Canal A, físico**: `keydown`/`keyup` → `code` → resalta tecla y dedo. Nunca
  espera a la composición. Usa `code` (posición física) y jamás `key`.
- **Canal B, caracteres**: lee el **valor del campo**, no acumula eventos. Es lo
  único que da igual el motor, el orden y el método de entrada.

El motor distingue `text` (lo que se ve, incluido un acento a medias) de
`committed` (lo confirmado). Durante una composición el campo ya muestra el `´`
pero ese carácter aún puede volverse `á`: **no cuenta como escrito y no debe
mover la posición de la lección**. Los sellos de tiempo van sobre `committed`.

`compositionend` fuerza el recálculo aunque el valor no haya cambiado, porque el
`input` con el texto final llega *antes* del `compositionend` y si no la lección
se queda clavada en la letra acentuada.

Otras piezas:

- `layouts.ts` — tabla ES-ISO con `code`, modificadores, dedo y fila de reposo,
  más `compose` (los acentos son dos pulsaciones). `buildIndex()` da el índice
  inverso carácter → pasos de tecla.
- `components/Drill.svelte` — captura en un `<textarea>` real fuera de pantalla
  pero **enfocable**: el texto tiene que pasar por el método de entrada del
  sistema. No lo cambies por un manejador global de `keydown`; sería justo el
  error que los spikes descartaron.
- `components/Keyboard.svelte` — SVG, no canvas (escala nítido al 200%, se
  estiliza con tokens, es inspeccionable).

## Accesibilidad

No es una capa final: es el motivo de que exista `src/styles/tokens.css`. Todo
color, tamaño y duración sale de ahí. **Un valor hardcodeado en un componente
rompe silenciosamente** el escalado de texto, el alto contraste o el movimiento
reducido en ese punto.

Reglas que aplican a cualquier UI nueva:

- Ningún estado se comunica solo por color. El error lleva fondo, subrayado
  doble y color; la tecla objetivo lleva triángulo además del contorno.
- Todo tamaño de texto se deriva de `--ui-scale` (100–200%).
- Objetivo de pulsación mínimo `--target-min` (48px; WCAG 2.2 pide 44).
- El bucle de práctica es visual y motor, así que el lector de pantalla importa
  sobre todo en el *chrome* (menús, ajustes, progreso) y el feedback de audio es
  más portante aquí que en una app normal.
- EN 301 549 (España: RD 1112/2018) aplica a software de escritorio, no solo a
  web. Si esto lo adopta un colegio público, obliga a operabilidad completa por
  teclado y a un árbol de accesibilidad real.

## Al tocar el teclado

Los dos bugs encontrados hasta ahora **compilaban limpios y pasaban
`svelte-check` sin errores**. Eran de orden y de estado de composición, y solo
aparecieron ejecutando la app. Si cambias `engine.ts` o `Drill.svelte`, ejecuta
y prueba la lección "Tildes" a mano: el cursor no debe avanzar mientras el
acento está a medias, y debe saltar al confirmar.
