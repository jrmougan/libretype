import { describe, expect, it } from 'vitest';
import { leccionesSuperadas, PCT_OBJETIVO } from '../storage/objetivos';
import type { Sesion } from '../storage/progreso';
import { catalogo } from './catalogo';
import {
  abreLeccion, inicioDeColocacion, PALABRAS_POR_TRAMO, tramoDe, trasTramo, type Colocacion,
} from './colocacion';
import { ejercicioDe } from './ejercicio';
import { IDS_RESERVADOS } from './ids';

const sesion = (leccion: string, pctAcierto: number): Sesion => ({
  leccion, ppm: 30, pctAcierto, aciertos: 30, escritos: 32, ms: 12346, terminadaEn: '2026-09-01T10:00:00Z',
});
const lecciones = catalogo.principal.lecciones;

describe('prueba de colocación', () => {
  it('cada tramo es texto de su lección, corto, solo con sus teclas y con alguna de las nuevas', () => {
    for (const l of catalogo.lecciones) {
      const tramo = tramoDe(l);
      expect(` ${l.text} `).toContain(` ${tramo} `);
      expect(tramo.split(' ').length).toBeLessThanOrEqual(PALABRAS_POR_TRAMO);
      const permitidas = catalogo.alfabetoHasta(l.id);
      for (const c of tramo) if (c !== ' ') expect(permitidas.has(c), `${l.id}: ${c}`).toBe(true);
      // Un tramo que no tocase nada de lo que estrena su lección la abriría sin demostrar nada.
      expect([...l.nuevas].some((c) => tramo.includes(c)), l.id).toBe(true);
    }
  });

  it('elige las palabras que más teclas nuevas tocan, no siempre las primeras', () => {
    // En los textos seguidos los signos nuevos no están al principio.
    expect(tramoDe(catalogo.leccion('un-dia')!)).toMatch(/[:;]/);
    expect(tramoDe(catalogo.leccion('refranes')!)).toMatch(/["()]/);
    // Donde las primeras ya lo cumplen igual de bien, se quedan las primeras.
    const reposo = catalogo.leccion('reposo')!;
    expect(tramoDe(reposo, 100)).toBe(reposo.text);
  });

  it('abre la lección con el mismo criterio que el resto de la app', () => {
    expect(abreLeccion(sesion('reposo', PCT_OBJETIVO))).toBe(true);
    expect(abreLeccion(sesion('reposo', PCT_OBJETIVO - 1))).toBe(false);
    // Solo lecciones del catálogo: un texto propio no abre nada.
    expect(abreLeccion(sesion('texto-propio', 100))).toBe(false);
    // Y el desbloqueo de siempre lo reconoce sin cambiar nada.
    const tramos = lecciones.slice(0, 3).map((l) => sesion(l.id, 96));
    expect(catalogo.nivelDesbloqueado(leccionesSuperadas(tramos))).toBe(3);
  });

  it('empieza por la primera lección sin superar, y no se ofrece con el curso entero abierto', () => {
    expect(inicioDeColocacion(new Set())).toBe(lecciones[0].id);
    expect(inicioDeColocacion(new Set([lecciones[0].id, lecciones[1].id]))).toBe(lecciones[2].id);
    expect(inicioDeColocacion(new Set(lecciones.map((l) => l.id)))).toBeNull();
  });

  it('avanza mientras los tramos salen bien y se para en el primero que cuesta', () => {
    let c: Colocacion = { fase: 'tramo', inicio: lecciones[0].id, actual: lecciones[0].id, abiertas: 0 };
    c = trasTramo(c, sesion(lecciones[0].id, 97));
    expect(c).toEqual({ fase: 'tramo', inicio: lecciones[0].id, actual: lecciones[1].id, abiertas: 1 });
    c = trasTramo(c, sesion(lecciones[1].id, 60));
    expect(c).toEqual({ fase: 'fin', inicio: lecciones[0].id, actual: lecciones[1].id, abiertas: 1 });
  });

  it('en la última lección del curso se acaba aunque salga bien: no salta a otro curso', () => {
    const ultima = lecciones.at(-1)!.id;
    const c = trasTramo({ fase: 'tramo', inicio: ultima, actual: ultima, abiertas: 0 }, sesion(ultima, 100));
    expect(c).toEqual({ fase: 'fin', inicio: ultima, actual: ultima, abiertas: 1 });
  });

  it('un tramo es un ejercicio más: se guarda como sesión normal de su lección', () => {
    const e = ejercicioDe({ tipo: 'colocacion', id: 'tildes', tramo: 5 }, []);
    expect(e.idSesion).toBe('tildes');
    expect(e.texto).toBe(tramoDe(catalogo.leccion('tildes')!));
    expect(e.titulo).toContain('Prueba de colocación');
    expect(e.explicacion).toContain('Tramo 5');
    // No enseña el umbral: ni cifra ni «objetivo».
    expect(e.explicacion).not.toMatch(/\d\d\s?%|[Oo]bjetivo/);
    expect(IDS_RESERVADOS.has('colocacion')).toBe(true);
  });
});
