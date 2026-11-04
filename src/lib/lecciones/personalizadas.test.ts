import { describe, expect, it } from 'vitest';
import { ES_ISO } from '../keyboard/layouts';
import { catalogo } from './catalogo';
import { esIdPropio, PREFIJO_PROPIA } from './ids';
import {
  activas, aplicarDeCopia, avisosDeImportacion, crearLeccion, duplicarLeccion, editarLeccion, FORMATO_EXPORTACION,
  fusionarImportadas, lapidaDe, LIMITES, nombreFichero, nuevoIdPropio, parsearExportacion,
  problemasDeTexto, sanearLeccion, sanearLista, serializarExportacion, validarBorrador,
  VERSION_EXPORTACION, type Entrante, type LeccionPropia,
} from './personalizadas';

const AHORA = '2026-11-04T10:00:00.000Z';
const LUEGO = '2026-11-05T10:00:00.000Z';
const borrador = { titulo: 'Mi lección', descripcion: '', texto: 'una frase para practicar' };
const propia = (extra: Partial<LeccionPropia> = {}): LeccionPropia => ({
  ...crearLeccion(borrador, AHORA, 'propia:uno'), ...extra,
});
const entrante = (extra: Partial<Entrante> = {}): Entrante => ({ ...borrador, id: null, creadaEn: null, ...extra });

describe('identificadores', () => {
  it('nunca chocan con el temario', () => {
    for (let i = 0; i < 20; i++) {
      const id = nuevoIdPropio();
      expect(esIdPropio(id)).toBe(true);
      expect(catalogo.tiene(id)).toBe(false);
    }
    expect(catalogo.lecciones.some((l) => l.id.startsWith(PREFIJO_PROPIA))).toBe(false);
  });

  it('se reconoce la forma y no se traga cualquier cosa', () => {
    expect(esIdPropio('propia:abc-1_2')).toBe(true);
    for (const malo of ['reposo', 'propia:', 'propia:a b', 'propia:../x', 'xpropia:a', 7, null]) {
      expect(esIdPropio(malo), String(malo)).toBe(false);
    }
  });
});

describe('validarBorrador', () => {
  it('limpia y acepta un texto normal', () => {
    const r = validarBorrador({ titulo: '  Mi\nlección ', descripcion: ' algo ', texto: ' uno\n“dos”  tres ' }, ES_ISO);
    expect(r).toEqual({ ok: true, limpio: { titulo: 'Mi lección', descripcion: 'algo', texto: 'uno "dos" tres' } });
  });

  it('pide nombre y texto suficiente', () => {
    const r = validarBorrador({ titulo: '  ', descripcion: '', texto: 'corto' }, ES_ISO);
    if (r.ok) throw new Error('debería fallar');
    expect(r.errores.map((e) => e.campo)).toEqual(['titulo', 'texto']);
    expect(r.errores[1].mensaje).toContain(String(LIMITES.textoMin));
  });

  it('respeta los límites de longitud', () => {
    const r = validarBorrador({
      titulo: 'a'.repeat(LIMITES.titulo + 1),
      descripcion: 'b'.repeat(LIMITES.descripcion + 1),
      texto: 'c'.repeat(LIMITES.textoMax + 1),
    }, ES_ISO);
    if (r.ok) throw new Error('debería fallar');
    expect(r.errores.map((e) => e.campo)).toEqual(['titulo', 'descripcion', 'texto']);
  });

  it('justo en el límite pasa', () => {
    const r = validarBorrador({
      titulo: 'a'.repeat(LIMITES.titulo),
      descripcion: 'b'.repeat(LIMITES.descripcion),
      texto: 'c'.repeat(LIMITES.textoMax),
    }, ES_ISO);
    expect(r.ok).toBe(true);
  });

  it('dice qué carácter y dónde', () => {
    const r = validarBorrador({ ...borrador, texto: 'una calle en straße' }, ES_ISO);
    if (r.ok) throw new Error('debería fallar');
    expect(r.errores).toHaveLength(1);
    const { campo, mensaje } = r.errores[0];
    expect(campo).toBe('texto');
    expect(mensaje).toContain('«ß»');
    expect(mensaje).toContain('carácter 18');
    expect(mensaje).toContain('«straße»');
  });

  it('en un texto de varias líneas dice también la línea', () => {
    const [m] = problemasDeTexto('primera línea\nsegunda ß', ES_ISO);
    expect(m).toContain('línea 2, carácter 9');
  });

  it('explica el acento suelto en vez de decir que no está en el teclado', () => {
    const [m] = problemasDeTexto('un acento ´ suelto aquí', ES_ISO);
    expect(m).toContain('sobre la vocal');
    expect(m).not.toContain('no está en el teclado');
  });

  it('no suelta una lista interminable', () => {
    const m = problemasDeTexto('ßæøåþð¶ŧ←↓', ES_ISO);
    expect(m.length).toBeLessThan(8);
    expect(m.at(-1)).toMatch(/más/);
  });

  it('informa sin reprender', () => {
    const r = validarBorrador({ titulo: '', descripcion: '', texto: 'ß' }, ES_ISO);
    if (r.ok) throw new Error('debería fallar');
    for (const { mensaje } of r.errores) {
      expect(mensaje).not.toMatch(/error|inválid|incorrect|mal |no puedes|debes/i);
    }
  });
});

describe('ciclo de vida', () => {
  it('editar conserva identificador y creación', () => {
    const l = editarLeccion(propia(), { ...borrador, titulo: 'Otra' }, LUEGO);
    expect(l).toMatchObject({ id: 'propia:uno', titulo: 'Otra', creadaEn: AHORA, actualizadaEn: LUEGO });
  });

  it('duplicar da otra lección, sin histórico, y sin pasarse del límite', () => {
    const c = duplicarLeccion(propia({ titulo: 'x'.repeat(LIMITES.titulo) }), LUEGO);
    expect(c.id).not.toBe('propia:uno');
    expect(c.titulo.startsWith('Copia de ')).toBe(true);
    expect([...c.titulo].length).toBe(LIMITES.titulo);
    expect(c.texto).toBe(borrador.texto);
  });

  it('borrar deja el nombre y se lleva el texto', () => {
    const l = lapidaDe(propia({ descripcion: 'algo' }), LUEGO);
    expect(l).toMatchObject({ titulo: 'Mi lección', texto: '', descripcion: '', borradaEn: LUEGO, actualizadaEn: LUEGO });
  });

  it('activas quita lápidas y ordena por nombre', () => {
    const lista = [propia({ id: 'propia:b', titulo: 'Zeta' }), propia({ id: 'propia:a', titulo: 'Ñu' }), propia({ id: 'propia:c', titulo: 'Ala', borradaEn: AHORA })];
    expect(activas(lista).map((l) => l.titulo)).toEqual(['Ñu', 'Zeta']);
  });
});

describe('datos corruptos', () => {
  it.each([null, 3, 'x', {}, { id: 'reposo', titulo: 'a', texto: 'b' }, { id: 'propia:a' }, { id: 'propia:a', titulo: 'a', texto: 7 }])(
    'descarta lo que no se puede aprovechar: %j', (crudo) => {
      expect(sanearLeccion(crudo)).toBeNull();
    },
  );

  it('arregla antes que perder lo que alguien escribió', () => {
    const l = sanearLeccion({
      id: 'propia:a', titulo: 7, descripcion: 8, texto: ` muy\nlargo ${'x'.repeat(LIMITES.textoMax)}`,
      creadaEn: 'ayer', actualizadaEn: null, borradaEn: 'no es fecha',
    })!;
    expect(l.titulo).toBe('Lección sin nombre');
    expect(l.descripcion).toBe('');
    expect(l.texto.startsWith('muy largo x')).toBe(true);
    expect([...l.texto].length).toBeLessThanOrEqual(LIMITES.textoMax);
    expect(l.borradaEn).toBeNull();
    expect(Number.isFinite(Date.parse(l.creadaEn))).toBe(true);
    expect(Number.isFinite(Date.parse(l.actualizadaEn))).toBe(true);
  });

  it('una lápida se conserva sin texto y pierde el que traiga', () => {
    const l = sanearLeccion({ id: 'propia:a', titulo: 'Vieja', texto: 'sobra', descripcion: 'sobra', borradaEn: AHORA })!;
    expect(l).toMatchObject({ titulo: 'Vieja', texto: '', descripcion: '', borradaEn: AHORA });
  });

  it('una lista corrupta es una lista vacía, y sin identificadores repetidos', () => {
    expect(sanearLista('no')).toEqual([]);
    expect(sanearLista(undefined)).toEqual([]);
    const lista = sanearLista([propia(), 3, propia({ titulo: 'Última' })]);
    expect(lista.map((l) => l.titulo)).toEqual(['Última']);
  });
});

describe('copia de seguridad', () => {
  it('gana la versión más reciente, también si es un borrado', () => {
    const aqui = [propia({ id: 'propia:a', actualizadaEn: LUEGO }), propia({ id: 'propia:b', actualizadaEn: AHORA })];
    const copia = [
      propia({ id: 'propia:a', titulo: 'Vieja', actualizadaEn: AHORA }),
      lapidaDe(propia({ id: 'propia:b' }), LUEGO),
      propia({ id: 'propia:c', titulo: 'Nueva' }),
    ];
    expect(aplicarDeCopia(aqui, copia).aEscribir.map((l) => l.id)).toEqual(['propia:b', 'propia:c']);
  });

  it('compara fechas, no textos: un formato distinto no gana por el orden alfabético', () => {
    const aqui = [propia({ actualizadaEn: LUEGO })];
    // Como texto, «Thu…» va detrás de «2026…» aunque la fecha sea anterior.
    const copia = [propia({ titulo: 'Antigua', actualizadaEn: 'Thu Jan 01 2015 10:00:00 GMT' })];
    expect(aplicarDeCopia(aqui, copia).aEscribir).toEqual([]);
  });

  it('no pasa del límite de lecciones vivas y dice cuáles se quedan fuera', () => {
    const aqui = Array.from({ length: LIMITES.lecciones - 1 }, (_, i) => propia({ id: `propia:n${i}` }));
    const copia = [propia({ id: 'propia:x', titulo: 'Cabe' }), propia({ id: 'propia:y', titulo: 'No cabe' })];
    const r = aplicarDeCopia(aqui, copia);
    expect(r.aEscribir.map((l) => l.titulo)).toEqual(['Cabe']);
    expect(r.sinSitio).toEqual(['No cabe']);
  });

  it('una lápida y una versión más nueva de una que ya estaba entran aunque esté lleno', () => {
    const aqui = Array.from({ length: LIMITES.lecciones }, (_, i) => propia({ id: `propia:n${i}` }));
    const copia = [
      propia({ id: 'propia:n0', titulo: 'Nueva versión', actualizadaEn: LUEGO }),
      lapidaDe(propia({ id: 'propia:vieja' }), LUEGO),
    ];
    const r = aplicarDeCopia(aqui, copia);
    expect(r.aEscribir).toHaveLength(2);
    expect(r.sinSitio).toEqual([]);
  });
});

describe('formato de intercambio', () => {
  const fichero = (lecciones: unknown, extra: object = {}): string => JSON.stringify({
    formato: FORMATO_EXPORTACION, version: VERSION_EXPORTACION, lecciones, ...extra,
  });

  it('el fichero exportado es versionado y vuelve a entrar igual', () => {
    const json = serializarExportacion([propia(), lapidaDe(propia({ id: 'propia:b' }), AHORA)], AHORA);
    const datos = JSON.parse(json);
    expect(datos).toMatchObject({ formato: FORMATO_EXPORTACION, version: 1, creadoEn: AHORA });
    expect(datos.lecciones).toHaveLength(1);
    const { validas, rechazadas } = parsearExportacion(json, ES_ISO);
    expect(rechazadas).toEqual([]);
    expect(validas).toEqual([{ ...borrador, id: 'propia:uno', creadaEn: AHORA }]);
  });

  it.each([
    ['no es JSON', 'hola', /JSON/],
    ['es otro JSON', '{"sesiones": []}', /lecciones de LibreType/],
    ['es una lista', '[]', /lecciones de LibreType/],
    ['sin versión', JSON.stringify({ formato: FORMATO_EXPORTACION, lecciones: [] }), /versión/],
    ['de una versión futura', fichero([], { version: 99 }), /más nueva/],
    ['sin lista', JSON.stringify({ formato: FORMATO_EXPORTACION, version: 1 }), /lista/],
  ])('rechaza un fichero que %s', (_, json, esperado) => {
    expect(() => parsearExportacion(json, ES_ISO)).toThrow(esperado);
  });

  it('entra lo bueno y explica lo que no, con su nombre', () => {
    const { validas, rechazadas } = parsearExportacion(fichero([
      borrador,
      { titulo: 'Alemana', texto: 'una calle en straße larga' },
      { titulo: 'x' },
      7,
    ]), ES_ISO);
    expect(validas).toHaveLength(1);
    expect(rechazadas.map((r) => r.nombre)).toEqual(['Alemana', 'x', 'Lección 4 del fichero']);
    expect(rechazadas[0].motivos[0]).toContain('«ß»');
  });

  it('un identificador ajeno no se hace pasar por una lección del temario', () => {
    const { validas } = parsearExportacion(fichero([{ ...borrador, id: 'reposo' }]), ES_ISO);
    expect(validas[0].id).toBeNull();
    const [l] = fusionarImportadas([], validas, AHORA).aGuardar;
    expect(esIdPropio(l.id)).toBe(true);
  });

  it('el nombre del fichero es seguro', () => {
    expect(nombreFichero(AHORA)).toBe('libretype-lecciones-2026-11-04.json');
    expect(nombreFichero(AHORA, 'Cómo está ../../ el Ñandú?')).toBe('libretype-como-esta-el-nandu-2026-11-04.json');
    expect(nombreFichero(AHORA, '¿?')).toBe('libretype-leccion-2026-11-04.json');
  });
});

describe('fusionarImportadas', () => {
  it('importar nunca pisa: mismo identificador con otro contenido entra aparte', () => {
    const f = fusionarImportadas([propia()], [entrante({ id: 'propia:uno', titulo: 'Otra' })], AHORA);
    expect(f.aGuardar).toHaveLength(1);
    expect(f.aGuardar[0].id).not.toBe('propia:uno');
    expect(f.aGuardar[0].titulo).toBe('Otra');
  });

  it('importar dos veces no duplica', () => {
    const f = fusionarImportadas([propia()], [entrante({ id: 'propia:uno' }), entrante()], AHORA);
    expect(f.aGuardar).toEqual([]);
    expect(f.repetidas).toBe(2);
  });

  it('dentro del mismo fichero tampoco', () => {
    const f = fusionarImportadas([], [entrante(), entrante()], AHORA);
    expect(f.aGuardar).toHaveLength(1);
    expect(f.repetidas).toBe(1);
  });

  it('conserva el identificador libre para no perder el histórico', () => {
    const f = fusionarImportadas([], [entrante({ id: 'propia:otra', creadaEn: LUEGO })], AHORA);
    expect(f.aGuardar[0]).toMatchObject({ id: 'propia:otra', creadaEn: LUEGO, actualizadaEn: AHORA, borradaEn: null });
  });

  it('resucita una lápida con su identificador, y el histórico vuelve a tener lección', () => {
    const f = fusionarImportadas([lapidaDe(propia(), AHORA)], [entrante({ id: 'propia:uno' })], LUEGO);
    expect(f.aGuardar[0]).toMatchObject({ id: 'propia:uno', borradaEn: null, texto: borrador.texto });
  });

  it('respeta el límite y dice cuáles no han cabido', () => {
    const llenas = Array.from({ length: LIMITES.lecciones }, (_, i) =>
      propia({ id: `propia:n${i}`, titulo: `n${i}` }));
    const f = fusionarImportadas(llenas, [entrante({ titulo: 'Una más' })], AHORA);
    expect(f.aGuardar).toEqual([]);
    expect(f.sinSitio).toEqual(['Una más']);
  });
});

describe('un fichero hostil no puede congelar la importación', () => {
  const con = (lecciones: unknown[]): string =>
    JSON.stringify({ formato: FORMATO_EXPORTACION, version: VERSION_EXPORTACION, lecciones });

  it('rechaza el fichero entero si trae demasiadas entradas, sin validarlas', () => {
    const json = con(Array.from({ length: LIMITES.ficheroEntradas + 1 }, () => ({})));
    expect(() => parsearExportacion(json, ES_ISO)).toThrow(/repartirlas en ficheros más pequeños/);
  });

  it('en el tope sigue leyéndolo y los avisos no crecen con él', () => {
    const leido = parsearExportacion(con(Array.from({ length: LIMITES.ficheroEntradas }, () => ({}))), ES_ISO);
    expect(leido.rechazadas).toHaveLength(LIMITES.ficheroEntradas);
    const avisos = avisosDeImportacion(leido, { aGuardar: [], repetidas: 0, sinSitio: [] });
    expect(avisos).toHaveLength(6);
    expect(avisos.at(-1)).toContain(`${LIMITES.ficheroEntradas - 5} lecciones más`);
  });

  it('la lista de las que no han cabido tampoco crece sin fin', () => {
    const sinSitio = Array.from({ length: 900 }, (_, i) => `n${i}`);
    const [aviso] = avisosDeImportacion({ validas: [], rechazadas: [] }, { aGuardar: [], repetidas: 0, sinSitio });
    expect(aviso).toContain('n4 y 895 más');
    expect(aviso).not.toContain('n5');
  });
});
