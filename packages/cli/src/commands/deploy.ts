/**
 * shippie deploy [dir]
 *
 * Zips the target directory and POSTs to the platform.
 *
 * By default posts to /api/deploy (requires a ~/.shippie/token).
 * With --trial, posts to /api/deploy/trial — no signup needed,
 * 24-hour TTL, 50MB limit. Useful for testing the B2 trial backend.
 */
import { existsSync } from 'node:fs';
import { resolve, basename } from 'node:path';
import { createClient, type DeployResult } from '@shippie/core';
import { streamCommand } from './stream.js';

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
  const deployDir = resolve(targetDir, outputDir);

  if (opts.trial) {
    console.log(`Packaging ${deployDir} as a trial deploy...`);
  } else {
    const slug = opts.slug ?? basename(targetDir).toLowerCase().replace(/[^a-z0-9-]/g, '-');
    console.log(`Packaging ${deployDir} as "${slug}"...`);
  }

  console.log('Uploading...');

  try {
    const slug = opts.slug ?? basename(targetDir).toLowerCase().replace(/[^a-z0-9-]/g, '-');
    const client = createClient({ apiUrl });
    const result = await client.deploy({
      directory: deployDir,
      slug: opts.trial ? undefined : slug,
      trial: opts.trial,
    });

    if (!result.ok) {
      printDeployError(result);
      process.exit(1);
    }

    console.log('');
    if (opts.trial) {
      console.log(`Live at:    ${result.liveUrl}`);
      console.log(`Slug:       ${result.slug}`);
      if (result.expiresAt) console.log(`Expires at: ${result.expiresAt}`);
      if (result.claimUrl) console.log(`Claim:      ${apiUrl}${result.claimUrl}`);
      console.log('');
      console.log('Trial deploys last 24 hours. Sign in to claim the slug before it expires.');
    } else {
      console.log(`Live at: ${result.liveUrl}`);
      if (result.version != null) console.log(`Version: v${result.version}`);
    }
    if (result.files != null) console.log(`Files:   ${result.files}`);
    if (result.totalBytes != null) console.log(`Bytes:   ${result.totalBytes}`);
    if (result.deployId) console.log(`Deploy:  ${result.deployId}`);
    console.log('');

    if (opts.watch && result.deployId) {
      await streamCommand(result.deployId, { api: apiUrl, delay: '30' });
    }
  } catch (err) {
    console.error('Network error:', (err as Error).message);
    process.exit(1);
  }
}

function printDeployError(result: DeployResult): void {
  const error = result.error ?? 'unknown_error';
  if (error === 'trial_rate_limit') {
    console.error('Trial rate limit hit (3/hour/IP). Wait an hour or sign in for unlimited deploys.');
    return;
  }
  if (error === 'rate_limit') {
    console.error('Rate limit hit. Try again in a moment.');
    return;
  }
  if (error.startsWith('no_auth_token')) {
    console.error(
      'No auth token found. Run `shippie login`, set SHIPPIE_TOKEN, or retry with --trial.',
    );
    return;
  }
  console.error('Deploy failed:', error);
  const blockers = result.preflight?.blockers ?? [];
  if (blockers.length > 0) {
    console.error('');
    console.error('Blocked by:');
    for (const blocker of blockers.slice(0, 8)) {
      console.error(`- ${blocker.title}`);
      if (blocker.detail) console.error(`  ${blocker.detail}`);
    }
    if (blockers.length > 8) {
      console.error(`- ...and ${blockers.length - 8} more`);
    }
  }
}
