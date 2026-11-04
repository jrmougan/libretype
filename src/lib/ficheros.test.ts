import { describe, expect, it, vi } from 'vitest';
import { guardarFichero } from './ficheros';

describe('guardarFichero', () => {
  it('en escritorio llama al comando y devuelve la ruta', async () => {
    const invocar = vi.fn().mockResolvedValue('/home/ana/Descargas/l.json');
    const r = await guardarFichero('l.json', '{}', async () => invocar);
    expect(invocar).toHaveBeenCalledWith('guardar_en_descargas', { nombre: 'l.json', contenido: '{}' });
    expect(r).toEqual({ ruta: '/home/ana/Descargas/l.json' });
  });

  it('en escritorio no intenta el enlace de descarga: si falla, hay que contarlo', async () => {
    const crear = vi.spyOn(URL, 'createObjectURL');
    const invocar = vi.fn().mockRejectedValue('Sin permiso');
    await expect(guardarFichero('l.json', '{}', async () => invocar)).rejects.toBe('Sin permiso');
    expect(crear).not.toHaveBeenCalled();
    crear.mockRestore();
  });

  it('en el navegador descarga con un enlace y no hay ruta que enseñar', async () => {
    URL.createObjectURL = vi.fn().mockReturnValue('blob:x');
    URL.revokeObjectURL = vi.fn();
    const clic = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
      expect(this.download).toBe('l.json');
    });
    const r = await guardarFichero('l.json', '{}', async () => null);
    expect(r).toEqual({ ruta: null });
    expect(clic).toHaveBeenCalledOnce();
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:x');
    clic.mockRestore();
  });

  it('sin Tauri, la detección por defecto va por el navegador', async () => {
    URL.createObjectURL = vi.fn().mockReturnValue('blob:x');
    URL.revokeObjectURL = vi.fn();
    const clic = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    await expect(guardarFichero('l.json', '{}')).resolves.toEqual({ ruta: null });
    clic.mockRestore();
  });
});
