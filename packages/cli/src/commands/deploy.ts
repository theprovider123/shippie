/**
 * shippie deploy [dir]
 *
 * Zips the target directory and POSTs to the platform's /api/deploy endpoint.
 * Auto-detects common output dirs (dist, build, out, .next).
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
  opts: { slug?: string; skipBuild?: boolean; api?: string },
) {
  const targetDir = resolve(dir ?? '.');
  const slug = opts.slug ?? basename(targetDir).toLowerCase().replace(/[^a-z0-9-]/g, '-');
  const apiUrl = opts.api ?? 'https://shippie.app';

  if (!existsSync(targetDir)) {
    console.error(`Directory not found: ${targetDir}`);
    process.exit(1);
  }

  // If skip-build, find the output dir and zip it
  const outputDir = opts.skipBuild ? findOutputDir(targetDir) : '.';
  const zipRoot = resolve(targetDir, outputDir);

  console.log(`Packaging ${zipRoot} as "${slug}"...`);

  const zip = new AdmZip();
  zip.addLocalFolder(zipRoot);
  const buffer = zip.toBuffer();

  console.log(`Uploading ${(buffer.byteLength / 1024).toFixed(0)} KB...`);

  // Read auth token from ~/.shippie/token if it exists
  const tokenPath = resolve(process.env.HOME ?? '~', '.shippie', 'token');
  const token = existsSync(tokenPath) ? readFileSync(tokenPath, 'utf8').trim() : null;

  const form = new FormData();
  form.append('slug', slug);
  form.append('zip', new Blob([buffer]), 'deploy.zip');

  const headers: Record<string, string> = {};
  if (token) headers['authorization'] = `Bearer ${token}`;

  try {
    const res = await fetch(`${apiUrl}/api/deploy`, {
      method: 'POST',
      body: form,
      headers,
    });

    const json = await res.json() as Record<string, unknown>;

    if (!res.ok) {
      console.error('Deploy failed:', json.error ?? json.reason ?? res.statusText);
      process.exit(1);
    }

    console.log('');
    console.log(`Live at: ${json.live_url}`);
    console.log(`Version: v${json.version}`);
    console.log(`Files:   ${json.files}`);
    console.log('');
  } catch (err) {
    console.error('Network error:', (err as Error).message);
    process.exit(1);
  }
}
