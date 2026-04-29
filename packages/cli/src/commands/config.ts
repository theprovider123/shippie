/**
 * `shippie config` — read/write the maker shippie.json override.
 *
 * This is intentionally whole-object based for v1. It avoids ambiguous
 * key-path mutation and mirrors the dashboard editor: read the current
 * override, set a reviewed JSON object, or reset to deploy defaults.
 */
import { readFileSync } from 'node:fs';
import { createClient } from '@shippie/core';

export async function configCommand(
  slug: string,
  opts: { api?: string; json?: boolean; set?: string; file?: string; reset?: boolean },
): Promise<void> {
  const client = createClient({ apiUrl: opts.api ?? 'https://shippie.app' });

  try {
    if (opts.reset) {
      const result = await client.config.reset(slug);
      printResult(result, opts.json, 'Reset shippie.json override.');
      return;
    }

    const next = readConfigInput(opts);
    if (next) {
      const result = await client.config.set(slug, next);
      printResult(result, opts.json, 'Saved shippie.json override. It applies on the next deploy.');
      return;
    }

    const result = await client.config.get(slug);
    printResult(result, opts.json);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'unknown_error';
    if (message === 'no_auth_token' || message === 'unauthenticated') {
      console.error('Not logged in. Run: shippie login');
      process.exit(1);
    }
    console.error(`Could not update config: ${message}`);
    process.exit(1);
  }
}

function readConfigInput(opts: { set?: string; file?: string }): Record<string, unknown> | null {
  const raw = opts.file ? readFileSync(opts.file, 'utf8') : opts.set;
  if (!raw) return null;
  const parsed = JSON.parse(raw) as unknown;
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('config_must_be_json_object');
  }
  return parsed as Record<string, unknown>;
}

function printResult(
  result: { slug: string; config: Record<string, unknown>; hasOverride: boolean },
  asJson: boolean | undefined,
  message?: string,
): void {
  if (asJson) {
    console.log(JSON.stringify(result, null, 2));
    return;
  }
  if (message) console.log(message);
  console.log(`App: ${result.slug}`);
  console.log(`Override: ${result.hasOverride ? 'yes' : 'no'}`);
  console.log(JSON.stringify(result.config, null, 2));
}
