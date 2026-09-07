/**
 * La primera versión de estas lecciones me las inventé: el orden no salía de
 * ningún dato y la primera lección era medio palabras falsas. Estos tests
 * fijan las propiedades que hacen que un temario sea coherente, para que la
 * próxima persona que añada una lección no pueda romperlas sin enterarse.
 */
import { describe, it, expect } from 'vitest';
import { alfabetoHasta, generarTextoPractica, LESSONS, nivelDesbloqueado, normalizarTextoLibre, vocabularioHasta } from './lessons';
import { buildIndex, ES_ISO } from './keyboard/layouts';

describe('coherencia del temario', () => {
  it('los identificadores no se repiten', () => {
    const ids = LESSONS.map((l) => l.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('ninguna lección usa una tecla que todavía no ha enseñado', () => {
    // Este es el test que importa. Una lección que pide una letra que el
    // alumno no ha visto lo deja atascado: el teclado en pantalla marcaría
    // una tecla sobre la que nadie le ha dicho nada.
    LESSONS.forEach((leccion, i) => {
      const permitidas = alfabetoHasta(i);
      const intrusas = [...new Set([...leccion.text])]
        .filter((ch) => ch !== ' ' && !permitidas.has(ch));
      expect(intrusas, `"${leccion.title}" usa ${intrusas.join(' ')} antes de tiempo`)
        .toEqual([]);
    });
  });

  it('cada lección practica de verdad las teclas que estrena', () => {
    // Si el texto no contiene ninguna tecla nueva, la lección no enseña nada.
    LESSONS.forEach((leccion) => {
      const nuevas = [...leccion.nuevas];
      const usadas = nuevas.filter((ch) => leccion.text.includes(ch));
      expect(usadas.length, `"${leccion.title}" no usa ninguna de: ${leccion.nuevas}`)
        .toBeGreaterThan(0);
    });
  });

  it('ninguna tecla se enseña dos veces', () => {
    const vistas = new Set<string>();
    for (const leccion of LESSONS) {
      for (const ch of leccion.nuevas) {
        expect(vistas.has(ch), `${ch} se enseña otra vez en "${leccion.title}"`).toBe(false);
        vistas.add(ch);
      }
    }
  });

  it('el temario cubre el alfabeto español completo', () => {
    const total = alfabetoHasta(LESSONS.length - 1);
    for (const ch of 'abcdefghijklmnopqrstuvwxyzñáéíóúü') {
      expect(total.has(ch), `falta enseñar ${ch}`).toBe(true);
    }
  });
});

describe('progresión', () => {
  it('la cobertura solo sube durante el alfabeto básico y se mantiene al 100% después', () => {
    const iRaras = LESSONS.findIndex((l) => l.id === 'raras');
    for (let i = 1; i <= iRaras; i++) {
      expect(LESSONS[i].cobertura,
        `"${LESSONS[i].title}" no aporta nada sobre "${LESSONS[i - 1].title}"`)
        .toBeGreaterThan(LESSONS[i - 1].cobertura);
    }
    for (let i = iRaras + 1; i < LESSONS.length; i++) {
      expect(LESSONS[i].cobertura).toBe(100);
    }
  });

  it('empieza por la fila de reposo, que es el ancla de los dedos', () => {
    expect([...LESSONS[0].nuevas].sort().join('')).toBe([...'asdfjklñ'].sort().join(''));
  });

  it('las tildes se enseñan antes de la segunda mitad del temario', () => {
    // Una de cada ocho palabras del español lleva tilde, diéresis o eñe, y la
    // tecla del acento se pulsa más que la p. Dejarlas para el final sería
    // heredar un temario pensado para el inglés.
    const i = LESSONS.findIndex((l) => [...l.nuevas].some((c) => 'áéíóú'.includes(c)));
    expect(i).toBeGreaterThanOrEqual(0);
    expect(i, 'las tildes están demasiado al final').toBeLessThan(LESSONS.length / 2);
  });

  it('las tildes llegan cuando ya están las cinco vocales', () => {
    const iTildes = LESSONS.findIndex((l) => l.nuevas.includes('á'));
    const antes = alfabetoHasta(iTildes - 1);
    for (const v of 'aeiou') {
      expect(antes.has(v), `falta la ${v} antes de enseñar las tildes`).toBe(true);
    }
  });

  it('se sale de la fila de reposo en la segunda lección', () => {
    // Con asdfjklñ solo se puede escribir el 5,5% de las palabras. Quedarse
    // ahí es teclear sílabas sin sentido.
    expect(LESSONS[1].cobertura).toBeGreaterThan(LESSONS[0].cobertura * 2);
  });

  it('ninguna lección mete demasiadas teclas de golpe en el alfabeto básico', () => {
    // El temario tradicional presenta las diez teclas de una fila a la vez.
    // Parece que avanza rápido, pero la carga por lección es enorme.
    const iRaras = LESSONS.findIndex((l) => l.id === 'raras');
    LESSONS.slice(1, iRaras + 1).forEach((l) => {
      expect(l.nuevas.length, `"${l.title}" estrena ${l.nuevas.length} teclas`)
        .toBeLessThanOrEqual(5);
    });
  });
});

describe('los textos son español de verdad', () => {
  it('nada de relleno de una sola letra repetida', () => {
    LESSONS.forEach((l) => {
      const palabras = l.text.split(' ');
      const monotonas = palabras.filter((p) => p.length > 2 && new Set(p).size === 1);
      expect(monotonas, `"${l.title}" tiene relleno: ${monotonas.join(' ')}`).toEqual([]);
    });
  });

  it('la lección de tildes practica las cinco', () => {
    const l = LESSONS.find((x) => x.id === 'tildes')!;
    for (const v of 'áéíóú') {
      expect(l.text.includes(v), `la lección de tildes no practica la ${v}`).toBe(true);
    }
  });

  it('la lección de la diéresis la practica', () => {
    const l = LESSONS.find((x) => x.nuevas.includes('ü'))!;
    expect(l.text).toMatch(/ü/);
  });

  it('todas tienen texto suficiente para medir velocidad', () => {
    LESSONS.forEach((l) => {
      expect(l.text.length, `"${l.title}" es demasiado corta`).toBeGreaterThan(30);
    });
  });
});

describe('temario ampliado: mayúsculas, puntuación y números (Issue #20)', () => {
  const index = buildIndex(ES_ISO);

  it('todos los caracteres nuevos de cada lección son escribibles según ES_ISO', () => {
    for (const leccion of LESSONS) {
      for (const ch of leccion.nuevas) {
        expect(index.has(ch), `el carácter ${ch} estrenado en ${leccion.title} no está en ES_ISO`).toBe(true);
      }
    }
  });

  it('la lección de mayúsculas practica nombres propios e inicios de frase', () => {
    const l = LESSONS.find((x) => x.id === 'mayusculas')!;
    expect(l).toBeDefined();
    expect(l.text).toContain('Madrid');
    expect(l.text).toContain('Ana');
    const mayusculasEnTexto = [...l.text].filter((c) => c >= 'A' && c <= 'Z');
    expect(mayusculasEnTexto.length).toBeGreaterThan(5);
  });

  it('la lección de puntuación practica todos los signos requeridos', () => {
    const l = LESSONS.find((x) => x.id === 'puntuacion')!;
    expect(l).toBeDefined();
    for (const signo of ['.', ',', '¿', '?', '¡', '!']) {
      expect(l.text).toContain(signo);
      expect(index.has(signo)).toBe(true);
    }
  });

  it('la lección de números practica los diez dígitos', () => {
    const l = LESSONS.find((x) => x.id === 'numeros')!;
    expect(l).toBeDefined();
    for (const digito of '0123456789') {
      expect(l.text).toContain(digito);
      expect(index.has(digito)).toBe(true);
    }
  });
});

describe('práctica continua y vocabulario desbloqueado (Issue #19)', () => {
  it('vocabularioHasta solo usa caracteres permitidos', () => {
    for (let i = 0; i < LESSONS.length; i++) {
      const permitidas = alfabetoHasta(i);
      const palabras = vocabularioHasta(i);
      expect(palabras.length).toBeGreaterThan(0);
      for (const p of palabras) {
        for (const ch of p) {
          expect(permitidas.has(ch), `palabra "${p}" usa "${ch}" no permitida en nivel ${i}`).toBe(true);
        }
      }
    }
  });

  it('generarTextoPractica genera texto válido para el nivel', () => {
    for (let i = 0; i < 5; i++) {
      const texto = generarTextoPractica(i, 10);
      const permitidas = alfabetoHasta(i);
      const intrusas = [...new Set([...texto])].filter((c) => c !== ' ' && !permitidas.has(c));
      expect(intrusas).toEqual([]);
    }
  });

  it('nivelDesbloqueado avanza según lecciones completadas', () => {
    expect(nivelDesbloqueado([])).toBe(0);
    expect(nivelDesbloqueado(['reposo'])).toBe(1);
    expect(nivelDesbloqueado(['reposo', 'vocales-1'])).toBe(2);
  });

  it('normalizarTextoLibre filtra espacios y caracteres no permitidos', () => {
    expect(normalizarTextoLibre('  hola   mundo  \n  prueba  ')).toBe('hola mundo prueba');
    const permitidas = new Set(['h', 'o', 'l', 'a']);
    expect(normalizarTextoLibre('hola mundo', permitidas)).toBe('hola o');
  });
});
