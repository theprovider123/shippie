#!/usr/bin/env node
/**
 * @shippie/cli — deploy apps to Shippie from the terminal.
 *
 * Commands:
 *   login                Authenticate via browser device-code flow
 *   logout               Remove the local token
 *   whoami               Show the current authenticated user
 *   deploy [dir]         Deploy a directory (auto-detects build output)
 *     --trial            Post to /api/deploy/trial — no signup, 24h TTL
 *     --watch            Poll status until cold path completes
 *   init                 Scaffold a shippie.json
 *   status <deploy-id>   Check deploy status (use --watch to follow)
 *
 * MIT license.
 */
import { Command } from 'commander';
import { existsSync, unlinkSync } from 'node:fs';
import { resolve } from 'node:path';
import { homedir } from 'node:os';
import { deployCommand } from './commands/deploy.js';
import { graduateScaffold } from './commands/graduate.js';
import { initCommand } from './commands/init.js';
import { loginCommand } from './commands/login.js';
import { rollbackCommand } from './commands/rollback.js';
import { statusCommand } from './commands/status.js';
import { whoamiCommand } from './commands/whoami.js';
import { wrapCommand } from './commands/wrap.js';
import { inviteCreate, inviteList, inviteRevoke } from './commands/invite.js';
import { streamCommand } from './commands/stream.js';
import { classifyCommand } from './commands/classify.js';
import { installCommand } from './commands/install.js';
import { localizePlanCommand } from './commands/localize-plan.js';
import { appsCommand } from './commands/apps.js';

function deriveSlug(url: string): string {
  try {
    const host = new URL(url).hostname.replace(/^www\./, '');
    return host.split('.')[0] ?? 'app';
  } catch {
    return 'app';
  }
}

const program = new Command();

program
  .name('shippie')
  .description('Ship apps to shippie.app from your terminal.')
  .version('0.0.2');

program
  .command('login')
  .description('Authenticate via browser (device-code flow)')
  .option('--api <url>', 'Platform API URL', 'https://shippie.app')
  .option('--no-open', "Don't try to open a browser automatically")
  .action(loginCommand);

program
  .command('logout')
  .description('Remove the local Shippie token')
  .action(() => {
    const tokenPath = resolve(homedir(), '.shippie', 'token');
    if (existsSync(tokenPath)) {
      unlinkSync(tokenPath);
      console.log(`Removed ${tokenPath}`);
    } else {
      console.log('No token found — already logged out.');
    }
  });

program
  .command('whoami')
  .description('Show the current authenticated user')
  .option('--api <url>', 'Platform API URL', 'https://shippie.app')
  .action(whoamiCommand);

program
  .command('apps')
  .description('List your deployed Shippie apps')
  .option('--api <url>', 'Platform API URL', 'https://shippie.app')
  .option('--json', 'Emit JSON instead of human-readable output')
  .action(appsCommand);

program
  .command('deploy [dir]')
  .description('Deploy a directory to Shippie')
  .option('-s, --slug <slug>', 'App slug (defaults to directory name)')
  .option('--skip-build', 'Skip install + build, deploy as-is')
  .option('--trial', 'Deploy as a 24-hour no-signup trial (no auth required)')
  .option('-w, --watch', 'Poll status after the URL returns until cold work completes')
  .option('--api <url>', 'Platform API URL', 'https://shippie.app')
  .action(deployCommand);

program
  .command('init')
  .description('Scaffold a shippie.json in the current directory')
  .action(initCommand);

program
  .command('graduate <slug>')
  .description(
    'Scaffold a Capacitor wrap for a deployed Shippie app so you can ship native binaries (Phase 6 — wrapped-binary build path).',
  )
  .option('-o, --out-dir <dir>', 'Where to scaffold (default: ./<slug>-native)')
  .option('--server-url <url>', 'Override the wrapped PWA URL (default: https://<slug>.shippie.app)')
  .option('--force', 'Overwrite an existing scaffold')
  .action((slug: string, opts: { outDir?: string; serverUrl?: string; force?: boolean }) => {
    try {
      const result = graduateScaffold({
        slug,
        outDir: opts.outDir,
        serverUrl: opts.serverUrl,
        force: opts.force,
      });
      console.log(`Scaffolded ${slug} native wrap at ${result.outDir}`);
      console.log('Next steps:');
      for (const step of result.nextSteps) console.log(`  ${step}`);
    } catch (err) {
      console.error(`graduate failed: ${(err as Error).message}`);
      process.exitCode = 1;
    }
  });

program
  .command('status <deploy-id>')
  .description('Check deploy status. Use --watch to poll until complete.')
  .option('-w, --watch', 'Poll until the deploy reaches a terminal phase')
  .option('-i, --interval <ms>', 'Polling interval in milliseconds', '2000')
  .option('--api <url>', 'Platform API URL', 'https://shippie.app')
  .action(statusCommand);

program
  .command('rollback <slug>')
  .description('Point an app at a prior successful deploy')
  .option('--to <version>', 'Roll back to this specific version (default: previous)')
  .option('--api <url>', 'Platform API URL', 'https://shippie.app')
  .action(rollbackCommand);

program
  .command('wrap <upstream-url>')
  .description('Wrap an already-hosted URL as a Shippie marketplace app')
  .option('-s, --slug <slug>', 'App slug (defaults to upstream hostname)')
  .option('-n, --name <name>', 'Human-readable name (defaults to slug)')
  .option('-t, --tagline <tagline>', 'Short tagline')
  .option('--type <type>', 'app | web_app | website', 'app')
  .option('-c, --category <category>', 'Marketplace category', 'tools')
  .option('--strict-csp', 'Pass upstream CSP through instead of the default Shippie CSP')
  .option('--api <url>', 'Platform API URL', 'https://shippie.app')
  .action(
    async (
      upstreamUrl: string,
      opts: {
        slug?: string;
        name?: string;
        tagline?: string;
        type?: string;
        category?: string;
        strictCsp?: boolean;
        api?: string;
      },
    ) => {
      const type =
        opts.type === 'web_app' || opts.type === 'website' || opts.type === 'app'
          ? opts.type
          : 'app';
      await wrapCommand({
        upstreamUrl,
        slug: opts.slug ?? deriveSlug(upstreamUrl),
        apiUrl: opts.api ?? 'https://shippie.app',
        name: opts.name,
        tagline: opts.tagline,
        type,
        category: opts.category,
        cspMode: opts.strictCsp ? 'strict' : undefined,
      });
    },
  );

program
  .command('invite <slug>')
  .description('Create a link invite for a private app')
  .option('--max-uses <n>', 'Hard cap on claims', (v) => Number(v))
  .option('--expires <days>', 'Expire after this many days', (v) => Number(v))
  .option('--api <url>', 'Platform API URL', 'https://shippie.app')
  .action(
    async (
      slug: string,
      opts: { maxUses?: number; expires?: number; api?: string },
    ) => {
      await inviteCreate({
        slug,
        apiUrl: opts.api ?? 'https://shippie.app',
        maxUses: opts.maxUses,
        expiresDays: opts.expires,
      });
    },
  );

program
  .command('invites <slug>')
  .description('List active invites for an app')
  .option('--api <url>', 'Platform API URL', 'https://shippie.app')
  .action(async (slug: string, opts: { api?: string }) => {
    await inviteList({ slug, apiUrl: opts.api ?? 'https://shippie.app' });
  });

program
  .command('invite:revoke <slug> <id>')
  .description('Revoke an invite by id')
  .option('--api <url>', 'Platform API URL', 'https://shippie.app')
  .action(async (slug: string, id: string, opts: { api?: string }) => {
    await inviteRevoke({ slug, id, apiUrl: opts.api ?? 'https://shippie.app' });
  });

program
  .command('stream <deploy-id>')
  .description('Replay the deploy event stream (security, privacy, kind, health)')
  .option('--api <url>', 'Platform API URL', 'https://shippie.app')
  .option('--delay <ms>', 'Replay delay between events (server-side, capped 200)', '30')
  .action(streamCommand);

program
  .command('classify [dir]')
  .description('Classify an app directory as local | connected | cloud (offline)')
  .option('--json', 'Emit JSON instead of human-readable output')
  .action(classifyCommand);

program
  .command('install <package>')
  .description('Verify a .shippie package and install it to a Hub or local mirror')
  .option('--target <target>', 'Hub URL/host or local mirror directory', './shippie-mirror')
  .option('--origin <url>', 'Origin written into local mirror collections', 'http://hub.local')
  .option('--dry-run', 'Verify only; do not write or post the package')
  .action(installCommand);

program
  .command('localize-plan [dir]')
  .description('Preview the source migration that would localize a cloud app')
  .option('--json', 'Emit JSON instead of human-readable output')
  .option('--transforms <list>', 'Comma-separated list of transforms (supabase,firebase,auth)')
  .action(localizePlanCommand);

program.parse();
