const STORAGE_KEY = 'shippie.matchday.peerId.v1';

export function getStablePeerId(): string {
  if (typeof localStorage === 'undefined') return randomId('peer');
  const existing = localStorage.getItem(STORAGE_KEY);
  if (existing) return existing;
  const next = randomId('peer');
  localStorage.setItem(STORAGE_KEY, next);
  return next;
}

export function randomId(prefix: string): string {
  const bytes = new Uint8Array(10);
  crypto.getRandomValues(bytes);
  let out = '';
  for (const b of bytes) out += b.toString(16).padStart(2, '0');
  return `${prefix}_${out}`;
}
