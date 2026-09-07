import { describe, it, expect } from 'vitest';
import { VOCES, vozDe, type Voz } from './voz';

const CLAVES: (keyof Voz)[] = [
  'terminada', 'record', 'animoAlto', 'animoBajo', 'repetir', 'siguiente', 'progreso',
];

describe('voces', () => {
  it('los dos tonos tienen texto para todas las situaciones', () => {
    for (const clave of CLAVES) {
      expect(VOCES.juego[clave].trim().length, `falta o es muy corto ${clave} en juego`).toBeGreaterThanOrEqual(3);
      expect(VOCES.sobrio[clave].trim().length, `falta o es muy corto ${clave} en sobrio`).toBeGreaterThanOrEqual(3);
    }
  });

  it('mientras no haya elegido se usa el sobrio', () => {
    // Nunca infantilizar por defecto: es más fácil perdonar que una app te
    // hable seria de más que al revés.
    expect(vozDe(null)).toBe(VOCES.sobrio);
  });

  it('el tono sobrio no exclama', () => {
    for (const clave of CLAVES) {
      expect(VOCES.sobrio[clave], clave).not.toMatch(/[¡!]/);
    }
  });

  it('el tono de juego sí celebra', () => {
    const celebra = CLAVES.filter((c) => /[¡!]/.test(VOCES.juego[c]));
    expect(celebra.length).toBeGreaterThan(2);
  });

  it('ninguna voz reprende cuando se falla', () => {
    // El error se corrige practicando, no avergonzando. Y para un niño esto
    // decide si vuelve mañana.
    for (const tono of ['juego', 'sobrio'] as const) {
      const texto = VOCES[tono].animoBajo.toLowerCase();
      for (const palabra of ['mal', 'error', 'fallo', 'incorrecto', 'peor']) {
        expect(texto, `${tono} usa "${palabra}"`).not.toContain(palabra);
      }
    }
  });

  it('ningún texto es tan largo que no quepa', () => {
    for (const tono of ['juego', 'sobrio'] as const) {
      for (const clave of CLAVES) {
        expect(VOCES[tono][clave].length, `${tono}.${clave}`).toBeLessThan(60);
      }
    }
  });
});
