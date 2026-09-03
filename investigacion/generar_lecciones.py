#!/usr/bin/env python3
"""Genera el texto de las lecciones a partir del corpus.

Para cada lección toma las palabras más frecuentes del español que (a) se
puedan escribir con las teclas vistas hasta ahí y (b) usen alguna de las
teclas nuevas, que es lo que la lección viene a practicar.

La salida se pega en src/lib/lessons.ts. Se genera una vez y se versiona: las
lecciones tienen que ser estables y revisables, no calcularse en tiempo de
ejecución.
"""
import sys
from frecuencias import cargar, cobertura

# (id, título, teclas nuevas, cuántas palabras, repeticiones para dar longitud)
PLAN = [
    ('reposo',    'Fila de reposo',            'asdfjklñ', 8, 2),
    ('vocales-1', 'Las vocales que mandan',    'eo',      10, 1),
    ('nasales',   'Las nasales y la erre',     'nr',      11, 1),
    ('vocales-2', 'Se cierran las vocales',    'itu',     12, 1),
    ('tildes',    'Tildes',                    'áéíóú',   10, 1),
    ('oclusivas', 'Las oclusivas',             'cmp',     12, 1),
    ('consonantes', 'Más consonantes',         'bgv',     12, 1),
    ('dificiles', 'Las que faltaban',          'hqy',     12, 1),
    ('raras',     'Las raras',                 'zxwkü',   10, 1),
]


def main():
    palabras = cargar(sys.argv[1] if len(sys.argv) > 1 else 'es_50k.txt')
    vistas = set()
    print('// Generado por investigacion/generar_lecciones.py\n')

    for lid, titulo, nuevas, cuantas, reps in PLAN:
        antes = set(vistas)
        vistas |= set(nuevas)

        # Palabras escribibles ya, que estrenen alguna tecla de esta lección.
        cand = [w for w, _ in palabras
                if set(w) <= vistas and set(w) & set(nuevas) and len(w) >= 2]

        # Sin repetir raíces obvias: aporta más variedad de transiciones.
        elegidas, usadas = [], set()
        for w in cand:
            if w[:3] in usadas and len(elegidas) > 3:
                continue
            usadas.add(w[:3])
            elegidas.append(w)
            if len(elegidas) == cuantas:
                break

        texto = ' '.join(elegidas * reps)
        cob = cobertura(palabras, vistas)
        print(f"  // {titulo}: {cob:.1f}% de las palabras del español")
        print(f"  id: '{lid}', nuevas: '{nuevas}', cobertura: {cob:.1f}")
        print(f"  texto: '{texto}'")
        print(f"  (antes: {''.join(sorted(antes))!r})\n")


if __name__ == '__main__':
    main()
