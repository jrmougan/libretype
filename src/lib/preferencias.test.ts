import { describe, it, expect, beforeEach } from 'vitest';
import { aplicar, cargar, guardar, normalizar, POR_DEFECTO } from './preferencias';

describe('normalizar', () => {
  it('sin nada guardado devuelve los valores por defecto', () => {
    expect(normalizar(null)).toEqual(POR_DEFECTO);
    expect(normalizar(undefined)).toEqual(POR_DEFECTO);
    expect(normalizar('basura')).toEqual(POR_DEFECTO);
  });

  it('acota la escala al rango admitido', () => {
    expect(normalizar({ escala: 5 }).escala).toBe(2);
    expect(normalizar({ escala: 0.1 }).escala).toBe(1);
    expect(normalizar({ escala: 1.5 }).escala).toBe(1.5);
  });

  it('un valor corrupto cae al de por defecto en vez de romper la app', () => {
    // Si esto no fuera así, un dato viejo o manipulado dejaría la interfaz en
    // un estado imposible, y justo a quien depende de estos ajustes.
    expect(normalizar({ tema: 'fucsia' }).tema).toBe('auto');
    expect(normalizar({ fuente: 42 }).fuente).toBe('normal');
    expect(normalizar({ escala: 'grande' }).escala).toBe(1);
  });

  it('el tono sin elegir se queda en null para poder preguntarlo', () => {
    expect(normalizar({}).tono).toBeNull();
    expect(normalizar({ tono: 'otro' }).tono).toBeNull();
    expect(normalizar({ tono: 'juego' }).tono).toBe('juego');
  });
});

describe('guardar y cargar', () => {
  beforeEach(() => localStorage.clear());

  it('sobrevive a cerrar la aplicación', () => {
    // El fallo que esto arregla: alguien pone el texto al 200% porque lo
    // necesita y al volver a abrir estaba otra vez al 100%.
    guardar({ ...POR_DEFECTO, escala: 2, fuente: 'dislexia', tono: 'sobrio' });
    const p = cargar();
    expect(p.escala).toBe(2);
    expect(p.fuente).toBe('dislexia');
    expect(p.tono).toBe('sobrio');
  });

  it('con datos corruptos no revienta', () => {
    localStorage.setItem('libretype.preferencias', '{esto no es json');
    expect(cargar()).toEqual(POR_DEFECTO);
  });
});

describe('aplicar al documento', () => {
  let raiz: HTMLElement;
  beforeEach(() => { raiz = document.createElement('div'); });

  it('los valores automáticos no dejan atributos puestos', () => {
    aplicar(POR_DEFECTO, raiz);
    expect(raiz.hasAttribute('data-theme')).toBe(false);
    expect(raiz.hasAttribute('data-motion')).toBe(false);
    expect(raiz.hasAttribute('data-font')).toBe(false);
    expect(raiz.hasAttribute('data-tono')).toBe(false);
    expect(raiz.style.getPropertyValue('--ui-scale')).toBe('1');
  });

  it('vuelca cada preferencia a su atributo', () => {
    aplicar({
      escala: 1.8, tema: 'oscuro', movimiento: 'reducido',
      fuente: 'dislexia', tono: 'juego', ayudaTeclado: 'siempre',
    }, raiz);
    expect(raiz.getAttribute('data-theme')).toBe('dark');
    expect(raiz.getAttribute('data-motion')).toBe('reducido');
    expect(raiz.getAttribute('data-font')).toBe('dyslexic');
    expect(raiz.getAttribute('data-tono')).toBe('juego');
    expect(raiz.style.getPropertyValue('--ui-scale')).toBe('1.8');
  });

  it('quita los atributos al volver a automático', () => {
    aplicar({ ...POR_DEFECTO, tema: 'claro', tono: 'juego' }, raiz);
    aplicar(POR_DEFECTO, raiz);
    expect(raiz.hasAttribute('data-theme')).toBe(false);
    expect(raiz.hasAttribute('data-tono')).toBe(false);
  });
});
