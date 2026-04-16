#!/usr/bin/env node
/**
 * @shippie/cli — deploy apps to Shippie from the terminal.
 *
 * Commands:
 *   deploy [dir]    Deploy a directory (auto-detects build output)
 *   init            Scaffold a shippie.json
 *   whoami          Show current auth state
 *
 * MIT license.
 */
import { Command } from 'commander';
import { deployCommand } from './commands/deploy.js';
import { initCommand } from './commands/init.js';

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
  .option('--api <url>', 'Platform API URL', 'https://shippie.app')
  .action(deployCommand);

program
  .command('init')
  .description('Scaffold a shippie.json in the current directory')
  .action(initCommand);

program
  .command('whoami')
  .description('Show current auth state')
  .action(() => {
    console.log('Auth not configured yet. Run: shippie login');
  });

program.parse();
