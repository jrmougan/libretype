import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // El motor se prueba contra un <textarea> real, no contra un doble: la
    // mitad de su trabajo es leer el valor del campo.
    environment: 'jsdom',
    // Devuelve el `localStorage` de jsdom, que Node 24 tapa con el suyo.
    setupFiles: ['./vitest.setup.ts'],
    include: ['src/**/*.test.ts'],
  },
});
