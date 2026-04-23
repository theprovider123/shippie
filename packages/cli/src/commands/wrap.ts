/**
 * shippie wrap <upstream-url>
 *
 * Wraps an already-hosted URL as a Shippie marketplace app served via the
 * Worker reverse-proxy at `{slug}.shippie.app`. No build, no upload —
 * we just register the upstream + config, and the edge handles the rest.
 *
 * Examples:
 *   shippie wrap https://mevrouw.vercel.app
 *   shippie wrap https://example.com --slug cool-app --name "Cool App"
 *   shippie wrap https://app.acme.io --strict-csp
 */
import { postJson } from '../api.js';

export interface WrapInput {
  upstreamUrl: string;
  slug: string;
  apiUrl: string;
  name?: string;
  tagline?: string;
  type?: 'app' | 'web_app' | 'website';
  category?: string;
  cspMode?: 'lenient' | 'strict';
  log?: (line: string) => void;
}

interface WrapResponse {
  success: boolean;
  slug: string;
  live_url: string;
  runtime_config: { required_redirect_uris: string[] };
  reason?: string;
}

export async function wrapCommand(input: WrapInput): Promise<void> {
  const log = input.log ?? console.log;

  const body = {
    slug: input.slug,
    upstream_url: input.upstreamUrl,
    name: input.name ?? input.slug,
    tagline: input.tagline,
    type: input.type ?? 'app',
    category: input.category ?? 'tools',
    csp_mode: input.cspMode,
  };

  const res = await postJson<WrapResponse>(
    { apiUrl: input.apiUrl },
    '/api/deploy/wrap',
    body,
  );

  if (!res.success) {
    throw new Error(`wrap failed: ${res.reason ?? 'unknown'}`);
  }

  log(`wrapped ${res.slug}`);
  log(`  live: ${res.live_url}`);
  log('');
  log('  Add this redirect URI to your auth provider (Supabase / Auth0 / Clerk):');
  for (const uri of res.runtime_config.required_redirect_uris) {
    log(`    ${uri}`);
  }
}
