/**
 * Filtro opcional para el temblor: ignorar la repetición involuntaria.
 *
 * Con temblor esencial o párkinson es frecuente que un dedo rebote sobre la
 * tecla y entren dos letras iguales seguidas en unas decenas de milisegundos.
 * Contarlo como error castiga algo que no es un fallo de mecanografía. Los
 * sistemas tienen «teclas de rebote» para esto, pero hay que saber que
 * existen; este filtro es la versión dentro de la app, y viene apagado.
 *
 * **Dónde actúa, y por qué ahí.** No toca el motor (`engine.ts`) ni su canal B,
 * que lee el valor del campo y es lo único que da igual el motor web y el
 * método de entrada. El filtro va un paso antes: cancela el `beforeinput` de la
 * pulsación repetida, así que ese carácter nunca llega al campo y el canal B no
 * tiene nada que ignorar. Para el motor es como si no se hubiera pulsado.
 *
 * Riesgos conocidos, que son el motivo de que venga apagado:
 *
 * - Solo filtra `insertText`. Las letras con tilde llegan por composición
 *   (`insertCompositionText`/`insertFromComposition`), cuyo `beforeinput` no
 *   se puede cancelar, y además cancelar a mitad de una composición rompería
 *   el acento. Un «áá» por temblor sí entra.
 * - Una doble letra legítima («ll», «rr», «cc») tecleada en menos de
 *   `MS_REPETICION` se comería la segunda. A ritmo humano el mismo dedo no
 *   repite tecla tan deprisa (lo normal es más de 100 ms), pero es posible.
 * - Depende de que el motor web dispare `beforeinput` cancelable. WebKitGTK,
 *   WKWebView y WebView2 lo hacen; si alguno dejara de hacerlo, el filtro se
 *   quedaría sin efecto, que es un fallo seguro (nunca come texto de más).
 */

/** Por debajo de esto, dos caracteres iguales seguidos se toman por rebote. */
export const MS_REPETICION = 60;

export interface Entrada {
  inputType: string;
  data: string | null;
  isComposing: boolean;
}

export interface FiltroTemblor {
  /** `true` si esta entrada es un rebote y hay que cancelarla. */
  debeIgnorar(e: Entrada, ahora: number): boolean;
  /** Olvida la última pulsación (al reiniciar o borrar). */
  olvidar(): void;
}

export function crearFiltroTemblor(ms = MS_REPETICION): FiltroTemblor {
  let ultimo: { data: string; t: number } | null = null;
  return {
    debeIgnorar(e, ahora) {
      if (e.inputType !== 'insertText' || e.isComposing || !e.data || [...e.data].length !== 1) {
        // Borrar, pegar o componer: lo siguiente ya no puede ser un rebote de
        // lo anterior.
        ultimo = null;
        return false;
      }
      const rebote = ultimo !== null && ultimo.data === e.data && ahora - ultimo.t < ms;
      // Se actualiza también al ignorar: una tecla que se queda pulsada repite
      // cada ~30 ms, y así se ignora la ráfaga entera y no una de cada dos.
      ultimo = { data: e.data, t: ahora };
      return rebote;
    },
    olvidar() { ultimo = null; },
  };
}
