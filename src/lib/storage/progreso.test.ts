import { describe, it, expect, beforeEach } from 'vitest';
import {
  esRecord, formatearDuracion, PCT_MINIMO_PARA_RECORD,
  resumirEvolucion, resumirGlobal, resumirLecciones, type Sesion,
} from './progreso';
import { AlmacenLocal, AlmacenMemoria, AlmacenSqlite, type DbSql } from './almacen';
import type { EstadoTecla } from '../keyboard/dominio';

const sesion = (p: Partial<Sesion> = {}): Sesion => ({
  leccion: 'reposo',
  ppm: 30,
  pctAcierto: 100,
  aciertos: 40,
  escritos: 40,
  ms: 60000,
  terminadaEn: '2026-09-01T10:00:00.000Z',
  ...p,
});

describe('resumen por lección', () => {
  it('cuenta los intentos', () => {
    const r = resumirLecciones([sesion(), sesion(), sesion({ leccion: 'tildes' })]);
    expect(r.get('reposo')!.intentos).toBe(2);
    expect(r.get('tildes')!.intentos).toBe(1);
  });

  it('la marca es la mejor velocidad, no la última', () => {
    const r = resumirLecciones([
      sesion({ ppm: 40, terminadaEn: '2026-09-01T10:00:00.000Z' }),
      sesion({ ppm: 25, terminadaEn: '2026-09-02T10:00:00.000Z' }),
    ]);
    expect(r.get('reposo')!.mejorPpm).toBe(40);
    expect(r.get('reposo')!.ultimaPpm).toBe(25);
  });

  it('teclear rápido y mal no cuenta como marca', () => {
    // Es el caso que más importa pedagógicamente: si un intento con 60% de
    // acierto fijara el récord, la app estaría premiando ir rápido y fallar.
    const r = resumirLecciones([
      sesion({ ppm: 20, pctAcierto: 100 }),
      sesion({ ppm: 90, pctAcierto: 60 }),
    ]);
    expect(r.get('reposo')!.mejorPpm).toBe(20);
  });

  it('sin ningún intento limpio la marca es cero, no un número inflado', () => {
    const r = resumirLecciones([sesion({ ppm: 90, pctAcierto: 50 })]);
    expect(r.get('reposo')!.mejorPpm).toBe(0);
    expect(r.get('reposo')!.intentos).toBe(1);
  });

  it('lo último es lo más reciente por fecha, no por orden de llegada', () => {
    const r = resumirLecciones([
      sesion({ ppm: 10, terminadaEn: '2026-09-05T10:00:00.000Z' }),
      sesion({ ppm: 20, terminadaEn: '2026-09-03T10:00:00.000Z' }),
    ]);
    expect(r.get('reposo')!.ultimaPpm).toBe(10);
  });

  it('sin sesiones devuelve un mapa vacío', () => {
    expect(resumirLecciones([]).size).toBe(0);
  });
});

describe('histórico de versiones anteriores', () => {
  // La v0.1.0 guardó 'home' y 'home-words'; hoy esa lección se llama 'reposo'.
  // Sin traducir, esas sesiones cuentan en los totales pero no salen en ninguna
  // fila: el alumno ve trabajo suyo desaparecido.
  it('una sesión de la v0.1.0 aparece en su lección de ahora', () => {
    const r = resumirLecciones([sesion({ leccion: 'home', ppm: 22 })]);
    expect(r.has('home')).toBe(false);
    expect(r.get('reposo')!.intentos).toBe(1);
    expect(r.get('reposo')!.mejorPpm).toBe(22);
  });

  it('las dos lecciones de la fila de reposo se funden en una', () => {
    const r = resumirLecciones([
      sesion({ leccion: 'home', ppm: 18 }),
      sesion({ leccion: 'home-words', ppm: 26 }),
      sesion({ leccion: 'reposo', ppm: 24 }),
    ]);
    expect(r.size).toBe(1);
    expect(r.get('reposo')!.intentos).toBe(3);
    expect(r.get('reposo')!.mejorPpm).toBe(26);
  });

  // Traducir 'top' a alguna lección de ahora le regalaría al alumno una marca
  // en teclas que no practicó, y esRecord() la daría por buena.
  it('una lección retirada conserva su identificador, no se traduce', () => {
    const r = resumirLecciones([sesion({ leccion: 'top', ppm: 30 })]);
    expect(r.get('top')!.intentos).toBe(1);
  });

  it('los totales no cuentan dos veces la lección renombrada', () => {
    const g = resumirGlobal([
      sesion({ leccion: 'home', ms: 60000 }),
      sesion({ leccion: 'reposo', ms: 60000 }),
    ]);
    expect(g.leccionesTocadas).toBe(1);
    expect(g.sesiones).toBe(2);
  });

  it('un identificador desconocido pasa tal cual, sin inventarse una lección', () => {
    const r = resumirLecciones([sesion({ leccion: 'lo-que-sea' })]);
    expect(r.get('lo-que-sea')!.intentos).toBe(1);
  });
});

describe('récords', () => {
  it('el primer intento limpio es récord', () => {
    expect(esRecord(undefined, sesion({ ppm: 15 }))).toBe(true);
  });

  it('un primer intento sucio no lo es', () => {
    expect(esRecord(undefined, sesion({ ppm: 80, pctAcierto: 40 }))).toBe(false);
  });

  it('hay que superar la marca, no igualarla', () => {
    const previo = resumirLecciones([sesion({ ppm: 30 })]).get('reposo')!;
    expect(esRecord(previo, sesion({ ppm: 31 }))).toBe(true);
    expect(esRecord(previo, sesion({ ppm: 30 }))).toBe(false);
    expect(esRecord(previo, sesion({ ppm: 29 }))).toBe(false);
  });

  it('justo en el umbral de acierto sí cuenta', () => {
    expect(esRecord(undefined, sesion({ pctAcierto: PCT_MINIMO_PARA_RECORD }))).toBe(true);
    expect(esRecord(undefined, sesion({ pctAcierto: PCT_MINIMO_PARA_RECORD - 1 }))).toBe(false);
  });
});

describe('resumen global', () => {
  it('suma tiempo y cuenta lecciones distintas', () => {
    const g = resumirGlobal([
      sesion({ leccion: 'reposo', ms: 60000, ppm: 20 }),
      sesion({ leccion: 'reposo', ms: 30000, ppm: 25 }),
      sesion({ leccion: 'tildes', ms: 90000, ppm: 18 }),
    ]);
    expect(g).toMatchObject({ sesiones: 3, leccionesTocadas: 2, msTotales: 180000, mejorPpm: 25 });
  });

  it('vacío no da NaN', () => {
    expect(resumirGlobal([])).toEqual({
      sesiones: 0, leccionesTocadas: 0, msTotales: 0, mejorPpm: 0,
    });
  });
});

describe('formato de duración', () => {
  it.each([
    [0, '0 min'],
    [90000, '2 min'],
    [3600000, '1 h 00 min'],
    [3900000, '1 h 05 min'],
  ])('%i ms -> %s', (ms, esperado) => {
    expect(formatearDuracion(ms)).toBe(esperado);
  });
});

describe('almacén local', () => {
  beforeEach(() => localStorage.clear());

  it('guarda y recupera', async () => {
    const a = new AlmacenLocal();
    await a.guardar(sesion({ ppm: 42 }));
    expect((await a.leerTodas())[0].ppm).toBe(42);
  });

  it('parte de vacío', async () => {
    expect(await new AlmacenLocal().leerTodas()).toEqual([]);
  });

  it('no revienta con datos corruptos', async () => {
    localStorage.setItem('libretype.sesiones', 'no es json');
    expect(await new AlmacenLocal().leerTodas()).toEqual([]);
  });

  it('borra', async () => {
    const a = new AlmacenLocal();
    await a.guardar(sesion());
    await a.borrarTodo();
    expect(await a.leerTodas()).toEqual([]);
  });

  it('recorta el histórico y conserva lo más reciente', async () => {
    const a = new AlmacenLocal();
    for (let i = 0; i < 520; i++) await a.guardar(sesion({ ppm: i }));
    const todas = await a.leerTodas();
    expect(todas).toHaveLength(500);
    expect(todas[todas.length - 1].ppm).toBe(519);
  });

  it('guarda, actualiza y recupera el mapa de teclas íntegro (Issue #38)', async () => {
    const a = new AlmacenLocal();
    expect(await a.leerTeclas()).toEqual(new Map());

    const teclas = new Map<string, EstadoTecla>([
      ['KeyA', { intentos: 12, aciertos: 11, msTotal: 2400 }],
      ['KeyS', { intentos: 15, aciertos: 15, msTotal: 3000 }],
    ]);
    await a.guardarTeclas(teclas);

    const leidas = await a.leerTeclas();
    expect(leidas).toEqual(teclas);

    // Actualiza intento y tiempo
    teclas.set('KeyA', { intentos: 20, aciertos: 19, msTotal: 3800 });
    await a.guardarTeclas(teclas);
    const leidas2 = await a.leerTeclas();
    expect(leidas2.get('KeyA')).toEqual({ intentos: 20, aciertos: 19, msTotal: 3800 });

    await a.borrarTodo();
    expect(await a.leerTeclas()).toEqual(new Map());
  });

  it('soporta datos corruptos en libretype.teclas devolviendo un mapa vacío (Issue #38)', async () => {
    const a = new AlmacenLocal();
    localStorage.setItem('libretype.teclas', 'datos no serializables');
    expect(await a.leerTeclas()).toEqual(new Map());
  });
});

describe('almacén en memoria', () => {
  it('cumple el mismo contrato', async () => {
    const a = new AlmacenMemoria();
    expect(await a.leerTodas()).toEqual([]);
    expect(await a.leerTeclas()).toEqual(new Map());

    await a.guardar(sesion({ ppm: 7 }));
    expect(await a.leerTodas()).toHaveLength(1);

    const teclas = new Map([['KeyA', { intentos: 10, aciertos: 9, msTotal: 2000 }]]);
    await a.guardarTeclas(teclas);
    expect(await a.leerTeclas()).toEqual(teclas);

    await a.borrarTodo();
    expect(await a.leerTodas()).toEqual([]);
    expect(await a.leerTeclas()).toEqual(new Map());
  });

  it('guarda, actualiza y recupera teclas con copias defensivas independientes (Issue #38)', async () => {
    const a = new AlmacenMemoria();
    const teclas = new Map<string, EstadoTecla>([
      ['KeyJ', { intentos: 14, aciertos: 14, msTotal: 2200 }],
      ['KeyF', { intentos: 18, aciertos: 17, msTotal: 2900 }],
    ]);
    await a.guardarTeclas(teclas);

    const recuperadas = await a.leerTeclas();
    expect(recuperadas.get('KeyJ')).toEqual({ intentos: 14, aciertos: 14, msTotal: 2200 });

    // Modificar la copia leída no debe afectar a una lectura posterior
    recuperadas.set('KeyJ', { intentos: 99, aciertos: 0, msTotal: 0 });
    expect((await a.leerTeclas()).get('KeyJ')?.intentos).toBe(14);

    // Actualización oficial mediante guardarTeclas
    teclas.set('KeyJ', { intentos: 25, aciertos: 25, msTotal: 3900 });
    await a.guardarTeclas(teclas);
    expect((await a.leerTeclas()).get('KeyJ')?.intentos).toBe(25);

    await a.borrarTodo();
    expect(await a.leerTeclas()).toEqual(new Map());
  });
});

describe('almacén sqlite (Issue #38)', () => {
  function crearDbMock(): DbSql {
    const filasTeclas: { code: string; intentos: number; aciertos: number; ms_total: number }[] = [];
    return {
      async execute(sql: string, params?: unknown[]): Promise<unknown> {
        if (sql.includes('DELETE FROM teclas')) {
          filasTeclas.length = 0;
        } else if (sql.includes('INSERT INTO teclas')) {
          const code = params![0] as string;
          const fila = {
            code,
            intentos: params![1] as number,
            aciertos: params![2] as number,
            ms_total: params![3] as number,
          };
          const ix = filasTeclas.findIndex((t) => t.code === code);
          if (ix >= 0) filasTeclas[ix] = fila;
          else filasTeclas.push(fila);
        }
        return {};
      },
      async select<T>(sql: string): Promise<T> {
        if (sql.includes('FROM teclas')) {
          return [...filasTeclas] as unknown as T;
        }
        return [] as unknown as T;
      },
    };
  }

  it('guarda, actualiza y recupera el mapa de teclas íntegro', async () => {
    const db = crearDbMock();
    const a = new AlmacenSqlite(db);

    expect(await a.leerTeclas()).toEqual(new Map());

    const teclas = new Map<string, EstadoTecla>([
      ['KeyD', { intentos: 8, aciertos: 7, msTotal: 1600 }],
      ['KeyK', { intentos: 12, aciertos: 12, msTotal: 2100 }],
    ]);
    await a.guardarTeclas(teclas);

    const leidas = await a.leerTeclas();
    expect(leidas.size).toBe(2);
    expect(leidas.get('KeyD')).toEqual({ intentos: 8, aciertos: 7, msTotal: 1600 });
    expect(leidas.get('KeyK')).toEqual({ intentos: 12, aciertos: 12, msTotal: 2100 });

    // Actualización de tecla existente
    teclas.set('KeyD', { intentos: 16, aciertos: 15, msTotal: 3000 });
    await a.guardarTeclas(teclas);

    const leidasActualizadas = await a.leerTeclas();
    expect(leidasActualizadas.size).toBe(2);
    expect(leidasActualizadas.get('KeyD')).toEqual({ intentos: 16, aciertos: 15, msTotal: 3000 });

    // Borrado
    await a.borrarTodo();
    expect(await a.leerTeclas()).toEqual(new Map());
  });
});

describe('resumen de evolución y racha', () => {
  it('vacío da 0 días y racha 0', () => {
    const e = resumirEvolucion([]);
    expect(e).toEqual({
      dias: [],
      diasPracticados: 0,
      rachaActual: 0,
      rachaMax: 0,
    });
  });

  it('agrupa sesiones del mismo día y calcula mejor ppm limpia', () => {
    const s1 = sesion({ ppm: 25, pctAcierto: 95, ms: 30000, terminadaEn: '2026-09-01T10:00:00.000Z' });
    const s2 = sesion({ ppm: 45, pctAcierto: 80, ms: 30000, terminadaEn: '2026-09-01T11:00:00.000Z' }); // sucia
    const s3 = sesion({ ppm: 35, pctAcierto: 92, ms: 40000, terminadaEn: '2026-09-01T12:00:00.000Z' }); // limpia

    const e = resumirEvolucion([s1, s2, s3], '2026-09-01');
    expect(e.diasPracticados).toBe(1);
    expect(e.rachaActual).toBe(1);
    expect(e.rachaMax).toBe(1);
    expect(e.dias).toHaveLength(1);
    expect(e.dias[0]).toEqual({
      fecha: '2026-09-01',
      sesiones: 3,
      mejorPpm: 35,
      msTotales: 100000,
      ppmMedia: 35,
      pctMedio: 89,
    });
  });

  it('calcula rachas consecutivas y racha máxima', () => {
    const sesiones = [
      sesion({ terminadaEn: '2026-09-01T10:00:00.000Z' }),
      sesion({ terminadaEn: '2026-09-02T10:00:00.000Z' }),
      sesion({ terminadaEn: '2026-09-03T10:00:00.000Z' }),
      // Hueco
      sesion({ terminadaEn: '2026-09-06T10:00:00.000Z' }),
      sesion({ terminadaEn: '2026-09-07T10:00:00.000Z' }),
    ];

    // Hoy es 2026-09-07 (la racha actual es 2 días: 06 y 07; la racha max histórica es 3 días: 01, 02, 03)
    const e = resumirEvolucion(sesiones, '2026-09-07');
    expect(e.diasPracticados).toBe(5);
    expect(e.rachaActual).toBe(2);
    expect(e.rachaMax).toBe(3);

    // Si hoy fuera 2026-09-08 (ayer practicó), la racha sigue activa
    const eAyer = resumirEvolucion(sesiones, '2026-09-08');
    expect(eAyer.rachaActual).toBe(2);

    // Si hoy fuera 2026-09-10 (pasaron 3 días), la racha actual se rompió
    const eRoto = resumirEvolucion(sesiones, '2026-09-10');
    expect(eRoto.rachaActual).toBe(0);
    expect(eRoto.rachaMax).toBe(3);
  });
});
