# LibreType

LibreType es un tutor de mecanografía multiplataforma para escritorio, diseñado primero para el español, altamente visual y accesible para todas las edades, desde niños hasta personas mayores.

Construido sobre **Tauri v2**, **Svelte 5** y **Rust**, LibreType combina la ligereza y seguridad de un backend nativo con una interfaz reactiva, moderna y accesible.

---

## Características principales

- **Español primero**: El temario de aprendizaje no sigue el orden tradicional en inglés (reposo, superior, inferior), sino uno derivado de frecuencias reales sobre un corpus de 50.000 palabras en español (`investigacion/frecuencias.py`). El **12,97 %** de las palabras en español contienen tildes, diéresis o eñe, y la tecla `´` se pulsa con más frecuencia que la `p`. Por ello, las tildes se enseñan temprano (lección 5 de 9) utilizando palabras reales.
- **Todo cabe en la ventana, sin scroll**: Para aprender mecanografía sin mirarse las manos, el alumno debe ver en un solo golpe de vista el texto objetivo, la pista del dedo y el teclado en pantalla. La ventana tiene un tamaño mínimo garantizado de 800×600 y una jerarquía de adaptación que evita que el teclado se vuelva ilegible.
- **Retirada progresiva de ayudas visuales**: El teclado en pantalla actúa como apoyo inicial. A medida que el alumno demuestra dominio sobre una tecla (precisión ≥ 90 % y al menos 8 intentos), su letra se desvanece y se sustituye por un punto discreto para romper el hábito de buscar la tecla en la pantalla.
- **Tono y preferencias respetuosas**: Evita la *design disqualification* (la sensación de exclusión al enfrentarse a interfaces infantiles o condescendientes). Permite alternar entre tono sobrio y tono lúdico por preferencia explícita (sin preguntar jamás la edad).
- **Accesibilidad desde los cimientos**: Cumplimiento con las pautas WCAG 2.2 y el estándar europeo EN 301 549 (RD 1112/2018). Escalado de interfaz (100 % a 200 %), tipografía para dislexia, modos de alto contraste, reducción de movimiento y ningún estado transmitido únicamente por color.
- **Privacidad y persistencia local**: Sin cuentas de usuario, sin telemetría ni servidores remotos. El progreso y las sesiones se guardan localmente en SQLite (`tauri-plugin-sql`), con respaldo automático en `localStorage` en entorno de desarrollo web.

---

## Arquitectura: El motor de dos canales

El núcleo de LibreType (`src/lib/keyboard/engine.ts`) implementa una arquitectura de **dos canales independientes**.

Esta decisión técnica es el resultado de dos *spikes* de investigación con eventos sintéticos reales (`spike-deadkeys/`) que compararon motores web contra campos nativos del sistema (`WKWebView` vs. `NSTextView` en macOS; `WebKitGTK` vs. `GtkTextView` en Linux):

1. **El orden de eventos del DOM varía entre plataformas**: En macOS/WKWebView la composición precede al evento `keydown` (WebKit #165004), mientras que en Linux/WebKitGTK ocurre al revés. No se puede predecir un orden universal.
2. **El resultado de las teclas muertas (*dead keys*) depende del sistema**: La combinación `´` + Espacio produce `´` en macOS y `'` en Linux GTK.

Para garantizar un funcionamiento consistente y robusto en cualquier sistema operativo:

- **Canal A (Físico)**: Escucha `keydown` y `keyup` utilizando exclusivamente `event.code` (posición física según la norma ES-ISO). Resalta al instante la tecla física y el dedo correspondiente sin esperar a la composición de acentos.
- **Canal B (Caracteres)**: Lee el valor confirmado (`committed`) directamente desde un `<textarea>` real (accesible al IME del sistema pero fuera de la vista del usuario). La posición de la lección solo avanza cuando un carácter o palabra se confirma definitivamente.

---

## Público objetivo

LibreType está concebido tanto para:

- **Niños y jóvenes**: Que se inician en el uso del ordenador o el teclado físico escolar.
- **Adultos y personas mayores**: Que desean mejorar su soltura, reaprender hábitos posturales o afianzar la memoria muscular.

La aplicación incluye la **Lección Cero** (`src/lib/components/LeccionCero.svelte`), una guía anatómica y postural centrada en la colocación de las manos sobre los relieves guía de las teclas `F` y `J`, sin presiones de tiempo ni puntuaciones.

---

## Requisitos previos

- [Node.js](https://nodejs.org/) (versión 20 o superior)
- [pnpm](https://pnpm.io/) (versión 10 o 11)
- [Rust](https://www.rust-lang.org/) (versión 1.77.2 o superior)
- Dependencias del sistema para Tauri (ver [guía de requisitos de Tauri](https://v2.tauri.app/start/prerequisites/))

---

## Comandos de desarrollo

Instalar dependencias del proyecto:

```bash
pnpm install
```

Ejecutar el entorno de desarrollo:

```bash
# Frontend en el navegador (localhost:5173, con persistencia en localStorage)
pnpm dev

# Aplicación de escritorio completa con Tauri (con persistencia en SQLite)
pnpm tauri:dev
```

Verificación de código y pruebas:

```bash
# Comprobación de tipos con svelte-check y tsc (debe arrojar 0 errores)
pnpm check

# Ejecutar la suite completa de tests con Vitest
pnpm test

# Ejecutar tests en modo escucha continua
pnpm test:watch

# Ejecutar un test concreto por patrón o fichero
pnpm test -- -t "acento cancelado"
pnpm test src/lib/keyboard/layouts.test.ts
```

Compilación y empaquetado para producción:

```bash
# Compilar bundle web para producción
pnpm build

# Generar binario ejecutable e instalador de escritorio
pnpm tauri:build
```

Backend Rust (dentro de `src-tauri/`):

```bash
cd src-tauri
cargo check
cargo build
```

---

## Spikes y validaciones de dead keys

En el directorio `spike-deadkeys/` se encuentran los bancos de prueba nativos para evaluar el comportamiento de teclas muertas y composición:

```bash
cd spike-deadkeys

# macOS: Ejecutar comparación WKWebView vs NSTextView
swiftc -O Driver.swift -o driver && ./driver

# Linux (con OrbStack o contenedor Ubuntu):
orb -m spike bash linux/run.sh
```

---

## Licencia

Distribuido bajo la licencia [MIT](LICENSE).
