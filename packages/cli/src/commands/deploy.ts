/**
 * shippie deploy [path]
 *
 * Zips the target directory/file and POSTs to the platform. The platform
 * runs the same Local Tool policy scanner for CLI, MCP, and browser uploads.
 *
 * By default posts to /api/deploy (requires a ~/.shippie/token).
 * With --trial, posts to /api/deploy/trial — no signup needed,
 * 24-hour TTL, 50MB limit. Useful for testing the B2 trial backend.
 */
import { existsSync, statSync } from 'node:fs';
import { resolve, basename, extname } from 'node:path';
import { createClient, type DeployResult, type DeployVisibility } from '@shippie/core';
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
  opts: {
    slug?: string;
    remix?: string;
    skipBuild?: boolean;
    api?: string;
    trial?: boolean;
    watch?: boolean;
    visibility?: string;
    org?: string;
    private?: boolean;
    unlisted?: boolean;
    public?: boolean;
    team?: boolean;
  },
) {
  const target = resolve(dir ?? '.');
  const apiUrl = opts.api ?? 'https://shippie.app';

  if (!existsSync(target)) {
    console.error(`Path not found: ${target}`);
    process.exit(1);
  }

  const isFile = statSync(target).isFile();
  const visibility = resolveVisibility(opts);
  if (visibility === 'team' && !opts.org) {
    console.error('Team deploys require --org <org-id-or-slug>.');
    process.exit(1);
  }

  // If skip-build, find the output dir and zip it
  const outputDir = opts.skipBuild && !isFile ? findOutputDir(target) : '.';
  const deployPath = isFile ? target : resolve(target, outputDir);

  if (opts.trial) {
    console.log(`Packaging ${deployPath} as a trial deploy${opts.remix ? ` remixing ${opts.remix}` : ''}...`);
  } else {
    const slug = opts.slug ?? slugFromPath(target, isFile);
    const visibilityLabel = visibility ? ` (${visibility})` : isFile ? ' (unlisted)' : '';
    console.log(`Packaging ${deployPath} as "${slug}"${visibilityLabel}${opts.remix ? ` remixing ${opts.remix}` : ''}...`);
  }

  console.log('Uploading...');
  console.log('Policy: local tools only — no external login, cloud user-data storage, ads, trackers, or silent user-data egress.');

  try {
    const slug = opts.slug ?? slugFromPath(target, isFile);
    const client = createClient({ apiUrl });
    const result = await client.deploy({
      directory: deployPath,
      slug: opts.trial ? undefined : slug,
      trial: opts.trial,
      remixFrom: opts.remix,
      visibility,
      organization: opts.org,
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
      if (result.visibility) console.log(`Visibility: ${result.visibility}`);
    }
    if (result.files != null) console.log(`Files:   ${result.files}`);
    if (result.totalBytes != null) console.log(`Bytes:   ${result.totalBytes}`);
    if (result.deployId) console.log(`Deploy:  ${result.deployId}`);
    if (opts.remix) console.log(`Remix:   ${opts.remix}`);
    console.log('');

    if (opts.watch && result.deployId) {
      await streamCommand(result.deployId, { api: apiUrl, delay: '30' });
    }
  } catch (err) {
    console.error('Network error:', (err as Error).message);
    process.exit(1);
  }
}

function resolveVisibility(opts: {
  visibility?: string;
  private?: boolean;
  unlisted?: boolean;
  public?: boolean;
  team?: boolean;
}): DeployVisibility | undefined {
  if (
    opts.visibility &&
    opts.visibility !== 'public' &&
    opts.visibility !== 'unlisted' &&
    opts.visibility !== 'private' &&
    opts.visibility !== 'team'
  ) {
    console.error('Invalid visibility. Use one of: public, unlisted, private, team.');
    process.exit(1);
  }
  const aliases = [
    opts.private ? 'private' : null,
    opts.unlisted ? 'unlisted' : null,
    opts.public ? 'public' : null,
    opts.team ? 'team' : null,
  ].filter((value): value is DeployVisibility => value !== null);
  const requested = opts.visibility ? [opts.visibility as DeployVisibility, ...aliases] : aliases;
  const distinct = new Set(requested);
  if (distinct.size > 1) {
    console.error('Choose only one visibility: --private, --unlisted, --public, or --visibility.');
    process.exit(1);
  }
  return requested[0];
}

function slugFromPath(path: string, isFile: boolean): string {
  const name = basename(path, isFile ? extname(path) : undefined);
  return name.toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, '') || 'tool';
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
