/**
 * Tipos mínimos de Node para `geometria.test.ts`, que necesita leer
 * `tokens.css` como texto.
 *
 * Por qué esto y no `@types/node` en `tsconfig.app.json`: eso metería `process`,
 * `fs`, `Buffer` y compañía en el ámbito de TODO el frontend, y en una
 * aplicación Tauri usar una API de Node en un componente es un error que
 * queremos que salte en `pnpm check`, no en tiempo de ejecución. Aquí se declara
 * solo la función que hace falta.
 *
 * Por qué no se lee el CSS con `import ... from '...?raw'`, que sería lo natural
 * en Vite: vitest sustituye por una cadena vacía cualquier import de un fichero
 * `.css`, también con `?raw` (comprobado con `css: true` y con
 * `css: { include: [/.+/] }`). Con los `.svelte` sí funciona, así que este
 * apaño es solo para el CSS.
 */
declare module 'node:fs' {
  export function readFileSync(ruta: string, codificacion: 'utf8'): string;
}
