import { describe, it, expect, beforeEach } from 'vitest';
import {
  aplicar, cargar, guardar, normalizar, PALABRAS_POR_LONGITUD, palabrasPorTexto, POR_DEFECTO,
} from './preferencias';

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
    expect(normalizar({ layout: 42 }).layout).toBe('es-iso');
    expect(normalizar({ layout: '  ' }).layout).toBe('es-iso');
    expect(normalizar({ layout: 'es-iso' }).layout).toBe('es-iso');
  });

  it('el tono sin elegir se queda en null para poder preguntarlo', () => {
    expect(normalizar({}).tono).toBeNull();
    expect(normalizar({ tono: 'otro' }).tono).toBeNull();
    expect(normalizar({ tono: 'juego' }).tono).toBe('juego');
  });

  it('la búsqueda de actualizaciones viene activada de fábrica', () => {
    // Quien usa esto no va a ir a mirar si hay versión nueva; quedarse con un
    // fallo ya arreglado es peor que la única consulta de red que hace la app.
    expect(normalizar({}).buscarActualizaciones).toBe(true);
    expect(normalizar(null).buscarActualizaciones).toBe(true);
  });

  it('desactivarla se respeta al volver a abrir', () => {
    // Es lo que importa de esta preferencia: quien la apagó a propósito no
    // puede encontrársela encendida otra vez.
    expect(normalizar({ buscarActualizaciones: false }).buscarActualizaciones).toBe(false);
    expect(normalizar({ buscarActualizaciones: 'no' }).buscarActualizaciones).toBe(true);
  });

  it('el sonido viene apagado y solo un true explícito lo enciende', () => {
    // En un aula con veinte equipos, un valor corrupto no puede ponerlos a sonar.
    expect(normalizar({}).sonido).toBe(false);
    expect(normalizar({ sonido: 'sí' }).sonido).toBe(false);
    expect(normalizar({ sonido: true }).sonido).toBe(true);
  });

  it('acota el volumen y lo recupera si viene corrupto', () => {
    expect(normalizar({ volumen: 5 }).volumen).toBe(1);
    expect(normalizar({ volumen: 0 }).volumen).toBe(0.1);
    expect(normalizar({ volumen: 'alto' }).volumen).toBe(POR_DEFECTO.volumen);
    expect(normalizar({ volumen: 0.3 }).volumen).toBe(0.3);
  });

  it('las métricas se ven salvo que se pida ocultarlas', () => {
    expect(normalizar({}).ocultarMetricas).toBe(false);
    expect(normalizar({ ocultarMetricas: true }).ocultarMetricas).toBe(true);
    expect(normalizar({ ocultarMetricas: 1 }).ocultarMetricas).toBe(false);
  });

  it('normaliza animaciones reducidas a movimiento reducido', () => {
    expect(normalizar({ animaciones: 'reducidas' }).movimiento).toBe('reducido');
    expect(normalizar({ movimiento: 'reducido' }).movimiento).toBe('reducido');
  });

  it('sanitiza la ultimaLeccion con fallback a la primera si no existe o es invalida', () => {
    expect(normalizar({}).ultimaLeccion).toBe('reposo');
    expect(normalizar({ ultimaLeccion: 'tildes' }).ultimaLeccion).toBe('tildes');
    expect(normalizar({ ultimaLeccion: 'leccion-inexistente' }).ultimaLeccion).toBe('reposo');
    expect(normalizar({ ultimaLeccion: 123 }).ultimaLeccion).toBe('reposo');
  });
});

describe('guardar y cargar', () => {
  beforeEach(() => localStorage.clear());

  it('sobrevive a cerrar la aplicación', () => {
    // El fallo que esto arregla: alguien pone el texto al 200% porque lo
    // necesita y al volver a abrir estaba otra vez al 100%.
    guardar({ ...POR_DEFECTO, escala: 2, fuente: 'dislexia', tono: 'sobrio', layout: 'es-iso' });
    const p = cargar();
    expect(p.escala).toBe(2);
    expect(p.fuente).toBe('dislexia');
    expect(p.tono).toBe('sobrio');
    expect(p.layout).toBe('es-iso');
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
      ...POR_DEFECTO,
      escala: 1.8, tema: 'oscuro', movimiento: 'reducido',
      fuente: 'dislexia', tono: 'juego', ayudaTeclado: 'siempre',
      buscarActualizaciones: true, layout: 'es-iso',
      sonido: false, volumen: 0.6, ocultarMetricas: false,
    }, raiz);
    expect(raiz.getAttribute('data-theme')).toBe('dark');
    expect(raiz.getAttribute('data-motion')).toBe('reducido');
    expect(raiz.getAttribute('data-font')).toBe('dyslexic');
    expect(raiz.getAttribute('data-tono')).toBe('juego');
    expect(raiz.style.getPropertyValue('--ui-scale')).toBe('1.8');
  });

  it('aplica movimiento reducido si se indica mediante animaciones reducidas', () => {
    aplicar({ ...POR_DEFECTO, ...({ animaciones: 'reducidas' } as any) }, raiz);
    expect(raiz.getAttribute('data-motion')).toBe('reducido');
  });

  it('quita los atributos al volver a automático', () => {
    aplicar({ ...POR_DEFECTO, tema: 'claro', tono: 'juego' }, raiz);
    aplicar(POR_DEFECTO, raiz);
    expect(raiz.hasAttribute('data-theme')).toBe(false);
    expect(raiz.hasAttribute('data-tono')).toBe(false);
  });
});

describe('preferencias de la fase 2', () => {
  it('traen valores por defecto prudentes', () => {
    const p = normalizar({});
    expect(p.contraste).toBe('auto');
    expect(p.longitudTexto).toBe('normal');
    expect(p.recordatorioPausa).toBe(20);
    // Apagado: a quien no tiene temblor le podría comer una doble letra.
    expect(p.ignorarRepeticion).toBe(false);
  });

  it('un valor corrupto cae al de por defecto', () => {
    const p = normalizar({ contraste: 'máximo', longitudTexto: 7, recordatorioPausa: 13, ignorarRepeticion: 'sí' });
    expect(p.contraste).toBe('auto');
    expect(p.longitudTexto).toBe('normal');
    expect(p.recordatorioPausa).toBe(20);
    expect(p.ignorarRepeticion).toBe(false);
  });

  it('respeta lo elegido, también apagar el recordatorio', () => {
    const p = normalizar({ contraste: 'alto', longitudTexto: 'corto', recordatorioPausa: 0, ignorarRepeticion: true });
    expect(p).toMatchObject({ contraste: 'alto', longitudTexto: 'corto', recordatorioPausa: 0, ignorarRepeticion: true });
  });

  it('la longitud del texto se traduce a palabras en un solo sitio', () => {
    expect(palabrasPorTexto('corto')).toBeLessThan(palabrasPorTexto('normal'));
    expect(palabrasPorTexto('normal')).toBeLessThan(palabrasPorTexto('largo'));
    expect(palabrasPorTexto('raro' as never)).toBe(PALABRAS_POR_LONGITUD.normal);
  });

  it('el contraste va al atributo de la raíz, y en auto se lo deja al sistema', () => {
    const raiz = document.createElement('html');
    aplicar({ ...POR_DEFECTO, contraste: 'alto' }, raiz);
    expect(raiz.getAttribute('data-contrast')).toBe('alto');
    aplicar({ ...POR_DEFECTO, contraste: 'normal' }, raiz);
    expect(raiz.getAttribute('data-contrast')).toBe('normal');
    aplicar({ ...POR_DEFECTO, contraste: 'auto' }, raiz);
    expect(raiz.hasAttribute('data-contrast')).toBe(false);
  });
});
