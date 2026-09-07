import { defineConfig } from 'vitest/config';
import { svelte } from '@sveltejs/vite-plugin-svelte';

export default defineConfig({
  plugins: [svelte()],
  resolve: { conditions: ['browser'] },
  test: {
    // El motor se prueba contra un <textarea> real, no contra un doble: la
    // mitad de su trabajo es leer el valor del campo.
    environment: 'jsdom',
    // Devuelve el `localStorage` de jsdom, que Node 24 tapa con el suyo.
    setupFiles: ['./vitest.setup.ts'],
    include: ['src/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/lib/**'],
      exclude: ['**/*.d.ts'],
      reporter: ['text', 'lcov'],
      // Umbrales fijados al nivel actual de src/lib/** para evitar regresiones.
      // Subirlos a medida que se incorporen los tests de componentes restantes.
      thresholds: {
        lines: 80,
        functions: 70,
        branches: 70,
        statements: 70,
      },
    },
  },
});
