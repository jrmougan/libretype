/**
 * Lo que tiene que cumplir cualquier curso para que el alumno no se atasque.
 *
 * Devuelve la lista de problemas en vez de lanzar: un test recorre todos los
 * cursos del catálogo, de modo que añadir uno nuevo lo somete a lo mismo que al
 * temario de español sin escribir ningún test. Las comprobaciones propias del
 * español (las tildes pronto, la fila de reposo primero) siguen en
 * `lessons.test.ts`, porque hablan de ese curso y no de cualquiera.
 */
import { LAYOUTS, type Layout } from '../keyboard/layouts';
import { caracteresEscribibles, normalizarTexto } from './texto';
import type { Curso } from './tipos';

/** Por debajo no se puede medir la velocidad con un mínimo de sentido. */
const MIN_CARACTERES = 30;
/** El temario tradicional estrena diez de golpe; la carga por lección es enorme. */
const MAX_NUEVAS = 5;

export function comprobarCurso(curso: Curso, layouts: readonly Layout[] = LAYOUTS): string[] {
  const problemas: string[] = [];
  const vistas = new Set<string>();
  const ids = new Set<string>();

  const finAlfabeto = curso.finAlfabeto === undefined
    ? curso.lecciones.length - 1
    : curso.lecciones.findIndex((l) => l.id === curso.finAlfabeto);
  if (finAlfabeto < 0) problemas.push(`finAlfabeto apunta a «${curso.finAlfabeto}», que no existe`);

  curso.lecciones.forEach((l, i) => {
    if (ids.has(l.id)) problemas.push(`el identificador «${l.id}» se repite`);
    ids.add(l.id);

    for (const ch of l.nuevas) {
      if (vistas.has(ch)) problemas.push(`«${l.title}» vuelve a enseñar ${ch}`);
      vistas.add(ch);
    }

    const intrusas = [...new Set(l.text)].filter((ch) => ch !== ' ' && !vistas.has(ch));
    if (intrusas.length > 0) problemas.push(`«${l.title}» usa ${intrusas.join(' ')} antes de enseñarlas`);

    if (![...l.nuevas].some((ch) => l.text.includes(ch))) {
      problemas.push(`«${l.title}» no practica ninguna de sus teclas nuevas`);
    }
    if (l.text.length <= MIN_CARACTERES) problemas.push(`«${l.title}» es demasiado corta`);
    if (l.text !== normalizarTexto(l.text)) problemas.push(`«${l.title}» tiene el texto sin normalizar`);

    const monotonas = l.text.split(' ').filter((p) => p.length > 2 && new Set(p).size === 1);
    if (monotonas.length > 0) problemas.push(`«${l.title}» tiene relleno: ${monotonas.join(' ')}`);

    for (const layout of layouts) {
      const permitidos = caracteresEscribibles(layout);
      const imposibles = [...new Set([...l.text, ...l.nuevas])].filter((ch) => !permitidos.has(ch));
      if (imposibles.length > 0) {
        problemas.push(`«${l.title}» pide ${imposibles.join(' ')}, que no se teclea en ${layout.name}`);
      }
    }

    if (i > 0 && i <= finAlfabeto) {
      if ([...l.nuevas].length > MAX_NUEVAS) {
        problemas.push(`«${l.title}» estrena demasiadas teclas de golpe`);
      }
      if (l.cobertura <= curso.lecciones[i - 1].cobertura) {
        problemas.push(`«${l.title}» no aumenta la cobertura`);
      }
    }
    if (finAlfabeto >= 0 && i > finAlfabeto && l.cobertura !== 100) {
      problemas.push(`«${l.title}» va tras el alfabeto completo y su cobertura no es 100`);
    }
  });

  return problemas;
}
