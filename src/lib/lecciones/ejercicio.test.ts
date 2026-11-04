import { describe, expect, it } from 'vitest';
import { ES_ISO } from '../keyboard/layouts';
import { objetivoLeccion } from '../storage/objetivos';
import { catalogo } from './catalogo';
import { ejercicioDe, propiaPracticable, resolverLeccion, type Seleccion } from './ejercicio';
import { cuentaParaDominio, cuentaParaMarcaGlobal, IDS_RESERVADOS } from './ids';
import { crearLeccion, lapidaDe } from './personalizadas';

const AHORA = '2026-11-04T10:00:00.000Z';
const propia = crearLeccion({ titulo: 'Mía', descripcion: '', texto: 'una frase mía' }, AHORA, 'propia:mia');
const [primera, segunda, tercera] = catalogo.lecciones;

describe('ejercicioDe', () => {
  it('la cobertura sabe de qué idioma habla', () => {
    expect(ejercicioDe({ tipo: 'leccion', id: catalogo.primera.id }, []).idioma).toBe(catalogo.principal.idioma);
  });

  it('una lección del temario lleva su objetivo y su cobertura', () => {
    const e = ejercicioDe({ tipo: 'leccion', id: segunda.id }, []);
    expect(e).toMatchObject({ idSesion: segunda.id, titulo: segunda.title, texto: segunda.text });
    expect(e.explicacion).toBe(objetivoLeccion(segunda.focus));
    expect(e.cobertura).not.toBe('');
  });

  it('una personalizada se guarda con su identificador, sin objetivo ni cobertura', () => {
    const e = ejercicioDe({ tipo: 'leccion', id: propia.id }, [propia]);
    expect(e).toMatchObject({ idSesion: propia.id, titulo: 'Mía', texto: propia.texto, cobertura: '' });
    expect(e.explicacion).not.toContain('Objetivo');
    expect(ejercicioDe({ tipo: 'leccion', id: propia.id }, [{ ...propia, descripcion: 'Algo' }]).explicacion).toBe('Algo');
  });

  it('editar la que está abierta cambia la clave y vuelve a montar la práctica', () => {
    const s: Seleccion = { tipo: 'leccion', id: propia.id };
    expect(ejercicioDe(s, [propia]).clave).not.toBe(
      ejercicioDe(s, [{ ...propia, actualizadaEn: '2026-11-05T10:00:00.000Z' }]).clave,
    );
  });

  it('una borrada no se puede teclear: cae al temario', () => {
    expect(ejercicioDe({ tipo: 'leccion', id: propia.id }, [lapidaDe(propia, AHORA)]).idSesion).toBe(primera.id);
    expect(ejercicioDe({ tipo: 'leccion', id: 'propia:nada' }, []).idSesion).toBe(primera.id);
    expect(ejercicioDe({ tipo: 'leccion', id: 'nada' }, []).idSesion).toBe(primera.id);
  });

  it('la práctica libre, la continua y el refuerzo guardan su identificador de siempre', () => {
    expect(ejercicioDe({ tipo: 'libre', texto: 'hola', intento: 1 }, [])).toMatchObject({ idSesion: 'texto-propio', texto: 'hola', cobertura: '' });
    expect(ejercicioDe({ tipo: 'continua', hasta: segunda.id, texto: 'la', intento: 1 }, [])).toMatchObject({ idSesion: 'practica-continua', titulo: 'Práctica continua' });
    expect(ejercicioDe({ tipo: 'continua', hasta: 'nada', texto: 'la', intento: 1 }, []).explicacion).toContain(primera.title);
    expect(ejercicioDe({
      tipo: 'refuerzo',
      ejercicio: { id: 'refuerzo', titulo: 'T', focus: 'F', text: 'xy', teclasFlojas: ['x'] },
    }, [])).toMatchObject({ idSesion: 'refuerzo', titulo: 'T', explicacion: 'F', cobertura: '' });
  });

  it('cada modo tiene su clave, y un intento nuevo la cambia', () => {
    expect(ejercicioDe({ tipo: 'libre', texto: 'a', intento: 1 }, []).clave)
      .not.toBe(ejercicioDe({ tipo: 'libre', texto: 'a', intento: 2 }, []).clave);
    expect(ejercicioDe({ tipo: 'continua', hasta: primera.id, texto: 'a', intento: 1 }, []).clave)
      .not.toBe(ejercicioDe({ tipo: 'continua', hasta: primera.id, texto: 'a', intento: 2 }, []).clave);
  });
});

describe('resolverLeccion: la última lección siempre lleva a un sitio seguro', () => {
  const superadas = new Set([primera.id]);

  it('vuelve a la personalizada si sigue existiendo', () => {
    expect(resolverLeccion(propia.id, superadas, [propia], ES_ISO)).toBe(propia.id);
  });

  it('una personalizada borrada cae a la más avanzada abierta', () => {
    expect(resolverLeccion(propia.id, superadas, [lapidaDe(propia, AHORA)], ES_ISO)).toBe(segunda.id);
    expect(resolverLeccion(propia.id, superadas, [], ES_ISO)).toBe(segunda.id);
  });

  it('una personalizada que este teclado no puede escribir, también', () => {
    const rara = { ...propia, texto: 'calle de straße' };
    expect(propiaPracticable(propia.id, [rara], ES_ISO)).toBe(false);
    expect(resolverLeccion(propia.id, superadas, [rara], ES_ISO)).toBe(segunda.id);
  });

  it('una lección del temario abierta se respeta y una bloqueada no', () => {
    expect(resolverLeccion(primera.id, superadas, [], ES_ISO)).toBe(primera.id);
    expect(resolverLeccion(tercera.id, superadas, [], ES_ISO)).toBe(segunda.id);
  });

  it('sin dato o con uno desconocido, también', () => {
    expect(resolverLeccion(undefined, new Set(), [], ES_ISO)).toBe(primera.id);
    expect(resolverLeccion('nada', superadas, [], ES_ISO)).toBe(segunda.id);
  });
});

describe('reglas por familia de identificador', () => {
  it('lo escrito a medida no retira ayudas ni fija la marca global', () => {
    for (const id of ['propia:x', 'texto-propio']) {
      expect(cuentaParaDominio(id), id).toBe(false);
      expect(cuentaParaMarcaGlobal(id), id).toBe(false);
    }
  });

  it('el temario y lo que sale de vocabulario real, sí', () => {
    for (const id of ['reposo', 'practica-continua', 'refuerzo']) {
      expect(cuentaParaDominio(id), id).toBe(true);
      expect(cuentaParaMarcaGlobal(id), id).toBe(true);
    }
  });

  it('ninguna lección del catálogo usa un identificador reservado', () => {
    for (const l of catalogo.lecciones) expect(IDS_RESERVADOS.has(l.id), l.id).toBe(false);
  });
});
