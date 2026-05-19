/**
 * shippie wrap <upstream-url>
 *
 * URL-wrap deploys used to register an already-hosted site behind
 * `{slug}.shippie.app`. The public maker path is now local-tool-only, so the
 * command is retained as a clear migration error rather than silently creating
 * a cloud-backed Shippie app.
 *
 * Examples:
 *   shippie wrap https://mevrouw.example.com
 *   shippie wrap https://example.com --slug cool-app --name "Cool App"
 *   shippie wrap https://app.acme.io --strict-csp
 */
export interface WrapInput {
  upstreamUrl: string;
  slug: string;
  apiUrl: string;
  name?: string;
  tagline?: string;
  type?: 'app' | 'web_app' | 'website';
  category?: string;
  cspMode?: 'lenient' | 'strict';
  remix?: string;
  sourceRepo?: string;
  license?: string;
  remixable?: boolean;
  log?: (line: string) => void;
}

export async function wrapCommand(input: WrapInput): Promise<void> {
  const log = input.log ?? console.log;
  log('Shippie no longer wraps hosted cloud apps into the marketplace.');
  log('Build a local tool, then deploy the built output instead:');
  log('');
  log('  shippie deploy ./dist');
  log('');
  log('A Shippie tool must keep user data on the device, avoid external login, and pass the local-tool policy scanner.');
  throw new Error(
    `wrap retired for ${input.upstreamUrl}. Convert to shippie.local.db / shippie.local.files, then deploy a zip or build folder.`,
  );
}
