/**
 * Lecciones que escribe el alumno (o su profesora): modelo, validación y formato
 * de intercambio. Sin almacén ni interfaz, para poder probarlo entero.
 *
 * Qué significan, y por qué:
 *
 * - **No desbloquean temario ni entran en objetivos, repaso o dificultad.** Esos
 *   módulos solo preguntan al catálogo, y estas no están en él.
 * - **Su marca exige lo mismo que cualquiera** (`PCT_MINIMO_PARA_RECORD`), pero no
 *   fija la mejor marca global: `ids.ts` explica el porqué.
 * - **No alimentan el dominio por tecla.** También en `ids.ts`.
 * - **Borrar una no borra lo que costó practicarla.** Se queda una lápida con el
 *   nombre y sin el texto, para que el histórico siga teniendo a quién apuntar.
 *   «Borrar mi progreso» se lleva las lápidas, porque ya no hay histórico al que
 *   poner nombre, pero **no** las lecciones vivas: son trabajo de alguien, no
 *   progreso, y en un aula quien pulsa ese botón puede no ser quien las escribió.
 * - **Editar conserva el identificador y el histórico.** Sigue siendo la misma
 *   lección; quien la edita a fondo puede duplicarla para empezar de cero.
 */
import type { Layout } from '../keyboard/layouts';
import { esIdPropio, PREFIJO_PROPIA } from './ids';
import { buscarNoEscribibles, normalizarTexto, type CaracterNoEscribible } from './texto';

export interface LeccionPropia {
  id: string;
  titulo: string;
  descripcion: string;
  /** Normalizado: es exactamente lo que se teclea. Vacío en una lápida. */
  texto: string;
  creadaEn: string;
  actualizadaEn: string;
  /** Si no es null, es una lápida: solo queda el nombre para el histórico. */
  borradaEn: string | null;
}

export interface Borrador {
  titulo: string;
  descripcion: string;
  texto: string;
}

export const LIMITES = {
  titulo: 80,
  descripcion: 280,
  /** Por debajo, la velocidad medida es puro ruido. */
  textoMin: 10,
  /** Unas tres páginas. Más ya no es una lección, y cada letra es un nodo del DOM. */
  textoMax: 5000,
  /** Lecciones vivas. Las lápidas no cuentan. */
  lecciones: 200,
  /** Un fichero mayor no puede salir de esta aplicación. */
  ficheroBytes: 4 * 1024 * 1024,
  /**
   * Entradas de un fichero de lecciones. Validarlas cuesta y cada rechazada se
   * cuenta, así que sin tope un fichero pequeño y hostil congela la aplicación. Da
   * margen sobre `lecciones` porque el fichero puede ser la suma de los de una clase.
   */
  ficheroEntradas: 1000,
  /** La copia de seguridad lleva todo el histórico, y este sí que crece con los años. */
  copiaBytes: 32 * 1024 * 1024,
  /**
   * Cada identificador distinto es una fila del panel de Progreso, y el progreso se
   * queda en disco: sin tope, una copia fabricada lo deja sin responder cada vez que
   * se abre. Nadie llega aquí practicando (el temario y sus 200 lecciones caben de
   * sobra, también con las que haya ido borrando). Medido: 5000 abre en 1,1 s.
   */
  copiaIdentificadores: 2000,
} as const;

export interface ErrorCampo {
  campo: keyof Borrador;
  mensaje: string;
}

const longitud = (s: string): number => [...s].length;
const recortar = (s: string, max: number): string => [...s].slice(0, max).join('').trim();

/** Una línea: el título y la descripción no se teclean, solo se leen. */
function limpiarLinea(s: string): string {
  return normalizarTexto(s).replace(/\p{Cc}/gu, '');
}

/** Dónde está y qué hacer con él. Informa de lo que pasa; nunca «error» ni «inválido». */
export function mensajeCaracter(c: CaracterNoEscribible, layout: Layout, unaLinea: boolean): string {
  const donde = unaLinea
    ? `carácter ${c.columna}`
    : `línea ${c.linea}, carácter ${c.columna}`;
  const contexto = c.palabra !== c.caracter ? `, en «${c.palabra}»` : '';
  const repetido = c.veces > 1 ? ` Aparece ${c.veces} veces.` : '';
  const que = c.acentoSuelto
    ? `es un acento sin su letra, y cada sistema lo escribe a su manera. Ponlo sobre la vocal o quítalo.`
    : `no está en el teclado elegido (${layout.name}). Puedes cambiarlo por otro o quitarlo.`;
  return `«${c.visible}» (${donde}${contexto}) ${que}${repetido}`;
}

/** Cuántos caracteres se detallan: con más, la lista ya no ayuda a nadie. */
const MAX_DETALLES = 6;

/** Lo que impide teclear este texto, en frases listas para enseñar. */
export function problemasDeTexto(texto: string, layout: Layout): string[] {
  const noEscribibles = buscarNoEscribibles(texto, layout);
  const unaLinea = !/[\r\n]/.test(texto.trim());
  const mensajes = noEscribibles
    .slice(0, MAX_DETALLES)
    .map((c) => mensajeCaracter(c, layout, unaLinea));
  if (noEscribibles.length > MAX_DETALLES) {
    mensajes.push(`Y ${noEscribibles.length - MAX_DETALLES} caracteres más que tampoco están en este teclado.`);
  }
  return mensajes;
}

export type ResultadoValidacion =
  | { ok: true; limpio: Borrador }
  | { ok: false; errores: ErrorCampo[] };

/** Lo que se comprueba antes de guardar, venga del formulario o de un fichero. */
export function validarBorrador(b: Borrador, layout: Layout): ResultadoValidacion {
  const titulo = limpiarLinea(b.titulo);
  const descripcion = limpiarLinea(b.descripcion);
  const texto = normalizarTexto(b.texto);
  const errores: ErrorCampo[] = [];

  if (!titulo) errores.push({ campo: 'titulo', mensaje: 'Ponle un nombre para encontrarla luego en la lista.' });
  if (longitud(titulo) > LIMITES.titulo) {
    errores.push({ campo: 'titulo', mensaje: `El nombre tiene ${longitud(titulo)} caracteres y caben ${LIMITES.titulo}.` });
  }
  if (longitud(descripcion) > LIMITES.descripcion) {
    errores.push({ campo: 'descripcion', mensaje: `La descripción tiene ${longitud(descripcion)} caracteres y caben ${LIMITES.descripcion}.` });
  }
  if (longitud(texto) < LIMITES.textoMin) {
    errores.push({ campo: 'texto', mensaje: `Hacen falta al menos ${LIMITES.textoMin} caracteres para poder medir el ritmo. Ahora hay ${longitud(texto)}.` });
  }
  if (longitud(texto) > LIMITES.textoMax) {
    errores.push({ campo: 'texto', mensaje: `El texto tiene ${longitud(texto)} caracteres y caben ${LIMITES.textoMax}. Puedes repartirlo en varias lecciones.` });
  }
  for (const mensaje of problemasDeTexto(b.texto, layout)) errores.push({ campo: 'texto', mensaje });

  return errores.length > 0 ? { ok: false, errores } : { ok: true, limpio: { titulo, descripcion, texto } };
}

/** `randomUUID` exige contexto seguro; el respaldo basta para no chocar en un equipo. */
export function nuevoIdPropio(): string {
  const azar = globalThis.crypto?.randomUUID?.()
    ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
  return `${PREFIJO_PROPIA}${azar}`;
}

export function crearLeccion(b: Borrador, ahora: string, id = nuevoIdPropio()): LeccionPropia {
  return { ...b, id, creadaEn: ahora, actualizadaEn: ahora, borradaEn: null };
}

export function editarLeccion(l: LeccionPropia, b: Borrador, ahora: string): LeccionPropia {
  return { ...l, ...b, actualizadaEn: ahora };
}

/** Una copia es otra lección: otro identificador y sin el histórico de la original. */
export function duplicarLeccion(l: LeccionPropia, ahora: string): LeccionPropia {
  const prefijo = 'Copia de ';
  const titulo = recortar(prefijo + l.titulo, LIMITES.titulo);
  return crearLeccion({ titulo, descripcion: l.descripcion, texto: l.texto }, ahora);
}

export function lapidaDe(l: LeccionPropia, ahora: string): LeccionPropia {
  return { ...l, descripcion: '', texto: '', actualizadaEn: ahora, borradaEn: ahora };
}

/** Las que se pueden practicar, ordenadas por nombre. */
export function activas(lista: readonly LeccionPropia[]): LeccionPropia[] {
  return lista
    .filter((l) => l.borradaEn === null)
    .sort((a, b) => a.titulo.localeCompare(b.titulo, 'es'));
}

const fechaValida = (v: unknown): string | null =>
  typeof v === 'string' && Number.isFinite(Date.parse(v)) ? v : null;

const FECHA_DESCONOCIDA = new Date(0).toISOString();

/**
 * Lo que venga de disco o de una copia de seguridad. No valida contra el teclado
 * —eso se decide al practicar, porque la distribución puede cambiar— y arregla lo
 * que se pueda antes que perder lo que alguien escribió. Devuelve null solo si no
 * queda nada que conservar.
 */
export function sanearLeccion(crudo: unknown): LeccionPropia | null {
  if (typeof crudo !== 'object' || crudo === null) return null;
  const o = crudo as Record<string, unknown>;
  if (!esIdPropio(o.id)) return null;

  const borradaEn = fechaValida(o.borradaEn);
  const texto = typeof o.texto === 'string' ? recortar(normalizarTexto(o.texto), LIMITES.textoMax) : '';
  if (!texto && !borradaEn) return null;

  const titulo = typeof o.titulo === 'string' ? recortar(limpiarLinea(o.titulo), LIMITES.titulo) : '';
  const descripcion = typeof o.descripcion === 'string'
    ? recortar(limpiarLinea(o.descripcion), LIMITES.descripcion)
    : '';
  return {
    id: o.id,
    titulo: titulo || 'Lección sin nombre',
    descripcion: borradaEn ? '' : descripcion,
    texto: borradaEn ? '' : texto,
    creadaEn: fechaValida(o.creadaEn) ?? FECHA_DESCONOCIDA,
    actualizadaEn: fechaValida(o.actualizadaEn) ?? FECHA_DESCONOCIDA,
    borradaEn,
  };
}

/** Sanea una lista entera; lo que no sea una lista se trata como lista vacía. */
export function sanearLista(crudo: unknown): LeccionPropia[] {
  if (!Array.isArray(crudo)) return [];
  const porId = new Map<string, LeccionPropia>();
  for (const c of crudo) {
    const l = sanearLeccion(c);
    if (l) porId.set(l.id, l);
  }
  return [...porId.values()];
}

export interface Restauracion {
  aEscribir: LeccionPropia[];
  /** Nombres de las que no han cabido en el límite de lecciones. */
  sinSitio: string[];
}

/**
 * Qué escribir al restaurar una copia de seguridad: de cada lección, la versión
 * más reciente. Una lápida también tiene fecha, así que un borrado posterior a la
 * copia sigue siéndolo. Lo que no está en la copia se queda como está: restaurar
 * el progreso no puede llevarse lecciones que alguien escribió después.
 *
 * Las fechas se comparan como fechas: `sanearLeccion` admite lo que entienda
 * `Date.parse`, y como texto «Thu Jan 01 2099» ganaría a cualquier fecha ISO.
 */
export function aplicarDeCopia(
  actuales: readonly LeccionPropia[],
  deLaCopia: readonly LeccionPropia[],
): Restauracion {
  const porId = new Map(actuales.map((l) => [l.id, l]));
  let vivas = actuales.filter((l) => l.borradaEn === null).length;
  const restauracion: Restauracion = { aEscribir: [], sinSitio: [] };

  for (const l of deLaCopia) {
    const previa = porId.get(l.id);
    if (previa && Date.parse(l.actualizadaEn) <= Date.parse(previa.actualizadaEn)) continue;
    const previaViva = previa !== undefined && previa.borradaEn === null;
    if (l.borradaEn === null && !previaViva) {
      if (vivas >= LIMITES.lecciones) { restauracion.sinSitio.push(l.titulo); continue; }
      vivas++;
    } else if (l.borradaEn !== null && previaViva) {
      vivas--;
    }
    restauracion.aEscribir.push(l);
  }
  return restauracion;
}

/* --- Exportar e importar --------------------------------------------------- */

export const FORMATO_EXPORTACION = 'libretype-lecciones';
export const VERSION_EXPORTACION = 1;

/** Solo las vivas: exportar es compartir, y una lápida no le sirve a nadie más. */
export function serializarExportacion(lista: readonly LeccionPropia[], ahora: string): string {
  return JSON.stringify({
    formato: FORMATO_EXPORTACION,
    version: VERSION_EXPORTACION,
    creadoEn: ahora,
    lecciones: lista.filter((l) => l.borradaEn === null).map((l) => ({
      id: l.id,
      titulo: l.titulo,
      descripcion: l.descripcion,
      texto: l.texto,
      creadaEn: l.creadaEn,
      actualizadaEn: l.actualizadaEn,
    })),
  }, null, 2);
}

export function nombreFichero(ahora: string, titulo?: string): string {
  const fecha = ahora.slice(0, 10);
  const parte = (titulo ?? 'lecciones')
    .normalize('NFD').replace(/\p{M}/gu, '').toLowerCase()
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40);
  return `libretype-${parte || 'leccion'}-${fecha}.json`;
}

export interface Entrante extends Borrador {
  /** El que traía el fichero, si es del espacio de nombres propio. */
  id: string | null;
  creadaEn: string | null;
}

export interface Rechazada {
  /** Cómo se llama en el fichero, para que se pueda encontrar. */
  nombre: string;
  motivos: string[];
}

export interface FicheroLeido {
  validas: Entrante[];
  rechazadas: Rechazada[];
}

/**
 * Lee un fichero exportado. Si el fichero entero no se entiende, lanza con una
 * frase lista para enseñar; si solo fallan algunas lecciones, las otras entran y
 * las que no se cuentan aparte con su motivo.
 */
export function parsearExportacion(json: string, layout: Layout): FicheroLeido {
  let datos: unknown;
  try {
    datos = JSON.parse(json);
  } catch {
    throw new Error('Este fichero no se puede leer: no tiene formato JSON.');
  }
  const o = (typeof datos === 'object' && datos !== null ? datos : {}) as Record<string, unknown>;
  if (o.formato !== FORMATO_EXPORTACION) {
    throw new Error('Este fichero no contiene lecciones de LibreType.');
  }
  if (!Number.isInteger(o.version) || (o.version as number) < 1) {
    throw new Error('No se reconoce la versión de este fichero de lecciones.');
  }
  if ((o.version as number) > VERSION_EXPORTACION) {
    throw new Error('Este fichero se hizo con una versión más nueva de LibreType. Actualiza la aplicación para abrirlo.');
  }
  if (!Array.isArray(o.lecciones)) {
    throw new Error('Este fichero no trae ninguna lista de lecciones.');
  }
  if (o.lecciones.length > LIMITES.ficheroEntradas) {
    throw new Error(`Este fichero trae ${o.lecciones.length} lecciones y aquí caben ${LIMITES.lecciones}. Puedes repartirlas en ficheros más pequeños.`);
  }

  const validas: Entrante[] = [];
  const rechazadas: Rechazada[] = [];
  o.lecciones.forEach((crudo: unknown, i: number) => {
    const l = (typeof crudo === 'object' && crudo !== null ? crudo : {}) as Record<string, unknown>;
    const nombre = typeof l.titulo === 'string' && l.titulo.trim()
      ? recortar(limpiarLinea(l.titulo), LIMITES.titulo)
      : `Lección ${i + 1} del fichero`;
    const v = validarBorrador({
      titulo: typeof l.titulo === 'string' ? l.titulo : '',
      descripcion: typeof l.descripcion === 'string' ? l.descripcion : '',
      texto: typeof l.texto === 'string' ? l.texto : '',
    }, layout);
    if (!v.ok) {
      rechazadas.push({ nombre, motivos: v.errores.map((e) => e.mensaje) });
      return;
    }
    validas.push({
      ...v.limpio,
      // Lo que no sea de nuestro espacio de nombres se ignora: un fichero que diga
      // `"id": "reposo"` no puede hacerse pasar por una lección del temario.
      id: esIdPropio(l.id) ? l.id : null,
      creadaEn: fechaValida(l.creadaEn),
    });
  });

  return { validas, rechazadas };
}

/** Cuántas lecciones se detallan al importar: con más, la lista ya no ayuda a nadie. */
const MAX_AVISOS = 5;

/** Lo que no ha entrado de un fichero, en frases listas para enseñar y con tope. */
export function avisosDeImportacion(leido: FicheroLeido, fusion: Fusion): string[] {
  const textos: string[] = [];
  const { sinSitio } = fusion;
  if (sinSitio.length > 0) {
    const nombres = sinSitio.slice(0, MAX_AVISOS).join(', ');
    const resto = sinSitio.length > MAX_AVISOS ? ` y ${sinSitio.length - MAX_AVISOS} más` : '';
    textos.push(`No han cabido, porque el límite son ${LIMITES.lecciones}: ${nombres}${resto}.`);
  }
  for (const r of leido.rechazadas.slice(0, MAX_AVISOS)) {
    textos.push(`«${r.nombre}» no se ha importado. ${r.motivos.join(' ')}`);
  }
  if (leido.rechazadas.length > MAX_AVISOS) {
    textos.push(`Y ${leido.rechazadas.length - MAX_AVISOS} lecciones más que tampoco se han importado.`);
  }
  return textos;
}

export interface Fusion {
  aGuardar: LeccionPropia[];
  /** Ya estaban, con el mismo nombre y el mismo texto. */
  repetidas: number;
  /** No han cabido en el límite de lecciones. */
  sinSitio: string[];
}

/**
 * Qué guardar al importar. Importar **nunca pisa** lo que ya hay: si el
 * identificador existe con otro contenido, entra como lección aparte con uno
 * nuevo. Sí puede resucitar una lápida con su identificador: así el histórico que
 * tenía vuelve a tener lección. Importar dos veces el mismo fichero no duplica.
 */
export function fusionarImportadas(
  actuales: readonly LeccionPropia[],
  entrantes: readonly Entrante[],
  ahora: string,
): Fusion {
  const porId = new Map(actuales.map((l) => [l.id, l]));
  const vigentes = actuales.filter((l) => l.borradaEn === null);
  const contenidos = new Set(vigentes.map((l) => `${l.titulo}\n${l.texto}`));
  let vivas = vigentes.length;
  const fusion: Fusion = { aGuardar: [], repetidas: 0, sinSitio: [] };

  for (const e of entrantes) {
    const contenido = `${e.titulo}\n${e.texto}`;
    if (contenidos.has(contenido)) { fusion.repetidas++; continue; }
    if (vivas >= LIMITES.lecciones) { fusion.sinSitio.push(e.titulo); continue; }

    const previa = e.id ? porId.get(e.id) : undefined;
    const reutilizable = e.id !== null && (!previa || previa.borradaEn !== null);
    const id = reutilizable ? (e.id as string) : nuevoIdPropio();
    const l: LeccionPropia = {
      id,
      titulo: e.titulo,
      descripcion: e.descripcion,
      texto: e.texto,
      creadaEn: e.creadaEn ?? ahora,
      actualizadaEn: ahora,
      borradaEn: null,
    };
    fusion.aGuardar.push(l);
    porId.set(id, l);
    contenidos.add(contenido);
    vivas++;
  }

  return fusion;
}
