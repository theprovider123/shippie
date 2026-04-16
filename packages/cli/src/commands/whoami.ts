/**
 * shippie whoami
 *
 * Verifies the local token + reports who it authenticates as.
 */
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { homedir } from 'node:os';

export async function whoamiCommand(opts: { api?: string }) {
  const apiUrl = opts.api ?? 'https://shippie.app';
  const tokenPath = resolve(homedir(), '.shippie', 'token');

  if (!existsSync(tokenPath)) {
    console.log('Not logged in. Run: shippie login');
    process.exit(1);
  }

  const token = readFileSync(tokenPath, 'utf8').trim();

  const res = await fetch(`${apiUrl}/api/auth/cli/whoami`, {
    headers: { authorization: `Bearer ${token}` },
  });

  if (res.status === 401) {
    console.log('Token is no longer valid. Run: shippie login');
    process.exit(1);
  }
  if (!res.ok) {
    console.error(`Whoami failed: ${res.status} ${res.statusText}`);
    process.exit(1);
  }

  const body = (await res.json()) as { user_id: string; email: string | null; username: string | null };
  console.log('');
  console.log(`Logged in as: ${body.email ?? body.username ?? body.user_id}`);
  console.log(`User ID:      ${body.user_id}`);
  console.log(`Token:        ${tokenPath}`);
  console.log('');
}
