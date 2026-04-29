/**
 * `shippie workspace [path]` — deploy a multi-app Shippie workspace.
 */
import { createClient } from '@shippie/core';

interface WorkspaceOptions {
  api?: string;
  trial?: boolean;
  dryRun?: boolean;
  json?: boolean;
}

export async function workspaceCommand(path: string | undefined, opts: WorkspaceOptions): Promise<void> {
  const client = createClient({ apiUrl: opts.api ?? 'https://shippie.app' });

  try {
    const result = await client.workspace.deploy({
      path: path ?? '.',
      trial: opts.trial,
      dryRun: opts.dryRun,
    });

    if (opts.json) {
      console.log(JSON.stringify(result, null, 2));
      return;
    }

    if (!result.ok && result.error) {
      console.error(`Workspace failed: ${result.error}`);
      process.exit(1);
    }

    console.log('');
    console.log(`Workspace: ${result.plan.workspace}`);
    console.log('----------------');
    if (opts.dryRun) {
      console.log(`Plan file: ${result.plan.file}`);
      for (const app of result.apps) {
        const role = app.role ? ` (${app.role})` : '';
        console.log(`- ${app.slug}${role}: ${app.absoluteDirectory}`);
      }
      console.log('');
      return;
    }

    for (const app of result.apps) {
      const role = app.role ? ` (${app.role})` : '';
      if (app.result?.ok) {
        console.log(`- ${app.slug}${role}: live`);
        if (app.result.liveUrl) console.log(`  ${app.result.liveUrl}`);
        if (app.result.deployId) console.log(`  deploy: ${app.result.deployId}`);
      } else {
        console.log(`- ${app.slug}${role}: failed`);
        console.log(`  ${app.result?.error ?? 'unknown_error'}`);
      }
    }
    console.log('');

    if (!result.ok) process.exitCode = 1;
  } catch (err) {
    const message = err instanceof Error ? err.message : 'unknown_error';
    if (message === 'no_auth_token' || message === 'unauthenticated') {
      console.error('Not logged in. Run: shippie login');
      process.exit(1);
    }
    console.error(`Workspace failed: ${message}`);
    process.exit(1);
  }
}
