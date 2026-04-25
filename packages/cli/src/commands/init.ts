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

  const name = basename(cwd)
    .split('-')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');

  const config = {
    version: 1,
    name,
    icon: './icon.png',
    theme_color: '#E8603C',
    display: 'standalone',
    categories: ['tools'],
    description: `An installable Shippie app called ${name}.`,
    badge: true,
    transitions: 'slide',
    haptics: true,
    sound: false,
    ambient: false,
    local: {
      database: false,
      files: false,
      ai: [],
      sync: false,
    },
  };

  writeFileSync(target, JSON.stringify(config, null, 2) + '\n');
  console.log(`Created shippie.json for "${name}"`);
}
