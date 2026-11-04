/**
 * Lo que se le pone delante al alumno. El público incluye menores y el vocabulario
 * sale de un corpus de subtítulos, donde entre las palabras más frecuentes hay
 * tacos: una lista de exclusión es tosca, pero evita que una ampliación del banco
 * de vocabulario cuele algo sin que nadie lo revise. También vigila la ortografía
 * que sí se puede comprobar a máquina: los signos de apertura y el tuteo.
 */
import { describe, expect, it } from 'vitest';
import { PASOS } from '../leccion-cero';
import { PALABRAS_BASE } from './cursos/espanol';
import { OBJETIVO_PANEL, OBJETIVO_PENDIENTE, FILA_DISPONIBLE, objetivoLeccion } from '../storage/objetivos';
import { VOCES } from '../voz';
import { catalogo } from './catalogo';

const EXCLUIDAS = new Set([
  // Sexo y cuerpo.
  'sexo', 'sexual', 'sexy', 'senos', 'seno', 'tetas', 'teta', 'culo', 'pene', 'polla', 'coño',
  'desnudo', 'desnuda', 'embarazada', 'porno', 'violar', 'violación',
  // Tacos e insultos.
  'puta', 'puto', 'putas', 'mierda', 'joder', 'cabrón', 'gilipollas', 'imbécil', 'idiota',
  'estúpido', 'estúpida', 'maldito', 'maldita', 'bastardo', 'zorra',
  // Violencia, muerte y drogas.
  'matar', 'mata', 'muerte', 'muerto', 'muerta', 'asesino', 'asesinar', 'sangre', 'guerra',
  'arma', 'armas', 'pistola', 'droga', 'drogas', 'cocaína', 'whisky', 'cerveza', 'borracho',
  'borracha', 'suicidio',
]);

const palabrasDe = (texto: string): string[] =>
  texto.toLowerCase().split(/[^\p{L}]+/u).filter(Boolean);

const lecciones = catalogo.lecciones;
const prosa: readonly string[] = [
  ...lecciones.flatMap((l) => [l.title, l.focus]),
  ...PASOS.flatMap((p) => [p.titulo, ...p.cuerpo]),
  ...Object.values(VOCES).flatMap((v) => Object.values(v)),
  OBJETIVO_PANEL, OBJETIVO_PENDIENTE, FILA_DISPONIBLE, objetivoLeccion(''),
];

describe('contenido apto para todo el público', () => {
  it('ninguna lección ni vocabulario lleva palabras de la lista de exclusión', () => {
    const fuentes: [string, string[]][] = [
      ...lecciones.map((l): [string, string[]] => [l.id, palabrasDe(l.text)]),
      ...catalogo.cursos.map((c): [string, string[]] => [`vocabulario de ${c.id}`, [...(c.vocabulario ?? [])]]),
      ['palabras base del refuerzo', [...PALABRAS_BASE]],
    ];
    for (const [nombre, palabras] of fuentes) {
      const malas = palabras.filter((p) => EXCLUIDAS.has(p));
      expect(malas, nombre).toEqual([]);
    }
  });

  it('la prosa de la aplicación tampoco', () => {
    for (const texto of prosa) {
      expect(palabrasDe(texto).filter((p) => EXCLUIDAS.has(p)), texto).toEqual([]);
    }
  });
});

describe('ortografía comprobable', () => {
  const cuenta = (texto: string, signo: string) => [...texto].filter((c) => c === signo).length;

  it('toda pregunta y exclamación abre y cierra', () => {
    const textos = [...prosa, ...lecciones.map((l) => l.text)];
    for (const texto of textos) {
      expect(cuenta(texto, '¿'), texto).toBe(cuenta(texto, '?'));
      expect(cuenta(texto, '¡'), texto).toBe(cuenta(texto, '!'));
    }
  });

  it('las explicaciones tutean: nada de «pulse» ni «desee»', () => {
    const ustedeo = new Set(['pulse', 'escriba', 'introduzca', 'seleccione', 'desee', 'desea', 'pruebe', 'siéntese']);
    for (const texto of prosa) {
      expect(palabrasDe(texto).filter((p) => ustedeo.has(p)), texto).toEqual([]);
    }
  });

  it('las explicaciones acaban en punto o en signo de cierre', () => {
    for (const l of lecciones) expect(l.focus, l.id).toMatch(/[.!?]$/);
    for (const p of PASOS) for (const c of p.cuerpo) expect(c).toMatch(/[.!?]$/);
  });
});

describe('afirmaciones del temario', () => {
  // Los datos salen de `investigacion/frecuencias.py`; lo que se fija aquí es que
  // las frases sigan diciendo lo que dicen los datos si alguien cambia las cifras.
  const cob = (id: string) => catalogo.leccion(id)!.cobertura;

  it('«cuatro de cada diez» y «casi siete» cuadran con la cobertura', () => {
    expect(catalogo.leccion('vocales-2')!.focus).toContain('casi cuatro de cada diez');
    expect(cob('vocales-2')).toBeGreaterThan(38);
    expect(cob('vocales-2')).toBeLessThan(40);
    expect(catalogo.leccion('oclusivas')!.focus).toContain('casi siete');
    expect(cob('tildes')).toBeGreaterThan(40);
    expect(cob('oclusivas')).toBeGreaterThan(65);
    expect(cob('oclusivas')).toBeLessThan(70);
    expect(catalogo.leccion('consonantes')!.focus).toContain('ocho de cada diez');
    expect(cob('consonantes')).toBeGreaterThan(80);
    expect(cob('consonantes')).toBeLessThan(85);
  });

  it('las mayúsculas se practican todas, con la eñe y las tildes', () => {
    const l = catalogo.leccion('mayusculas')!;
    expect([...l.nuevas].filter((c) => !l.text.includes(c))).toEqual([]);
  });

  it('los números no fijan un año que envejezca', () => {
    const l = catalogo.leccion('numeros')!;
    expect(l.text).not.toMatch(/\b(19|20)\d\d\b/);
  });
});
