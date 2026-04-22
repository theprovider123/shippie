/**
 * shippie rollback <slug>
 *
 * Point an app at an earlier version. Defaults to "the previous
 * successful deploy"; pass --to <version> to pick a specific one.
 *
 *   shippie rollback my-app
 *   shippie rollback my-app --to 7
 *
 * The server re-writes the DB's active pointer and the worker's KV
 * `active` key; the PWA manifest and per-app CSP are not re-written
 * (CSP reflects whatever the previous deploy left). The response
 * surfaces `csp_stale: true` as a hint to redeploy if the rolled-back
 * version relies on different allowed_connect_domains.
 */
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { homedir } from 'node:os';

interface RollbackSuccess {
  success: true;
  slug: string;
  from_version: number | null;
  to_version: number;
  deploy_id: string;
  csp_stale: true;
}

interface RollbackFailure {
  error: string;
}

export async function rollbackCommand(
  slug: string,
  opts: { to?: string; api?: string },
) {
  const apiUrl = opts.api ?? 'https://shippie.app';
  const tokenPath = resolve(homedir(), '.shippie', 'token');

  if (!existsSync(tokenPath)) {
    console.error('Not logged in. Run: shippie login');
    process.exit(1);
  }

  const token = readFileSync(tokenPath, 'utf8').trim();

  const body: Record<string, unknown> = { slug };
  if (opts.to != null) {
    const v = Number(opts.to);
    if (!Number.isFinite(v) || v <= 0) {
      console.error(`Invalid --to version: ${opts.to}. Must be a positive integer.`);
      process.exit(1);
    }
    body.to_version = v;
  } else {
    body.to = 'previous';
  }

  const res = await fetch(`${apiUrl}/api/deploy/rollback`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${token}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  const payload = (await res.json()) as RollbackSuccess | RollbackFailure;

  if (!res.ok || 'error' in payload) {
    const reason = 'error' in payload ? payload.error : `http_${res.status}`;
    console.error(`Rollback failed: ${reason}`);
    process.exit(1);
  }

  console.log('');
  console.log(`Rolled back ${payload.slug}`);
  console.log(`  from version: ${payload.from_version ?? '(none)'}`);
  console.log(`  to version:   ${payload.to_version}`);
  console.log(`  deploy id:    ${payload.deploy_id}`);
  if (payload.csp_stale) {
    console.log('');
    console.log('  Note: per-app CSP still reflects the version you rolled off of.');
    console.log('  Redeploy to refresh if allowed_connect_domains has changed.');
  }
  console.log('');
}
