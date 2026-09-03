import { describe, it, expect, beforeEach } from 'vitest';
import {
  esRecord, formatearDuracion, PCT_MINIMO_PARA_RECORD,
  resumirGlobal, resumirLecciones, type Sesion,
} from './progreso';
import { AlmacenLocal, AlmacenMemoria } from './almacen';

const sesion = (p: Partial<Sesion> = {}): Sesion => ({
  leccion: 'home',
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
    expect(r.get('home')!.intentos).toBe(2);
    expect(r.get('tildes')!.intentos).toBe(1);
  });

  it('la marca es la mejor velocidad, no la última', () => {
    const r = resumirLecciones([
      sesion({ ppm: 40, terminadaEn: '2026-09-01T10:00:00.000Z' }),
      sesion({ ppm: 25, terminadaEn: '2026-09-02T10:00:00.000Z' }),
    ]);
    expect(r.get('home')!.mejorPpm).toBe(40);
    expect(r.get('home')!.ultimaPpm).toBe(25);
  });

  it('teclear rápido y mal no cuenta como marca', () => {
    // Es el caso que más importa pedagógicamente: si un intento con 60% de
    // acierto fijara el récord, la app estaría premiando ir rápido y fallar.
    const r = resumirLecciones([
      sesion({ ppm: 20, pctAcierto: 100 }),
      sesion({ ppm: 90, pctAcierto: 60 }),
    ]);
    expect(r.get('home')!.mejorPpm).toBe(20);
  });

  it('sin ningún intento limpio la marca es cero, no un número inflado', () => {
    const r = resumirLecciones([sesion({ ppm: 90, pctAcierto: 50 })]);
    expect(r.get('home')!.mejorPpm).toBe(0);
    expect(r.get('home')!.intentos).toBe(1);
  });

  it('lo último es lo más reciente por fecha, no por orden de llegada', () => {
    const r = resumirLecciones([
      sesion({ ppm: 10, terminadaEn: '2026-09-05T10:00:00.000Z' }),
      sesion({ ppm: 20, terminadaEn: '2026-09-03T10:00:00.000Z' }),
    ]);
    expect(r.get('home')!.ultimaPpm).toBe(10);
  });

  it('sin sesiones devuelve un mapa vacío', () => {
    expect(resumirLecciones([]).size).toBe(0);
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
    const previo = resumirLecciones([sesion({ ppm: 30 })]).get('home')!;
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
      sesion({ leccion: 'home', ms: 60000, ppm: 20 }),
      sesion({ leccion: 'home', ms: 30000, ppm: 25 }),
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
});

describe('almacén en memoria', () => {
  it('cumple el mismo contrato', async () => {
    const a = new AlmacenMemoria();
    expect(await a.leerTodas()).toEqual([]);
    await a.guardar(sesion({ ppm: 7 }));
    expect(await a.leerTodas()).toHaveLength(1);
    await a.borrarTodo();
    expect(await a.leerTodas()).toEqual([]);
  });
});
