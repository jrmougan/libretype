/**
 * Qué se está practicando ahora mismo, sea del temario o no. Convierte todas las
 * fuentes en la misma forma, para que la vista tenga un solo `<Drill>` y una sola
 * manera de anotar un intento.
 */
import type { Layout } from '../keyboard/layouts';
import type { EjercicioRefuerzo } from '../refuerzo';
import { objetivoLeccion } from '../storage/objetivos';
import { catalogo as catalogoApp, type Catalogo } from './catalogo';
import { esIdPropio, ID_PRACTICA_CONTINUA, ID_REFUERZO, ID_REFUERZO_SUELTO, ID_TEXTO_PROPIO } from './ids';
import { activas, problemasDeTexto, type LeccionPropia } from './personalizadas';

export interface Ejercicio {
  /** Cambia cuando hay que volver a montar la práctica desde cero. */
  clave: string;
  /** Lo que se guarda en la columna `leccion` del histórico. */
  idSesion: string;
  titulo: string;
  texto: string;
  explicacion: string;
  /** Vacío si el dato no aplica: solo lo tiene lo que sigue el temario. */
  cobertura: string;
  /** El idioma al que se refiere la cobertura; vacío si no hay cobertura. */
  idioma: string;
}

export type Seleccion =
  | { tipo: 'leccion'; id: string }
  | { tipo: 'refuerzo'; ejercicio: EjercicioRefuerzo }
  | { tipo: 'continua'; hasta: string; texto: string; intento: number }
  | { tipo: 'libre'; texto: string; intento: number };

/** En español el separador decimal es la coma, no el punto. */
export const formatearPct = (n: number): string =>
  n.toLocaleString('es-ES', { maximumFractionDigits: 1 });

const SIN_DESCRIPCION = 'Una lección tuya, para practicar a tu ritmo.';

export function ejercicioDe(
  s: Seleccion,
  propias: readonly LeccionPropia[],
  catalogo: Catalogo = catalogoApp,
): Ejercicio {
  switch (s.tipo) {
    case 'refuerzo':
      return {
        clave: `refuerzo:${s.ejercicio.text}`,
        idSesion: s.ejercicio.suelto ? ID_REFUERZO_SUELTO : ID_REFUERZO,
        titulo: s.ejercicio.titulo,
        texto: s.ejercicio.text,
        explicacion: s.ejercicio.focus,
        cobertura: '',
        idioma: '',
      };
    case 'continua': {
      const hasta = catalogo.leccion(s.hasta) ?? catalogo.primera;
      return {
        clave: `continua:${s.intento}`,
        idSesion: ID_PRACTICA_CONTINUA,
        titulo: 'Práctica continua',
        texto: s.texto,
        explicacion: `Vocabulario acumulado hasta la lección ${catalogo.indiceEnCurso(hasta.id) + 1}: ${hasta.title}.`,
        cobertura: formatearPct(hasta.cobertura),
        idioma: catalogo.cursoDe(hasta.id)?.idioma ?? '',
      };
    }
    case 'libre':
      return {
        clave: `libre:${s.intento}`,
        idSesion: ID_TEXTO_PROPIO,
        titulo: 'Texto propio',
        texto: s.texto,
        explicacion: 'Práctica libre con tu propio texto.',
        cobertura: '',
        idioma: '',
      };
    case 'leccion': {
      if (esIdPropio(s.id)) {
        const propia = propias.find((l) => l.id === s.id && l.borradaEn === null);
        if (propia) {
          return {
            // Con la fecha: si se edita mientras está abierta, cambia lo que se teclea.
            clave: `${propia.id}:${propia.actualizadaEn}`,
            idSesion: propia.id,
            titulo: propia.titulo,
            texto: propia.texto,
            explicacion: propia.descripcion || SIN_DESCRIPCION,
            cobertura: '',
            idioma: '',
          };
        }
      }
      const leccion = catalogo.leccion(s.id) ?? catalogo.primera;
      return {
        clave: leccion.id,
        idSesion: leccion.id,
        titulo: leccion.title,
        texto: leccion.text,
        explicacion: objetivoLeccion(leccion.focus),
        cobertura: formatearPct(leccion.cobertura),
        idioma: catalogo.cursoDe(leccion.id)?.idioma ?? '',
      };
    }
  }
}

/** Una personalizada se puede abrir si existe y su texto se puede teclear aquí. */
export function propiaPracticable(
  id: string,
  propias: readonly LeccionPropia[],
  layout: Layout,
): boolean {
  const l = activas(propias).find((x) => x.id === id);
  return l !== undefined && problemasDeTexto(l.texto, layout).length === 0;
}

/**
 * Por dónde seguir al abrir, o cuando la lección actual deja de existir. Nunca
 * deja al alumno en algo que no puede abrir: una personalizada borrada o una
 * lección bloqueada caen a la más avanzada que tenga abierta.
 */
export function resolverLeccion(
  guardada: string | undefined,
  superadas: ReadonlySet<string>,
  propias: readonly LeccionPropia[],
  layout: Layout,
  catalogo: Catalogo = catalogoApp,
): string {
  if (guardada !== undefined) {
    if (esIdPropio(guardada) && propiaPracticable(guardada, propias, layout)) return guardada;
    if (catalogo.estaDesbloqueada(guardada, superadas)) return guardada;
  }
  const curso = guardada === undefined ? undefined : catalogo.cursoDe(guardada)?.id;
  return catalogo.ultimaDisponible(superadas, curso).id;
}
