import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * Resolve the maker's API token. Order:
 *   1. Explicit override (passed to createClient)
 *   2. SHIPPIE_TOKEN env
 *   3. ~/.shippie/token (written by `shippie login`)
 *   4. null — caller decides whether trial-deploy is OK
 */
export function readToken(override?: string | null): string | null {
  if (override) return override;
  if (process.env.SHIPPIE_TOKEN) return process.env.SHIPPIE_TOKEN;
  const home = process.env.HOME ?? '~';
  const tokenPath = resolve(home, '.shippie', 'token');
  if (existsSync(tokenPath)) {
    try {
      return readFileSync(tokenPath, 'utf8').trim() || null;
    } catch {
      return null;
    }
  }
  return null;
}
