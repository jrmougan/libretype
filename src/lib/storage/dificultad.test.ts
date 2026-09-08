import { describe, it, expect } from 'vitest';
import { LESSONS } from '../lessons';
import { resumirLecciones, type Sesion } from './progreso';
import { PCT_OBJETIVO } from './objetivos';
import {
  FACTOR_ATIPICO, leccionesAtipicas, MIN_INTENTOS_ATIPICA, MIN_LECCIONES_BASE,
  resumirDificultad,
} from './dificultad';

const HORA = 3600000;
const BASE = Date.UTC(2026, 8, 1);

/** Marca temporal determinista: una hora por intento, para poder ordenarlos. */
const fecha = (hora: number): string => new Date(BASE + hora * HORA).toISOString();

const sesion = (p: Partial<Sesion> = {}): Sesion => ({
  leccion: 'reposo',
  ppm: 30,
  pctAcierto: 100,
  aciertos: 40,
  escritos: 40,
  ms: 60000,
  terminadaEn: fecha(0),
  ...p,
});

/** Los intentos de una lección con los porcentajes dados, uno por hora. */
function intentos(leccion: string, pcts: readonly number[], inicio = 0): Sesion[] {
  return pcts.map((pctAcierto, i) => sesion({
    leccion,
    pctAcierto,
    aciertos: Math.round(40 * pctAcierto / 100),
    terminadaEn: fecha(inicio + i),
  }));
}

/** Las `n` primeras lecciones del temario superadas al primer intento. */
function superadasAlPrimero(n: number): Sesion[] {
  return Array.from({ length: n }, (_, i) => intentos(LESSONS[i].id, [95], i)).flat();
}

/** Las `n` primeras lecciones del temario superadas al segundo intento. */
function superadasAlSegundo(n: number): Sesion[] {
  return Array.from({ length: n }, (_, i) => intentos(LESSONS[i].id, [70, 95], i * 2)).flat();
}

/** `n` intentos de una lección, con el objetivo alcanzado en el último. */
function fallando(leccion: string, n: number, inicio: number): Sesion[] {
  return intentos(leccion, [...Array.from({ length: n - 1 }, () => 40), 95], inicio);
}

/** `n` intentos de una lección sin llegar nunca al objetivo. */
function sinSuperar(leccion: string, n: number, inicio: number): Sesion[] {
  return intentos(leccion, Array.from({ length: n }, () => 40), inicio);
}

const TILDES = 'tildes';

describe('intentos hasta superar', () => {
  it('cuenta los intentos hasta el primero que alcanza el objetivo, incluido', () => {
    const d = resumirDificultad(intentos('reposo', [70, 85, PCT_OBJETIVO]));
    expect(d.get('reposo')).toEqual({
      leccion: 'reposo', intentosHastaSuperar: 3, superada: true,
    });
  });

  it('justo en el umbral cuenta como superada; un punto por debajo no', () => {
    expect(resumirDificultad(intentos('reposo', [PCT_OBJETIVO])).get('reposo')!.superada).toBe(true);
    expect(resumirDificultad(intentos('reposo', [PCT_OBJETIVO - 1])).get('reposo')!.superada).toBe(false);
  });

  // Es la razón de ser de esta métrica: `intentos` suma también el repaso de
  // quien ya superó la lección, así que una lección muy usada y una muy difícil
  // dan el mismo número.
  it('lo practicado después de superarla no cuenta, al revés que los intentos', () => {
    const sesiones = intentos('reposo', [92, 40, 100, 30]);
    expect(resumirDificultad(sesiones).get('reposo')!.intentosHastaSuperar).toBe(1);
    expect(resumirLecciones(sesiones).get('reposo')!.intentos).toBe(4);
  });

  it('una lección sin superar da los intentos que lleva y lo señala', () => {
    const d = resumirDificultad(sinSuperar(TILDES, 3, 0));
    expect(d.get(TILDES)).toEqual({
      leccion: TILDES, intentosHastaSuperar: 3, superada: false,
    });
  });

  it('el orden lo marca la fecha, no la llegada', () => {
    // Una copia importada puede traer sesiones antiguas detrás de recientes.
    const d = resumirDificultad([
      sesion({ pctAcierto: 40, terminadaEn: fecha(5) }),
      sesion({ pctAcierto: 95, terminadaEn: fecha(1) }),
    ]);
    expect(d.get('reposo')!.intentosHastaSuperar).toBe(1);
    expect(d.get('reposo')!.superada).toBe(true);
  });

  it('las filas vacías o corruptas no son intentos', () => {
    const d = resumirDificultad([
      sesion({ escritos: 0 }),
      sesion({ pctAcierto: NaN }),
      sesion({ pctAcierto: Infinity }),
      sesion({ pctAcierto: 101 }),
      sesion({ pctAcierto: -5 }),
    ]);
    expect(d.size).toBe(0);
  });

  it('una fila corrupta no abulta el recuento de una lección de verdad', () => {
    const d = resumirDificultad([
      ...intentos('reposo', [40, 0], 0),
      sesion({ escritos: 0, terminadaEn: fecha(2) }),
      sesion({ pctAcierto: 95, terminadaEn: fecha(3) }),
    ]);
    expect(d.get('reposo')!.intentosHastaSuperar).toBe(3);
  });

  it('sin sesiones devuelve un mapa vacío', () => {
    expect(resumirDificultad([]).size).toBe(0);
  });
});

describe('histórico de versiones anteriores', () => {
  // 'home' y 'home-words' son la misma lección que hoy se llama 'reposo': sus
  // intentos se suman y el recuento hasta superarla es el de las tres juntas.
  it('las dos lecciones de la fila de reposo cuentan como una', () => {
    const d = resumirDificultad([
      sesion({ leccion: 'home', pctAcierto: 70, terminadaEn: fecha(0) }),
      sesion({ leccion: 'home-words', pctAcierto: 80, terminadaEn: fecha(1) }),
      sesion({ leccion: 'home', pctAcierto: 92, terminadaEn: fecha(2) }),
    ]);
    expect(d.has('home')).toBe(false);
    expect(d.has('home-words')).toBe(false);
    expect(d.get('reposo')).toEqual({
      leccion: 'reposo', intentosHastaSuperar: 3, superada: true,
    });
  });

  it('una sesión de la v0.1.0 se atribuye a su lección de ahora', () => {
    const d = resumirDificultad([sesion({ leccion: 'home', pctAcierto: 95 })]);
    expect(d.get('reposo')!.intentosHastaSuperar).toBe(1);
  });
});

describe('lo que no es una lección del temario', () => {
  it('la práctica libre no tiene objetivo que superar', () => {
    const d = resumirDificultad(
      ['practica-continua', 'texto-propio', 'refuerzo'].map((id) => sesion({ leccion: id })),
    );
    expect(d.size).toBe(0);
  });

  // En la v0.1.0 terminar ya desbloqueaba la siguiente: contarle a esas
  // sesiones intentos hasta el 90% mezclaría dos reglas distintas.
  it('una lección retirada no entra, se jugaba con otra regla', () => {
    expect(resumirDificultad(intentos('top', [40, 40, 100])).size).toBe(0);
  });

  it('un identificador desconocido no se cuela', () => {
    expect(resumirDificultad([sesion({ leccion: 'lo-que-sea' })]).size).toBe(0);
  });
});

describe('lecciones atípicas', () => {
  it('un histórico plano no señala ninguna', () => {
    const sesiones = [
      ...superadasAlPrimero(MIN_LECCIONES_BASE),
      ...fallando(TILDES, 3, MIN_LECCIONES_BASE),
    ];
    expect(leccionesAtipicas(sesiones).size).toBe(0);
  });

  it('una lección muy por encima del resto sí, y solo ella', () => {
    const sesiones = [
      ...superadasAlPrimero(MIN_LECCIONES_BASE),
      ...fallando(TILDES, 9, MIN_LECCIONES_BASE),
    ];
    expect([...leccionesAtipicas(sesiones)]).toEqual([TILDES]);
  });

  // El suelo absoluto: con todo superado a la primera la mediana es 1, y cuatro
  // veces uno son cuatro intentos, que es lo que le cuesta a cualquiera empezar.
  it('por debajo del suelo de intentos no se señala, por mucho que destaque', () => {
    const sesiones = [
      ...superadasAlPrimero(MIN_LECCIONES_BASE),
      ...fallando(TILDES, MIN_INTENTOS_ATIPICA - 1, MIN_LECCIONES_BASE),
    ];
    expect(leccionesAtipicas(sesiones).size).toBe(0);
  });

  it('en el suelo exacto ya se señala', () => {
    const sesiones = [
      ...superadasAlPrimero(MIN_LECCIONES_BASE),
      ...fallando(TILDES, MIN_INTENTOS_ATIPICA, MIN_LECCIONES_BASE),
    ];
    expect(leccionesAtipicas(sesiones).has(TILDES)).toBe(true);
  });

  // Con la mediana en 2 el que manda es el factor, no el suelo: siete intentos
  // destacan sobre dos, pero no son cuatro veces dos.
  it('el factor ata por encima del suelo', () => {
    const base = superadasAlSegundo(MIN_LECCIONES_BASE);
    expect(leccionesAtipicas([
      ...base, ...fallando(TILDES, FACTOR_ATIPICO * 2 - 1, 20),
    ]).size).toBe(0);
    expect(leccionesAtipicas([
      ...base, ...fallando(TILDES, FACTOR_ATIPICO * 2, 20),
    ]).has(TILDES)).toBe(true);
  });

  it('sin suficientes lecciones superadas no hay comparación posible', () => {
    const sesiones = [
      ...superadasAlPrimero(MIN_LECCIONES_BASE - 1),
      ...sinSuperar(TILDES, 20, MIN_LECCIONES_BASE),
    ];
    expect(leccionesAtipicas(sesiones).size).toBe(0);
  });

  // Llevar muchos intentos sin llegar al objetivo es la señal más fuerte: es la
  // persona encallada, que es justo lo que la issue teme que pase en Tildes.
  it('una lección en la que no se llega al objetivo también se señala', () => {
    const sesiones = [
      ...superadasAlPrimero(MIN_LECCIONES_BASE),
      ...sinSuperar(TILDES, MIN_INTENTOS_ATIPICA + 2, MIN_LECCIONES_BASE),
    ];
    expect(resumirDificultad(sesiones).get(TILDES)!.superada).toBe(false);
    expect(leccionesAtipicas(sesiones).has(TILDES)).toBe(true);
  });

  // La mediana se calcula sin la candidata, y aquí es lo que decide: con las
  // cuatro anteriores en [1, 1, 3, 3] la mediana ajena es 2 y Tildes con diez
  // intentos pasa el filtro; incluyéndola subiría a 3 y la taparía.
  it('la propia candidata no entra en la mediana con la que se compara', () => {
    const sesiones = [
      ...intentos(LESSONS[0].id, [95], 0),
      ...intentos(LESSONS[1].id, [95], 1),
      ...intentos(LESSONS[2].id, [40, 40, 95], 2),
      ...intentos(LESSONS[3].id, [40, 40, 95], 5),
      ...fallando(TILDES, 10, 8),
    ];
    expect(leccionesAtipicas(sesiones).has(TILDES)).toBe(true);
  });

  it('la práctica libre no entra ni en la comparación ni en la señal', () => {
    const sesiones = [
      ...superadasAlPrimero(MIN_LECCIONES_BASE),
      ...fallando(TILDES, 9, MIN_LECCIONES_BASE),
      ...sinSuperar('practica-continua', 30, 100),
    ];
    const atipicas = leccionesAtipicas(sesiones);
    expect(atipicas.has('practica-continua')).toBe(false);
    expect([...atipicas]).toEqual([TILDES]);
  });

  it('una lección retirada no abulta la base contra la que se compara', () => {
    const sesiones = [
      ...superadasAlPrimero(MIN_LECCIONES_BASE - 1),
      ...intentos('top', [95, 95, 95, 95], 10),
      ...sinSuperar(TILDES, 20, 20),
    ];
    expect(leccionesAtipicas(sesiones).size).toBe(0);
  });

  it('sin sesiones no señala nada', () => {
    expect(leccionesAtipicas([]).size).toBe(0);
  });
});
