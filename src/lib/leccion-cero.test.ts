import { describe, it, expect } from 'vitest';
import { PASOS, REPOSO } from './leccion-cero';
import { ES_ISO } from './keyboard/layouts';

const CODES = new Set(ES_ISO.rows.flat().map((k) => k.code));

describe('lección cero', () => {
  it('toda tecla señalada existe en el teclado', () => {
    // Un code mal escrito no daría error de compilación: se quedaría sin
    // resaltar y nadie se enteraría.
    for (const paso of PASOS) {
      for (const code of paso.guia) {
        expect(CODES.has(code), `${code} no existe (paso "${paso.titulo}")`).toBe(true);
      }
    }
  });

  it('toda tecla que se pide se puede pulsar de verdad', () => {
    // Esta es la grave: si el code no existe, el paso no se completa nunca y
    // el alumno se queda encallado con la única salida de saltarlo.
    for (const paso of PASOS) {
      for (const p of paso.pide ?? []) {
        expect(CODES.has(p.code), `${p.code} no existe (paso "${paso.titulo}")`).toBe(true);
      }
    }
  });

  it('el dedo que se indica es el que el teclado asigna a esa tecla', () => {
    const porCode = new Map(ES_ISO.rows.flat().map((k) => [k.code, k.finger]));
    for (const paso of PASOS) {
      for (const p of paso.pide ?? []) {
        expect(p.dedo, `${p.code} en "${paso.titulo}"`).toBe(porCode.get(p.code));
      }
    }
  });

  it('la fila de reposo son ocho teclas y coincide con la del teclado', () => {
    expect(REPOSO).toHaveLength(8);
    const home = ES_ISO.rows.flat().filter((k) => k.home).map((k) => k.code);
    expect([...REPOSO].sort()).toEqual([...home].sort());
  });

  it('enseña los relieves de la F y la J, que es el truco entero', () => {
    const texto = PASOS.map((p) => p.cuerpo.join(' ')).join(' ');
    expect(texto).toMatch(/relieve/i);
    const paso = PASOS.find((p) => p.pide?.some((x) => x.code === 'KeyF'));
    expect(paso, 'ningún paso hace probar la F').toBeTruthy();
    expect(paso!.pide!.map((x) => x.code)).toContain('KeyJ');
  });

  it('no mide nada: ni velocidad ni puntuación', () => {
    // Es deliberado. Aquí se coloca a la persona, no se la evalúa.
    const texto = PASOS.map((p) => p.cuerpo.join(' ')).join(' ').toLowerCase();
    for (const palabra of ['puntuación', 'récord', 'velocidad por minuto']) {
      expect(texto).not.toContain(palabra);
    }
  });

  it('todos los pasos tienen título y algo que leer', () => {
    for (const paso of PASOS) {
      expect(paso.titulo.length).toBeGreaterThan(5);
      expect(paso.cuerpo.length).toBeGreaterThan(0);
      for (const p of paso.cuerpo) expect(p.length).toBeGreaterThan(20);
    }
  });
});
