/**
 * El generador sustituye a los textos fijos a partir del segundo intento, así
 * que tiene que cumplir lo mismo que `garantias.ts` exige a esos textos. No
 * basta con probar una semilla: se prueban cientos por lección, y sobre todos
 * los cursos del catálogo, para que un curso nuevo quede cubierto sin escribir
 * ningún test.
 */
import { describe, expect, it } from 'vitest';
import { LAYOUTS } from '../keyboard/layouts';
import { catalogo, crearCatalogo } from './catalogo';
import { azar, construirTexto, generarTextoLeccion, piezasDe, textoDeIntento } from './generador';
import { caracteresEscribibles } from './texto';
import type { Curso, Lesson } from './tipos';

const SEMILLAS = Array.from({ length: 200 }, (_, i) => i * 7919 + 13);
const generables = catalogo.lecciones.filter((l) => piezasDe(l.id) !== null);
const generar = (l: Lesson, s: number, escala = 1): string => generarTextoLeccion(l.id, s, escala)!;

describe('texto nuevo en cada intento', () => {
  it('se generan todas las lecciones que estrenan letras y las que traen frases', () => {
    const ids = generables.map((l) => l.id);
    for (const id of ['reposo', 'vocales-1', 'nasales', 'vocales-2', 'tildes', 'oclusivas',
      'consonantes', 'dificiles', 'raras', 'mayusculas', 'puntuacion', 'numeros', 'numeros-2', 'simbolos']) {
      expect(ids, id).toContain(id);
    }
  });

  it('los textos seguidos de consolidación conservan su texto', () => {
    for (const id of ['un-dia', 'refranes']) {
      expect(generarTextoLeccion(id, 1)).toBeNull();
      expect(textoDeIntento(id, true, 1)).toBe(catalogo.leccion(id)!.text);
    }
  });

  it('ninguna semilla usa una tecla que la lección no haya enseñado', () => {
    for (const l of generables) {
      const permitidas = catalogo.alfabetoHasta(l.id);
      for (const s of SEMILLAS) {
        const texto = generar(l, s);
        const intrusas = [...new Set(texto)].filter((ch) => ch !== ' ' && !permitidas.has(ch));
        expect(intrusas, `«${l.title}» con semilla ${s}: ${texto}`).toEqual([]);
      }
    }
  });

  it('todo lo generado se puede escribir con cualquier distribución', () => {
    for (const layout of LAYOUTS) {
      const permitidos = caracteresEscribibles(layout);
      for (const l of generables) {
        for (const s of SEMILLAS.slice(0, 40)) {
          expect([...new Set(generar(l, s))].filter((ch) => !permitidos.has(ch))).toEqual([]);
        }
      }
    }
  });

  it('cada intento practica las teclas que estrena la lección', () => {
    for (const l of generables) {
      for (const s of SEMILLAS) {
        const texto = generar(l, s);
        expect([...l.nuevas].some((ch) => texto.includes(ch)), `«${l.title}» (${s}) no practica nada nuevo`)
          .toBe(true);
      }
    }
  });

  it('en las lecciones de pocas teclas salen todas las que su texto practica', () => {
    // Con cinco teclas nuevas o menos, un intento sin alguna de ellas sería
    // un intento que no enseña lo que dice enseñar.
    for (const l of generables.filter((x) => [...x.nuevas].length <= 5)) {
      const practicadas = [...l.nuevas].filter((ch) => l.text.includes(ch));
      for (const s of SEMILLAS) {
        const texto = generar(l, s);
        for (const ch of practicadas) expect(texto, `«${l.title}» (${s}) no practica la ${ch}`).toContain(ch);
      }
    }
  });

  it('la lección de tildes practica las cinco en cada intento', () => {
    for (const s of SEMILLAS) {
      const texto = generarTextoLeccion('tildes', s)!;
      for (const v of 'áéíóú') expect(texto).toContain(v);
    }
  });

  it('las teclas nuevas pesan más que las ya sabidas', () => {
    const l = catalogo.leccion('consonantes')!;
    const nuevas = new Set(l.nuevas);
    const conNueva = (t: string) => [...t].some((ch) => nuevas.has(ch));
    const piezas = piezasDe(l.id)!;
    const enElBanco = piezas.filter(conNueva).length / piezas.length;
    const palabras = SEMILLAS.flatMap((s) => generar(l, s).split(' '));
    const enLosTextos = palabras.filter(conNueva).length / palabras.length;
    expect(enLosTextos).toBeGreaterThan(enElBanco * 1.3);
  });

  it('es determinista con la semilla', () => {
    for (const l of generables) expect(generar(l, 42)).toBe(generar(l, 42));
    expect(azar(1)()).toBe(azar(1)());
  });

  it('los intentos no se repiten entre sí', () => {
    for (const l of generables) {
      const distintos = new Set(SEMILLAS.map((s) => generar(l, s)));
      expect(distintos.size, `«${l.title}» repite`).toBeGreaterThanOrEqual(SEMILLAS.length * 0.9);
    }
  });

  it('dentro de un texto no se repite la misma palabra pegada', () => {
    for (const l of generables) {
      for (const s of SEMILLAS.slice(0, 50)) {
        const palabras = generar(l, s).split(' ');
        for (let k = 1; k < palabras.length; k++) {
          if (palabras.length > 3) expect(palabras[k], `«${l.title}» (${s})`).not.toBe(palabras[k - 1]);
        }
      }
    }
  });

  it('tiene más o menos el largo del texto revisado a mano', () => {
    for (const l of generables) {
      const masLarga = Math.max(...piezasDe(l.id)!.map((p) => p.length));
      for (const s of SEMILLAS.slice(0, 50)) {
        const largo = generar(l, s).length;
        expect(largo, l.title).toBeGreaterThanOrEqual(Math.min(l.text.length, 50));
        expect(largo, l.title).toBeLessThanOrEqual(Math.max(l.text.length, 50) + masLarga + 1);
      }
    }
  });

  it('nada de relleno de una sola letra repetida', () => {
    for (const l of generables) {
      for (const s of SEMILLAS.slice(0, 30)) {
        const monotonas = generar(l, s).split(' ').filter((p) => p.length > 2 && new Set(p).size === 1);
        expect(monotonas).toEqual([]);
      }
    }
  });

  it('el primer contacto usa el texto revisado; después, uno nuevo', () => {
    const primera = catalogo.primera;
    expect(textoDeIntento(primera.id, false, 1)).toBe(primera.text);
    expect(textoDeIntento(primera.id, true, 1)).toBe(generarTextoLeccion(primera.id, 1));
    expect(textoDeIntento(primera.id, true, 1)).not.toBe(primera.text);
  });

  it('las mayúsculas y la puntuación no se pierden: salen frases enteras', () => {
    for (const s of SEMILLAS.slice(0, 40)) {
      expect(generarTextoLeccion('mayusculas', s)!).toMatch(/^[A-ZÁÉÍÓÚÑ]/);
      expect(generarTextoLeccion('puntuacion', s)!).toMatch(/[.?!]$/);
      expect(generarTextoLeccion('numeros', s)!).toMatch(/\d/);
    }
  });

  it('la escala alarga o acorta los intentos, sin bajar del mínimo', () => {
    const l = catalogo.leccion('vocales-2')!;
    const corto = generar(l, 7, 0.5).length;
    const normal = generar(l, 7).length;
    const largo = generar(l, 7, 2).length;
    expect(corto).toBeLessThanOrEqual(normal);
    expect(corto).toBeGreaterThanOrEqual(50);
    expect(largo).toBeGreaterThan(normal);
  });
});

describe('con otros cursos y casos límite', () => {
  const leccion = (id: string, nuevas: string, text: string, frases?: string[]): Lesson => ({
    id, title: id, focus: 'x', nuevas, cobertura: 10, text, frases,
  });
  const curso: Curso = {
    id: 'mini',
    titulo: 'Mini',
    idioma: 'x',
    finAlfabeto: 'm2',
    vocabulario: ['sal', 'las', 'ala', 'sala', 'alas', 'asa', 'salsa', 'sale', 'les', 'ese', 'esa', 'sea', 'lee'],
    lecciones: [
      leccion('m1', 'sal', 'sala sal las ala alas sala sal las ala alas'),
      leccion('m2', 'e', 'sale ese esa sea lee les sale ese esa sea lee'),
      leccion('m3', 'S', 'Sal Sala Sale Sea Sal Sala Sale Sea Sal Sala'),
      leccion('m4', 'L', 'Las alas Lee esa', ['Las alas', 'Lee esa', 'Les sale', 'La sala', 'Le sale', 'Lee ese']),
    ],
  };
  const mini = crearCatalogo([curso]);

  it('usa el vocabulario del propio curso y solo lo ya enseñado', () => {
    for (const s of SEMILLAS.slice(0, 50)) {
      expect(generarTextoLeccion('m1', s, 1, mini)).not.toMatch(/e/);
      expect(generarTextoLeccion('m2', s, 1, mini)).toContain('e');
    }
  });

  it('tras el alfabeto solo genera donde hay frases', () => {
    expect(piezasDe('m3', mini)).toBeNull();
    expect(textoDeIntento('m3', true, 1, 1, mini)).toBe(curso.lecciones[2].text);
    expect(generarTextoLeccion('m4', 1, 1, mini)).toMatch(/L/);
  });

  it('una lección que no es del catálogo no se genera', () => {
    expect(piezasDe('propia:abc')).toBeNull();
    expect(generarTextoLeccion('nada', 1)).toBeNull();
  });

  it('con piezas vacías no se cuelga', () => {
    expect(construirTexto([], 1, { largo: 50 })).toBe('');
    expect(construirTexto(['la'], 1, { largo: 20 }).length).toBeGreaterThan(0);
  });
});
