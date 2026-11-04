import { describe, expect, it } from 'vitest';
import { ES_ISO } from '../keyboard/layouts';
import {
  buscarNoEscribibles, caracteresEscribibles, esAcentoSuelto, normalizarTexto, normalizarTextoLibre,
} from './texto';

describe('buscarNoEscribibles', () => {
  it('copia solo un trozo de la palabra: un texto sin espacios la haría tan larga como el fichero', () => {
    const [largo] = buscarNoEscribibles(`${'a'.repeat(5000)}☃${'b'.repeat(5000)}`, ES_ISO);
    expect(largo.palabra).toBe(`…${'a'.repeat(20)}☃${'b'.repeat(20)}…`);
  });

  it('una palabra normal sale entera y sin puntos suspensivos', () => {
    expect(buscarNoEscribibles('hola m☃ndo adiós', ES_ISO)[0].palabra).toBe('m☃ndo');
  });
});

describe('normalizarTexto', () => {
  it('une los saltos de línea y los espacios de más', () => {
    expect(normalizarTexto('  hola\r\n\tmundo  ya  ')).toBe('hola mundo ya');
  });

  it('recompone los acentos separados: macOS y algunos PDF los dan así', () => {
    expect(normalizarTexto('café')).toBe('café');
    expect(buscarNoEscribibles('café', ES_ISO)).toEqual([]);
  });

  it('cambia lo tipográfico por lo que hay en el teclado', () => {
    expect(normalizarTexto('“Hola” — dijo… ‘ya’ «no»')).toBe(`"Hola" - dijo... 'ya' "no"`);
  });

  it('quita lo invisible sin partir la palabra', () => {
    expect(normalizarTexto('pala​bra﻿ a­b')).toBe('palabra ab');
  });
});

describe('qué se puede pedir', () => {
  it('lo normal sí, espacio incluido, y con dos pulsaciones también', () => {
    const permitidos = caracteresEscribibles(ES_ISO);
    for (const ch of 'aZñÑáÉü 1?¡@€') expect(permitidos.has(ch), ch).toBe(true);
  });

  it('un acento suelto no: el resultado cambia según la plataforma', () => {
    // Hallazgo 2 de los spikes: `´`+espacio da `´` en macOS y `'` en GTK.
    const permitidos = caracteresEscribibles(ES_ISO);
    for (const ch of '´¨`^') {
      expect(permitidos.has(ch), ch).toBe(false);
      expect(esAcentoSuelto(ch, ES_ISO)).toBe(true);
    }
    expect(esAcentoSuelto('a', ES_ISO)).toBe(false);
  });

  it('normalizarTextoLibre descarta lo que no se puede teclear', () => {
    expect(normalizarTextoLibre('straße ´ ok', caracteresEscribibles(ES_ISO))).toBe('strae ok');
  });
});

describe('buscarNoEscribibles', () => {
  it('no encuentra nada en texto normal, aunque venga de un procesador de textos', () => {
    expect(buscarNoEscribibles('Hola, “qué tal” — ¿bien…?\nSí.', ES_ISO)).toEqual([]);
  });

  it('dice qué carácter, en qué línea, en qué posición y en qué palabra', () => {
    const [ß, ...resto] = buscarNoEscribibles('hola\nla straße ancha', ES_ISO);
    expect(resto).toEqual([]);
    expect(ß).toMatchObject({ caracter: 'ß', visible: 'ß', linea: 2, columna: 8, palabra: 'straße', veces: 1 });
  });

  it('agrupa las repeticiones y cuenta desde la primera', () => {
    const [ß] = buscarNoEscribibles('ß ß\nß', ES_ISO);
    expect(ß).toMatchObject({ linea: 1, columna: 1, veces: 3 });
  });

  it('cuenta bien la posición con un emoji delante', () => {
    const r = buscarNoEscribibles('😀 ß', ES_ISO);
    expect(r.map((c) => c.columna)).toEqual([1, 3]);
    expect(r[0].caracter).toBe('😀');
  });

  it('enseña por su código lo que no se ve', () => {
    const [c] = buscarNoEscribibles('a\u0007b', ES_ISO);
    expect(c.visible).toBe('U+0007');
  });

  it('marca el acento suelto para poder explicarlo', () => {
    const [c] = buscarNoEscribibles('a ´ b', ES_ISO);
    expect(c.acentoSuelto).toBe(true);
  });
});

describe('texto libre', () => {
  const permitidos = caracteresEscribibles(ES_ISO);

  it('lo que queda tras quitar lo que no se teclea no lleva espacios de más', () => {
    expect(normalizarTextoLibre('hola 😀 mundo', permitidos)).toBe('hola mundo');
    expect(normalizarTextoLibre('😀 hola', permitidos)).toBe('hola');
    expect(normalizarTextoLibre('hola 😀', permitidos)).toBe('hola');
  });

  it('si no queda nada escribible no queda nada, ni un espacio', () => {
    expect(normalizarTextoLibre('😀 😀', permitidos)).toBe('');
  });
});
