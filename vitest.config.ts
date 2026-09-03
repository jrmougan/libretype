import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // El motor se prueba contra un <textarea> real, no contra un doble: la
    // mitad de su trabajo es leer el valor del campo.
    environment: 'jsdom',
    include: ['src/**/*.test.ts'],
  },
});
