#!/usr/bin/env node
/**
 * CLI entry point: bun run db:push
 *
 * Reads DATABASE_URL from the environment (falls back to pglite://memory),
 * applies every migration in ./migrations/, reports applied and skipped.
 */
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { createDb } from '../src/client.ts';
import { runMigrations } from '../src/migrate.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const migrationsDir = join(__dirname, '..', 'migrations');

async function main() {
  const url = process.env.DATABASE_URL ?? 'pglite://./.pglite';
  console.log(`[shippie:db] Connecting to ${url}`);

  const handle = await createDb({ url });
  console.log(`[shippie:db] Driver: ${handle.kind}`);

  try {
    const result = await runMigrations(handle, migrationsDir, {
      log: (msg) => console.log(`[shippie:db] ${msg}`),
    });

    if (result.applied.length === 0 && result.skipped.length === 0) {
      console.log('[shippie:db] No migrations found.');
    } else {
      console.log(
        `[shippie:db] Applied ${result.applied.length}, skipped ${result.skipped.length}`,
      );
      if (result.applied.length > 0) {
        for (const name of result.applied) console.log(`  ✓ ${name}`);
      }
    }
  } finally {
    await handle.close();
  }
}

main().catch((err) => {
  console.error('[shippie:db] Migration failed:');
  console.error(err);
  process.exit(1);
});
