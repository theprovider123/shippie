/**
 * `shippie apps` — maker-owned app list.
 *
 * This is the terminal twin of the MCP apps tool: intentionally plain,
 * scriptable, and backed by @shippie/core so it can target shippie.app or
 * a future Hub with the same command.
 */
import { createClient } from '@shippie/core';

export async function appsCommand(opts: { api?: string; json?: boolean }): Promise<void> {
  const client = createClient({ apiUrl: opts.api ?? 'https://shippie.app' });

  try {
    const apps = await client.appsList();
    if (opts.json) {
      console.log(JSON.stringify({ apps }, null, 2));
      return;
    }

    if (apps.length === 0) {
      console.log('No apps yet. Try: shippie deploy ./dist');
      return;
    }

    console.log('');
    console.log('Your Shippie apps');
    console.log('-----------------');
    for (const app of apps) {
      const kind = app.kind ? ` · ${app.kind}` : '';
      const visibility = app.visibility ? ` · ${app.visibility}` : '';
      console.log(`${app.slug.padEnd(24)} ${app.status}${kind}${visibility}`);
      if (app.liveUrl) console.log(`  ${app.liveUrl}`);
    }
    console.log('');
  } catch (err) {
    const message = err instanceof Error ? err.message : 'unknown_error';
    if (message === 'no_auth_token' || message === 'unauthenticated') {
      console.error('Not logged in. Run: shippie login');
      process.exit(1);
    }
    console.error(`Could not list apps: ${message}`);
    process.exit(1);
  }
}
