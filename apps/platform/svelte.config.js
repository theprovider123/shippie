import adapter from '@sveltejs/adapter-cloudflare';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

const useRemoteBindings = process.env.SHIPPIE_REMOTE_BINDINGS === 'true';

/** @type {import('@sveltejs/kit').Config} */
const config = {
  preprocess: vitePreprocess(),

  kit: {
    adapter: adapter({
      // Use local platform-proxy bindings by default so production builds and
      // CI never need a Cloudflare edge-preview session. Edge preview cannot
      // host Durable Object bindings such as SIGNAL_ROOM. Developers can opt
      // into live remote resources with SHIPPIE_REMOTE_BINDINGS=true.
      platformProxy: {
        configPath: 'wrangler.toml',
        persist: '.wrangler/state',
        remoteBindings: useRemoteBindings
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
