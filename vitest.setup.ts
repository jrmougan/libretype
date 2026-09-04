/**
 * Le devuelve a jsdom su `localStorage`.
 *
 * Node 24 define globales propias `localStorage` y `sessionStorage`, todavía
 * experimentales, que valen `undefined` mientras no se arranque con
 * `--localstorage-file`. Vitest, al volcar los globales de jsdom sobre
 * `globalThis`, se salta las claves que ya existen allí y no están en su lista
 * blanca (`getWindowKeys`), así que las de Node ganan y todo test que toque
 * almacenamiento revienta con "Cannot read properties of undefined".
 *
 * No es un fallo de la app: en el navegador y en la webview el `localStorage`
 * de siempre está donde tiene que estar. Es solo el entorno de test, y por eso
 * se arregla aquí y no en `almacen.ts` ni en `preferencias.ts` — usar
 * `window.localStorage` en el código de producción para contentar a los tests
 * sería dejar que la herramienta escriba la app.
 *
 * Vitest expone el objeto JSDOM real en `globalThis.jsdom`; su `window` sí lo
 * tiene, porque el `window` global es el propio `globalThis`.
 */
const dom = (globalThis as unknown as { jsdom?: { window: Window & typeof globalThis } }).jsdom;

if (dom) {
  for (const clave of ['localStorage', 'sessionStorage'] as const) {
    const real = dom.window[clave];
    if (real && globalThis[clave] !== real) {
      Object.defineProperty(globalThis, clave, {
        value: real,
        configurable: true,
        writable: true,
      });
    }
  }
}
