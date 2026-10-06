import { describe, it, expect } from 'vitest';
import { PRECISION_ALTA, QUE_ES_PPM, textosResultado, VOCES, vozDe, type Voz } from './voz';
import { PCT_OBJETIVO } from './storage/objetivos';

const CLAVES: (keyof Voz)[] = [
  'terminada', 'superada', 'practicaTerminada', 'record', 'recordPractica',
  'animoAlto', 'animoMedio', 'animoBajo', 'repetir', 'siguiente', 'progreso', 'repaso',
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
      const texto = `${VOCES[tono].animoBajo} ${VOCES[tono].animoMedio} ${VOCES[tono].terminada}`.toLowerCase();
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

  describe('diálogo de resultado (roadmap 0.1)', () => {
    for (const tono of ['juego', 'sobrio'] as const) {
      const voz = VOCES[tono];

      it(`${tono}: no dice «superada» si el intento no llega al objetivo`, () => {
        const { titulo } = textosResultado(voz, { modo: 'leccion', precision: PCT_OBJETIVO - 1, record: false });
        expect(titulo).toBe(voz.terminada);
        expect(titulo.toLowerCase()).not.toContain('superada');
      });

      it(`${tono}: dice «superada» cuando el intento llega al objetivo`, () => {
        expect(textosResultado(voz, { modo: 'leccion', precision: PCT_OBJETIVO, record: false }).titulo)
          .toBe(voz.superada);
      });

      it(`${tono}: en práctica libre no habla de lecciones`, () => {
        for (const precision of [50, PCT_OBJETIVO, 100]) {
          for (const record of [false, true]) {
            const { titulo } = textosResultado(voz, { modo: 'practica', precision, record });
            expect(titulo.toLowerCase(), `${precision}% record=${record}`).not.toContain('lección');
          }
        }
      });

      it(`${tono}: el ánimo tiene tres escalones según la precisión`, () => {
        const animo = (precision: number) =>
          textosResultado(voz, { modo: 'leccion', precision, record: false }).animo;
        expect(animo(PCT_OBJETIVO - 1)).toBe(voz.animoBajo);
        expect(animo(PCT_OBJETIVO)).toBe(voz.animoMedio);
        expect(animo(PRECISION_ALTA - 0.5)).toBe(voz.animoMedio);
        expect(animo(PRECISION_ALTA)).toBe(voz.animoAlto);
        expect(new Set([voz.animoBajo, voz.animoMedio, voz.animoAlto]).size).toBe(3);
      });
    }

    it('la marca manda en el titular de la lección', () => {
      expect(textosResultado(VOCES.juego, { modo: 'leccion', precision: 100, record: true }).titulo)
        .toBe(VOCES.juego.record);
    });
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

