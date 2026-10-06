import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  abrirCopiasNativas, guardarCopia, leerArchivos, nombreCopia, type ApiArchivos,
} from './copia';

afterEach(() => {
  vi.restoreAllMocks();
  vi.resetModules();
});

describe('nombreCopia', () => {
  it('lleva la fecha y, si lo hay, el alias sin tildes ni espacios', () => {
    const hoy = new Date('2026-10-06T12:00:00Z');
    expect(nombreCopia(undefined, hoy)).toBe('libretype-progreso-2026-10-06.json');
    expect(nombreCopia('  Íñigo López ', hoy)).toBe('libretype-inigo-lopez-2026-10-06.json');
    expect(nombreCopia('***', hoy)).toBe('libretype-progreso-2026-10-06.json');
  });
});

describe('guardarCopia (0.6)', () => {
  it('en escritorio usa el diálogo nativo y escribe donde se eligió', async () => {
    const api: ApiArchivos = {
      guardar: vi.fn(async () => '/home/ana/USB/copia.json'),
      abrir: vi.fn(),
    };
    const json = JSON.stringify({ perfil: { alias: 'Ana' } });
    expect(await guardarCopia(json, undefined, api)).toBe(true);
    expect(api.guardar).toHaveBeenCalledWith(expect.stringMatching(/^libretype-ana-\d{4}-\d{2}-\d{2}\.json$/), json);
  });

  it('si se cancela el diálogo, no dice que se guardó', async () => {
    const api: ApiArchivos = { guardar: async () => null, abrir: async () => [] };
    expect(await guardarCopia('{}', 'x.json', api)).toBe(false);
  });

  it('en el navegador descarga con un enlace, como siempre', async () => {
    const crear = vi.fn(() => 'blob:demo');
    const revocar = vi.fn();
    URL.createObjectURL = crear;
    URL.revokeObjectURL = revocar;
    const clic = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});

    expect(await guardarCopia('{}', 'x.json', null)).toBe(true);
    expect(clic).toHaveBeenCalledOnce();
    expect((clic.mock.contexts[0] as HTMLAnchorElement).download).toBe('x.json');
    expect(revocar).toHaveBeenCalledWith('blob:demo');
  });

  it('carga los plugins en diferido solo en escritorio', async () => {
    const save = vi.fn(async () => '/tmp/copia.json');
    const writeTextFile = vi.fn(async () => {});
    vi.doMock('@tauri-apps/api/core', () => ({ isTauri: () => true }));
    vi.doMock('@tauri-apps/plugin-dialog', () => ({ save, open: vi.fn() }));
    vi.doMock('@tauri-apps/plugin-fs', () => ({ writeTextFile, readTextFile: vi.fn() }));

    const { guardarCopia: guardar } = await import('./copia');
    expect(await guardar('{"a":1}', 'c.json')).toBe(true);
    expect(save).toHaveBeenCalledWith(expect.objectContaining({ defaultPath: 'c.json' }));
    expect(writeTextFile).toHaveBeenCalledWith('/tmp/copia.json', '{"a":1}');
  });
});

describe('abrir copias', () => {
  it('en el navegador devuelve null para que se use el input de fichero', async () => {
    expect(await abrirCopiasNativas(true, null)).toBeNull();
  });

  it('en escritorio lee todas las elegidas con su nombre', async () => {
    vi.doMock('@tauri-apps/api/core', () => ({ isTauri: () => true }));
    vi.doMock('@tauri-apps/plugin-dialog', () => ({
      save: vi.fn(),
      open: vi.fn(async () => ['C:\\Aula\\ana.json', '/media/usb/luis.json']),
    }));
    vi.doMock('@tauri-apps/plugin-fs', () => ({
      writeTextFile: vi.fn(),
      readTextFile: vi.fn(async (r: string) => `contenido de ${r}`),
    }));
    const { abrirCopiasNativas: abrir } = await import('./copia');
    expect(await abrir(true)).toEqual([
      { nombre: 'ana.json', contenido: 'contenido de C:\\Aula\\ana.json' },
      { nombre: 'luis.json', contenido: 'contenido de /media/usb/luis.json' },
    ]);
  });

  it('cancelar el diálogo nativo no es un error: no hay nada que abrir', async () => {
    const api: ApiArchivos = { guardar: async () => null, abrir: async () => [] };
    expect(await abrirCopiasNativas(false, api)).toEqual([]);
  });

  it('lee los ficheros de un input', async () => {
    const f = new File(['{"x":1}'], 'a.json', { type: 'application/json' });
    expect(await leerArchivos([f])).toEqual([{ nombre: 'a.json', contenido: '{"x":1}' }]);
    expect(await leerArchivos(null)).toEqual([]);
  });
});
