import { describe, expect, it } from 'vitest';
import type { Sesion } from './progreso';
import { DIAS_PARA_REPASAR, leccionesOxidadas } from './repaso';

/** Fecha fija: el paso del tiempo se prueba inyectándola, no con el reloj. */
const HOY = '2026-09-08T12:00:00Z';
const MS_DIA = 86_400_000;

function hace(dias: number): string {
  return new Date(Date.parse(HOY) - dias * MS_DIA).toISOString();
}

function sesion(leccion: string, dias: number, pctAcierto = 95, escritos = 40): Sesion {
  return {
    leccion, pctAcierto, ppm: 10, aciertos: escritos, escritos, ms: 60_000, terminadaEn: hace(dias),
  };
}

const ids = (s: readonly Sesion[], hoy?: string, enCurso?: string | null) =>
  leccionesOxidadas(s, hoy, enCurso).map((o) => o.id);

describe('repaso espaciado de lecciones superadas', () => {
  it('sin histórico no hay nada que repasar', () => {
    expect(leccionesOxidadas([])).toEqual([]);
    expect(leccionesOxidadas([], HOY)).toEqual([]);
  });

  it('no da por oxidada la lección que se acaba de practicar', () => {
    expect(ids([sesion('reposo', 0)], HOY)).toEqual([]);
    expect(ids([sesion('reposo', DIAS_PARA_REPASAR - 1)], HOY)).toEqual([]);
  });

  it('detecta la superada que lleva una semana sin salir y dice cuántos días', () => {
    const historial = [
      sesion('reposo', 20), sesion('vocales-1', 10), sesion('nasales', 5), sesion('vocales-2', 2),
    ];
    expect(leccionesOxidadas(historial, HOY)).toEqual([{ id: 'reposo', diasSinRepasar: 20 }]);
    // El día que se cruza el umbral, no el anterior.
    expect(ids([sesion('reposo', DIAS_PARA_REPASAR), sesion('vocales-1', 5),
      sesion('nasales', 4), sesion('vocales-2', 3)], HOY)).toEqual(['reposo']);
  });

  it('exige haber seguido avanzando: el suelo de intentos no dispara nada por sí solo', () => {
    const despues = [sesion('vocales-1', 30), sesion('nasales', 20)];
    // Un mes sin tocarla, pero solo dos intentos más: aún no se ha alejado.
    expect(ids([sesion('reposo', 40), ...despues], HOY)).toEqual([]);
    const tercero = [...despues, sesion('vocales-2', 10)];
    expect(ids([sesion('reposo', 40), ...tercero], HOY)).toEqual(['reposo']);
  });

  it('deja fuera la práctica libre y las lecciones retiradas', () => {
    const libres = ['practica-continua', 'texto-propio', 'refuerzo'].map((id) => sesion(id, 5));
    const temario = [sesion('vocales-1', 30), sesion('nasales', 20)];
    // Tres intentos de práctica libre no cuentan como haber avanzado: repasar ya
    // es lo que se está haciendo, así que no se le invita a ello otra vez.
    expect(ids([sesion('reposo', 40), ...temario, ...libres], HOY)).toEqual([]);
    // Y una lección retirada no se puede repasar porque ya no existe.
    const conRetirada = [sesion('top', 90), sesion('reposo', 40), ...temario, sesion('vocales-2', 10)];
    expect(ids(conRetirada, HOY)).toEqual(['reposo']);
  });

  it('agrupa los identificadores antiguos con la lección de ahora', () => {
    const historial = [
      sesion('home', 40), sesion('home-words', 35),
      sesion('vocales-1', 30), sesion('nasales', 20), sesion('vocales-2', 10),
    ];
    // Las dos de la v0.1.0 son la misma lección: cuenta la más reciente.
    expect(leccionesOxidadas(historial, HOY)).toEqual([{ id: 'reposo', diasSinRepasar: 35 }]);
  });

  it('nunca da por oxidada la lección que se tiene delante', () => {
    const historial = [
      sesion('reposo', 40), sesion('vocales-1', 30), sesion('nasales', 20),
      sesion('vocales-2', 15), sesion('tildes', 10), sesion('oclusivas', 5),
    ];
    expect(ids(historial, HOY)).toEqual(['reposo', 'vocales-1', 'nasales']);
    expect(ids(historial, HOY, 'reposo')).toEqual(['vocales-1', 'nasales']);
    // También si la lección abierta viene con el nombre de antes.
    expect(ids(historial, HOY, 'home')).toEqual(['vocales-1', 'nasales']);
  });

  it('devuelve antes la que más tiempo lleva sin salir', () => {
    const historial = [
      sesion('reposo', 12), sesion('vocales-1', 40), sesion('nasales', 10),
      sesion('vocales-2', 8), sesion('tildes', 6), sesion('oclusivas', 4), sesion('consonantes', 2),
    ];
    expect(ids(historial, HOY)).toEqual(['vocales-1', 'reposo', 'nasales', 'vocales-2']);
  });

  it('desempata por orden del temario cuando llevan el mismo tiempo sin salir', () => {
    const historial = [
      sesion('nasales', 30), sesion('reposo', 30), sesion('vocales-1', 30),
      sesion('vocales-2', 10), sesion('tildes', 8), sesion('oclusivas', 6),
    ];
    expect(ids(historial, HOY)).toEqual(['reposo', 'vocales-1', 'nasales']);
  });

  it('no invita a repasar lo que no se puede abrir', () => {
    // Histórico importado con un hueco: falta la cuarta lección, así que nada
    // por encima está desbloqueado aunque conste como superado.
    const historial = [
      sesion('reposo', 60), sesion('vocales-1', 55), sesion('nasales', 50),
      sesion('tildes', 40), sesion('oclusivas', 30), sesion('consonantes', 20), sesion('dificiles', 10),
    ];
    expect(ids(historial, HOY)).toEqual(['reposo', 'vocales-1', 'nasales']);
  });

  it('solo repasa lo que en su día se superó', () => {
    const historial = [
      sesion('reposo', 60), sesion('vocales-1', 50, 40),
      sesion('nasales', 40), sesion('vocales-2', 30), sesion('tildes', 20),
    ];
    // La segunda lleva mes y medio sin tocarse, pero nunca llegó al objetivo:
    // no está oxidada, está pendiente.
    expect(ids(historial, HOY)).toEqual(['reposo']);
  });

  it('no da por repasado un intento en el que no se tecleó nada', () => {
    const historial = [
      sesion('reposo', 40), sesion('vocales-1', 30), sesion('nasales', 20), sesion('vocales-2', 10),
      sesion('reposo', 5, 95, 0),
    ];
    expect(ids(historial, HOY)).toEqual(['reposo']);
  });

  it('ignora las fechas ilegibles en vez de dar la lección por oxidada', () => {
    const historial = [
      sesion('reposo', 40), sesion('vocales-1', 30), sesion('nasales', 20), sesion('vocales-2', 10),
    ];
    expect(leccionesOxidadas(historial, 'no es una fecha')).toEqual([]);
    const rotas = historial.map((s) => ({ ...s, terminadaEn: 'cuando pude' }));
    expect(leccionesOxidadas(rotas, HOY)).toEqual([]);
  });

  it('usa el reloj real cuando no se le da una fecha', () => {
    const ahora = Date.now();
    const historial = [40, 30, 20, 10].map((dias, i) => ({
      ...sesion(['reposo', 'vocales-1', 'nasales', 'vocales-2'][i], 0),
      terminadaEn: new Date(ahora - dias * MS_DIA).toISOString(),
    }));
    expect(ids(historial)).toEqual(['reposo']);
  });
});
