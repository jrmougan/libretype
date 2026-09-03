#!/usr/bin/env python3
"""Frecuencias del español para ordenar las lecciones.

El orden en que se aprenden las teclas decide cuánto tarda el alumno en
escribir su primera palabra de verdad. Este guion calcula ese dato en vez de
suponerlo.

Fuente: FrequencyWords (español, 50 000 palabras, corpus de subtítulos),
ponderado por apariciones reales.

    curl -sL -o es_50k.txt \
      https://raw.githubusercontent.com/hermitdave/FrequencyWords/master/content/2018/es/es_50k.txt
    python3 frecuencias.py es_50k.txt

Limitación: al venir de subtítulos refleja español conversacional. Encaja bien
con un tutor para niños y adultos, pero infrarrepresenta el vocabulario formal
y técnico. Para lecciones de texto administrativo habría que recalcularlo.
"""
import sys
from collections import Counter

RE = 'asdfjklñ'  # fila de reposo del teclado español


def cargar(ruta):
    palabras = []
    for linea in open(ruta, encoding='utf-8'):
        p = linea.split()
        if len(p) == 2 and p[0].isalpha():
            palabras.append((p[0], int(p[1])))
    return palabras


def frecuencia_letras(palabras):
    c = Counter()
    for w, f in palabras:
        for ch in w:
            c[ch] += f
    total = sum(c.values())
    return {ch: 100 * n / total for ch, n in c.items()}


def cobertura(palabras, alfabeto):
    """% de palabras realmente escritas que se pueden teclear con esas letras."""
    s, total = set(alfabeto), sum(f for _, f in palabras)
    return 100 * sum(f for w, f in palabras if set(w) <= s) / total


def curva(palabras, orden):
    """Cobertura tras aprender cada tecla, en ese orden."""
    s, out = set(), []
    for ch in orden:
        s.add(ch)
        out.append((len(s), round(cobertura(palabras, s), 1)))
    return out


def orden_voraz(palabras, base=RE):
    """Mejor orden posible por cobertura. Cota superior, no un temario."""
    s = set(base)
    resto = set('abcdefghijklmnopqrstuvwxyzáéíóúüñ') - s
    orden = list(base)
    while resto:
        mejor = max(resto, key=lambda c: cobertura(palabras, s | {c}))
        s.add(mejor); resto.discard(mejor); orden.append(mejor)
    return orden


# Progresión propuesta: mantiene el reposo como ancla anatómica, pero mete tres
# teclas por lección en vez de diez y ordena por rentabilidad en español.
PROPUESTA = [
    ('Reposo', RE), ('Las dos vocales que mandan', 'eo'),
    ('Las nasales y la erre', 'nr'), ('Se cierran las vocales', 'itu'),
    ('Tildes', 'áéíóú'), ('Las oclusivas', 'cmp'),
    ('Resto de consonantes', 'bgv'), ('Las difíciles', 'hqy'),
    ('Las raras', 'zxwkü'),
]

TRADICIONAL = [
    ('Reposo', RE), ('Fila superior', 'qwertyuiop'),
    ('Fila inferior', 'zxcvbnm'), ('Tildes', 'áéíóúü'),
]


def main():
    palabras = cargar(sys.argv[1] if len(sys.argv) > 1 else 'es_50k.txt')
    fr = frecuencia_letras(palabras)

    print('=== LETRAS MÁS FRECUENTES ===')
    for ch, pct in sorted(fr.items(), key=lambda x: -x[1])[:12]:
        print(f'  {ch}  {pct:5.2f}%')

    acentos = sum(fr.get(c, 0) for c in 'áéíóú')
    total_p = sum(f for _, f in palabras)
    con = sum(f for w, f in palabras if any(c in 'áéíóúüñ' for c in w))
    print(f'\n  tecla del acento: {acentos:.2f}% de las pulsaciones '
          f'(la «p» es {fr.get("p", 0):.2f}%)')
    print(f'  palabras con tilde, diéresis o eñe: {100 * con / total_p:.2f}%')

    for nombre, plan in (('PROPUESTA', PROPUESTA), ('TRADICIONAL', TRADICIONAL)):
        print(f'\n=== {nombre} ===')
        acc = ''
        for i, (titulo, nuevas) in enumerate(plan, 1):
            acc += nuevas
            print(f'  {i}. {titulo:28} {cobertura(palabras, acc):6.2f}%')

    print('\n=== POR TECLA APRENDIDA (la comparación justa) ===')
    cp = dict(curva(palabras, ''.join(n for _, n in PROPUESTA)))
    ct = dict(curva(palabras, ''.join(n for _, n in TRADICIONAL)))
    cv = dict(curva(palabras, orden_voraz(palabras)))
    print(f'  {"teclas":>7} {"propuesta":>10} {"tradicional":>12} {"tope":>7}')
    for n in (8, 13, 18, 23, 28):
        print(f'  {n:>7} {cp.get(n, "-"):>10} {ct.get(n, "-"):>12} {cv.get(n, "-"):>7}')


if __name__ == '__main__':
    main()
