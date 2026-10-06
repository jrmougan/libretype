/**
 * Tipos mínimos de `node:sqlite` para `sqlite-de-prueba.ts`.
 *
 * Mismo motivo que `keyboard/geometria.node.d.ts`: meter `@types/node` en
 * `tsconfig.app.json` abriría las API de Node a todo el frontend, y usar una
 * en un componente tiene que saltar en `pnpm check`. Aquí se declara solo lo
 * que usan los tests.
 */
declare module 'node:sqlite' {
  interface SentenciaPreparada {
    run(...valores: unknown[]): unknown;
    all(...valores: unknown[]): unknown[];
  }
  export class DatabaseSync {
    constructor(ruta: string);
    exec(sql: string): void;
    prepare(sql: string): SentenciaPreparada;
    close(): void;
  }
}
