/**
 * El generador sustituye a los textos fijos a partir del segundo intento, así
 * que tiene que cumplir lo mismo que `lessons.test.ts` exige a esos textos. No
 * basta con probar una semilla: se prueban cientos por lección.
 */
import { describe, expect, it } from 'vitest';
import {
  azar, CARACTERES_POR_PALABRA, construirTexto, formatearFrase, generarTextoLeccion, generarTextoPractica,
  piezasHasta, textoDeIntento,
} from './generador';
import { alfabetoHasta, LESSONS } from './lessons';
import { buildIndex, ES_ISO } from './keyboard/layouts';

const SEMILLAS = Array.from({ length: 200 }, (_, i) => i * 7919 + 13);
const iDe = (id: string) => LESSONS.findIndex((l) => l.id === id);

describe('texto nuevo en cada intento', () => {
  it('ninguna semilla usa una tecla que la lección no haya enseñado', () => {
    LESSONS.forEach((l, i) => {
      const permitidas = alfabetoHasta(i);
      for (const s of SEMILLAS) {
        const texto = generarTextoLeccion(i, s);
        const intrusas = [...new Set(texto)].filter((ch) => ch !== ' ' && !permitidas.has(ch));
        expect(intrusas, `"${l.title}" con semilla ${s}: ${texto}`).toEqual([]);
      }
    });
  });

  it('todo lo generado se puede escribir con ES-ISO', () => {
    const index = buildIndex(ES_ISO);
    LESSONS.forEach((_, i) => {
      for (const s of SEMILLAS.slice(0, 40)) {
        const imposibles = [...new Set(generarTextoLeccion(i, s))].filter((ch) => !index.has(ch));
        expect(imposibles).toEqual([]);
      }
    });
  });

  it('cada intento practica las teclas que estrena la lección', () => {
    LESSONS.forEach((l, i) => {
      for (const s of SEMILLAS) {
        const texto = generarTextoLeccion(i, s);
        expect([...l.nuevas].some((ch) => texto.includes(ch)), `"${l.title}" (${s}) no practica nada nuevo`)
          .toBe(true);
      }
    });
  });

  it('en las lecciones de pocas teclas salen todas las nuevas en cada intento', () => {
    // Con cinco teclas nuevas o menos, un intento sin alguna de ellas sería
    // un intento que no enseña lo que dice enseñar.
    LESSONS.filter((l) => l.nuevas.length <= 5).forEach((l) => {
      const i = LESSONS.indexOf(l);
      for (const s of SEMILLAS) {
        const texto = generarTextoLeccion(i, s);
        for (const ch of l.nuevas) {
          expect(texto, `"${l.title}" (${s}) no practica la ${ch}`).toContain(ch);
        }
      }
    });
  });

  it('la lección de tildes practica las cinco en cada intento', () => {
    for (const s of SEMILLAS) {
      const texto = generarTextoLeccion(iDe('tildes'), s);
      for (const v of 'áéíóú') expect(texto).toContain(v);
    }
  });

  it('las teclas nuevas pesan más que las ya sabidas', () => {
    const i = iDe('consonantes');
    const nuevas = new Set(LESSONS[i].nuevas);
    const conNueva = (t: string) => [...t].some((ch) => nuevas.has(ch));
    const piezas = piezasHasta(i);
    const enElBanco = piezas.filter(conNueva).length / piezas.length;
    const palabras = SEMILLAS.flatMap((s) => generarTextoLeccion(i, s).split(' '));
    const enLosTextos = palabras.filter(conNueva).length / palabras.length;
    expect(enLosTextos).toBeGreaterThan(enElBanco * 1.3);
  });

  it('es determinista con la semilla', () => {
    LESSONS.forEach((_, i) => {
      expect(generarTextoLeccion(i, 42)).toBe(generarTextoLeccion(i, 42));
    });
    expect(azar(1)()).toBe(azar(1)());
  });

  it('un mes de práctica diaria no repite texto', () => {
    // Veinte minutos al día durante un mes son unos 600 intentos en total;
    // repartidos por lecciones, menos de 200 en cada una.
    LESSONS.forEach((l, i) => {
      const distintos = new Set(SEMILLAS.map((s) => generarTextoLeccion(i, s)));
      expect(distintos.size, `"${l.title}" repite`).toBeGreaterThanOrEqual(SEMILLAS.length * 0.97);
    });
  });

  it('dentro de un texto no se repite la misma palabra pegada', () => {
    LESSONS.forEach((_, i) => {
      for (const s of SEMILLAS.slice(0, 50)) {
        const palabras = generarTextoLeccion(i, s).split(' ');
        for (let k = 1; k < palabras.length; k++) {
          if (palabras.length > 3) expect(palabras[k]).not.toBe(palabras[k - 1]);
        }
      }
    });
  });

  it('tiene más o menos el largo del texto revisado a mano', () => {
    LESSONS.forEach((l, i) => {
      for (const s of SEMILLAS.slice(0, 50)) {
        const largo = generarTextoLeccion(i, s).length;
        expect(largo, l.title).toBeGreaterThan(30);
        expect(largo, l.title).toBeGreaterThanOrEqual(Math.min(l.text.length, 50));
        expect(largo, l.title).toBeLessThan(Math.max(l.text.length, 50) + 60);
      }
    });
  });

  it('nada de relleno de una sola letra repetida', () => {
    LESSONS.forEach((_, i) => {
      for (const s of SEMILLAS.slice(0, 30)) {
        const monotonas = generarTextoLeccion(i, s).split(' ')
          .filter((p) => p.length > 2 && new Set(p).size === 1);
        expect(monotonas).toEqual([]);
      }
    });
  });

  it('el primer contacto usa el texto revisado; después, uno nuevo', () => {
    expect(textoDeIntento(0, false, 1)).toBe(LESSONS[0].text);
    expect(textoDeIntento(0, true, 1)).toBe(generarTextoLeccion(0, 1));
  });
});

describe('frases cortas y práctica continua', () => {
  it('desde «oclusivas» los textos llevan frases, no solo palabras sueltas', () => {
    const i = iDe('oclusivas');
    const frases = new Set(piezasHasta(i).filter((p) => p.includes(' ')));
    expect(frases.size).toBeGreaterThan(10);
  });

  it('la mayúscula y el punto se añaden solo cuando ya se han enseñado', () => {
    expect(formatearFrase('mi casa es tu casa', alfabetoHasta(iDe('oclusivas'))))
      .toBe('mi casa es tu casa');
    expect(formatearFrase('mi casa es tu casa', alfabetoHasta(iDe('mayusculas'))))
      .toBe('Mi casa es tu casa');
    expect(formatearFrase('mi casa es tu casa', alfabetoHasta(iDe('puntuacion'))))
      .toBe('Mi casa es tu casa.');
    expect(formatearFrase('¿Vienes hoy?', alfabetoHasta(iDe('puntuacion')))).toBe('¿Vienes hoy?');
    expect(formatearFrase('él no está', alfabetoHasta(iDe('mayusculas')))).toBe('Él no está');
  });

  it('la práctica continua mantiene mayúsculas y puntuación una vez aprendidas', () => {
    const iPunt = iDe('puntuacion');
    for (let i = iDe('mayusculas'); i < LESSONS.length; i++) {
      for (const s of SEMILLAS.slice(0, 30)) {
        const texto = generarTextoPractica(i, s);
        expect(texto[0], texto).toMatch(/[A-ZÁÉÍÓÚÑ¿¡]/);
        if (i >= iPunt) expect(texto, texto).toMatch(/[.?!]$/);
      }
    }
  });

  it('la práctica continua no usa teclas sin enseñar en ningún nivel', () => {
    LESSONS.forEach((_, i) => {
      const permitidas = alfabetoHasta(i);
      for (const s of SEMILLAS.slice(0, 50)) {
        const texto = generarTextoPractica(i, s);
        expect([...texto].filter((ch) => ch !== ' ' && !permitidas.has(ch))).toEqual([]);
      }
    });
  });

  it('con piezas vacías no se cuelga', () => {
    expect(construirTexto([], 1, { largo: 50 })).toBe('');
    expect(construirTexto(['la'], 1, { largo: 20 }).length).toBeGreaterThan(0);
  });
});

describe('longitud de los textos (preferencia de la fase 2)', () => {
  it('la escala alarga los intentos generados de una lección, sin bajar del mínimo', () => {
    const indice = 3;
    const corto = generarTextoLeccion(indice, 7, 0.5).length;
    const normal = generarTextoLeccion(indice, 7).length;
    const largo = generarTextoLeccion(indice, 7, 2).length;
    // Por debajo de 50 caracteres no caben siempre todas las teclas que se
    // estrenan, así que «corto» acorta poco una lección que ya es corta.
    expect(corto).toBeLessThanOrEqual(normal);
    expect(corto).toBeGreaterThanOrEqual(50);
    expect(largo).toBeGreaterThan(normal);
  });

  it('la práctica continua mide en caracteres y cambia con la semilla', () => {
    const largo = 40 * CARACTERES_POR_PALABRA;
    expect(generarTextoPractica(4, 1, largo).length).toBeGreaterThanOrEqual(largo);
    expect(generarTextoPractica(4, 1, largo)).not.toBe(generarTextoPractica(4, 2, largo));
  });
});
