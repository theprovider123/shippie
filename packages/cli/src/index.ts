#!/usr/bin/env node
/**
 * @shippie/cli — deploy apps to Shippie from the terminal.
 *
 * Commands:
 *   deploy [dir]         Deploy a directory (auto-detects build output)
 *     --trial            Post to /api/deploy/trial — no signup, 24h TTL
 *     --watch            Poll status until cold path completes
 *   init                 Scaffold a shippie.json
 *   status <deploy-id>   Check deploy status (use --watch to follow)
 *   whoami               Show current auth state
 *
 * MIT license.
 */
import { Command } from 'commander';
import { deployCommand } from './commands/deploy.js';
import { initCommand } from './commands/init.js';
import { statusCommand } from './commands/status.js';

const program = new Command();

program
  .name('shippie')
  .description('Ship apps to shippie.app from your terminal.')
  .version('0.0.1');

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
  .command('whoami')
  .description('Show current auth state')
  .action(() => {
    console.log('Auth not configured yet. Run: shippie login');
  });

program.parse();
