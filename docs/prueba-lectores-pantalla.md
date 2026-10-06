# Prueba manual con lectores de pantalla

Guion para que una persona lo ejecute de principio a fin y deje registrado qué
anuncia cada lector. Es el punto 2.10 del roadmap.

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
ciegas (decisión del roadmap: el modo específico queda fuera de la 1.0). Lo que
sí se exige —EN 301 549, RD 1112/2018— es que el *chrome* sea operable y se
entienda: la barra, el temario, Ajustes, Progreso y los diálogos. También lo
usan personas con baja visión que se apoyan en el lector a ratos.

## Preparación

1. Instala la versión a probar (el `.deb`, el `.dmg` o el `.msi` de la Release,
   no `pnpm dev`: el motor tiene que ser el de la plataforma).
2. Empieza **sin datos**, para pasar por la primera apertura. El
   identificador de la app es `io.github.jrmougan.libretype`; borra (o mueve a
   otro sitio, si quieres conservarlos) el directorio de datos y el del WebView:
   - Linux: `~/.local/share/io.github.jrmougan.libretype/`.
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
| 1.5 | Recorre las dos opciones de tono | Encabezado de nivel 2 «¿Cómo prefieres que sea la aplicación?». Dos botones cuyo nombre incluye «Con celebración» y «Tranquila» y su descripción. No se lee la muestra decorativa («¡Lección superada!») como texto suelto. |
| 1.6 | Elige «Tranquila» | Pasa a la lección cero. Se anuncia su encabezado. |

## 2. Lección cero

| # | Acción | Qué debe anunciarse |
|---|---|---|
| 2.1 | Recorre la pantalla | Encabezados de cada paso en orden. El texto largo se puede leer entero en modo navegación. |
| 2.2 | Llega a un paso que pide pulsar una tecla | Se dice qué tecla pulsar. Existe y se alcanza con `Tab` el botón «Saltar esta comprobación». |
| 2.3 | Termina o salta hasta el final | Lleva a la lección 1 y el foco queda en el campo de práctica. |

## 3. Barra superior y temario (0.3, 2.3)

| # | Acción | Qué debe anunciarse |
|---|---|---|
| 3.1 | `Mayús+Tab` desde el campo hasta la barra | Botón «Temario · 1. Fila de reposo», contraído. Botones «Empezar de nuevo», «Pausar» (de alternar, no pulsado), «Progreso» y «Ajustes», contraídos. Las métricas se leen como lista de definiciones: «Velocidad 0 ppm», «Precisión 100 %», «Avance 0/…». |
| 3.2 | Abre «Temario» | Se anuncia un diálogo llamado «Temario». El foco entra en él (normalmente en «Cerrar»). `Tab` no sale del diálogo. |
| 3.3 | Recorre las tarjetas | Encabezados «Antes de empezar», «Lecciones», «Práctica libre», «¿Ya escribes algo?». Las lecciones se anuncian como lista numerada. Cada tarjeta es un botón con su título y estado: «Superada», «Disponible · a tu ritmo» o «Cerrada. Se abre al superar «…». A tu ritmo.». |
| 3.4 | **Moverse por la lista no cambia nada** | Recorrer con `Tab` (y con las flechas en modo navegación) solo mueve el foco; la lección en curso sigue siendo la misma. Este es el fallo de WCAG 3.2.2 que tenía el `<select>`. |
| 3.5 | Enfoca una lección cerrada | Se anuncia como botón **no disponible / atenuado** y se lee el motivo. Pulsarla no hace nada ni cierra el panel. |
| 3.6 | La lección actual | Su tarjeta se anuncia como «actual» (`aria-current`) y lleva el texto «Estás aquí». |
| 3.7 | `Esc` | Se cierra el diálogo y el foco vuelve al campo de práctica. |

## 4. Práctica

| # | Acción | Qué debe anunciarse |
|---|---|---|
| 4.1 | Foco en el campo | Un campo de texto editable con el nombre «Escribe el texto de la lección: …». No se repite el texto dos veces seguidas (la etiqueta exterior y la del campo). |
| 4.2 | Teclea una letra | Se anuncia la pista de la siguiente tecla («s · anular izquierdo» o similar) por la región viva, sin interrumpir a lo bruto. |
| 4.3 | `Esc` en el campo | Se pausa: se anuncia «Ejercicio pausado» y aparece el botón «Reanudar». El foco no se queda en un campo deshabilitado sin salida. |
| 4.4 | Lección «Tildes» con `´` + `a` | `Esc` a mitad del acento **no** pausa: cancela el acento, como en cualquier campo del sistema. |
| 4.5 | Termina la lección | Se abre un diálogo con nombre (el titular: «Lección terminada.» o la marca) y descripción (palabras por minuto, precisión y ánimo). Se anuncia una sola vez, no dos. |
| 4.6 | Recorre el diálogo | Botones «Repetir» y «Siguiente lección» (o «Nuevo texto», «Otra tanda»…). Si hay teclas recién dominadas, se lee «Ya escribes sin mirar…». `Esc` vuelve a la misma lección. |
| 4.7 | Espera el recordatorio de pausa (ponlo a 15 min en Ajustes) | Se anuncia una vez, cuando el lector termina lo que esté diciendo. No se lleva el foco del campo. Su botón «Vale» se alcanza con `Tab`. |

## 5. Ajustes

| # | Acción | Qué debe anunciarse |
|---|---|---|
| 5.1 | Abre «Ajustes» | Diálogo «Ajustes», foco dentro. |
| 5.2 | Recorre cada grupo | Cada grupo de botones se anuncia con su etiqueta («Tema», «Contraste», «Cómo te habla», «Animaciones», «Tipografía», «Letras del teclado en pantalla», «Longitud de los textos de práctica», «Recordarme descansar», «Si a veces una tecla se repite sin querer») y cada botón como de alternar, con su estado pulsado/no pulsado. |
| 5.3 | Deslizador «Ajuste fino» | Se anuncia como control deslizante con el valor en porcentaje («125%»), no como «1.25». Las flechas lo mueven de 5 en 5. |
| 5.4 | Contraste «Alto» | Visualmente: negro sobre blanco (o al revés con tema oscuro), bordes marcados, foco más grueso. El lector anuncia el cambio de estado del botón. |
| 5.5 | Distribución del teclado | Cuadro combinado con etiqueta. Recorrerlo con flechas no cambia nada más que su propio valor. |

## 6. Progreso

| # | Acción | Qué debe anunciarse |
|---|---|---|
| 6.1 | Abre «Progreso» con alguna sesión hecha | Diálogo con el título del tono («Tu progreso»). Un solo encabezado de nivel 2, no dos. |
| 6.2 | Lee desde el principio | Primero la frase de resumen. Después la lista de definiciones: «Teclas que ya escribes sin mirar: X de N», «Esta semana», «Días practicados», «Tiempo total». **No aparece ninguna racha.** |
| 6.3 | La gráfica | Se anuncia como imagen con el nombre «Palabras por minuto, media de cada día» y su descripción (días, primero, último y máximo). No se leen las barras una a una ni números sueltos del SVG. |
| 6.4 | «Ver los datos de cada día» | Se anuncia como botón desplegable (contraído/expandido). Dentro, una tabla con cabeceras de columna que el lector repite al moverse por las celdas. |
| 6.5 | Tabla de lecciones | Título de la tabla («Marca por lección»), cabeceras de columna y de fila. La nota del umbral se lee entera, con su «sin velocidad mínima». |
| 6.6 | Exportar / importar / borrar | Botones con nombre. Las confirmaciones se anuncian como alerta. |

## 7. Texto propio, fluidez y prueba de colocación

| # | Acción | Qué debe anunciarse |
|---|---|---|
| 7.1 | Texto propio con comillas tipográficas o rayas | Al empezar, el aviso «Se han quitado «“» «”»…» se anuncia como estado. |
| 7.2 | Fluidez | El encabezado «Fluidez» y la explicación. Al terminar, la valoración en el diálogo. |
| 7.3 | Prueba de colocación | Pantalla con encabezado y botones «Empezar la prueba» y «Mejor empiezo por las lecciones». Entre tramos, el encabezado cambia al de la lección siguiente. Al acabar, «Prueba terminada» se anuncia como estado, sin cifras. |

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
