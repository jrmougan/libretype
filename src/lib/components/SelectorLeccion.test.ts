import { afterEach, describe, expect, it, vi } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';
import SelectorLeccion from './SelectorLeccion.svelte';
import { catalogo } from '../lecciones/catalogo';

let c: ReturnType<typeof SelectorLeccion> | undefined;

afterEach(async () => {
  if (c) await unmount(c);
  c = undefined;
  document.body.replaceChildren();
});

function montar(valor: string, seguiaEn: string | null, onElegir: (v: string) => void = () => {}): HTMLSelectElement {
  c = mount(SelectorLeccion, {
    target: document.body,
    props: { valor, superadas: new Set<string>(), porLeccion: new Map(), seguiaEn, propias: [], onElegir },
  });
  flushSync();
  return document.querySelector('select')!;
}

const textoDe = (s: HTMLSelectElement, id: string) => s.querySelector(`option[value="${id}"]`)?.textContent ?? '';

describe('el selector de lección', () => {
  const primera = catalogo.primera.id;

  it('agrupa por curso y por modo', () => {
    const s = montar(primera, null);
    const grupos = [...s.querySelectorAll('optgroup')].map((g) => g.label);
    expect(grupos).toEqual([...catalogo.cursos.map((x) => x.titulo), 'Práctica libre', 'Tus lecciones']);
  });

  it('no gasta sitio diciendo lo normal: solo se marca lo superado y lo bloqueado', () => {
    const s = montar(primera, null);
    expect(textoDe(s, primera)).not.toContain('Disponible');
    expect(textoDe(s, catalogo.lecciones[1].id)).toContain('Bloqueada');
  });

  it('«seguías por aquí» solo cuando no es lo que está abierto', () => {
    expect(textoDe(montar(primera, primera), primera)).not.toContain('Seguías');
  });

  it('«seguías por aquí» aparece al estar en otro sitio', () => {
    expect(textoDe(montar('cero', primera), primera)).toContain('Seguías');
  });

  describe('recorrer con el teclado no cambia de lección (WCAG 3.2.2)', () => {
    const tecla = (s: HTMLSelectElement, key: string): KeyboardEvent => {
      const e = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true });
      s.dispatchEvent(e);
      return e;
    };
    /** Lo que hace el motor con la lista cerrada: `change` en el turno del `keydown`. */
    const flecha = (s: HTMLSelectElement, opcion: string): void => {
      tecla(s, 'ArrowDown');
      s.value = opcion;
      s.dispatchEvent(new Event('change', { bubbles: true }));
      flushSync();
    };
    const pista = () => document.querySelector('.pista')!.textContent!.trim();

    it('la flecha solo deja marcada la opción, y lo dice', () => {
      const onElegir = vi.fn();
      const s = montar(primera, null, onElegir);
      flecha(s, 'continua');
      expect(onElegir).not.toHaveBeenCalled();
      expect(s.value).toBe('continua');
      expect(pista()).toContain('Intro');
    });

    it('Intro abre lo marcado, también «Gestionar»', () => {
      const onElegir = vi.fn();
      const s = montar(primera, null, onElegir);
      flecha(s, 'continua');
      flecha(s, 'gestionar');
      expect(tecla(s, 'Enter').defaultPrevented).toBe(true);
      expect(onElegir).toHaveBeenCalledExactlyOnceWith('gestionar');
    });

    it('Intro sin nada marcado no hace nada: es el motor quien abre la lista', () => {
      const onElegir = vi.fn();
      const s = montar(primera, null, onElegir);
      expect(tecla(s, 'Enter').defaultPrevented).toBe(false);
      expect(onElegir).not.toHaveBeenCalled();
    });

    it.each([
      ['Esc', (s: HTMLSelectElement) => { tecla(s, 'Escape'); }],
      ['salir con Tab', (s: HTMLSelectElement) => { s.dispatchEvent(new FocusEvent('blur')); }],
    ])('%s vuelve a lo que sigue abierto sin abandonar nada', (_n, salir) => {
      const onElegir = vi.fn();
      const s = montar(primera, null, onElegir);
      flecha(s, 'continua');
      salir(s);
      flushSync();
      expect(onElegir).not.toHaveBeenCalled();
      expect(s.value).toBe(primera);
      expect(pista()).toBe('');
    });

    it('la flecha que no dispara `change`, como la de WebKit tras Esc, también marca', async () => {
      const onElegir = vi.fn();
      const s = montar(primera, null, onElegir);
      flecha(s, 'continua');
      await new Promise((r) => setTimeout(r, 0));
      tecla(s, 'Escape');
      flushSync();
      tecla(s, 'ArrowDown');
      s.value = 'continua';
      await new Promise((r) => setTimeout(r, 0));
      flushSync();
      expect(pista()).toContain('Intro');
      tecla(s, 'Enter');
      expect(onElegir).toHaveBeenCalledExactlyOnceWith('continua');
    });

    it('con el ratón, elegir es elegir', () => {
      const onElegir = vi.fn();
      const s = montar(primera, null, onElegir);
      s.value = 'continua';
      s.dispatchEvent(new Event('change', { bubbles: true }));
      expect(onElegir).toHaveBeenCalledExactlyOnceWith('continua');
    });

    it('si `change` llega después de la pulsación, como en la lista nativa de macOS, también', async () => {
      const onElegir = vi.fn();
      const s = montar(primera, null, onElegir);
      tecla(s, 'ArrowDown');
      await new Promise((r) => setTimeout(r, 0));
      s.value = 'continua';
      s.dispatchEvent(new Event('change', { bubbles: true }));
      expect(onElegir).toHaveBeenCalledExactlyOnceWith('continua');
    });
  });
});
