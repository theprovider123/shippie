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
import { initCommand } from './commands/init.js';
import { loginCommand } from './commands/login.js';
import { rollbackCommand } from './commands/rollback.js';
import { statusCommand } from './commands/status.js';
import { whoamiCommand } from './commands/whoami.js';
import { wrapCommand } from './commands/wrap.js';

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

program.parse();
