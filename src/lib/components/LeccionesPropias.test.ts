import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import { flushSync, mount, tick, unmount } from 'svelte';
import LeccionesPropias from './LeccionesPropias.svelte';
import { ES_ISO } from '../keyboard/layouts';
import { crearLeccion, FORMATO_EXPORTACION, LIMITES, lapidaDe, type LeccionPropia } from '../lecciones/personalizadas';
import { AlmacenMemoria } from '../storage/almacen';

const AHORA = '2026-11-04T10:00:00.000Z';
const leccion = (id = 'propia:a', titulo = 'Primera'): LeccionPropia =>
  crearLeccion({ titulo, descripcion: '', texto: 'una frase para practicar' }, AHORA, id);

let componente: ReturnType<typeof mount> | null = null;
let almacen: AlmacenMemoria;
let lista: LeccionPropia[];
let onCambio: Mock<(l: LeccionPropia[]) => void>;
let onBorrada: Mock<(id: string) => void>;
let onPracticar: Mock<(id: string) => void>;

function montar(iniciales: LeccionPropia[] = [], extra: Record<string, unknown> = {}): void {
  lista = iniciales;
  componente = mount(LeccionesPropias, {
    target: document.body,
    props: {
      almacen,
      get lecciones() { return lista; },
      layout: ES_ISO,
      porLeccion: new Map(),
      onCambio,
      onBorrada,
      onPracticar,
      ...extra,
    },
  });
  flushSync();
}

const boton = (texto: string): HTMLButtonElement =>
  [...document.querySelectorAll('button')].find((b) => b.textContent?.trim() === texto)!;
const porEtiqueta = (etiqueta: string): HTMLButtonElement =>
  document.querySelector(`button[aria-label="${etiqueta}"]`)!;

describe('el límite de lecciones', () => {
  it('también vale al llegar con un borrador, sin pasar por «Nueva lección»', async () => {
    almacen = new AlmacenMemoria();
    onCambio = vi.fn(); onBorrada = vi.fn(); onPracticar = vi.fn();
    const llenas = Array.from({ length: LIMITES.lecciones }, (_, i) => leccion(`propia:n${i}`, `n${i}`));
    montar(llenas, { borradorInicial: { titulo: 'Una más', texto: 'una frase para practicar' } });
    const guardar = vi.spyOn(almacen, 'guardarLeccion');

    boton('Guardar').click();
    await vi.waitFor(() => expect(document.getElementById('propia-texto-err')!.textContent).toContain('máximo'));

    expect(guardar).not.toHaveBeenCalled();
    expect(onCambio).not.toHaveBeenCalled();
    expect(document.querySelector<HTMLTextAreaElement>('#propia-texto')!.value).toBe('una frase para practicar');
    if (componente) { await unmount(componente); componente = null; }
  });

  it('no impide editar una que ya existe con el cupo lleno', async () => {
    almacen = new AlmacenMemoria();
    onCambio = vi.fn(); onBorrada = vi.fn(); onPracticar = vi.fn();
    const llenas = Array.from({ length: LIMITES.lecciones }, (_, i) => leccion(`propia:n${i}`, `n${i}`));
    montar(llenas);
    porEtiqueta('Editar n0').click();
    await tick();
    boton('Guardar').click();
    await vi.waitFor(() => expect(onCambio).toHaveBeenCalled());
    if (componente) { await unmount(componente); componente = null; }
  });
});
const escribir = (id: string, valor: string): void => {
  const c = document.querySelector<HTMLInputElement | HTMLTextAreaElement>(id)!;
  c.value = valor;
  c.dispatchEvent(new Event('input', { bubbles: true }));
};
const estado = (): string => document.querySelector('[role="status"]')?.textContent ?? '';
const enviar = async (): Promise<void> => {
  document.querySelector('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
  await tick();
};

async function subir(contenido: string): Promise<void> {
  const input = document.querySelector<HTMLInputElement>('input[type="file"]')!;
  const fichero = new File([contenido], 'l.json', { type: 'application/json' });
  Object.defineProperty(input, 'files', { configurable: true, value: [fichero] });
  input.dispatchEvent(new Event('change', { bubbles: true }));
}

beforeEach(() => {
  almacen = new AlmacenMemoria();
  onCambio = vi.fn<(l: LeccionPropia[]) => void>((l) => { lista = l; });
  onBorrada = vi.fn<(id: string) => void>();
  onPracticar = vi.fn<(id: string) => void>();
});

afterEach(async () => {
  if (componente) await unmount(componente);
  componente = null;
  document.body.replaceChildren();
});

describe('la lista', () => {
  it('sin lecciones invita a crear y no deja exportar', () => {
    montar();
    expect(document.body.textContent).toContain('Todavía no tienes ninguna');
    expect(boton('Exportar todas').disabled).toBe(true);
  });

  it('no enseña las lápidas', () => {
    montar([leccion(), lapidaDe(leccion('propia:b', 'Borrada'), AHORA)]);
    expect(document.body.textContent).toContain('Primera');
    expect(document.body.textContent).not.toContain('Borrada');
  });

  it('practicar avisa a quien manda', () => {
    montar([leccion()]);
    porEtiqueta('Practicar Primera').click();
    expect(onPracticar).toHaveBeenCalledWith('propia:a');
  });

  it('una lección que este teclado no puede escribir no se puede abrir, y dice por qué', () => {
    montar([{ ...leccion(), texto: 'una calle en straße' }]);
    expect(porEtiqueta('Practicar Primera').disabled).toBe(true);
    expect(document.body.textContent).toContain('«ß»');
  });

  it('en el límite no deja crear más', () => {
    const llenas = Array.from({ length: LIMITES.lecciones }, (_, i) => leccion(`propia:n${i}`, `n${i}`));
    montar(llenas);
    expect(boton('Nueva lección').disabled).toBe(true);
    expect(document.body.textContent).toContain('máximo');
  });
});

describe('crear y editar', () => {
  it('crea, guarda en el almacén y vuelve a la lista', async () => {
    montar();
    boton('Nueva lección').click();
    await tick();
    escribir('#propia-titulo', ' Refranes ');
    escribir('#propia-texto', 'a quien madruga\nDios le ayuda');
    await enviar();
    await vi.waitFor(() => expect(onCambio).toHaveBeenCalled());
    const [guardada] = await almacen.leerLecciones();
    expect(guardada).toMatchObject({ titulo: 'Refranes', texto: 'a quien madruga Dios le ayuda' });
    expect(guardada.id.startsWith('propia:')).toBe(true);
    await vi.waitFor(() => expect(document.querySelector('form')).toBeNull());
    expect(estado()).toContain('«Refranes» está guardada');
  });

  it('si no vale, dice qué y dónde, y no pierde lo escrito', async () => {
    montar();
    boton('Nueva lección').click();
    await tick();
    escribir('#propia-titulo', 'Alemán');
    escribir('#propia-texto', 'una calle en straße');
    await enviar();
    await vi.waitFor(() => expect(document.body.textContent).toContain('«ß»'));
    expect(document.querySelector<HTMLTextAreaElement>('#propia-texto')!.value).toBe('una calle en straße');
    expect(document.querySelector('#propia-texto')!.getAttribute('aria-invalid')).toBe('true');
    await vi.waitFor(() => expect(document.activeElement?.id).toBe('propia-texto'));
    expect(onCambio).not.toHaveBeenCalled();
    expect(await almacen.leerLecciones()).toEqual([]);
  });

  it('si el almacén falla, el texto sigue ahí', async () => {
    vi.spyOn(almacen, 'guardarLeccion').mockRejectedValue(new Error('lleno'));
    montar();
    boton('Nueva lección').click();
    await tick();
    escribir('#propia-titulo', 'Nombre');
    escribir('#propia-texto', 'una frase para practicar');
    await enviar();
    await vi.waitFor(() => expect(document.body.textContent).toContain('Tu texto sigue aquí'));
    expect(onCambio).not.toHaveBeenCalled();
  });

  it('editar abre con lo que había y conserva el identificador', async () => {
    await almacen.guardarLeccion(leccion());
    montar([leccion()]);
    porEtiqueta('Editar Primera').click();
    await tick();
    expect(document.querySelector<HTMLInputElement>('#propia-titulo')!.value).toBe('Primera');
    escribir('#propia-titulo', 'Renombrada');
    await enviar();
    await vi.waitFor(() => expect(onCambio).toHaveBeenCalled());
    const guardadas = await almacen.leerLecciones();
    expect(guardadas).toHaveLength(1);
    expect(guardadas[0]).toMatchObject({ id: 'propia:a', titulo: 'Renombrada' });
  });

  it('cancelar no guarda nada', async () => {
    montar();
    boton('Nueva lección').click();
    await tick();
    escribir('#propia-titulo', 'Nada');
    boton('Cancelar').click();
    await tick();
    expect(document.querySelector('form')).toBeNull();
    expect(onCambio).not.toHaveBeenCalled();
  });

  it('un borrador abre directamente el formulario con ese texto', async () => {
    montar([], { borradorInicial: { texto: 'desde el texto libre' } });
    await tick();
    expect(document.querySelector<HTMLTextAreaElement>('#propia-texto')!.value).toBe('desde el texto libre');
  });
});

describe('duplicar y borrar', () => {
  it('duplica como lección aparte', async () => {
    montar([leccion()]);
    porEtiqueta('Duplicar Primera').click();
    await vi.waitFor(() => expect(onCambio).toHaveBeenCalled());
    const [copia] = await almacen.leerLecciones();
    expect(copia.id).not.toBe('propia:a');
    expect(copia.titulo).toBe('Copia de Primera');
  });

  it('un doble clic en duplicar solo crea una copia, y después se puede volver a duplicar', async () => {
    montar([leccion()]);
    const boton = porEtiqueta('Duplicar Primera');
    boton.click();
    boton.click();
    await vi.waitFor(() => expect(onCambio).toHaveBeenCalled());
    expect(await almacen.leerLecciones()).toHaveLength(1);
    await vi.waitFor(() => expect(porEtiqueta('Duplicar Primera').hasAttribute('disabled')).toBe(false));
  });

  it('borrar pide confirmación y explica qué pasa con el histórico', async () => {
    await almacen.guardarLeccion(leccion());
    montar([leccion()]);
    porEtiqueta('Borrar Primera').click();
    flushSync();
    expect(document.body.textContent).toContain('Tus intentos seguirán en Progreso');
    expect(onBorrada).not.toHaveBeenCalled();

    boton('No, conservarla').click();
    flushSync();
    expect((await almacen.leerLecciones())[0].borradaEn).toBeNull();

    porEtiqueta('Borrar Primera').click();
    flushSync();
    boton('Sí, borrar').click();
    await vi.waitFor(() => expect(onBorrada).toHaveBeenCalledWith('propia:a'));
    expect((await almacen.leerLecciones())[0]).toMatchObject({ titulo: 'Primera', texto: '' });
  });
});

describe('importar y exportar', () => {
  const fichero = (lecciones: unknown[]): string =>
    JSON.stringify({ formato: FORMATO_EXPORTACION, version: 1, lecciones });

  it('un fichero con miles de entradas se rechaza con una frase, sin un párrafo por entrada', async () => {
    montar([]);
    await subir(fichero(Array.from({ length: 20000 }, () => ({}))));
    await vi.waitFor(() => expect(estado()).toContain('repartirlas en ficheros más pequeños'));
    expect(document.querySelectorAll('.aviso p')).toHaveLength(1);
  });

  it('importa lo bueno y cuenta lo que no, sin perder lo que ya había', async () => {
    await almacen.guardarLeccion(leccion());
    montar([leccion()]);
    await subir(fichero([
      { titulo: 'Nueva', texto: 'otra frase para practicar' },
      { titulo: 'Primera', texto: 'una frase para practicar' },
      { titulo: 'Alemana', texto: 'una calle en straße' },
    ]));
    await vi.waitFor(() => expect(estado()).toContain('Se ha importado 1 lección'));
    expect(estado()).toContain('1 ya la tenías');
    expect(estado()).toContain('«Alemana» no se ha importado');
    expect(estado()).toContain('«ß»');
    expect((await almacen.leerLecciones()).map((l) => l.titulo).sort()).toEqual(['Nueva', 'Primera']);
  });

  it('un fichero que no es de lecciones se explica', async () => {
    montar();
    await subir('{"sesiones":[]}');
    await vi.waitFor(() => expect(estado()).toContain('no contiene lecciones de LibreType'));
    expect(onCambio).not.toHaveBeenCalled();
  });

  it('si todo estaba ya, no dice que ha importado cero', async () => {
    montar([leccion()]);
    await subir(fichero([{ titulo: 'Primera', texto: 'una frase para practicar' }]));
    await vi.waitFor(() => expect(estado()).toContain('1 ya la tenías'));
    expect(estado()).not.toContain('importado');
  });

  it('un fichero sin lecciones lo dice', async () => {
    montar();
    await subir(fichero([]));
    await vi.waitFor(() => expect(estado()).toContain('no trae ninguna lección'));
  });

  it('un fichero enorme no se llega a leer', async () => {
    montar();
    await subir('x'.repeat(LIMITES.ficheroBytes + 1));
    await vi.waitFor(() => expect(estado()).toContain('demasiado grande'));
  });

  it('si el guardado falla a medias, la lista enseña lo que sí entró', async () => {
    const guardar = vi.spyOn(almacen, 'guardarLeccion')
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error('lleno'));
    montar();
    await subir(fichero([
      { titulo: 'Una', texto: 'una frase para practicar' },
      { titulo: 'Dos', texto: 'otra frase para practicar' },
    ]));
    await vi.waitFor(() => expect(estado()).toContain('Han entrado 1 de 2'));
    expect(guardar).toHaveBeenCalledTimes(2);
    expect(onCambio.mock.lastCall![0].map((l) => l.titulo)).toEqual(['Una']);
  });

  it('exporta por la vía común de ficheros', async () => {
    URL.createObjectURL = vi.fn().mockReturnValue('blob:x');
    URL.revokeObjectURL = vi.fn();
    const clic = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    montar([leccion()]);
    boton('Exportar todas').click();
    await vi.waitFor(() => expect(clic).toHaveBeenCalled());
    await vi.waitFor(() => expect(estado()).toContain('descargas'));
    clic.mockRestore();
  });

  describe('validación en vivo', () => {
    const errores = () => [...document.querySelectorAll('.error')].map((e) => e.textContent);
    const salir = (id: string) => document.querySelector(id)!.dispatchEvent(new FocusEvent('blur'));

    beforeEach(async () => {
      montar();
      boton('Nueva lección').click();
      await tick();
    });

    it('no regaña a quien aún está escribiendo', async () => {
      escribir('#propia-texto', 'abc');
      await tick();
      expect(errores()).toEqual([]);
    });

    it('dice lo que falta al salir del campo', async () => {
      escribir('#propia-texto', 'abc');
      salir('#propia-texto');
      await tick();
      expect(errores().join(' ')).toContain('al menos');
      expect(document.querySelector('#propia-texto')?.getAttribute('aria-invalid')).toBe('true');
      escribir('#propia-texto', 'ahora ya tiene longitud');
      await tick();
      expect(errores()).toEqual([]);
      expect(document.querySelector('#propia-texto')?.getAttribute('aria-invalid')).toBe('false');
    });

    it('una letra que el teclado no tiene se dice en cuanto aparece', async () => {
      escribir('#propia-texto', 'stra\u00dfe');
      await tick();
      expect(errores().join(' ')).toContain('\u00df');
    });

    it('pasarse del límite se dice sin esperar', async () => {
      escribir('#propia-titulo', 'x'.repeat(LIMITES.titulo + 1));
      await tick();
      expect(errores().join(' ')).toContain('caben');
    });
  });

  describe('foco', () => {
    it('pedir borrar va a la salida segura y cancelar vuelve al botón', async () => {
      montar([leccion()]);
      porEtiqueta('Borrar Primera').click();
      await tick();
      await tick();
      expect(document.activeElement).toBe(boton('No, conservarla'));
      boton('No, conservarla').click();
      await tick();
      await tick();
      expect(document.activeElement).toBe(porEtiqueta('Borrar Primera'));
    });

    it('cancelar una edición vuelve a su botón', async () => {
      montar([leccion()]);
      porEtiqueta('Editar Primera').click();
      await tick();
      boton('Cancelar').click();
      await tick();
      await tick();
      expect(document.activeElement).toBe(porEtiqueta('Editar Primera'));
    });

    it('al borrar, el foco no se va al documento', async () => {
      montar([leccion()]);
      porEtiqueta('Borrar Primera').click();
      await tick();
      boton('Sí, borrar').click();
      await vi.waitFor(() => expect(onBorrada).toHaveBeenCalled());
      await tick();
      await tick();
      expect(document.activeElement).toBe(boton('Nueva lección'));
    });
  });

  it('los datos de cada lección van separados, no pegados', async () => {
    const l = leccion();
    montar([l], {
      porLeccion: new Map([[l.id, { leccion: l.id, intentos: 2, mejorPpm: 30, mejorPct: 95, ultimaPpm: 30, ultimaPct: 95, ultimaEn: AHORA }]]),
    });
    expect(document.querySelector('.lista .note')?.textContent).toMatch(/\d+ caracteres · 2 intentos · mejor 30 ppm/);
  });
});
