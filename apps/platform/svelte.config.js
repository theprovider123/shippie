import adapter from '@sveltejs/adapter-cloudflare';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

/** @type {import('@sveltejs/kit').Config} */
const config = {
  preprocess: vitePreprocess(),

  kit: {
    adapter: adapter({
      // Use the platform-proxy in dev so bindings resolve against the live
      // Cloudflare account when running `vite dev`.
      platformProxy: {
        configPath: 'wrangler.toml',
        persist: '.wrangler/state'
      }
    }),

    alias: {
      $components: 'src/lib/components',
      $server: 'src/lib/server',
      $stores: 'src/lib/stores'
    }
  }
};

export default config;
