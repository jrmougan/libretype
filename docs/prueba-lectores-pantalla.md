# Prueba manual con lectores de pantalla

Guion para que una persona lo ejecute de principio a fin y deje registrado qué
anuncia cada lector. **Todavía no se ha ejecutado con un lector real en ninguna
plataforma**: lo que hay hasta ahora son los tests de jsdom, que comprueban
atributos y no lo que de verdad se oye.

## Por qué hace falta y qué no se espera

LibreType corre en tres motores web distintos, y cada uno expone a los lectores
de pantalla **un árbol de accesibilidad distinto**:

| Plataforma | Motor | Lector | API de accesibilidad |
|---|---|---|---|
| Linux | WebKitGTK | Orca | AT-SPI2 |
| macOS | WKWebView | VoiceOver | NSAccessibility |
| Windows | WebView2 (Chromium) | NVDA | UIA / IA2 |

Que algo funcione en uno no dice nada de los otros dos. Los tests de jsdom
comprueban atributos (`role`, `aria-*`), no lo que de verdad se anuncia.

**Lo que no se evalúa aquí:** la práctica en sí no está pensada para personas
ciegas (el modo específico queda fuera de la 1.0). Lo que sí se exige —EN 301
549, RD 1112/2018— es que el *chrome* sea operable y se entienda: la barra, el
selector de lección, Ajustes, Progreso y los diálogos. También lo usan personas
con baja visión que se apoyan en el lector a ratos.

## Preparación

1. Instala la versión a probar (el `.deb`, el `.dmg` o el `.msi` de la Release,
   no `pnpm dev`: el motor tiene que ser el de la plataforma).
2. Empieza **sin datos**, para pasar por la primera apertura. El
   identificador de la app es `io.github.jrmougan.libretype`; mueve a otro sitio
   el directorio de configuración (donde está `libretype.db`) y el del WebView
   (donde están las preferencias):
   - Linux: `~/.config/io.github.jrmougan.libretype/` y
     `~/.local/share/io.github.jrmougan.libretype/`.
   - macOS: `~/Library/Application Support/io.github.jrmougan.libretype/` y
     `~/Library/WebKit/io.github.jrmougan.libretype/`.
   - Windows: `%APPDATA%\io.github.jrmougan.libretype\` y
     `%LOCALAPPDATA%\io.github.jrmougan.libretype\`.
3. Arranca el lector antes que la aplicación:
   - **Orca**: `Super+Alt+S` en GNOME, o `orca` desde un terminal. Modo de
     navegación con `Insert+A` (o `BloqMayús+A` en distribución portátil).
   - **VoiceOver**: `Cmd+F5`. Rotor con `VO+U` (`VO` = `Ctrl+Opción`).
   - **NVDA**: `Ctrl+Alt+N`. Alterna modo foco / navegación con `NVDA+Espacio`.
4. Ten a mano la tabla de resultados del final y anota **la frase literal** que
   dice el lector cuando no coincida con lo esperado.

En todo el guion, «recorre» significa con `Tab` y `Mayús+Tab`, sin ratón. Lo
esperado está escrito en términos de rol y nombre; cada lector lo dice con sus
palabras («botón», «button», «pulsador»).

## 1. Primera apertura

| # | Acción | Qué debe anunciarse |
|---|---|---|
| 1.1 | Abre la app | El título de la ventana, «LibreType». El foco cae en un control de la pantalla, no en el documento vacío. |
| 1.2 | Recorre el selector de tamaño | Grupo «Tamaño del texto: 100%». Cuatro botones de alternar: «Texto al 100%, pulsado», «Texto al 125%, no pulsado»… |
| 1.3 | Pulsa «Texto al 200%» | Cambia a «pulsado». El texto de la etiqueta del grupo pasa a «200%». La página **no** se desplaza. |
| 1.4 | `Ctrl+−` dos veces y `Ctrl+0` | La escala baja y vuelve al 100%. El lector no tiene por qué anunciarlo, pero no debe perder el foco. |
| 1.5 | Recorre las dos opciones de tono | Encabezado de nivel 2 «¿Cómo prefieres que sea la aplicación?». Dos botones cuyo nombre incluye «Con celebración» y «Tranquila» y su descripción. No se lee la muestra decorativa («¡Has llegado al final!») como texto suelto. |
| 1.6 | Elige «Tranquila» | Pasa a la colocación de manos. Se anuncia su encabezado. |

## 2. Antes de empezar (colocación de manos)

| # | Acción | Qué debe anunciarse |
|---|---|---|
| 2.1 | Recorre la pantalla | El encabezado del paso y su texto, que se puede leer entero en modo navegación. La navegación «Pasos de "Antes de empezar"» con «Anterior» y «Siguiente». Al cambiar de paso se anuncia el encabezado nuevo. |
| 2.2 | Llega a un paso que pide pulsar una tecla | Se dice qué tecla pulsar. Existe y se alcanza con `Tab` el botón «Saltar esta comprobación». |
| 2.3 | Termina o salta hasta el final | Lleva a la lección 1 y el foco queda en el campo de práctica. |

## 3. Barra superior y selector de lección

| # | Acción | Qué debe anunciarse |
|---|---|---|
| 3.1 | `Mayús+Tab` desde el campo hasta la barra | Cuadro combinado «Lección o modo de práctica» con el valor «1. Fila de reposo». Botones «Reiniciar esta lección» y «Pausar lección». Botones «Progreso» y «Ajustes», contraídos y de tipo «abre diálogo». Las métricas se leen como lista de definiciones: «Velocidad 0 ppm», «Precisión 100 %», «Avance 0/…». |
| 3.2 | En el selector, pulsa flecha abajo | Se anuncia la opción siguiente y la pista «Pulsa Intro para abrirla · Esc para volver». **La lección en curso no cambia**: el encabezado de la práctica sigue siendo el mismo. Este es el caso de WCAG 3.2.2. |
| 3.3 | `Esc` | El selector vuelve a decir la lección que estaba abierta. |
| 3.4 | Flecha hasta una lección bloqueada | Se anuncia como no disponible («· Bloqueada», atenuada) y no se puede elegir. |
| 3.5 | Flecha a otra lección abierta e `Intro` | Se abre esa lección y el foco pasa al campo de práctica. |
| 3.6 | Los grupos del selector | «Temario de español», «Práctica libre» (práctica continua, fluidez, texto propio) y «Tus lecciones». Arriba, «Antes de empezar» y, si queda algo por abrir, «Prueba de colocación». |

## 4. Práctica

| # | Acción | Qué debe anunciarse |
|---|---|---|
| 4.1 | Foco en el campo | Un campo de texto editable con el nombre «Campo de práctica: Fila de reposo» y, **después**, la descripción «Texto: …» con el texto de la lección. El nombre no lleva el texto entero, y al volver el foco al campo no se repite la lección como nombre. |
| 4.2 | Teclea una letra | Se anuncia la pista de la siguiente tecla («s · anular izquierdo» o similar) por la región viva, sin interrumpir a lo bruto. |
| 4.3 | `Esc` en el campo | Se pausa: se anuncia «Ejercicio pausado» y el foco pasa al botón «Reanudar». `Intro` reanuda y devuelve el foco al campo. |
| 4.4 | Lección «Tildes» con `´` + `a` | `Esc` a mitad del acento **no** pausa: cancela el acento, como en cualquier campo del sistema. |
| 4.5 | Termina la lección | Se abre un diálogo con nombre (el titular: «Lección terminada.» o la marca) y descripción (palabras por minuto, precisión y ánimo). Se anuncia **una sola vez**, no dos. |
| 4.6 | Recorre el diálogo | Botones «Repetir» y «Siguiente lección» (o «Nuevo texto», «Otra tanda», «Ver tu progreso»…). Si hubo fallos, se lee «Las teclas que más costaron esta vez: …» y el botón «Practicar estas teclas». Si hay teclas recién dominadas, «Ya escribes sin mirar…». `Esc` vuelve a la misma lección. |
| 4.7 | Espera el recordatorio de pausa (ponlo a 15 min en Ajustes) | Se anuncia una vez, cuando el lector termina lo que esté diciendo. No se lleva el foco del campo. Su botón «Vale» se alcanza con `Tab`. |

## 5. Ajustes

| # | Acción | Qué debe anunciarse |
|---|---|---|
| 5.1 | Abre «Ajustes» | Diálogo «Ajustes», foco dentro. `Tab` no sale del diálogo. |
| 5.2 | Recorre cada grupo | Cada grupo de botones se anuncia con su etiqueta («Tamaño del texto», «Tema», «Contraste», «Cómo te habla», «Animaciones», «Tipografía», «Letras del teclado en pantalla», «Mientras practicas», «Longitud de los textos de práctica», «Recordarme descansar», «Si a veces una tecla se repite sin querer», «Sonido», «Actualizaciones») y cada botón como de alternar, con su estado pulsado/no pulsado. |
| 5.3 | Deslizador «Ajuste fino» | Se anuncia como control deslizante con el valor en porcentaje («125%»), no como «1.25». Las flechas lo mueven de 5 en 5. |
| 5.4 | Contraste «Alto» | Visualmente: negro sobre blanco (o al revés con tema oscuro), bordes marcados, foco más grueso. El lector anuncia el cambio de estado del botón. |
| 5.5 | Sonido «Con sonido» | Suena una muestra. Aparece el deslizador «Volumen», con su valor en porcentaje. El sonido no tapa la voz del lector. |
| 5.6 | Distribución del teclado | Cuadro combinado con etiqueta. Recorrerlo con flechas no cambia nada más que su propio valor. |

## 6. Progreso

| # | Acción | Qué debe anunciarse |
|---|---|---|
| 6.1 | Abre «Progreso» con alguna sesión hecha | Diálogo «Progreso» con el título del tono («Tu progreso»; con varios perfiles, seguido del nombre). Un solo encabezado de nivel 2, no dos. |
| 6.2 | Lee desde el principio | La nota del objetivo y la frase de resumen. Después la lista de definiciones: «Teclas que ya escribes sin mirar: X de N», «Lecciones practicadas», «Sesiones», «Esta semana», «Días practicados», «Tiempo total», «Mejor marca». **No aparece ninguna racha.** |
| 6.3 | La gráfica | Se anuncia como imagen con el nombre «Palabras por minuto, media de cada día» y su descripción (días, primero, último y máximo). No se leen las barras una a una ni números sueltos del SVG. |
| 6.4 | Las tablas | Regiones con nombre («Marca por lección», «Evolución por días») que se pueden enfocar y desplazar con el teclado; cabeceras de columna y de fila que el lector repite al moverse por las celdas. La nota del umbral se lee entera, con su «Sin velocidad mínima». |
| 6.5 | Exportar / importar / borrar | Botones con nombre. Exportar anuncia dónde se ha guardado. Al importar con progreso, la confirmación se anuncia como alerta y ofrece «Sí, importar», «Combinar con lo que hay» y «Cancelar», con el foco en «Cancelar». |
| 6.6 | «Quién practica en este equipo» | Lista de perfiles; el activo dice «practicando ahora». Cada botón dice de quién es («Practicar como Ana», «Borrar el perfil de Ana»). Borrar pide confirmación, con el foco en «Cancelar». |
| 6.7 | «Para el docente» | Botones «Informe de … para imprimir» y «Abrir copias de varios alumnos». Al abrir un informe el foco va a su título. La tabla de la clase tiene título y cabeceras, y cada «Ver» dice de quién. |

## 7. Otros modos y pantallas

| # | Acción | Qué debe anunciarse |
|---|---|---|
| 7.1 | Texto propio | Encabezado «Práctica libre con texto propio», el campo «Tu texto» y los botones «Empezar a teclear» y «Guardar como lección». Un texto vacío o imposible se anuncia como alerta, sin perder lo escrito. |
| 7.2 | Fluidez | El campo «Campo de práctica: Fluidez». Al terminar, la valoración en el diálogo, comparada con el ritmo propio. |
| 7.3 | Prueba de colocación | Tarjeta con encabezado y botones «Empezar la prueba» y «Mejor empiezo por las lecciones». Entre tramos, el nombre del campo cambia al de la lección siguiente. Al acabar, «Prueba terminada» se anuncia como estado, sin cifras, y el foco queda en «Ir a …». |
| 7.4 | Con dos perfiles, cierra y abre | Encabezado «¿Quién practica?», con el foco en el primer nombre. Cada perfil es un botón. «No estoy en la lista» abre un campo con etiqueta; un nombre que no vale se anuncia como alerta y el campo queda marcado como no válido. |

## Resultados

Copia esta tabla por cada plataforma probada. Una fila por paso que **no** se
comporte como se espera; si todo va bien, déjalo dicho en una línea.

- Plataforma y versión del sistema:
- Versión de LibreType:
- Lector y versión:
- Fecha y quién lo prueba:

| Paso | Qué ha anunciado (literal) | Qué se esperaba | Gravedad (bloquea / molesta / detalle) |
|---|---|---|---|
| | | | |

Los fallos que **bloquean** (no se puede llegar a un control, el foco se queda
atrapado o se pierde, algo se anuncia con un nombre que no es) van a una issue
cada uno, con la plataforma en el título.
