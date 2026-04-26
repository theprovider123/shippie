import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [sveltekit()],
  server: {
    port: 4101 // distinct from apps/web (4100) so both can run side-by-side during canary
  }
});
