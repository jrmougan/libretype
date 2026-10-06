import { describe, it, expect } from 'vitest';
import { QUE_ES_PPM, VOCES, vozDe, type Voz } from './voz';

const CLAVES: (keyof Voz)[] = [
  'terminada', 'record', 'animoAlto', 'animoBajo', 'repetir', 'siguiente', 'progreso', 'repaso',
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

describe('feedback del intento, refuerzo y horizonte (fase 1)', () => {
  const NUEVAS: (keyof Voz)[] = ['costaron', 'costaronAnimo', 'refuerzo', 'horizonte'];

  it('los dos tonos tienen todos los textos nuevos', () => {
    for (const clave of NUEVAS) {
      expect(VOCES.juego[clave].trim().length, `juego.${clave}`).toBeGreaterThan(10);
      expect(VOCES.sobrio[clave].trim().length, `sobrio.${clave}`).toBeGreaterThan(10);
    }
  });

  it('el sobrio tampoco exclama aquí', () => {
    for (const clave of NUEVAS) expect(VOCES.sobrio[clave], clave).not.toMatch(/[¡!]/);
  });

  it('decir qué teclas costaron no reprende en ninguna voz', () => {
    // Se habla de las teclas, no de la persona; y nada de «mal», «error» o «fallo».
    for (const tono of ['juego', 'sobrio'] as const) {
      for (const clave of ['costaron', 'costaronAnimo', 'refuerzo', 'horizonte'] as const) {
        const texto = VOCES[tono][clave].toLowerCase();
        for (const palabra of ['mal', 'error', 'fallo', 'fallaste', 'incorrecto', 'peor', 'deberías']) {
          expect(texto, `${tono}.${clave} usa "${palabra}"`).not.toMatch(new RegExp(`\\b${palabra}`));
        }
      }
    }
  });

  it('el horizonte habla de semanas sin cifra ni cuenta atrás', () => {
    for (const tono of ['juego', 'sobrio'] as const) {
      const h = VOCES[tono].horizonte;
      expect(h).toMatch(/semanas/);
      expect(h).toMatch(/cada día/);
      expect(h, 'una cifra sería una meta que se puede incumplir').not.toMatch(/\d/);
      expect(h).not.toMatch(/\b(dos|tres|cuatro|cinco|seis|siete|ocho|diez|treinta)\b/i);
    }
  });

  it('explica qué son las ppm', () => {
    expect(QUE_ES_PPM).toMatch(/palabras por minuto/);
  });
});

