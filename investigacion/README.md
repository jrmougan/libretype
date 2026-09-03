# Investigación

## `frecuencias.py`

Calcula las frecuencias del español que ordenan las lecciones. El orden en que
se aprenden las teclas decide cuánto tarda el alumno en escribir su primera
palabra de verdad; esto lo mide en vez de suponerlo.

    curl -sL -o investigacion/es_50k.txt \
      https://raw.githubusercontent.com/hermitdave/FrequencyWords/master/content/2018/es/es_50k.txt
    python3 investigacion/frecuencias.py investigacion/es_50k.txt

El corpus no está versionado: son 700 KB que se bajan en un segundo.

## Lo que salió

| Dato | Valor |
|---|---|
| Palabras con tilde, diéresis o eñe | **12,97 %** |
| Pulsaciones que son la tecla `´` | **2,80 %** (más que la `p`, 2,50 %) |
| Palabras escribibles solo con la fila de reposo | **5,51 %** |
| Cobertura con 13 teclas, orden tradicional | 17,6 % |
| Cobertura con 13 teclas, orden propuesto | **28,1 %** |
| Cobertura con 13 teclas, tope teórico | 31,8 % |

Conclusiones que afectan al producto:

1. **Las tildes no son un tema avanzado.** Sin ellas te quedas fuera de una de
   cada ocho palabras. La app las enseña en la lección 6 de 8; deberían estar
   en la 5 de 9, en cuanto el alumno tiene las cinco vocales.
2. **La fila de reposo española es un mal punto de partida por sí sola.**
   Contiene cuatro de las letras más raras del idioma (`f`, `j`, `k`, `ñ`) y
   ninguna de las cinco que lo sostienen. Sigue siendo el ancla anatómica
   correcta, pero hay que salir de ella pronto.
3. **Comparar por lección engaña.** El temario tradicional parece avanzar
   rápido porque mete diez teclas de golpe. Por tecla aprendida, que es el
   esfuerzo real del alumno, va por detrás.

El análisis completo, con el mapa de calor del teclado y la parte de UI/UX para
los dos públicos, está en el documento de diseño enlazado desde el README.
