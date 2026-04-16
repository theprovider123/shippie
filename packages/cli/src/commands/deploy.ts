/**
 * shippie deploy [dir]
 *
 * Zips the target directory and POSTs to the platform.
 *
 * By default posts to /api/deploy (requires a ~/.shippie/token).
 * With --trial, posts to /api/deploy/trial — no signup needed,
 * 24-hour TTL, 50MB limit. Useful for testing the B2 trial backend.
 */
import { readFileSync, existsSync } from 'node:fs';
import { resolve, basename } from 'node:path';
import AdmZip from 'adm-zip';

const OUTPUT_DIRS = ['dist', 'build', 'out', '.output/public', 'public', '_site'];

function findOutputDir(base: string): string {
  for (const dir of OUTPUT_DIRS) {
    if (existsSync(resolve(base, dir))) return dir;
  }
  return '.';
}

export async function deployCommand(
  dir: string | undefined,
  opts: { slug?: string; skipBuild?: boolean; api?: string; trial?: boolean; watch?: boolean },
) {
  const targetDir = resolve(dir ?? '.');
  const apiUrl = opts.api ?? 'https://shippie.app';

  if (!existsSync(targetDir)) {
    console.error(`Directory not found: ${targetDir}`);
    process.exit(1);
  }

  // If skip-build, find the output dir and zip it
  const outputDir = opts.skipBuild ? findOutputDir(targetDir) : '.';
  const zipRoot = resolve(targetDir, outputDir);

  if (opts.trial) {
    console.log(`Packaging ${zipRoot} as a trial deploy...`);
  } else {
    const slug = opts.slug ?? basename(targetDir).toLowerCase().replace(/[^a-z0-9-]/g, '-');
    console.log(`Packaging ${zipRoot} as "${slug}"...`);
  }

  const zip = new AdmZip();
  zip.addLocalFolder(zipRoot);
  const buffer = zip.toBuffer();

  console.log(`Uploading ${(buffer.byteLength / 1024).toFixed(0)} KB...`);

  try {
    if (opts.trial) {
      await deployTrial({ apiUrl, buffer, watch: opts.watch ?? false });
    } else {
      const slug = opts.slug ?? basename(targetDir).toLowerCase().replace(/[^a-z0-9-]/g, '-');
      await deployAuthed({ apiUrl, slug, buffer, watch: opts.watch ?? false });
    }
  } catch (err) {
    console.error('Network error:', (err as Error).message);
    process.exit(1);
  }
}

async function deployAuthed(input: {
  apiUrl: string;
  slug: string;
  buffer: Buffer;
  watch: boolean;
}) {
  // Read auth token from ~/.shippie/token if it exists
  const tokenPath = resolve(process.env.HOME ?? '~', '.shippie', 'token');
  const token = existsSync(tokenPath) ? readFileSync(tokenPath, 'utf8').trim() : null;

  const form = new FormData();
  form.append('slug', input.slug);
  form.append('zip', new Blob([input.buffer]), 'deploy.zip');

  const headers: Record<string, string> = {};
  if (token) headers['authorization'] = `Bearer ${token}`;

  const res = await fetch(`${input.apiUrl}/api/deploy`, {
    method: 'POST',
    body: form,
    headers,
  });

  const json = (await res.json()) as Record<string, unknown>;

  if (!res.ok) {
    console.error('Deploy failed:', json.error ?? json.reason ?? res.statusText);
    process.exit(1);
  }

  console.log('');
  console.log(`Live at: ${json.live_url}`);
  console.log(`Version: v${json.version}`);
  console.log(`Files:   ${json.files}`);
  if (json.deploy_id) console.log(`Deploy:  ${json.deploy_id}`);
  console.log('');

  if (input.watch && typeof json.deploy_id === 'string') {
    const { statusCommand } = await import('./status.js');
    await statusCommand(json.deploy_id, { api: input.apiUrl, watch: true });
  }
}

async function deployTrial(input: { apiUrl: string; buffer: Buffer; watch: boolean }) {
  const form = new FormData();
  form.append('zip', new Blob([input.buffer]), 'deploy.zip');

  const res = await fetch(`${input.apiUrl}/api/deploy/trial`, {
    method: 'POST',
    body: form,
  });

  if (res.status === 429) {
    console.error('Trial rate limit hit (3/hour/IP). Wait an hour or sign in for unlimited deploys.');
    process.exit(1);
  }

  const json = (await res.json()) as Record<string, unknown>;

  if (!res.ok) {
    console.error('Trial deploy failed:', json.error ?? json.reason ?? res.statusText);
    process.exit(1);
  }

  console.log('');
  console.log(`Live at:    ${json.live_url}`);
  console.log(`Slug:       ${json.slug}`);
  console.log(`Expires at: ${json.expires_at}`);
  console.log(`Claim:      ${input.apiUrl}${json.claim_url}`);
  console.log('');
  console.log('Trial deploys last 24 hours. Sign in to claim the slug before it expires.');
  console.log('');

  if (input.watch && typeof json.deploy_id === 'string') {
    const { statusCommand } = await import('./status.js');
    await statusCommand(json.deploy_id, { api: input.apiUrl, watch: true });
  }
}
