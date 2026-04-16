/**
 * Clone a GitHub repo to a temp directory.
 *
 * Uses the installation token for private repos, falls back to
 * unauthenticated clone for public repos (deploy button path).
 *
 * Returns the absolute path to the cloned directory.
 *
 * Spec v5 §4.
 */
import { mkdtemp } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { spawn } from 'node:child_process';

export interface CloneOptions {
  repoUrl: string;
  branch?: string;
  token?: string;
  timeoutMs?: number;
}

export async function cloneRepo(opts: CloneOptions): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'shippie-clone-'));

  let cloneUrl = opts.repoUrl;
  // Inject token for authenticated clone
  if (opts.token && cloneUrl.startsWith('https://github.com/')) {
    cloneUrl = cloneUrl.replace(
      'https://github.com/',
      `https://x-access-token:${opts.token}@github.com/`,
    );
  }

  const args = ['clone', '--depth', '1'];
  if (opts.branch) args.push('--branch', opts.branch);
  args.push(cloneUrl, dir);

  await runGit(args, opts.timeoutMs ?? 120_000);
  return dir;
}

function runGit(args: string[], timeoutMs: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn('git', args, { stdio: 'pipe' });
    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      reject(new Error('git clone timed out'));
    }, timeoutMs);

    let stderr = '';
    child.stderr?.on('data', (d: Buffer) => {
      stderr += d.toString();
    });

    child.on('error', (err) => {
      clearTimeout(timer);
      reject(err);
    });
    child.on('exit', (code) => {
      clearTimeout(timer);
      if (code !== 0) reject(new Error(`git clone failed (exit ${code}): ${stderr}`));
      else resolve();
    });
  });
}
