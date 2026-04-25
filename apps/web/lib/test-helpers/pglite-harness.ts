import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runMigrations, type ShippieDbHandle } from '@shippie/db';
import { getDbHandle } from '@/lib/db';

const __dirname = dirname(fileURLToPath(import.meta.url));
export const MIGRATIONS_DIR = join(__dirname, '..', '..', '..', '..', 'packages', 'db', 'migrations');

export async function setupPgliteForTest(): Promise<ShippieDbHandle> {
  process.env.DATABASE_URL = 'pglite://memory';
  const handle = await getDbHandle();
  await runMigrations(handle, MIGRATIONS_DIR);
  return handle;
}

export async function teardownPglite(handle: ShippieDbHandle | undefined): Promise<void> {
  if (!handle) return;
  await handle.close();
  delete (globalThis as { __shippieDbHandle?: unknown }).__shippieDbHandle;
}
