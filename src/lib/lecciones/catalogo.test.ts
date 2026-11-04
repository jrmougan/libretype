/**
 * El catálogo con cursos inventados: lo que importa es que añadir un curso sea
 * añadir datos, y eso solo se ve con más de uno.
 */
import { describe, expect, it } from 'vitest';
import { LAYOUTS } from '../keyboard/layouts';
import { leccionesOxidadas } from '../storage/repaso';
import { leccionesSuperadas } from '../storage/objetivos';
import { resumirDificultad } from '../storage/dificultad';
import type { Sesion } from '../storage/progreso';
import { catalogo, crearCatalogo } from './catalogo';
import { CURSOS } from './cursos';
import { comprobarCurso } from './garantias';
import type { Curso, Lesson } from './tipos';

const leccion = (id: string, nuevas: string, text: string, cobertura = 10): Lesson => ({
  id, title: id, focus: 'x', nuevas, cobertura, text,
});

const LARGO = 'sala sala sala sala sala sala sala';
const CURSO_A: Curso = {
  id: 'a',
  titulo: 'Curso A',
  idioma: 'x',
  vocabulario: ['las', 'imposible'],
  lecciones: [
    leccion('a1', 'sal', LARGO, 10),
    leccion('a2', 'e', 'sale sale sale sale sale sale sale', 20),
    leccion('a3', 'o', 'solo solo sola sale sala solo sola', 30),
  ],
};
const CURSO_B: Curso = {
  id: 'b',
  titulo: 'Curso B',
  idioma: 'y',
  lecciones: [
    leccion('b1', 'mi', 'mi mi mi mimi mi mi mimi mi mi mi mi', 10),
    leccion('b2', 'u', 'mu mi mu mimu mu mi mimu mu mi mu mu', 20),
  ],
};
const dos = crearCatalogo([CURSO_A, CURSO_B]);

const sesion = (leccion: string, terminadaEn = '2026-09-01T10:00:00Z'): Sesion => ({
  leccion, ppm: 20, pctAcierto: 95, aciertos: 95, escritos: 100, ms: 60000, terminadaEn,
});

describe('consultas', () => {
  it('encuentra cualquier lección de cualquier curso', () => {
    expect(dos.lecciones.map((l) => l.id)).toEqual(['a1', 'a2', 'a3', 'b1', 'b2']);
    expect(dos.leccion('b2')?.nuevas).toBe('u');
    expect(dos.tiene('b1')).toBe(true);
    expect(dos.tiene('nada')).toBe(false);
    expect(dos.cursoDe('b2')?.id).toBe('b');
    expect(dos.indiceEnCurso('b2')).toBe(1);
    expect(dos.indiceEnCurso('nada')).toBe(-1);
    expect(dos.primera.id).toBe('a1');
    expect(dos.principal.id).toBe('a');
  });

  it('la siguiente nunca salta de curso', () => {
    expect(dos.siguiente('a1')?.id).toBe('a2');
    expect(dos.siguiente('a3')).toBeUndefined();
    expect(dos.siguiente('nada')).toBeUndefined();
  });

  it('cada curso se desbloquea por su cuenta', () => {
    const hechas = ['a1', 'b1', 'b2'];
    expect(dos.nivelDesbloqueado(hechas)).toBe(1);
    expect(dos.nivelDesbloqueado(hechas, 'b')).toBe(1);
    expect(dos.estaDesbloqueada('a2', hechas)).toBe(true);
    expect(dos.estaDesbloqueada('a3', hechas)).toBe(false);
    expect(dos.estaDesbloqueada('b1', [])).toBe(true);
    expect(dos.estaDesbloqueada('nada', hechas)).toBe(false);
    expect(dos.ultimaDisponible(hechas).id).toBe('a2');
    expect(dos.ultimaDisponible(hechas, 'b').id).toBe('b2');
  });

  it('el alfabeto y el vocabulario no se mezclan entre cursos', () => {
    expect([...dos.alfabetoHasta('a2')].sort().join('')).toBe('aels');
    expect(dos.alfabetoHasta('b1').has('s')).toBe(false);
    expect(dos.alfabetoHasta('nada').size).toBe(0);
    expect(dos.vocabularioHasta('a1')).toContain('las');
    expect(dos.vocabularioHasta('a1')).not.toContain('imposible');
    expect(dos.vocabularioHasta('nada')).toEqual([]);
  });

  it('sin palabras escribibles cae al texto de la propia lección', () => {
    const raro = crearCatalogo([{
      id: 'r', titulo: 'R', idioma: 'x', lecciones: [leccion('r1', 'z', 'a b', 10)],
    }]);
    expect(raro.vocabularioHasta('r1')).toEqual(['a', 'b']);
  });

  it('el texto de práctica no repite palabra dos veces seguidas', () => {
    let i = 0;
    const texto = dos.textoPractica('a2', 12, () => (i++ % 7) / 7).split(' ');
    expect(texto).toHaveLength(12);
    texto.forEach((p, j) => {
      if (j > 0) expect(p).not.toBe(texto[j - 1]);
    });
  });
});

describe('un catálogo mal escrito no arranca', () => {
  it.each([
    ['sin cursos', []],
    ['con un curso vacío', [{ id: 'x', titulo: 'x', lecciones: [] }]],
    ['con dos cursos iguales', [CURSO_A, CURSO_A]],
    ['con una lección repetida entre cursos', [CURSO_A, { id: 'c', titulo: 'c', lecciones: [CURSO_A.lecciones[0]] }]],
    ['con el espacio de nombres de las personalizadas', [{ id: 'c', titulo: 'c', lecciones: [leccion('propia:uno', 'a', LARGO)] }]],
    ['con un modo del selector como lección', [{ id: 'c', titulo: 'c', lecciones: [leccion('continua', 'a', LARGO)] }]],
    ['con un modo del histórico como lección', [{ id: 'c', titulo: 'c', lecciones: [leccion('texto-propio', 'a', LARGO)] }]],
  ] as [string, Curso[]][])('%s', (_, cursos) => {
    expect(() => crearCatalogo(cursos)).toThrow();
  });
});

describe('las mismas garantías para cada curso', () => {
  it.each(CURSOS.map((c) => [c.titulo, c] as const))('%s las cumple', (_, curso) => {
    expect(comprobarCurso(curso)).toEqual([]);
  });

  it('el catálogo de la aplicación usa la lista de cursos', () => {
    expect(catalogo.cursos).toEqual(CURSOS);
  });

  const base = (lecciones: Lesson[], extra: Partial<Curso> = {}): Curso => ({
    id: 'p', titulo: 'p', idioma: 'x', lecciones, ...extra,
  });
  // Cada comprobación se demuestra rompiéndola: una garantía que nunca falla no
  // está garantizando nada.
  it.each<[string, Curso, RegExp]>([
    ['identificador repetido', base([leccion('x', 'sal', LARGO), leccion('x', 'e', 'sale sale sale sale sale sale sale', 20)]), /se repite/],
    ['tecla sin enseñar', base([leccion('x', 'sal', `${LARGO} pez`)]), /antes de enseñarlas/],
    ['no practica lo que estrena', base([leccion('x', 'q', LARGO)]), /no practica/],
    ['tecla enseñada dos veces', base([leccion('x', 'sal', LARGO), leccion('y', 's', LARGO, 20)]), /vuelve a enseñar/],
    ['demasiado corta', base([leccion('x', 'sal', 'sala')]), /demasiado corta/],
    ['texto sin normalizar', base([leccion('x', 'sal', `${LARGO}  sal`)]), /sin normalizar/],
    ['relleno repetido', base([leccion('x', 'sal', `${LARGO} ssss`)]), /relleno/],
    ['carácter fuera del teclado', base([leccion('x', 'salß', `${LARGO} salß`)]), /no se teclea/],
    ['acento suelto', base([leccion('x', 'sal´', `${LARGO} sal´`)]), /no se teclea/],
    ['demasiadas teclas de golpe', base([leccion('x', 'sal', LARGO), leccion('y', 'bcdefg', `bcdefg ${LARGO}`, 20)]), /demasiadas teclas/],
    ['cobertura que no sube', base([leccion('x', 'sal', LARGO, 20), leccion('y', 'e', 'sale sale sale sale sale sale sale', 20)]), /no aumenta/],
    ['fin de alfabeto inexistente', base([leccion('x', 'sal', LARGO)], { finAlfabeto: 'nada' }), /no existe/],
    ['cobertura tras el alfabeto', base([leccion('x', 'sal', LARGO), leccion('y', 'e', 'sale sale sale sale sale sale sale', 80)], { finAlfabeto: 'x' }), /no es 100/],
  ])('detecta: %s', (_, curso, esperado) => {
    expect(comprobarCurso(curso, LAYOUTS).join('\n')).toMatch(esperado);
  });
});

describe('el progreso funciona con varios cursos', () => {
  it('objetivos: se superan por curso y lo ajeno al catálogo no cuenta', () => {
    const sesiones = ['a1', 'b1', 'propia:x', 'reposo'].map((id) => sesion(id));
    expect([...leccionesSuperadas(sesiones, dos)].sort()).toEqual(['a1', 'b1']);
    expect(dos.nivelDesbloqueado(leccionesSuperadas(sesiones, dos), 'a')).toBe(1);
    expect(dos.nivelDesbloqueado(leccionesSuperadas(sesiones, dos), 'b')).toBe(1);
  });

  it('repaso: recorre todos los cursos', () => {
    const viejas = [sesion('a1', '2026-08-01T10:00:00Z'), sesion('b1', '2026-08-02T10:00:00Z')];
    const luego = ['a2', 'b2', 'a2', 'b2'].map((id) => sesion(id, '2026-09-01T10:00:00Z'));
    const ids = leccionesOxidadas([...viejas, ...luego], '2026-09-02T10:00:00Z', null, dos).map((o) => o.id);
    expect(ids).toEqual(['a1', 'b1']);
  });

  it('dificultad: entra cualquier curso y nada de fuera', () => {
    const mapa = resumirDificultad([sesion('a1'), sesion('b1'), sesion('propia:x')], dos);
    expect([...mapa.keys()].sort()).toEqual(['a1', 'b1']);
  });
});

/** Las fuentes, para vigilar quién depende de qué. */
const FUENTES = import.meta.glob('/src/**/*.{svelte,ts}', {
  eager: true, query: '?raw', import: 'default',
}) as Record<string, string>;

describe('nadie depende del array concreto', () => {
  it('el código de la aplicación no importa la fachada por índice', () => {
    const reinciden = Object.entries(FUENTES)
      .filter(([ruta]) => !ruta.includes('.test.') && !ruta.endsWith('/lessons.ts'))
      .filter(([, fuente]) => /from\s+['"][^'"]*\/lessons['"]/.test(fuente) || /\bLESSONS\b/.test(fuente))
      .map(([ruta]) => ruta);
    expect(reinciden, 'pregunta a lecciones/catalogo.ts').toEqual([]);
  });

  it('solo el índice de cursos conoce los ficheros de datos', () => {
    const reinciden = Object.entries(FUENTES)
      .filter(([ruta]) => !ruta.includes('.test.') && !ruta.endsWith('/cursos/index.ts'))
      .filter(([, fuente]) => /from\s+['"][^'"]*cursos\/espanol['"]|from\s+['"]\.\/espanol['"]/.test(fuente))
      .map(([ruta]) => ruta);
    expect(reinciden).toEqual([]);
  });
});
