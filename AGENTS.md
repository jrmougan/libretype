# Instrucciones para agentes de código

Este archivo contiene las instrucciones compartidas para cualquier agente de
código que trabaje en este repositorio.

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
    pnpm test          # vitest sobre el motor y la tabla de teclado
    pnpm test:watch
    pnpm test:coverage # con informe y umbrales de cobertura

    cd src-tauri && cargo build    # solo el backend Rust

    # Repositorio apt, de punta a punta con un apt de verdad. Necesita Linux:
    bash empaquetado/apt/probar-repo.sh

Un solo test: `pnpm test -- -t "acento cancelado"` (por nombre) o
`pnpm test src/lib/keyboard/layouts.test.ts` (por fichero).

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

## Todo cabe en la ventana, sin scroll

No es una preferencia estética: el alumno necesita ver **a la vez** el texto, la
pista y el teclado. Si hay que desplazarse, se rompe justo la relación que
enseña a no mirarse las manos.

Cómo se sostiene:

- `.app` ocupa `100dvh` con `overflow: hidden`. La barra de arriba lleva el
  selector de lección, las métricas en vivo y los botones; sustituyó a diez
  botones que ocupaban dos filas.
- **El teclado absorbe la diferencia**: es lo último de la rejilla y se lleva el
  espacio que sobra. El SVG escala solo, así que encoger no lo rompe.
- **Ajustes y progreso son paneles superpuestos**, no bloques en el flujo:
  abrirlos no puede mover el teclado de sitio.

Con la letra al 200% no cabe todo a tamaño completo, así que hay un **orden de
sacrificio explícito** y conviene respetarlo:

1. Se pliega la explicación de la lección (`espacioJusto`).
2. El texto se desplaza dentro de su caja (`max-height: 30vh`).
3. El teclado se encoge, **pero nunca por debajo de `min(34vh, 230px)`**: un
   teclado ilegible es peor que uno al que haya que desplazarse.
4. Si aún así no cabe, se desplaza `.escena`. Desplazarse es malo; recortar
   contenido y que nadie lo encuentre es peor.

Al tocar esta zona, comprobar las cuatro vistas al 100% y al 200%.

## Tono y preferencias

`src/lib/preferencias.ts` y `src/lib/voz.ts`.

**Las preferencias se guardan siempre.** No es un extra: quien necesita el texto
al 200% o la tipografía para dislexia no puede tener que reconfigurarlo cada vez
que abre la aplicación. Van en localStorage y no en la base de datos porque son
de este equipo, no progreso del alumno. `normalizar()` acota y sanea lo que
venga de disco: un valor corrupto cae al de por defecto en vez de dejar la
interfaz en un estado imposible.

**El tono** responde a un problema real de este público doble. La investigación
de usabilidad con personas mayores le llama *design disqualification*: la
sensación de quedarse fuera al ver una interfaz hecha para gente joven. Un tutor
lleno de premios le dice a un adulto que la app no es para él; uno gris no
engancha a un niño.

Reglas del tono, que no son negociables sin rehacer el razonamiento:

- **Cambia cómo se ve y cómo habla, nunca cuánto se ve.** El tamaño lo necesitan
  los dos y vive en `--ui-scale`, en sus propios ajustes.
- **Se pregunta por preferencia, jamás por edad.** «¿Eres niño o mayor?» sería
  cometer justo el error que la pantalla evita. El selector enseña una muestra
  real de cada opción en vez de describirla.
- **Por defecto se usa el sobrio** mientras no haya elegido: es más fácil
  perdonar que una app te hable seria de más que al revés.
- Ninguna de las dos voces reprende al fallar. Hay test.
- **El objetivo de precisión nunca se muestra como número suelto.**
  `PCT_OBJETIVO` decide qué lecciones se desbloquean, pero enseñarlo aislado
  activa una meta de *rendimiento* («¿llego o no llego?») en vez de una de
  *maestría* («estoy mejorando»). En un público con ansiedad frente a la
  tecnología ese marco de amenaza pesa más que el beneficio pedagógico del
  umbral: es el *design disqualification* de más arriba, dicho con un número.
  Así que el umbral solo se comunica con las frases de `storage/objetivos.ts`,
  que llevan la cifra y el lenguaje que quita presión juntos —«a tu ritmo», «sin
  prisa», «sin velocidad mínima»—, y ninguna vista puede interpolar
  `PCT_OBJETIVO` por su cuenta. En la etiqueta corta de cada fila del panel no va
  número: ya está explicado en la nota de encima, y repetirlo fila a fila
  convertiría cada lección en un examen. Lo vigilan `objetivos.test.ts`, que
  recorre `src/` buscando quién interpola el umbral, y los tests de `App` y
  `Progreso` que recorren el DOM montado.

## Retirada de la ayuda visual

`src/lib/keyboard/dominio.ts`. El teclado en pantalla es una muleta: mirarlo
para encontrar la tecla es el hábito que hay que romper. Las teclas que el
alumno domina dejan de mostrar su letra y pasan a un punto — no se quedan
vacías, que parecería un fallo de dibujo.

Reglas que están ahí por algo y no son parámetros que tocar a ojo:

- **No se retira nada por debajo de 8 intentos.** Con tres aciertos no se sabe
  si domina la tecla o ha tenido suerte.
- **Ni por debajo del 90% de precisión**, por buena que sea la velocidad.
  Teclear rápido fallando no es dominar, ni aquí ni en las marcas.
- **La opacidad no baja gradualmente hasta un gris ilegible**: se mantiene por
  encima de 0,65 y luego desaparece del todo. Una letra por debajo de 0,65
  incumpliría el contraste (4,5:1) y parecería un error.
- Hay ajuste para dejarlas **siempre visibles**. Quien necesite la ayuda no
  puede perderla porque una heurística crea que ya no le hace falta.

El dominio se persiste al terminar cada lección, no en cada pulsación.

Los intentos se atribuyen a la tecla del carácter **objetivo**, no al `keydown`:
los spikes demostraron que no se puede emparejar un carácter confirmado con la
tecla que lo produjo. En una vocal con tilde cuentan las dos teclas —el acento y
la vocal— con el mismo resultado; es una aproximación deliberada.

## Lección cero

`src/lib/components/LeccionCero.svelte`, con el contenido en
`src/lib/leccion-cero.ts` para poder probarlo. Es la pantalla de colocación de
manos: postura, la fila de reposo, los relieves de la F y la J, y el espacio con
el pulgar. Los pasos 3 y 4 comprueban de verdad la pulsación leyendo `code`.

Tres cosas deliberadas que no hay que "optimizar":

- **No mide nada.** Ni velocidad ni puntuación. Aquí se coloca a la persona, no
  se la evalúa.
- **El texto es largo a propósito.** Al contrario que el tópico del onboarding,
  las personas mayores sí leen las instrucciones, y son buena parte del público.
- **Se llega sola la primera vez** (cuando no hay ninguna sesión guardada) pero
  sigue accesible desde la navegación, porque la investigación dice que hay que
  poder volver a las instrucciones, no solo verlas una vez.

Cada paso interactivo tiene salida (*Saltar esta comprobación*) por si una tecla
no responde: nunca se puede quedar nadie encallado.

## Las lecciones (no reordenar a ojo)

`src/lib/lessons.ts`. El orden **no** es el tradicional (reposo, fila superior,
fila inferior). Ese viene de las academias de mecanografía en inglés. Este sale
de contar frecuencias sobre un corpus real: `investigacion/frecuencias.py`.

Lo que dicen los datos, y que no es intuitivo:

- **El 12,97% de las palabras que se escriben en español llevan tilde, diéresis
  o eñe**, y la tecla `´` se pulsa más que la `p`. Las tildes van en la lección
  5 de 9, no al final. No son un tema avanzado del español: son el español.
- **Con la fila de reposo entera solo se escribe el 5,5% de las palabras.**
  `asdfjklñ` contiene cuatro de las letras más raras (`f`, `j`, `k`, `ñ`) y
  ninguna de las cinco que sostienen el idioma. Sigue siendo el ancla anatómica
  correcta —los relieves de la F y la J son lo que permite volver sin mirar—,
  pero hay que salir pronto o el alumno teclea sílabas sin sentido.
- **Comparar por lección engaña**: el temario tradicional parece rápido porque
  mete diez teclas de golpe. Por tecla aprendida, que es el esfuerzo real, con
  13 teclas da 17,6% frente al 28,1% de este orden.

Los textos son palabras reales ordenadas por frecuencia, generadas con
`investigacion/generar_lecciones.py` y revisadas a mano. Si añades o cambias una
lección, `lessons.test.ts` comprueba lo que importa: que no use teclas sin
enseñar, que practique las que estrena, que ninguna meta más de cinco de golpe
y que las tildes lleguen con las cinco vocales ya dadas.

## Compilación continua

`.github/workflows/`. Lo barato corre siempre (tipos, tests, backend y el spike
de dead keys, todo en Linux); los binarios de las tres plataformas se compilan
al integrar en master o a mano, y las Releases al empujar una etiqueta `v*`.

El job **spike-deadkeys** es el que más aporta: compara WebKitGTK contra un
`GtkTextView` nativo bajo Xvfb y **rompe el build si divergen**. Es la
comprobación de Linux que no se puede hacer desde un Mac. Si lo tocas, mantén
que `driver_linux.py` salga con código distinto de cero al divergir, o el job
pasará siempre.

Se compila en `ubuntu-22.04` a propósito: la versión de glibc que exige el
binario la fija la máquina donde se construye.

Los binarios van **sin firmar**. Añadir firma es meter secretos en
`release.yml`, no reescribirlo.

## Cómo llega y se actualiza

Dos caminos, y **la aplicación tiene que saber en cuál está**. El comando
`tipo_de_paquete` de `lib.rs` lee lo que el bundler estampó al empaquetar
(`bundle_type()`), no lo deduce del sistema operativo.

La razón es concreta: en un `.deb` o `.rpm`, el actualizador de Tauri intenta
`dpkg -i` / `rpm -U`. Como usuario normal falla por permisos, y si funcionara
sería peor —tocaría por detrás un fichero del que manda apt—. Así que
`detectarEntorno()` en `src/lib/actualizacion.ts` devuelve tres cosas, no dos,
y en `gestionado` la interfaz **no ofrece el botón**: dice quién se encarga.

`actualizacion.ts` no importa `@tauri-apps/*` en el cuerpo: recibe la API por
parámetro y la carga en diferido. Es lo que permite probarlo entero en jsdom y
lo que mantiene vivo `pnpm dev` en el navegador, igual que los dos backends de
`almacen.ts`.

Reglas que están ahí por algo:

- **Nunca instala ni reinicia sola.** Reiniciar a mitad de una lección tira el
  intento. Descargar e instalar son dos clics distintos y explícitos.
- **Fallar al comprobar es silencioso**, salvo si alguien pulsó «Buscar
  actualizaciones» y está esperando respuesta. Sin red no puede aparecer un
  aviso que nadie pidió.
- **El aviso de la barra no añade altura.** Está medido al 100% y al 200%: la
  barra ya envolvía a dos y tres filas respectivamente, y el aviso encaja en el
  hueco. Si se le añade texto hay que volver a medirlo, porque el orden de
  sacrificio de la ventana no se negocia.
- **La comprobación es la única petición de red de la aplicación**, y por eso
  hay preferencia para apagarla (`buscarActualizaciones`). Viene activada
  porque este público no va a ir a mirar si hay versión nueva, pero la promesa
  de no hablar con ningún servidor es parte de lo que se ofrece: si se añade
  cualquier otra petición, hay que decirlo en el README y en Ajustes.

### El repositorio apt

`empaquetado/apt/`. Se **reconstruye entero** en cada publicación a partir de
los `.deb` de las Releases estables, y eso no es fuerza bruta: hace que el
repositorio sea siempre una función de lo que hay en GitHub. Ir añadiendo al
que ya está publicado es de donde salen los índices que anuncian ficheros
inexistentes.

- El nombre del paquete es **`libre-type`**, con guion. Lo decide Tauri
  partiendo el CamelCase del `productName` y no se puede cambiar sin renombrar
  la aplicación. `construir-repo.sh` lo **lee del `.deb`** en vez de escribirlo,
  para que no pueda quedarse desfasado.
- Un solo suite `stable`, no uno por nombre de distribución: el `.deb` depende
  de `libwebkit2gtk-4.1-0`, que está en Ubuntu 22.04+ y Debian 12+. Ese
  conjunto es todo lo que hay; partirlo daría a entender que se prueban por
  separado.
- Solo **amd64**. Si algún día se compila para arm64, hay que tocar
  `Architectures` en `construir-repo.sh` además del workflow.

`probar-repo.sh` lo ataca con un `apt` de verdad y **rompe el build si algo
falla**, en el mismo espíritu que el job de dead keys. Comprueba cuatro cosas,
y las dos últimas son las que importan: que un índice manipulado se rechace por
el hash, y que un `InRelease` manipulado se rechace por la firma. Sin ellas, un
repositorio con la firma puesta de adorno pasaría el resto en verde.

Dos trampas que ya se cayeron al escribirlo y que conviene no repetir:

1. **apt no vuelve a descargar el índice si el `InRelease` no ha cambiado.** Un
   test que manipula ficheros sin vaciar `/var/lib/apt/lists` no comprueba la
   cadena de confianza, comprueba que apt tiene caché.
2. **Un `sed` que no encaja no cambia nada y el test pasa en verde.** De ahí la
   función `manipular`, que verifica que el fichero cambió de verdad antes de
   preguntarle a apt.

Los `.deb` de la prueba son sintéticos a propósito: lo que se prueba es la
maquinaria del repositorio, no la compilación de la app. Meter el toolchain de
Rust y pnpm ahí convertiría un job de un minuto en uno de diez.

## Persistencia

El progreso vive en SQLite local (`tauri-plugin-sql`), en el directorio de datos
de la app. No hay cuentas ni servidor: con menores de por medio, lo que no se
recoge no hay que protegerlo.

`src/lib/storage/almacen.ts` tiene **dos backends** y eso no es sobreingeniería:
la app corre en `pnpm tauri:dev` (escritorio, SQLite) y en `pnpm dev`
(navegador, sin Tauri). Sin el respaldo de localStorage, desarrollar el frontend
en el navegador dejaría de funcionar. Si abrir SQLite falla, se cae al respaldo
en vez de tumbar la app.

La agregación (`storage/progreso.ts`) se hace en TypeScript, no en SQL, para que
se pueda probar sin base de datos. Los volúmenes son de una persona practicando.

Regla de producto que vive en el código: **solo cuentan para la marca los
intentos con 90% de acierto o más** (`PCT_MINIMO_PARA_RECORD`). Sin ese umbral
la app premiaría teclear rápido y mal, que es lo contrario de lo que enseña.

**Renombrar una lección rompe el histórico de quien ya tenía la app.** El
identificador es lo que guarda cada fila, así que al reordenar el temario las
sesiones de la v0.1.0 (`home`, `top`, `enye`…) dejaron de casar con nada:
contaban en los totales y no salían en ninguna fila. `storage/equivalencias.ts`
las traduce, y la línea que traza no es negociable: **solo se renombra lo que es
la misma lección con otro nombre.** Traducir `top` a alguna actual regalaría una
marca en teclas que nadie practicó, y `esRecord()` la daría por buena; lo que no
tiene equivalente honesto se marca retirado y el panel lo enseña aparte, con su
nombre de entonces. Al renombrar una lección, la entrada va en el mismo commit:
hay test que lo comprueba contra `LESSONS`.

Se traduce al agregar y no con un `UPDATE` en SQL porque el respaldo de
localStorage no tiene migraciones: en TypeScript se arreglan los dos backends
con el mismo código, y sin tocar lo que ya está escrito en disco.

El esquema está en `src-tauri/src/lib.rs` como migración versionada. Al cambiarlo
hay que añadir una migración nueva, no editar la que ya se aplicó.

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

## Tests

`src/lib/keyboard/traces.ts` guarda **secuencias reales de eventos del DOM**, con
el valor del campo después de cada uno. Las de macOS son capturas literales de
`spike-deadkeys/Driver.swift`; el campo `origin` distingue lo capturado de lo
reconstruido y hay que mantenerlo honesto. `engine.test.ts` las reproduce contra
un `<textarea>` real en jsdom.

Existen porque **el orden de eventos no se puede reproducir tecleando en una
sola máquina**: un cambio que funcione en tu Mac puede romper Linux sin que nada
avise. Los dos bugs que ha tenido el motor están fijados como tests con nombre.

`progreso.test.ts` cubre la agregación y los dos almacenes; el caso que más
importa es que un intento rápido y lleno de fallos no fije récord.

`layouts.test.ts` comprueba, entre otras cosas, que **todo carácter de toda
lección sea escribible** con la distribución. Si añades una lección con un
carácter que ES-ISO no produce, falla ahí en vez de dejar al alumno atascado sin
pista.

## Al tocar el teclado

Los dos bugs encontrados hasta ahora **compilaban limpios y pasaban
`svelte-check` sin errores**. Eran de orden y de estado de composición, y solo
aparecieron ejecutando la app.

Los tests ya cubren esos dos casos, pero no sustituyen a ejecutar: cubren el
motor con trazas grabadas, no el método de entrada real del sistema. Si cambias
`engine.ts` o `Drill.svelte`, ejecuta y prueba la lección "Tildes" a mano con el
teclado físico: el cursor no debe avanzar mientras el acento está a medias, y
debe saltar al confirmar.
