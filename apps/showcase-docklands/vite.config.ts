import { defineConfig } from 'vite';

export default defineConfig({
  build: { outDir: 'dist', target: 'es2022', sourcemap: false },
  server: { port: 5263 },
});
