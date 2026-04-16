/**
 * shippie login
 *
 * OAuth 2.0 Device Authorization Grant. CLI asks the platform for a
 * device_code + user_code, opens the browser for approval, then polls
 * until the user approves, saving the resulting bearer to ~/.shippie/token.
 *
 * Flow:
 *   POST /api/auth/cli/device → device_code, user_code, verification_uri
 *   (open browser)
 *   POST /api/auth/cli/poll {device_code} → { status: "pending" } ×N → { access_token }
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { homedir, platform } from 'node:os';
import { spawn } from 'node:child_process';

interface DeviceCodeResponse {
  device_code: string;
  user_code: string;
  verification_uri: string;
  verification_uri_complete: string;
  expires_in: number;
  interval: number;
}

type PollResponse =
  | { status: 'pending' }
  | { status: 'approved'; access_token: string; user_id: string }
  | { status: 'expired' }
  | { status: 'not_found' }
  | { status: 'already_consumed' };

export async function loginCommand(opts: { api?: string; open?: boolean }) {
  const apiUrl = opts.api ?? 'https://shippie.app';

  console.log('Requesting device code…');
  const deviceRes = await fetch(`${apiUrl}/api/auth/cli/device`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ client_name: 'shippie-cli' }),
  });

  if (!deviceRes.ok) {
    console.error(`Device request failed: ${deviceRes.status} ${deviceRes.statusText}`);
    process.exit(1);
  }

  const device = (await deviceRes.json()) as DeviceCodeResponse;

  console.log('');
  console.log(`Open this URL in a browser:`);
  console.log(`  ${device.verification_uri_complete}`);
  console.log('');
  console.log(`Or go to ${device.verification_uri} and enter:`);
  console.log(`  ${device.user_code}`);
  console.log('');
  console.log(`Code expires in ${Math.round(device.expires_in / 60)} minutes. Waiting for approval…`);

  if (opts.open !== false) {
    openBrowser(device.verification_uri_complete);
  }

  const token = await pollUntilApproved(apiUrl, device.device_code, device.interval);

  const dir = resolve(homedir(), '.shippie');
  mkdirSync(dir, { recursive: true });
  const tokenPath = resolve(dir, 'token');
  writeFileSync(tokenPath, token, { mode: 0o600 });

  console.log('');
  console.log(`✓ Logged in. Token saved to ${tokenPath}`);
  console.log('');
}

async function pollUntilApproved(apiUrl: string, deviceCode: string, intervalSec: number): Promise<string> {
  const intervalMs = Math.max(1000, intervalSec * 1000);
  while (true) {
    await sleep(intervalMs);

    const res = await fetch(`${apiUrl}/api/auth/cli/poll`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ device_code: deviceCode }),
    });

    const body = (await res.json().catch(() => ({ status: 'error' }))) as PollResponse;

    if (body.status === 'pending') continue;
    if (body.status === 'approved') return body.access_token;

    if (body.status === 'expired') {
      console.error('Code expired. Run `shippie login` again.');
      process.exit(1);
    }
    if (body.status === 'not_found') {
      console.error('Device code not recognized by the server.');
      process.exit(1);
    }
    if (body.status === 'already_consumed') {
      console.error('Device code already redeemed.');
      process.exit(1);
    }
  }
}

function openBrowser(url: string): void {
  const command =
    platform() === 'darwin'
      ? 'open'
      : platform() === 'win32'
        ? 'start'
        : 'xdg-open';
  try {
    spawn(command, [url], { stdio: 'ignore', detached: true }).unref();
  } catch {
    // Best effort — user can always click the link manually
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
