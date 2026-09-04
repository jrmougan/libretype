import { describe, it, expect } from 'vitest';
import { RENOMBRADAS, RETIRADAS, idCanonico, tituloRetirada } from './equivalencias';
import { LESSONS } from '../lessons';

const idsActuales = new Set(LESSONS.map((l) => l.id));

describe('equivalencias de identificadores', () => {
  it('todo destino renombrado es una lección que existe', () => {
    for (const destino of RENOMBRADAS.values()) {
      expect(idsActuales, `${destino} no está en LESSONS`).toContain(destino);
    }
  });

  // Si un identificador vivo apareciera como origen, las sesiones que se están
  // guardando ahora mismo se irían a otra lección sin que nadie lo note.
  it('ningún identificador vivo se traduce ni se da por retirado', () => {
    for (const id of idsActuales) {
      expect(RENOMBRADAS.has(id), `${id} está vivo y renombrado`).toBe(false);
      expect(RETIRADAS.has(id), `${id} está vivo y marcado retirado`).toBe(false);
    }
  });

  it('las dos tablas no se pisan', () => {
    for (const origen of RENOMBRADAS.keys()) {
      expect(RETIRADAS.has(origen)).toBe(false);
    }
  });

  // Toda lección de la v0.1.0 tiene que estar en una tabla o en la otra, o
  // seguir existiendo: si no, su histórico vuelve a quedarse sin fila.
  it('cubre las ocho lecciones publicadas en la v0.1.0', () => {
    const v010 = [
      'home', 'home-words', 'top', 'bottom', 'enye', 'tildes', 'dieresis', 'mixed',
    ];
    for (const id of v010) {
      const resuelto = RENOMBRADAS.has(id) || RETIRADAS.has(id) || idsActuales.has(id);
      expect(resuelto, `${id} no lo cubre nadie`).toBe(true);
    }
  });

  it('toda retirada tiene nombre que enseñar', () => {
    for (const id of RETIRADAS.keys()) {
      expect(tituloRetirada(id)).toBeTruthy();
    }
  });

  it('lo que no hay que traducir pasa igual', () => {
    expect(idCanonico('tildes')).toBe('tildes');
    expect(idCanonico('top')).toBe('top');
    expect(idCanonico('desconocida')).toBe('desconocida');
  });
});
