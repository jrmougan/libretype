# Roadmap de LibreType hacia un producto sólido

Escrito en octubre de 2026 sobre la v0.2.1, a partir de cinco revisiones en
paralelo: pedagogía, accesibilidad, UX y producto, calidad técnica, y motivación
y adopción. **Actualizado en noviembre de 2026**: las fases 0 a 3 están hechas
en el código (issue #89, que reimplementó sobre `master` lo que quedaba de la PR
#57, más lo que ya había traído #75). Lo que les falta no es código: son pruebas
con personas, con lectores de pantalla y en máquinas reales, y está dicho en
cada fase.

**El objetivo** es que una persona de cualquier edad, sin ayuda técnica,
instale la app y pase de no saber dónde están las teclas a escribir con soltura
sin mirar, y que vuelva a practicar durante las semanas que eso lleva.

**De dónde se partía.** La base era buena: el temario sale de frecuencias
reales del español, el motor de acentos está validado con spikes, la ayuda
visual se retira tecla a tecla, el tono no presiona y no hay cuentas ni nube.
Los huecos estaban en tres sitios:

1. **El recorrido pedagógico no llegaba hasta la soltura.** Los textos eran
   fijos y no había fase de fluidez. *Cubierto en las fases 1 y 2.*
2. **Unos cuantos bugs rompían reglas propias** del AGENTS.md o de WCAG.
   *Cubierto en la fase 0.*
3. **No había forma de que llegase a su público.** Los binarios van sin firmar,
   no había perfiles para un aula y no se ha probado en Windows ni en un Linux
   de escritorio real. *Los perfiles y el aula, en la fase 3; la firma y las
   pruebas en máquina real siguen pendientes (fase 4).*

Esfuerzo: S = horas a 1 día · M = días · L = semanas.

Estado: **Hecho** · **Falta probar** (está en el código, pero queda una prueba
que no se puede automatizar, o una parte por decidir) · **Descartado**, con el
motivo.

---

## Fase 0 — Arreglar lo que contradice las propias reglas

| # | Problema | Estado |
|---|---|---|
| 0.1 | El resultado decía «¡Lección superada!» aunque no se hubiera superado | **Hecho.** #75: `terminada` no dice «superada» y el ánimo va en tres escalones |
| 0.2 | «Pausar» no hacía nada en práctica continua ni en texto propio | **Hecho.** #75; además `Esc` pausa desde el campo (2.6) |
| 0.3 | El `<select>` de lección saltaba de lección con cada flecha (WCAG 3.2.2) | **Hecho.** #75: `SelectConfirmado`, las flechas marcan e Intro confirma |
| 0.4 | El refuerzo sacaba palabras con teclas aún no enseñadas | **Hecho.** #75; queda fijado con el caso que lo destapó |
| 0.5 | Importar en modo «combinar» sumaba las estadísticas de teclas; «reemplazar» no era atómico | **Hecho.** Reemplazar, en #75 (`json_each`, una sentencia por tabla). Combinar, en #89: idempotente, se queda el estado con más intentos |
| 0.6 | Exportar con `<a download>` puede no guardar nada en WKWebView/WebKitGTK | **Hecho.** #75, por otro camino: comando `guardar_en_descargas`. **Descartado.** El diálogo nativo (`plugin-dialog` + `plugin-fs`) se descartó: dos dependencias y permisos más amplios para algo que Descargas resuelve |
| 0.7 | La racha volvía a 0 tras un día sin practicar | **Hecho.** Días de esta semana y total de días, que nunca baja |
| 0.8 | El umbral aparecía como número suelto | **Hecho.** #75: solo en las frases de `objetivos.ts` |
| 0.9 | La tipografía para dislexia no cargaba nada | **Hecho.** OpenDyslexic incluida (OFL), servida desde el paquete |
| 0.10 | Contraste de bordes en controles y teclas en reposo; cursor en `forced-colors` | **Hecho.** Teclas y caja de práctica con `--border-strong` (3:1) |
| 0.11 | ARIA del campo de práctica y `aria-live` anidados | **Hecho.** Nombre corto, texto como descripción, una sola región viva |
| 0.12 | Limpieza de `.qwen/` y frase de privacidad del README | **Hecho** |

---

## Fase 1 — Que se aprenda de verdad

| # | Trabajo | Estado |
|---|---|---|
| 1.1 | **Un texto nuevo en cada intento** | **Hecho.** A partir del segundo intento (`lecciones/generador.ts`): palabras del vocabulario ya enseñado mientras se estrena el alfabeto, y las `frases` de la lección después. Los dos textos seguidos de consolidación conservan el suyo |
| 1.2 | **El dominio de una tecla mira lo reciente** | **Hecho.** Ventana de 24 intentos reescalando los enteros que ya se guardaban: sin migración |
| 1.3 | **El refuerzo entra en el recorrido**, en el diálogo de resultado | **Hecho.** Con las teclas del propio intento (1.4), además del repaso de lecciones oxidadas de #75 |
| 1.4 | **Feedback concreto al terminar**: las teclas con más fallos de ese intento | **Hecho.** `fallos.ts`; el sujeto son las teclas, nunca la persona |
| 1.5 | **Frases cortas antes** y práctica continua con mayúsculas y puntuación | **Falta probar.** #75 añadió dos textos seguidos al final. Las frases antes de «Mayúsculas» no se han traído: es una decisión de contenido que conviene tomar viendo a alguien usarlo |
| 1.6 | **Símbolos del día a día** y partir «Números» | **Hecho.** `: ; " ( )` en #75; `- /` y `@ € %` en dos lecciones nuevas **al final**. **Descartado.** «Números» no se parte: el desbloqueo recorre el curso en orden y partirla retiraría algo ya acreditado |
| 1.7 | **Sonido opcional** | **Hecho.** WebAudio, sin ficheros ni red, apagado por defecto |
| 1.8 | **Ocultar métricas** y explicar qué son «ppm» | **Hecho** |
| 1.9 | **Horizonte realista** en la lección cero | **Hecho.** Dos frases, sin cifras |

**Falta para darla por cerrada:** que alguien practique 20 minutos al día
durante un mes y cuente si los textos generados se sienten variados y de la
dificultad de su lección.

---

## Fase 2 — Para cualquier edad

| # | Trabajo | Estado |
|---|---|---|
| 2.1 | **Tamaño de texto desde la primera pantalla**, Ctrl+/Ctrl− y valores fijos | **Hecho** |
| 2.2 | **Tema de alto contraste** propio y `prefers-contrast: more` | **Hecho.** Medido en `accesibilidad.test.ts` leyendo las paletas de `tokens.css` |
| 2.3 | **Temario visual** en un panel de tarjetas | **Descartado.** #75 resolvió el mismo problema con `SelectConfirmado` y `SelectorLeccion`, que agrupa por curso |
| 2.4 | **Progreso comparado con uno mismo**, resumen y gráfica | **Hecho.** Gráfica SVG con nombre y descripción; la tabla sigue como alternativa |
| 2.5 | **Fase de fluidez** | **Hecho.** Un tipo más de `Seleccion`; la meta es el ritmo propio |
| 2.6 | `Esc` pausa desde el campo; un solo «Empezar de nuevo»; aviso de lo que quita Texto propio | **Hecho.** `Esc`. Lo demás ya no aplica: #75 rehízo la barra y el editor de texto propio |
| 2.7 | **Temblor y ergonomía** | **Hecho.** Filtro de rebote opcional, recordatorio de pausa y longitud de los textos. **Falta probar.** Falta la prueba a mano de «Tildes» con teclado físico y el filtro puesto |
| 2.8 | **Ver varias palabras por delante** también al 200% | **Falta probar.** La línea del cursor va siempre arriba y caben dos líneas a 1280×800 al 200%. En ventanas más bajas al 200% sigue viéndose una entera y asoma la siguiente: darle dos obliga a quitarle alto al teclado, y eso hay que decidirlo mirándolo |
| 2.9 | **Prueba de colocación opcional** | **Hecho.** Desde el selector, nunca por edad |
| 2.10 | **Prueba manual registrada** con Orca, VoiceOver y NVDA | **Falta probar.** El guion está en `docs/prueba-lectores-pantalla.md`. **No se ha ejecutado** con ningún lector |

**Falta para darla por cerrada:** las cuatro vistas al 100% y al 200% miradas
en los tres motores, la prueba con lectores de pantalla, y la prueba con
usuarios reales (una persona de 75 años y un niño de 8 haciendo la lección cero
y la lección 1 sin ayuda).

---

## Fase 3 — Aula, biblioteca y centro de mayores

| # | Trabajo | Estado |
|---|---|---|
| 3.1 | **Persistencia robusta** | **Hecho.** Copia del `.db` antes de cada migración nueva, migraciones probadas contra un SQLite real, traspaso a SQLite de lo guardado en localStorage durante un fallo. **Descartado.** No hay comando Rust transaccional: `tauri-plugin-sql` reparte las llamadas por un pool, así que cada tabla se escribe con una sola sentencia, que sí es atómica |
| 3.2 | **Perfiles locales** | **Hecho.** Migración 4. Progreso, teclas **y lecciones propias** por perfil; las preferencias siguen siendo del equipo. La interfaz dice que no son privados entre sí |
| 3.3 | **Informe para el docente sin servidor** | **Hecho.** Tabla alfabética sin velocidad, e informe individual para imprimir o guardar como página. **Falta probar.** «Imprimir» no se ha probado en los tres motores |
| 3.4 | **Instalaciones gestionadas** | **Hecho.** Política del sistema (apagar actualizaciones, perfil por defecto) y WebView2 `offlineInstaller`. **Falta probar.** Sin probar con un MDM ni en un Windows sin WebView2 |
| 3.5 | **Comprobar el `.deb` en LliureX 23 y MAX 12** | **Falta probar.** El procedimiento está en `docs/prueba-lliurex-max.md`. **No se ha ejecutado** |

**Falta para darla por cerrada:** que un aula comparta equipos durante un
trimestre, y las pruebas en máquina real de 3.4 y 3.5.

---

## Fase 4 — Fiable e instalable sin ayuda (v1.0)

| # | Trabajo | Impacto | Esfuerzo |
|---|---|---|---|
| 4.1 | **Firma en Windows**: Azure Trusted Signing, SignPath (gratis para OSS) o la Microsoft Store. El comentario de `release.yml` no basta con Tauri v2, hace falta `signCommand` o `certificateThumbprint` | Alto | M |
| 4.2 | **macOS como plataforma de segunda (decidido: no se notariza).** Firma ad-hoc (`signingIdentity: "-"`) para que arm64 no salga como «dañado», y una guía con capturas para «Abrir de todos modos» en Ajustes del sistema, enlazada desde la página de descarga. El README dice con claridad que macOS funciona pero no está notarizado | Medio | S |
| 4.3 | **Validar la entrada donde no se ha probado.** Spike de WebView2 frente a un control nativo en `windows-latest` (las trazas de Windows hoy son reconstruidas). Sesión real con IBus en GNOME y fcitx en KDE convertida en trazas `captured` | Alto | M |
| 4.4 | **e2e de la app empaquetada** con `tauri-driver` en Linux y Windows: abrir, elegir perfil, hacer una lección, guardar, reabrir y ver el progreso. Incluye lo que jsdom no ve: imprimir el informe y el foco real de los diálogos. Prueba de actualización de N-1 a N con un `latest.json` local | Alto | M |
| 4.5 | **Diagnóstico sin telemetría**: logs rotados en release, `window.onerror` y un panel «Copiar información del fallo» con enlace a una issue prerrellenada | Medio | S/M |
| 4.6 | **Release fiable**: lint y tests en `release.yml`, toolchain de `mise.toml` en `build.yml` y `release.yml`, checksums SHA256 y `attest-build-provenance` | Medio | S |
| 4.7 | **Distribución**: Flathub (como `gestionado` en `detectarEntorno()`) y winget | Medio-alto | M |
| 4.8 | Endurecer la CSP (`object-src`, `base-uri`). Perfil de release con `lto` y `strip`. Medir el tamaño de los binarios en CI. Seguir troceando `App.svelte` (#75 sacó cinco componentes, pero con perfiles y modos nuevos vuelve a pasar de 1300 líneas y sigue fuera de cobertura) y subir los umbrales de cobertura a lo real menos 2 puntos | Medio | M |
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
4. **Las lecciones propias son de cada perfil**, como el progreso. La migración
   de perfiles deja las que había en el perfil principal.
5. **El sonido viene apagado**, y solo un `true` explícito lo enciende.
6. **Al combinar copias, de cada tecla se queda el estado con más intentos** en
   vez de sumarlos: sumar duplicaría el dominio al importar dos veces lo mismo.
7. **Una política del sistema ilegible apaga las actualizaciones.**
8. **La barra no muestra el perfil activo.** Lo dice el título del panel de
   progreso cuando hay más de uno.
9. **El teclado en pantalla se queda en monoespaciada** con la fuente para
   dislexia, para no romper su geometría.
10. **No se usa el diálogo «Guardar como» del sistema.** Las copias y el informe
    van a Descargas con `guardar_en_descargas`.
11. **Una lección nueva va al final de su curso.** En medio volvería a cerrar a
    quien ya superó las de detrás.
