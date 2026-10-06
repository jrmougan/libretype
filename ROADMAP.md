# Roadmap de LibreType hacia un producto sólido

Octubre de 2026, sobre la v0.2.1. Sale de cinco revisiones en paralelo:
pedagogía, accesibilidad, UX y producto, calidad técnica, y motivación y
adopción. Los hallazgos marcados con ✔ están comprobados en el código.

**El objetivo** es que una persona de cualquier edad, sin ayuda técnica,
instale la app y pase de no saber dónde están las teclas a escribir con soltura
sin mirar, y que vuelva a practicar durante las semanas que eso lleva.

**Estado de partida.** La base es buena:

- el temario sale de frecuencias reales del español;
- el motor de acentos está validado con spikes;
- la ayuda visual se retira tecla a tecla;
- el tono no presiona;
- no hay cuentas ni nube;
- hay 379 tests en verde y un 92 % de cobertura.

Los huecos están en tres sitios:

1. **El recorrido pedagógico no llega hasta la soltura.** Los textos son fijos y
   no hay fase de fluidez.
2. **Unos cuantos bugs rompen reglas propias** del AGENTS.md o de WCAG.
3. **Hoy no hay forma de que llegue a su público.** Los binarios van sin firmar,
   no hay perfiles para un aula y no se ha probado en Windows ni en un Linux de
   escritorio real.

Esfuerzo: S = horas a 1 día · M = días · L = semanas.

---

## Fase 0 — Arreglar lo que contradice las propias reglas (v0.2.2)

Todo es de esfuerzo S. Va primero porque son bugs o incumplimientos, no mejoras.

| # | Problema | Dónde | Por qué urge |
|---|---|---|---|
| 0.1 | ✔ El resultado dice «¡Lección superada!» con el tono lúdico aunque no se haya superado. ✔ El ternario de `animoAlto` da lo mismo en las dos ramas. | `App.svelte:653`, `voz.ts` | Un niño se queda con el titular y no entiende por qué no se desbloquea la siguiente lección |
| 0.2 | ✔ «Pausar» no hace nada en Práctica continua ni en Texto propio, y la pausa al perder el foco solo existe en lecciones | `App.svelte:543-602` | El botón engaña (`aria-pressed`) y el cronómetro sigue corriendo |
| 0.3 | El `<select>` de lección salta de lección con cada flecha y se lleva el foco | `App.svelte:423, 534` | WCAG 3.2.2: con teclado no se puede recorrer la lista |
| 0.4 | ✔ El refuerzo saca palabras con teclas aún no enseñadas | `refuerzo.ts:108` | Rompe la regla «no usar teclas sin enseñar» |
| 0.5 | ✔ Importar en modo «combinar» **suma** las estadísticas de teclas: importar dos veces la misma copia falsea el dominio. «Reemplazar» borra y reinserta sin transacción | `almacen.ts:226-258` | Pérdida o corrupción de datos del alumno |
| 0.6 | Exportar usa `Blob` + `<a download>`, que en WKWebView/WebKitGTK puede no guardar nada. Verificar y pasar a un diálogo nativo (`plugin-dialog` + `plugin-fs`) | `Progreso.svelte:95` | La copia de seguridad es la única salida de los datos |
| 0.7 | ✔ La racha vuelve a 0 tras un día sin practicar. Sustituir por «esta semana: N días» y un total de días que nunca baje | `Progreso.svelte:198` | Mecánica de aversión a la pérdida; reprende con un número |
| 0.8 | ✔ «90% de acierto» aparece como número suelto (es `PCT_MINIMO_PARA_RECORD`, por eso el test no lo detecta). Pasar por `objetivos.ts` y ampliar el test a ese umbral | `Progreso.svelte:282`, `objetivos.test.ts` | Mismo razonamiento que `PCT_OBJETIVO` |
| 0.9 | ✔ La tipografía para dislexia no carga nada: OpenDyslexic no viene incluida y Comic Sans no existe en Linux. Incluir una fuente OFL (OpenDyslexic o Atkinson Hyperlegible) | `tokens.css:273`, `public/` | Promesa de accesibilidad incumplida |
| 0.10 | Contraste de bordes 1,46:1 en controles y teclas en reposo. El cursor desaparece en `forced-colors`. `border` sobre un `<g>` de SVG no tiene efecto | `tokens.css`, `Keyboard.svelte`, `Drill.svelte` | WCAG 1.4.11 |
| 0.11 | ARIA del campo de práctica: el `aria-label` contiene la lección entera, el botón «Reanudar» queda dentro del `<label>` y hay dos `aria-live` anidados | `Drill.svelte:289-307`, `App.svelte:638` | WCAG 4.1.2 |
| 0.12 | Limpieza: borrar `.qwen/tmp/` e ignorar `.qwen/`, `.claude/` y `.gemini/`. La línea 16 del README dice «sin servidores» sin mencionar el actualizador | `.gitignore`, `README.md` | Coherencia con la promesa de privacidad |

**Hecho cuando** cada punto tenga su test con nombre, como los bugs del motor.

---

## Fase 1 — Que se aprenda de verdad (v0.3)

El núcleo pedagógico. Sin esto, el resto de pulido da igual.

| # | Trabajo | Impacto | Esfuerzo |
|---|---|---|---|
| 1.1 | **Un texto nuevo en cada intento**, generado con el vocabulario de la lección y con más peso en las teclas que estrena. Hoy son unas 12 palabras fijas que al tercer intento se recitan de memoria, así que el 90% mide memoria y no destreza. `lessons.test.ts` sigue valiendo sobre el generador | Alto | M |
| 1.2 | **El dominio de una tecla mira lo reciente** (ventana de los últimos N intentos o media que pese más lo reciente), no toda la vida. Mantiene las reglas de 8 intentos, 90% y 0,65. Requiere migración nueva | Alto | S |
| 1.3 | **El refuerzo de teclas flojas entra en el recorrido**: se ofrece en el diálogo de resultado, junto al repaso, en vez de quedarse escondido en Progreso | Alto | S |
| 1.4 | **Feedback concreto al terminar**: las 2–3 teclas o pares con más fallos de ese intento | Medio | S |
| 1.5 | **Frases cortas antes** (desde «oclusivas» ya hay un 67,7% de cobertura) y que la práctica continua mantenga mayúsculas y puntuación una vez aprendidas | Alto | M |
| 1.6 | **Símbolos del día a día** (`: ; - " ( ) / % € @`) al final del temario. Partir «Números» en dos lecciones de 5 teclas (regla de no estrenar más de cinco). Escribir el propio correo es el primer uso real de un adulto | Alto | S/M |
| 1.7 | **Sonido opcional** (acierto, error y fin), suave, sin red y desactivable. Hoy no hay audio en ningún sitio | Alto | M |
| 1.8 | Preferencia **«Ocultar métricas mientras practico»** y explicar qué son «ppm» (TDAH, ansiedad, niños) | Medio | S |
| 1.9 | **Horizonte realista** en la lección cero y en las dos voces: «lleva unas semanas, un rato cada día». Anticipar la meseta de la 2ª–3ª semana, que es cuando se abandona | Medio | S |

**Hecho cuando** una persona pueda practicar 20 minutos al día durante un mes
sin repetir texto, y cada sesión trabaje lo que le cuesta.

---

## Fase 2 — Para cualquier edad (v0.4)

| # | Trabajo | Impacto | Esfuerzo |
|---|---|---|---|
| 2.1 | **Tamaño de texto desde la primera pantalla**, Ctrl+/Ctrl− conectados a `--ui-scale` y botones de valor fijo (100/125/150/200) además del deslizador, que con temblor cuesta | Alto | S |
| 2.2 | **Tema de alto contraste** propio y respeto a `prefers-contrast: more`. En Linux y macOS no existe `forced-colors` | Alto | M |
| 2.3 | **Temario visual**: un panel superpuesto con tarjetas en lugar del `<select>`, que diga por qué está bloqueada cada lección (sin número suelto) | Alto | M |
| 2.4 | **Progreso comparado con uno mismo**: «teclas que ya escribes sin mirar: 18 de 33», «hace dos semanas te costaba 6 intentos; hoy, 2». Contar la retirada de la ayuda visual como logro al terminar la lección. Un resumen en una frase y una gráfica sencilla en vez de seis métricas | Alto | M |
| 2.5 | **Fase de fluidez**: tandas de palabras y bigramas muy frecuentes, con metas contra el propio ritmo anterior y nunca a costa de la precisión | Alto | M |
| 2.6 | Esc pausa desde el campo (respetando `isComposing`). Dejar un solo «Empezar de nuevo» de los tres que hay. Avisar de qué caracteres quitó Texto propio | Medio | S |
| 2.7 | **Temblor y ergonomía**: ignorar una repetición involuntaria del mismo carácter en menos de ~60 ms (opcional), enlazar a las teclas de rebote del sistema, recordatorio amable de pausa cada ~20 minutos y textos cortos o largos a elegir | Medio | M |
| 2.8 | **Ver varias palabras por delante** del cursor también al 200%: los mecanógrafos mayores compensan leyendo por delante (Salthouse) | Medio | S |
| 2.9 | **Prueba de colocación opcional** para quien ya sabe algo, ofrecida por preferencia y nunca por edad | Medio | M |
| 2.10 | **Prueba manual registrada** con Orca/WebKitGTK, VoiceOver/WKWebView y NVDA/WebView2: tres árboles de accesibilidad distintos | Alto | M |

**Hecho cuando** las cuatro vistas pasen al 100% y al 200%, con alto contraste
y con lector de pantalla, y cuando una persona de 75 años y un niño de 8 puedan
hacer la lección cero y la lección 1 sin ayuda (prueba con usuarios reales).

---

## Fase 3 — Aula, biblioteca y centro de mayores (v0.5)

Va antes de la 1.0: el primer público son los colegios y los equipos
compartidos. Los perfiles meten una migración, así que la persistencia robusta
va primero, en esta misma fase.

| # | Trabajo | Impacto | Esfuerzo |
|---|---|---|---|
| 3.1 | **Persistencia robusta (requisito de 3.2)**: importar y reemplazar como comando Rust transaccional, copia del `.db` antes de cada migración, test de migraciones real, comprobar `version` al importar y reconciliar lo que quedó en localStorage si SQLite falló | Alto | M |
| 3.2 | **Perfiles locales** («¿Quién practica?», con alias y sin contraseña). Progreso y dominio de teclas por perfil, con migración nueva; las preferencias siguen siendo del equipo. Hay que decir con claridad que en un equipo compartido los perfiles no son privados entre sí | Alto | M |
| 3.3 | **Informe para el docente sin servidor**: resumen imprimible por alumno y un modo «abrir varias copias» que las junte en una tabla. Muestra evolución y lecciones superadas, sin clasificaciones ni orden por velocidad | Alto | M |
| 3.4 | **Instalaciones gestionadas**: desactivar el actualizador por política o fichero de sistema, y elegir un perfil por defecto para el aula. WebView2 en `offlineInstaller` para aulas sin red | Alto | S/M |
| 3.5 | **Comprobar el `.deb` en LliureX 23 y MAX 12** (las dos sobre Ubuntu 22.04) en máquina real | Alto | S |

**Hecho cuando** un aula de 25 alumnos pueda compartir 10 equipos durante un
trimestre y el docente pueda ver la evolución de cada uno sin que ningún dato
salga de los equipos.

---

## Fase 4 — Fiable e instalable sin ayuda (v1.0)

| # | Trabajo | Impacto | Esfuerzo |
|---|---|---|---|
| 4.1 | **Firma en Windows**: Azure Trusted Signing, SignPath (gratis para OSS) o la Microsoft Store. El comentario de `release.yml` no basta con Tauri v2, hace falta `signCommand` o `certificateThumbprint` | Alto | M |
| 4.2 | **macOS como plataforma de segunda (decidido: no se notariza).** Firma ad-hoc (`signingIdentity: "-"`) para que arm64 no salga como «dañado», y una guía con capturas para «Abrir de todos modos» en Ajustes del sistema, enlazada desde la página de descarga. El README dice con claridad que macOS funciona pero no está notarizado | Medio | S |
| 4.3 | **Validar la entrada donde no se ha probado.** Spike de WebView2 frente a un control nativo en `windows-latest` (las trazas de Windows hoy son reconstruidas). Sesión real con IBus en GNOME y fcitx en KDE convertida en trazas `captured` | Alto | M |
| 4.4 | **e2e de la app empaquetada** con `tauri-driver` en Linux y Windows: abrir, elegir perfil, hacer una lección, guardar, reabrir y ver el progreso. Prueba de actualización de N-1 a N con un `latest.json` local | Alto | M |
| 4.5 | **Diagnóstico sin telemetría**: logs rotados en release, `window.onerror` y un panel «Copiar información del fallo» con enlace a una issue prerrellenada | Medio | S/M |
| 4.6 | **Release fiable**: lint y tests en `release.yml`, toolchain de `mise.toml` en `build.yml` y `release.yml`, checksums SHA256 y `attest-build-provenance` | Medio | S |
| 4.7 | **Distribución**: Flathub (como `gestionado` en `detectarEntorno()`) y winget | Medio-alto | M |
| 4.8 | Endurecer la CSP (`object-src`, `base-uri`). Perfil de release con `lto` y `strip`. Medir el tamaño de los binarios en CI. Trocear `App.svelte` (1094 líneas, fuera de cobertura) y subir los umbrales de cobertura a lo real menos 2 puntos | Medio | M |
| 4.9 | **Declaración de accesibilidad** EN 301 549 / RD 1112/2018, diciendo con honestidad qué se cumple y qué no (incluido que la práctica no está pensada para personas ciegas) | Alto (centros públicos) | S |
| 4.10 | **Adopción escolar**: ficha técnica de una página (sin red salvo actualizaciones, que se pueden apagar; sin cuentas; licencia libre) y propuesta a Vitalinux, empezando por una sola comunidad | Alto | S (gestión) |

**Hecho cuando** alguien no técnico instale la app en Windows y Ubuntu sin pasar
por un aviso de seguridad (y en macOS con una guía de un paso), y ninguna
operación pueda dejarle sin progreso.

---

## Fase 5 — Más público (v1.x)

| # | Trabajo | Impacto | Esfuerzo |
|---|---|---|---|
| 5.1 | **Distribución latinoamericana** y textos aislados en un módulo (sin librería de i18n) | Alto | M |
| 5.2 | **Escritura libre**: una pregunta y el alumno contesta sin modelo; solo se mide el ritmo. Es la transferencia a escribir de verdad | Medio | M |
| 5.3 | **Guía para quien acompaña** (PDF): sesiones de 20 minutos, cómo ayudar sin teclear por la otra persona | Medio | S |

## Más adelante, a explorar

- Catalán, gallego y euskera.
- Modo para personas ciegas (decidido: fuera de la 1.0): anunciar errores y
  palabra actual, con audio pregrabado.
- Audio para quien aún no lee.
- Un juego sin reloj que solo cuente la precisión.
- Diploma imprimible.
- Temario para una sola mano.
- Recordatorio local opcional.

## Lo que no se hace

Contradice la investigación o las reglas del proyecto:

- **Clasificaciones**, ni siquiera entre perfiles del mismo equipo.
- **Rachas que se pierden**, «protectores de racha» o «¡vas a perder tu racha!».
- **Puntos, monedas, cofres o recompensas al azar.** La fiesta del tono lúdico va
  en cómo se celebra, no en una economía de premios.
- **Metas de velocidad**, o umbrales como número suelto en avisos, informes o
  insignias.
- **Telemetría o informes a un servidor «para el profesor».**
- **Elegir perfil, temario o tono por edad o curso.**

## Decisiones tomadas

1. **No se notariza en macOS.** Queda como plataforma de segunda: firma ad-hoc
   y guía para abrirla (4.2).
2. **Las personas ciegas no entran en la 1.0.** El modo específico pasa a «Más
   adelante». La prueba con lectores de pantalla (2.10) se mantiene: el *chrome*
   (menús, ajustes, progreso) lo exige EN 301 549 y lo usan también personas
   con baja visión. El sonido (1.7) sigue en la fase 1 porque sirve a todos.
3. **Perfiles antes de la 1.0.** El aula pasa a ser la fase 3 (v0.5), con la
   persistencia robusta como requisito previo, y la 1.0 pasa a la fase 4.
