import { svelte } from '@sveltejs/vite-plugin-svelte';
import { defineConfig } from 'vite';

const host = process.env.TAURI_DEV_HOST;

// Configuración adaptada para Tauri v2:
// 1. clearScreen: false para no ocultar errores de Rust/Tauri en la consola.
// 2. Puerto fijo y estricto (5173): si está ocupado falla explícitamente en
//    vez de abrir en 5174 y dejar a Tauri apuntando a una pantalla en blanco.
// 3. build.target: 'safari13' en Linux/macOS (WebKitGTK/WKWebView) y 'chrome105'
//    en Windows (WebView2), garantizando compatibilidad con WebKit antiguo en
//    distribuciones Linux LTS.
export default defineConfig({
  plugins: [svelte()],
  clearScreen: false,
  server: {
    port: 5173,
    strictPort: true,
    host: host || false,
    hmr: host
      ? {
          protocol: 'ws',
          host,
          port: 1421,
        }
      : undefined,
    watch: {
      // Evita recargas del dev server cuando Rust/cargo compila src-tauri
      ignored: ['**/src-tauri/**'],
    },
  },
  envPrefix: ['VITE_', 'TAURI_ENV_*'],
  build: {
    target:
      process.env.TAURI_ENV_PLATFORM === 'windows'
        ? 'chrome105'
        : 'safari13',
    minify: !process.env.TAURI_ENV_DEBUG,
    sourcemap: !!process.env.TAURI_ENV_DEBUG,
  },
});
