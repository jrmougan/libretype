# Spike dead keys — WKWebView vs Chromium

Decide si LibreType va sobre Tauri (WebView del SO) o Electron (Chromium propio).
Layout requerido: **Spanish - ISO** (ya activo en esta máquina).

## 1. WKWebView (el motor bajo sospecha — el que usaría Tauri en macOS)

    cd /Users/jeromo/Dev/libretype/spike-deadkeys
    ./wkhost

Teclea los 9 casos que la ventana va pidiendo, pulsando "Siguiente caso →"
entre uno y otro. Al acabar pulsa "Copiar JSON" (escribe el fichero solo)
y cierra la ventana.

## 2. Chromium (lo que usaría Electron en las tres plataformas)

    open -a "Google Chrome" logger.html

Los mismos 9 casos. Al acabar pulsa "Copiar JSON" y luego, en la terminal:

    pbpaste > resultado-chromium.json

## 3. Veredicto

    python3 comparar.py

## El caso que decide todo

**T2: pulsa `´` y luego `t`.** No componen, así que el resultado correcto es
`´t` — dos caracteres, en ese orden. El bug reportado en WebKit duplica el
acento y se traga la `t`. Si T2 diverge entre motores, Tauri queda descartado.
Si no diverge, Tauri vuelve a la mesa con toda su ventaja de recursos.
