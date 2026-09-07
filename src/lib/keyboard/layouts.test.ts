import { describe, it, expect } from 'vitest';
import { buildIndex, ES_ISO, FINGER_NAMES, LAYOUTS } from './layouts';
import { LESSONS } from '../lessons';

const index = buildIndex(ES_ISO);

describe('índice de caracteres', () => {
  it('una letra normal es una sola pulsación', () => {
    expect(index.get('a')).toEqual([
      expect.objectContaining({ code: 'KeyA', shift: false, altgr: false, finger: 'l-pinky' }),
    ]);
  });

  it('la eñe está donde el meñique derecho, junto a la ele', () => {
    expect(index.get('ñ')).toEqual([
      expect.objectContaining({ code: 'Semicolon', shift: false, finger: 'r-pinky' }),
    ]);
    expect(index.get('Ñ')).toEqual([
      expect.objectContaining({ code: 'Semicolon', shift: true }),
    ]);
  });

  it('una vocal con tilde son dos pulsaciones: acento y luego vocal', () => {
    const pasos = index.get('á');
    expect(pasos).toHaveLength(2);
    expect(pasos![0]).toMatchObject({ code: 'Quote', dead: true });
    expect(pasos![1]).toMatchObject({ code: 'KeyA', dead: false });
  });

  it('la diéresis lleva Mayús en el primer paso', () => {
    const pasos = index.get('ü');
    expect(pasos).toHaveLength(2);
    expect(pasos![0]).toMatchObject({ code: 'Quote', shift: true });
    expect(pasos![1]).toMatchObject({ code: 'KeyU' });
  });

  it('las mayúsculas acentuadas también se componen', () => {
    expect(index.get('Á')).toHaveLength(2);
    expect(index.get('Ó')![1]).toMatchObject({ code: 'KeyO', shift: true });
  });

  it('los símbolos de AltGr están marcados como tales', () => {
    expect(index.get('@')).toEqual([
      expect.objectContaining({ code: 'Digit2', altgr: true, shift: false }),
    ]);
    expect(index.get('€')![0].altgr).toBe(true);
  });

  it('el acento suelto es una tecla muerta', () => {
    expect(index.get('´')![0].dead).toBe(true);
    expect(index.get('¨')![0].dead).toBe(true);
  });

  it('el espacio va con el pulgar', () => {
    expect(index.get(' ')).toEqual([
      expect.objectContaining({ code: 'Space', finger: 'thumb' }),
    ]);
  });
});

describe('distribución ES-ISO', () => {
  it('la fila de reposo son las ocho teclas de siempre más la ñ', () => {
    const reposo = ES_ISO.rows.flat().filter((k) => k.home).map((k) => k.code);
    expect(reposo).toEqual([
      'KeyA', 'KeyS', 'KeyD', 'KeyF',
      'KeyJ', 'KeyK', 'KeyL', 'Semicolon',
    ]);
  });
});

describe('las lecciones son escribibles', () => {
  // Si alguien añade una lección con un carácter que esta distribución no
  // produce, la app no sabría qué tecla resaltar y el alumno se quedaría
  // atascado sin pista. Mejor que falle aquí.
  for (const leccion of LESSONS) {
    it(`"${leccion.title}"`, () => {
      const imposibles = [...new Set([...leccion.text])].filter((ch) => !index.has(ch));
      expect(imposibles, `caracteres sin tecla: ${imposibles.join(' ')}`).toEqual([]);
    });
  }

  it('hay una lección que practica tildes de verdad', () => {
    const conTilde = LESSONS.filter((l) =>
      [...l.text].some((ch) => (index.get(ch)?.length ?? 0) > 1));
    expect(conTilde.length).toBeGreaterThan(0);
  });
});

describe('todas las distribuciones registradas', () => {
  for (const layout of LAYOUTS) {
    describe(layout.id, () => {
      it('construye su índice sin romperse', () => {
        const ix = buildIndex(layout);
        expect(ix.size).toBeGreaterThan(30);
        for (const pasos of ix.values()) expect(pasos.length).toBeGreaterThan(0);
      });

      it('no hay codes repetidos', () => {
        const vistos = new Set<string>();
        for (const fila of layout.rows) {
          for (const k of fila) {
            expect(vistos.has(k.code), `code duplicado: ${k.code}`).toBe(false);
            vistos.add(k.code);
          }
        }
      });

      it('toda tecla tiene dedo asignado y válido', () => {
        for (const k of layout.rows.flat()) {
          expect(k.finger in FINGER_NAMES, `dedo inválido o ausente en ${k.code}: ${k.finger}`).toBe(true);
        }
      });

      it('todo carácter compuesto se puede formar con teclas que existen', () => {
        const ix = buildIndex(layout);
        for (const [ch, seq] of Object.entries(layout.compose)) {
          for (const parte of [...seq]) {
            expect(ix.has(parte), `${ch} necesita "${parte}", que no está en la tabla`)
              .toBe(true);
          }
          expect(ix.has(ch), `${ch} debe estar indexado en la distribución`).toBe(true);
          const pasos = ix.get(ch);
          expect(pasos, `${ch} no tiene pasos en el índice`).toBeDefined();
          expect(pasos!.length, `${ch} debe requerir tantos pasos como caracteres en la secuencia compose`).toBe([...seq].length);
          expect(pasos![0].dead, `el primer paso de composición para "${ch}" debe ser tecla muerta`).toBe(true);
        }
      });
    });
  }
});

