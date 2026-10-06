import { describe, it, expect } from 'vitest';
import {
  caracteresDeTecla,
  charDeCodigo,
  generarEjercicioRefuerzo,
  nivelEnsenado,
  obtenerTeclasOrdenadas,
  teclasParaReforzar,
} from './refuerzo';
import type { EstadoTecla } from './keyboard/dominio';
import { alfabetoHasta, LESSONS } from './lessons';

const iDe = (id: string) => LESSONS.findIndex((l) => l.id === id);
const floja = (intentos = 12): EstadoTecla => ({ intentos, aciertos: Math.floor(intentos * 0.6), msTotal: intentos * 900 });
const bien = (intentos = 30): EstadoTecla => ({ intentos, aciertos: intentos, msTotal: intentos * 250 });

describe('refuerzo de teclas flojas', () => {
  it('identifica el caracter correspondiente al codigo físico', () => {
    expect(charDeCodigo('KeyA')).toBe('a');
    expect(charDeCodigo('KeyP')).toBe('p');
    expect(charDeCodigo('Quote')).toBe('´');
  });

  it('ordena las teclas por dificultad (menor dominio y precisión primero)', () => {
    const mapa = new Map<string, EstadoTecla>([
      ['KeyA', { intentos: 20, aciertos: 20, msTotal: 6000 }], // Dominada (100% acierto, rápido)
      ['KeyP', { intentos: 10, aciertos: 6, msTotal: 9000 }],  // 60% acierto (muy floja)
      ['KeyB', { intentos: 12, aciertos: 9, msTotal: 10000 }], // 75% acierto (floja)
    ]);

    const ordenadas = obtenerTeclasOrdenadas(mapa);
    expect(ordenadas).toHaveLength(3);
    expect(ordenadas[0].char).toBe('p');
    expect(ordenadas[0].esFloja).toBe(true);
    expect(ordenadas[1].char).toBe('b');
    expect(ordenadas[1].esFloja).toBe(true);
    expect(ordenadas[2].char).toBe('a');
  });

  it('genera un ejercicio de refuerzo enfocado en las teclas flojas', () => {
    const mapa = new Map<string, EstadoTecla>([
      ['KeyA', { intentos: 20, aciertos: 20, msTotal: 6000 }],
      ['KeyP', { intentos: 10, aciertos: 5, msTotal: 9000 }],
      ['KeyB', { intentos: 10, aciertos: 6, msTotal: 9000 }],
    ]);

    const ejercicio = generarEjercicioRefuerzo(mapa);
    expect(ejercicio).not.toBeNull();
    expect(ejercicio!.teclasFlojas).toContain('p');
    expect(ejercicio!.teclasFlojas).toContain('b');
    expect(ejercicio!.titulo).toContain('P');
    expect(ejercicio!.text.length).toBeGreaterThan(10);
    // El texto debe contener palabras con las letras flojas 'p' o 'b'
    const tieneLetrasFlojas = ejercicio!.text.includes('p') || ejercicio!.text.includes('b');
    expect(tieneLetrasFlojas).toBe(true);
  });

  it('devuelve null si no hay teclas registradas', () => {
    expect(generarEjercicioRefuerzo(new Map())).toBeNull();
  });
});

describe('el refuerzo no se sale de lo enseñado (roadmap 0.4)', () => {
  it('el refuerzo no saca palabras con teclas aún no enseñadas', () => {
    // El fallo de antes: el refuerzo tiraba de todas las palabras de todas las
    // lecciones, así que a quien iba por las vocales le pedía «cabeza».
    const mapa = new Map<string, EstadoTecla>([
      ['KeyT', floja()], ['KeyE', floja()], ['KeyA', bien()],
    ]);
    const nivel = iDe('vocales-2');
    const permitidas = alfabetoHasta(nivel);
    for (let semilla = 1; semilla < 200; semilla++) {
      const ej = generarEjercicioRefuerzo(mapa, undefined, { nivel, semilla })!;
      const intrusas = [...new Set(ej.text)].filter((ch) => ch !== ' ' && !permitidas.has(ch));
      expect(intrusas, ej.text).toEqual([]);
      expect(ej.text).toMatch(/t/);
    }
  });

  it('una tecla floja que aún no se ha enseñado no entra en el refuerzo', () => {
    // Pudo salir floja en «Texto propio», pero la lección que la enseña no ha llegado.
    const mapa = new Map<string, EstadoTecla>([['KeyP', floja()], ['KeyE', floja()]]);
    const ej = generarEjercicioRefuerzo(mapa, undefined, { nivel: iDe('nasales'), semilla: 3 })!;
    expect(ej.teclasFlojas).toEqual(['e']);
    expect(ej.text).not.toMatch(/p/);
    expect(generarEjercicioRefuerzo(new Map([['KeyP', floja()]]), undefined, { nivel: 0 })).toBeNull();
  });

  it('el acento se practica con vocales con tilde: á es ´ más a', () => {
    expect(caracteresDeTecla('´')).toBe('áéíóú');
    expect(caracteresDeTecla('a')).toContain('á');
    expect(caracteresDeTecla('u')).toContain('ü');
    expect(caracteresDeTecla('n')).toBe('n'); // la ñ es otra tecla, no una n con algo encima
    const mapa = new Map<string, EstadoTecla>([['Quote', floja()]]);
    const ej = generarEjercicioRefuerzo(mapa, undefined, { nivel: iDe('tildes'), semilla: 9 })!;
    expect(ej).not.toBeNull();
    expect(ej.teclasFlojas).toEqual(['´']);
    expect(ej.titulo).toContain('tilde');
    const palabras = ej.text.split(' ');
    expect(palabras.filter((p) => /[áéíóú]/.test(p)).length).toBeGreaterThan(palabras.length / 2);
  });

  it('antes de enseñar las tildes, el acento no se refuerza', () => {
    const mapa = new Map<string, EstadoTecla>([['Quote', floja()]]);
    expect(generarEjercicioRefuerzo(mapa, undefined, { nivel: iDe('vocales-2') })).toBeNull();
  });

  it('el texto no sale siempre igual', () => {
    const mapa = new Map<string, EstadoTecla>([['KeyP', floja()], ['KeyM', floja()]]);
    const nivel = iDe('oclusivas');
    const textos = new Set(
      Array.from({ length: 30 }, (_, s) => generarEjercicioRefuerzo(mapa, undefined, { nivel, semilla: s })!.text),
    );
    expect(textos.size).toBeGreaterThan(25);
    // Y con la misma semilla, el mismo texto.
    expect(generarEjercicioRefuerzo(mapa, undefined, { nivel, semilla: 4 })!.text)
      .toBe(generarEjercicioRefuerzo(mapa, undefined, { nivel, semilla: 4 })!.text);
  });

  it('solo se ofrece reforzar teclas con intentos suficientes para saber que cuestan', () => {
    const mapa = new Map<string, EstadoTecla>([
      ['KeyA', floja(12)], ['KeyS', floja(5)], ['KeyD', bien()], ['Space', floja(20)],
    ]);
    expect(teclasParaReforzar(mapa, 0).map((t) => t.char)).toEqual(['a']);
    expect(teclasParaReforzar(new Map([['KeyD', bien()]]), 0)).toEqual([]);
  });

  it('el nivel enseñado es la lección más alta con algún intento, superada o no', () => {
    expect(nivelEnsenado([])).toBe(0);
    expect(nivelEnsenado([{ leccion: 'reposo' }, { leccion: 'tildes' }, { leccion: 'texto-propio' }]))
      .toBe(iDe('tildes'));
    // Las de la v0.1.0 cuentan por su equivalente honesto.
    expect(nivelEnsenado([{ leccion: 'home' }])).toBe(0);
  });
});

