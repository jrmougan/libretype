import { describe, expect, it, vi } from 'vitest';
import { leerPolitica, normalizarPolitica, SIN_POLITICA } from './politica';

describe('política del equipo (3.4)', () => {
  it('sin fichero no hay política', () => {
    expect(normalizarPolitica('')).toEqual(SIN_POLITICA);
    expect(normalizarPolitica('  \n')).toEqual(SIN_POLITICA);
  });

  it('lee las actualizaciones y el perfil por defecto', () => {
    expect(normalizarPolitica('{"actualizaciones": false, "perfilPorDefecto": "  Aula 2 "}'))
      .toEqual({ actualizaciones: false, perfilPorDefecto: 'Aula 2' });
    expect(normalizarPolitica('{"perfilPorDefecto": ""}')).toEqual(SIN_POLITICA);
    // Solo un false explícito las apaga.
    expect(normalizarPolitica('{"actualizaciones": "no"}').actualizaciones).toBe(true);
  });

  it('un fichero que no se entiende apaga las actualizaciones, por si acaso', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(normalizarPolitica('{actualizaciones: false')).toEqual({
      actualizaciones: false, perfilPorDefecto: null,
    });
    expect(normalizarPolitica('[1, 2]').actualizaciones).toBe(false);
    vi.restoreAllMocks();
  });

  it('pregunta a Rust con el comando, y si no existe sigue sin política', async () => {
    const invocar = vi.fn(async () => '{"actualizaciones": false}');
    expect((await leerPolitica(invocar)).actualizaciones).toBe(false);
    expect(invocar).toHaveBeenCalledWith('politica_del_sistema');

    expect(await leerPolitica(async () => { throw new Error('command not found'); }))
      .toEqual(SIN_POLITICA);
  });

  it('en el navegador no hay política', async () => {
    expect(await leerPolitica()).toEqual(SIN_POLITICA);
  });
});
