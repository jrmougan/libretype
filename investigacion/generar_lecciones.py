#!/usr/bin/env python3
"""Genera el texto de las lecciones a partir del corpus.

Para cada lección toma las palabras más frecuentes del español que (a) se
puedan escribir con las teclas vistas hasta ahí y (b) usen alguna de las
teclas nuevas, que es lo que la lección viene a practicar.

La salida se pega en src/lib/lecciones/cursos/espanol.ts. Se genera una vez y se versiona: las
lecciones tienen que ser estables y revisables, no calcularse en tiempo de
ejecución.
"""
import sys
from frecuencias import cargar, cobertura

# (id, título, teclas nuevas, cuántas palabras, repeticiones para dar longitud)
PLAN = [
    ('reposo',    'Fila de reposo',            'asdfjklñ', 26, 1),
    ('vocales-1', 'Las vocales que mandan',    'eo',      30, 1),
    ('nasales',   'La N y la R',               'nr',      30, 1),
    ('vocales-2', 'Las cinco vocales',         'itu',     30, 1),
    ('tildes',    'Tildes',                    'áéíóú',   30, 1),
    ('oclusivas', 'La C, la M y la P',         'cmp',     30, 1),
    ('consonantes', 'La B, la G y la V',       'bgv',     30, 1),
    ('dificiles', 'La H, la Q y la Y',         'hqy',     30, 1),
    ('raras',     'Las raras',                 'zxwü',    30, 1),
]

# El corpus son subtítulos: entre las palabras frecuentes hay tacos, nombres de
# personajes y palabras que no se le ponen delante a un niño. Esto quita lo más
# gordo, pero la revisión a mano sigue haciendo falta; lo que importa de verdad
# lo vigila la lista de exclusión de `src/lib/lecciones/contenido.test.ts`.
EXCLUIDAS = {
    'joder', 'mierda', 'sexo', 'sexual', 'sexy', 'culo', 'puta', 'puto', 'coño',
    'muerto', 'muerte', 'matar', 'sangre', 'guerra', 'senos', 'embarazada',
    'whisky', 'cerveza', 'lsd',
}


def main():
    palabras = cargar(sys.argv[1] if len(sys.argv) > 1 else 'es_50k.txt')
    vistas = set()
    print('// Generado por investigacion/generar_lecciones.py\n')

    for lid, titulo, nuevas, cuantas, reps in PLAN:
        antes = set(vistas)
        vistas |= set(nuevas)

        # Palabras escribibles ya, que estrenen alguna tecla de esta lección.
        cand = [w for w, _ in palabras
                if set(w) <= vistas and set(w) & set(nuevas) and len(w) >= 2
                and w not in EXCLUIDAS]

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
