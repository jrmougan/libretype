import { describe, it, expect } from 'vitest';
import {
  charDeCodigo,
  generarEjercicioRefuerzo,
  obtenerTeclasOrdenadas,
} from './refuerzo';
import type { EstadoTecla } from './keyboard/dominio';

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
