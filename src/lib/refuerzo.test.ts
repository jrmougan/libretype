import { describe, it, expect } from 'vitest';
import {
  charDeCodigo,
  generarEjercicioRefuerzo,
  obtenerTeclasOrdenadas,
  type EjercicioRefuerzo,
} from './refuerzo';
import type { EstadoTecla } from './keyboard/dominio';
import { ES_ISO } from './keyboard/layouts';
import { catalogo, crearCatalogo } from './lecciones/catalogo';
import { ejercicioDe } from './lecciones/ejercicio';
import { cuentaParaDominio, cuentaParaMarcaGlobal, ID_REFUERZO, ID_REFUERZO_SUELTO } from './lecciones/ids';
import type { Curso, Lesson } from './lecciones/tipos';

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

  describe('solo pide lo que ya se ha visto', () => {
    const floja = new Map<string, EstadoTecla>([['KeyA', { intentos: 20, aciertos: 5, msTotal: 1000 }]]);

    it('con solo la primera lección abierta, ni mayúsculas ni letras sin enseñar', () => {
      const enseñadas = new Set(catalogo.primera.text);
      const { text } = generarEjercicioRefuerzo(floja)!;
      expect(text.length).toBeGreaterThan(10);
      for (const c of text) if (c !== ' ') expect(enseñadas.has(c), c).toBe(true);
    });

    it('al avanzar se abre más vocabulario', () => {
      const todas = new Set(catalogo.lecciones.map((l) => l.id));
      const { text } = generarEjercicioRefuerzo(floja, todas)!;
      expect(text).toMatch(/[^asdfjklñ ]/);
    });

    it('la misma palabra no sale dos veces por llevar mayúscula', () => {
      const todas = new Set(catalogo.lecciones.map((l) => l.id));
      const palabras = generarEjercicioRefuerzo(floja, todas)!.text.toLowerCase().split(' ');
      expect(new Set(palabras).size).toBe(palabras.length);
    });

    it('la tecla que se refuerza se pide aunque no esté en lo abierto, y aunque no haya palabras', () => {
      const raro = new Map<string, EstadoTecla>([['KeyZ', { intentos: 20, aciertos: 5, msTotal: 1000 }]]);
      const { text } = generarEjercicioRefuerzo(raro)!;
      expect(text).toContain('z');
      expect(text.length).toBeGreaterThan(10);
    });
  });

  describe('teclas que no son letras', () => {
    const todas = new Set(catalogo.lecciones.map((l) => l.id));
    const floja = { intentos: 20, aciertos: 8, msTotal: 20000 };
    const fuerte = { intentos: 50, aciertos: 50, msTotal: 5000 };
    const VOCALES_CON_TILDE = /[áéíóúÁÉÍÓÚ]/;

    it('el acento se practica en palabras con tilde, nunca suelto', () => {
      const ej = generarEjercicioRefuerzo(new Map([['Quote', floja], ['KeyA', fuerte]]), todas)!;
      expect(ej.text).not.toContain('´');
      for (const palabra of ej.text.split(' ')) expect(palabra, palabra).toMatch(VOCALES_CON_TILDE);
      expect(ej.titulo).toBe('Refuerzo de teclas (acento)');
      expect(ej.suelto).toBe(false);
    });

    it('el acento junto a otra tecla no se queda sin palabras', () => {
      const ej = generarEjercicioRefuerzo(new Map([['Quote', floja], ['KeyA', floja]]), todas)!;
      const palabras = ej.text.split(' ');
      expect(palabras.some((p) => VOCALES_CON_TILDE.test(p))).toBe(true);
      expect(palabras.some((p) => /a/.test(p))).toBe(true);
      expect(ej.titulo).toContain('acento');
    });

    it('sin palabras con tilde a su alcance no se inventa un relleno con el acento', () => {
      expect(generarEjercicioRefuerzo(new Map([['Quote', floja]]))).toBeNull();
    });

    it('el título no promete una tecla que el texto no trae', () => {
      const ej = generarEjercicioRefuerzo(new Map([['Quote', floja], ['KeyA', floja]]))!;
      expect(ej.text).not.toContain('´');
      expect(ej.titulo).toBe('Refuerzo de teclas (A)');
    });

    it('el espacio se practica con palabras cortas, no con un texto en blanco', () => {
      const ej = generarEjercicioRefuerzo(new Map([['Space', floja], ['KeyA', fuerte]]), todas)!;
      expect(ej.text.trim().length).toBe(ej.text.length);
      expect(ej.text.split(' ').length).toBeGreaterThanOrEqual(10);
      expect(ej.text.split(' ').every((p) => p.length > 0 && p.length <= 3)).toBe(true);
      expect(ej.titulo).toBe('Refuerzo de teclas (espacio)');
    });

    it('una tecla que ningún carácter usa no impide practicar las demás', () => {
      const ej = generarEjercicioRefuerzo(new Map([['ShiftRight', floja], ['KeyA', fuerte]]))!;
      expect(ej.teclasFlojas).toEqual(['a']);
    });

    it('si solo hay teclas que ningún carácter usa, no hay ejercicio', () => {
      expect(generarEjercicioRefuerzo(new Map([['Enter', floja]]))).toBeNull();
    });

    it('el relleno de una tecla sola no cuenta como vocabulario', () => {
      const ej = generarEjercicioRefuerzo(new Map([['KeyZ', floja]]))!;
      expect(ej.text).toMatch(/^zzz( zzz)+$/);
      const idSesion = (e: EjercicioRefuerzo) => ejercicioDe({ tipo: 'refuerzo', ejercicio: e }, []).idSesion;
      expect(idSesion(ej)).toBe(ID_REFUERZO_SUELTO);
      expect(cuentaParaDominio(idSesion(ej))).toBe(false);
      expect(cuentaParaMarcaGlobal(idSesion(ej))).toBe(false);
      const conPalabras = generarEjercicioRefuerzo(new Map([['KeyA', floja]]))!;
      expect(cuentaParaDominio(idSesion(conPalabras))).toBe(true);
    });
  });

  describe('un texto en bucle no es vocabulario', () => {
    const floja = { intentos: 9, aciertos: 6, msTotal: 9000 };
    const idSesion = (e: EjercicioRefuerzo) => ejercicioDe({ tipo: 'refuerzo', ejercicio: e }, []).idSesion;

    // La K es el caso natural: solo sale en «ka» y «kas» hasta «Las raras».
    it.each(['KeyK', 'KeyJ', 'KeyF'])('%s, con solo la primera lección, ni retira la letra ni fija marca', (code) => {
      const ej = generarEjercicioRefuerzo(new Map([[code, floja]]), new Set())!;
      const palabras = ej.text.split(' ');
      expect(new Set(palabras).size).toBeLessThan(palabras.length);
      expect(ej.suelto).toBe(true);
      expect(idSesion(ej)).toBe(ID_REFUERZO_SUELTO);
      expect(cuentaParaDominio(idSesion(ej))).toBe(false);
      expect(cuentaParaMarcaGlobal(idSesion(ej))).toBe(false);
    });

    it('con palabras distintas de sobra sí es vocabulario, y ninguna se repite', () => {
      const ej = generarEjercicioRefuerzo(new Map([['KeyA', floja]]), new Set())!;
      const palabras = ej.text.split(' ');
      expect(new Set(palabras).size).toBe(palabras.length);
      expect(ej.suelto).toBe(false);
      expect(idSesion(ej)).toBe(ID_REFUERZO);
    });
  });

  describe('con más de un curso', () => {
    const floja = { intentos: 9, aciertos: 6, msTotal: 9000 };
    const leccion = (id: string, text: string): Lesson => ({
      id, title: id, focus: 'x', nuevas: 'xyz', cobertura: 10, text,
    });
    const curso = (id: string, text: string): Curso => ({
      id, titulo: id, idioma: 'inglés', lecciones: [leccion(`${id}-1`, text)],
    });
    const OTRO = 'xoxo yaya zaza xaxa yoyo zozo xexe yeye zeze xixi yiyi';
    const dos = crearCatalogo([curso('uno', 'sala casa masa rasa pasa tasa gasa lasa basa nasa vasa'), curso('dos', OTRO)]);
    const conLaA = new Map([['KeyA', floja]]);

    it('solo pide palabras del curso que se está siguiendo', () => {
      const ej = generarEjercicioRefuerzo(conLaA, new Set(), ES_ISO, 'uno', dos)!;
      expect(ej.text).toContain('sala');
      expect(ej.text).not.toMatch(/[xyz]/);
    });

    it('al cambiar de curso cambian las palabras', () => {
      const ej = generarEjercicioRefuerzo(conLaA, new Set(), ES_ISO, 'dos', dos)!;
      expect(ej.text).toContain('yaya');
      expect(ej.text).not.toContain('sala');
    });

    it('el banco de palabras es de cada curso, no de todos', () => {
      const ej = generarEjercicioRefuerzo(conLaA, new Set(), ES_ISO, 'dos', dos)!;
      expect(ej.text).not.toContain('la');
    });
  });

  it('devuelve null si no hay teclas registradas', () => {
    expect(generarEjercicioRefuerzo(new Map())).toBeNull();
  });
});
