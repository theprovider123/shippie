/**
 * shippie init — scaffold a shippie.json in the current directory.
 */
import { writeFileSync, existsSync } from 'node:fs';
import { resolve, basename } from 'node:path';

export async function initCommand() {
  const cwd = process.cwd();
  const target = resolve(cwd, 'shippie.json');

  if (existsSync(target)) {
    console.log('shippie.json already exists.');
    return;
  }

  const slug = basename(cwd).toLowerCase().replace(/[^a-z0-9-]/g, '-');
  const name = basename(cwd)
    .split('-')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');

  const config = {
    version: 1,
    slug,
    type: 'app',
    name,
    category: 'tools',
    theme_color: '#0a0a0a',
    background_color: '#ffffff',
  };

  writeFileSync(target, JSON.stringify(config, null, 2) + '\n');
  console.log(`Created shippie.json for "${name}" (${slug})`);
}
