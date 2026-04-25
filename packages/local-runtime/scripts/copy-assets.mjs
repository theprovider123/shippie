import { copyFile, mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const waSqlitePkg = require.resolve('wa-sqlite/package.json');
const waSqliteRoot = dirname(waSqlitePkg);
const outDir = new URL('../dist/local/', import.meta.url);

await mkdir(outDir, { recursive: true });
for (const name of ['wa-sqlite.wasm', 'wa-sqlite-async.wasm']) {
  await copyFile(join(waSqliteRoot, 'dist', name), new URL(name, outDir));
}
