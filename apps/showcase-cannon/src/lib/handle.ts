/**
 * Anonymous terrace identity. A handle from the prefix/suffix pools plus an
 * app-issued UUID key, both minted once and persisted locally — the golazo
 * playerKey idiom. No platform session is ever involved.
 */

export const PREFIXES = [
  'NorthBank',
  'ClockEnd',
  'Highbury',
  'TheGun',
  'Emirates',
  'Ashburton',
  'Islington',
  'Arsenal',
] as const;

export const SUFFIXES = [
  'Nelson',
  'Cyrus',
  'Charlie',
  'Henry',
  'Adams',
  'Bergkamp',
  'Vieira',
  'Pires',
  'Lauren',
  'Cole',
] as const;

const HANDLE_KEY = 'cannon_handle';
const ANON_KEY = 'cannon_anon';

export function generateHandle(random: () => number = Math.random): string {
  const pre = PREFIXES[Math.floor(random() * PREFIXES.length)] ?? 'NorthBank';
  const suf = SUFFIXES[Math.floor(random() * SUFFIXES.length)] ?? 'Nelson';
  return pre + suf;
}

export function getHandle(): string {
  try {
    let h = localStorage.getItem(HANDLE_KEY);
    if (!h) {
      h = generateHandle();
      localStorage.setItem(HANDLE_KEY, h);
    }
    return h;
  } catch {
    return 'NorthBankNelson';
  }
}

export function getAnonKey(): string {
  try {
    let k = localStorage.getItem(ANON_KEY);
    if (!k) {
      k = crypto.randomUUID();
      localStorage.setItem(ANON_KEY, k);
    }
    return k;
  } catch {
    return 'ephemeral-' + Math.random().toString(36).slice(2, 10);
  }
}

/** Compose-bar truncation, exactly as designed. */
export function shortHandle(handle: string): string {
  return handle.length > 12 ? handle.slice(0, 11) + '…' : handle;
}
