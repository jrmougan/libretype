import { describe, it, expect, vi, afterEach } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';
import SelectorTono from './SelectorTono.svelte';
import type { Tono } from '../preferencias';

let componente: ReturnType<typeof SelectorTono> | undefined;

afterEach(async () => {
  if (componente) await unmount(componente);
  componente = undefined;
  document.body.replaceChildren();
  vi.restoreAllMocks();
});

function montar(onElegir = vi.fn<(tono: Tono) => void>()) {
  componente = mount(SelectorTono, {
    target: document.body,
    props: { onElegir },
  });
  flushSync();
  return { onElegir };
}

describe('SelectorTono.svelte (Issue #36)', () => {
  it('renderiza la sección accesible y su encabezado', () => {
    montar();
    const seccion = document.querySelector('section.selector');
    expect(seccion).not.toBeNull();
    expect(seccion?.getAttribute('aria-labelledby')).toBe('tono-tit');

    const titulo = document.getElementById('tono-tit');
    expect(titulo).not.toBeNull();
    expect(titulo?.textContent).toBe('¿Cómo prefieres que sea la aplicación?');
  });

  it('muestra la explicación de que la elección no clasifica por edad', () => {
    montar();
    const intro = document.querySelector('.intro');
    expect(intro).not.toBeNull();
    const textoNormalizado = intro?.textContent?.replace(/\s+/g, ' ') ?? '';
    expect(textoNormalizado).toContain('Solo cambia cómo se ve y cómo te habla');
    expect(textoNormalizado).toContain('Todo lo demás —las lecciones, el tamaño de la letra, los ajustes— es igual en las dos');
  });

  it('presenta las dos opciones: juego (con celebración) y sobrio (tranquila)', () => {
    montar();
    const botones = document.querySelectorAll('button.opcion');
    expect(botones).toHaveLength(2);

    const nombres = Array.from(botones).map((b) => b.querySelector('.nombre')?.textContent?.trim());
    expect(nombres).toEqual(['Con celebración', 'Tranquila']);

    const chips = Array.from(botones).map((b) => b.querySelector('.chip')?.textContent?.trim());
    expect(chips).toEqual(['¡Lección superada!', 'Lección terminada.']);

    // Las muestras visuales están ocultas para el lector de pantalla para no duplicar información
    const muestras = document.querySelectorAll('.muestra');
    expect(muestras).toHaveLength(2);
    for (const m of muestras) {
      expect(m.getAttribute('aria-hidden')).toBe('true');
    }
  });

  it('al pulsar "Con celebración" invoca onElegir con "juego"', () => {
    const onElegir = vi.fn();
    montar(onElegir);

    const botonJuego = Array.from(document.querySelectorAll('button.opcion')).find((b) =>
      b.textContent?.includes('Con celebración'),
    );
    expect(botonJuego).not.toBeUndefined();
    botonJuego?.dispatchEvent(new MouseEvent('click', { bubbles: true }));

    expect(onElegir).toHaveBeenCalledTimes(1);
    expect(onElegir).toHaveBeenCalledWith('juego');
  });

  it('al pulsar "Tranquila" invoca onElegir con "sobrio"', () => {
    const onElegir = vi.fn();
    montar(onElegir);

    const botonSobrio = Array.from(document.querySelectorAll('button.opcion')).find((b) =>
      b.textContent?.includes('Tranquila'),
    );
    expect(botonSobrio).not.toBeUndefined();
    botonSobrio?.dispatchEvent(new MouseEvent('click', { bubbles: true }));

    expect(onElegir).toHaveBeenCalledTimes(1);
    expect(onElegir).toHaveBeenCalledWith('sobrio');
  });
});
