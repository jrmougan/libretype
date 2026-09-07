import { describe, it, expect, vi } from 'vitest';
import {
  crearActualizador,
  type ActualizacionDisponible,
  type ApiActualizador,
  type EstadoActualizacion,
  type EventoDescarga,
} from './actualizacion';

/**
 * Un doble de la API de Tauri. Todo lo que se prueba aquí es la máquina de
 * estados; el plugin real solo se puede ejercitar ejecutando la app de
 * escritorio, y esa comprobación está anotada en AGENTS.md.
 */
function dobleApi(opciones: {
  actualizacion?: ActualizacionDisponible | null;
  fallaComprobar?: unknown;
  fallaReiniciar?: unknown;
  version?: string;
} = {}): ApiActualizador & { reinicios: number } {
  let reinicios = 0;
  return {
    get reinicios() { return reinicios; },
    versionActual: async () => opciones.version ?? '0.2.0',
    comprobar: async () => {
      if (opciones.fallaComprobar !== undefined) throw opciones.fallaComprobar;
      return opciones.actualizacion ?? null;
    },
    reiniciar: async () => {
      if (opciones.fallaReiniciar !== undefined) throw opciones.fallaReiniciar;
      reinicios += 1;
    },
  };
}

/** Una actualización que emite los eventos que se le pasen y luego resuelve. */
function dobleActualizacion(
  eventos: EventoDescarga[],
  opciones: { version?: string; notas?: string; falla?: unknown } = {},
): ActualizacionDisponible & { instalaciones: number } {
  let instalaciones = 0;
  return {
    get instalaciones() { return instalaciones; },
    version: opciones.version ?? '0.3.0',
    notas: opciones.notas,
    async descargarEInstalar(alProgresar) {
      instalaciones += 1;
      if (opciones.falla !== undefined) throw opciones.falla;
      for (const ev of eventos) alProgresar(ev);
    },
  };
}

/** Recoge los estados publicados, que es lo que vería la interfaz. */
function grabador() {
  const estados: EstadoActualizacion[] = [];
  return {
    estados,
    on: (e: EstadoActualizacion) => { estados.push(e); },
    get ultimo() { return estados[estados.length - 1]; },
    fases: () => estados.map((e) => e.fase),
  };
}

describe('comprobar', () => {
  it('anuncia la versión nueva cuando la hay', async () => {
    const g = grabador();
    const api = dobleApi({
      actualizacion: dobleActualizacion([], { version: '0.3.0', notas: 'Arregla las tildes' }),
    });

    await crearActualizador(api, g.on).comprobar();

    expect(g.ultimo).toEqual({
      fase: 'disponible',
      version: '0.3.0',
      notas: 'Arregla las tildes',
    });
  });

  it('sin notas de versión no deja el campo en undefined', async () => {
    // La interfaz las pinta directamente; un undefined saldría en pantalla.
    const g = grabador();
    const api = dobleApi({ actualizacion: dobleActualizacion([], { notas: undefined }) });

    await crearActualizador(api, g.on).comprobar();

    expect(g.ultimo).toMatchObject({ fase: 'disponible', notas: '' });
  });

  it('la comprobación de arranque sin novedad no dice nada', async () => {
    // Un «estás al día» que aparece solo es ruido en una barra que comparte
    // sitio con las métricas de la lección.
    const g = grabador();

    await crearActualizador(dobleApi({ actualizacion: null }), g.on).comprobar();

    expect(g.fases()).toEqual(['inactivo']);
  });

  it('la comprobación manual sin novedad sí responde, porque alguien espera', async () => {
    const g = grabador();

    await crearActualizador(dobleApi({ version: '0.2.0' }), g.on).comprobar(true);

    expect(g.fases()).toEqual(['buscando', 'al-dia']);
    expect(g.ultimo).toEqual({ fase: 'al-dia', version: '0.2.0' });
  });

  it('sin red, la comprobación de arranque falla en silencio', async () => {
    // Que GitHub esté caído o no haya red no puede llenar la barra de avisos
    // que nadie ha pedido: se sigue pudiendo practicar igual.
    const g = grabador();
    const api = dobleApi({ fallaComprobar: new Error('network error') });

    await crearActualizador(api, g.on).comprobar();

    expect(g.fases()).toEqual(['inactivo']);
  });

  it('sin red, la comprobación manual sí cuenta el error', async () => {
    const g = grabador();
    const api = dobleApi({ fallaComprobar: new Error('network error') });

    await crearActualizador(api, g.on).comprobar(true);

    expect(g.ultimo).toEqual({ fase: 'error', mensaje: 'network error' });
  });

  it('un error sin mensaje aprovechable no enseña un texto vacío', async () => {
    const g = grabador();

    await crearActualizador(dobleApi({ fallaComprobar: { raro: true } }), g.on).comprobar(true);

    expect(g.ultimo.fase).toBe('error');
    expect((g.ultimo as { mensaje: string }).mensaje).toMatch(/versión nueva/);
  });
});

describe('instalar', () => {
  it('no instala nada si no se ha comprobado antes', async () => {
    // Es la garantía de que nada se instala solo: sin una comprobación previa
    // que haya encontrado algo, instalar() no tiene qué hacer.
    const g = grabador();
    const act = dobleActualizacion([]);

    await crearActualizador(dobleApi({ actualizacion: act }), g.on).instalar();

    expect(act.instalaciones).toBe(0);
    expect(g.estados).toEqual([]);
  });

  it('comprobar no descarga: la descarga necesita un clic', async () => {
    const g = grabador();
    const act = dobleActualizacion([]);

    await crearActualizador(dobleApi({ actualizacion: act }), g.on).comprobar();

    expect(act.instalaciones).toBe(0);
  });

  it('lleva el porcentaje según lo descargado', async () => {
    const g = grabador();
    const act = dobleActualizacion([
      { event: 'Started', data: { contentLength: 1000 } },
      { event: 'Progress', data: { chunkLength: 250 } },
      { event: 'Progress', data: { chunkLength: 250 } },
      { event: 'Finished' },
    ]);
    const a = crearActualizador(dobleApi({ actualizacion: act }), g.on);

    await a.comprobar();
    await a.instalar();

    const pcts = g.estados
      .filter((e) => e.fase === 'descargando')
      .map((e) => (e as { pct: number }).pct);
    expect(pcts).toEqual([-1, 0, 25, 50]);
    expect(g.ultimo).toEqual({ fase: 'lista', version: '0.3.0' });
  });

  it('sin tamaño declarado la barra va indeterminada, no clavada en 0%', async () => {
    // Un 0% que no se mueve parece que se ha colgado; -1 es la señal de que
    // no se sabe cuánto falta.
    const g = grabador();
    const act = dobleActualizacion([
      { event: 'Started' },
      { event: 'Progress', data: { chunkLength: 900 } },
    ]);
    const a = crearActualizador(dobleApi({ actualizacion: act }), g.on);

    await a.comprobar();
    await a.instalar();

    const pcts = g.estados
      .filter((e) => e.fase === 'descargando')
      .map((e) => (e as { pct: number }).pct);
    expect(pcts.every((p) => p === -1)).toBe(true);
  });

  it('el porcentaje no se pasa de 100 aunque lleguen más bytes de los dichos', async () => {
    const g = grabador();
    const act = dobleActualizacion([
      { event: 'Started', data: { contentLength: 100 } },
      { event: 'Progress', data: { chunkLength: 500 } },
    ]);
    const a = crearActualizador(dobleApi({ actualizacion: act }), g.on);

    await a.comprobar();
    await a.instalar();

    const pcts = g.estados
      .filter((e) => e.fase === 'descargando')
      .map((e) => (e as { pct: number }).pct);
    expect(Math.max(...pcts)).toBe(100);
  });

  it('queda lista aunque la plataforma no mande el evento Finished', async () => {
    // No todas lo emiten. Sin esto la interfaz se quedaría descargando para
    // siempre a ojos de quien mira.
    const g = grabador();
    const act = dobleActualizacion([{ event: 'Started', data: { contentLength: 10 } }]);
    const a = crearActualizador(dobleApi({ actualizacion: act }), g.on);

    await a.comprobar();
    await a.instalar();

    expect(g.ultimo).toEqual({ fase: 'lista', version: '0.3.0' });
  });

  it('dos clics seguidos no lanzan dos descargas', async () => {
    const g = grabador();
    const enCurso: (() => void)[] = [];
    const act: ActualizacionDisponible & { instalaciones: number } = {
      instalaciones: 0,
      version: '0.3.0',
      notas: '',
      descargarEInstalar() {
        act.instalaciones += 1;
        return new Promise<void>((r) => { enCurso.push(r); });
      },
    };
    const a = crearActualizador(dobleApi({ actualizacion: act }), g.on);
    await a.comprobar();

    const primera = a.instalar();
    await a.instalar();
    for (const r of enCurso) r();
    await primera;

    expect(act.instalaciones).toBe(1);
  });

  it('si la descarga falla, se cuenta aunque no fuera manual', async () => {
    // Aquí hubo un clic y una espera: callarse sería dejar a alguien mirando
    // una barra que no avanza.
    const g = grabador();
    const act = dobleActualizacion([], { falla: new Error('disco lleno') });
    const a = crearActualizador(dobleApi({ actualizacion: act }), g.on);

    await a.comprobar();
    await a.instalar();

    expect(g.ultimo).toEqual({ fase: 'error', mensaje: 'disco lleno' });
  });

  it('tras un fallo se puede reintentar', async () => {
    const g = grabador();
    const act = dobleActualizacion([], { falla: 'se cayó' });
    const a = crearActualizador(dobleApi({ actualizacion: act }), g.on);

    await a.comprobar();
    await a.instalar();
    await a.instalar();

    expect(act.instalaciones).toBe(2);
  });
});

describe('reiniciar', () => {
  it('reinicia solo cuando se le pide', async () => {
    const g = grabador();
    const api = dobleApi({ actualizacion: dobleActualizacion([{ event: 'Finished' }]) });
    const a = crearActualizador(api, g.on);

    await a.comprobar();
    await a.instalar();
    expect(api.reinicios).toBe(0);

    await a.reiniciar();
    expect(api.reinicios).toBe(1);
  });

  it('si el reinicio falla se cuenta, en vez de quedarse la app muda', async () => {
    const g = grabador();
    const api = dobleApi({ fallaReiniciar: new Error('no se pudo relanzar') });

    await crearActualizador(api, g.on).reiniciar();

    expect(g.ultimo).toEqual({ fase: 'error', mensaje: 'no se pudo relanzar' });
  });
});

describe('detectarEntorno', () => {
  /** Carga el módulo con un `@tauri-apps/api/core` de mentira. */
  async function conTauri(isTauri: boolean, empaquetado = '') {
    vi.resetModules();
    vi.doMock('@tauri-apps/api/core', () => ({
      isTauri: () => isTauri,
      invoke: async () => empaquetado,
    }));
    const { detectarEntorno } = await import('./actualizacion');
    const entorno = await detectarEntorno();
    vi.doUnmock('@tauri-apps/api/core');
    vi.resetModules();
    return entorno;
  }

  it('fuera del escritorio no hay actualizador', async () => {
    // En `pnpm dev` (navegador) no hay con quién hablar, y esto es lo que
    // deja el arranque del frontend intacto.
    expect(await conTauri(false)).toEqual({ tipo: 'sin-actualizador' });
  });

  it('instalado con apt, manda el gestor de paquetes', async () => {
    // El actualizador de Tauri intentaría `dpkg -i`, que como usuario normal
    // falla por permisos; y si funcionase estaría tocando por detrás un
    // fichero del que manda apt. Aquí no se ofrece el botón.
    expect(await conTauri(true, 'deb')).toEqual({ tipo: 'gestionado', gestor: 'deb' });
    expect(await conTauri(true, 'rpm')).toEqual({ tipo: 'gestionado', gestor: 'rpm' });
  });

  it('en AppImage, .app, msi y nsis se actualiza sola', async () => {
    for (const empaquetado of ['appimage', 'app', 'msi', 'nsis']) {
      const entorno = await conTauri(true, empaquetado);
      expect(entorno.tipo, `empaquetado ${empaquetado}`).toBe('propio');
    }
  });
});
