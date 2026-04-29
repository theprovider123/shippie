import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Bundles to a static SPA. The /api/deploy zip pipeline picks up the
// `dist/` directory. Service worker + manifest are emitted as static
// files in `public/` so the bundler doesn't fight with them.
export default defineConfig({
  plugins: [react()],
  build: {
    outDir: 'dist',
    target: 'es2022',
    sourcemap: true,
  },
  server: {
    port: 5182,
  },
});
