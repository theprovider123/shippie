const CONTROL_CHAR = /[\u0000-\u001F\u007F]/;

export function safeReturnTo(raw: string | null | undefined, fallback = '/'): string {
  const value = (raw ?? '').trim();
  if (!value) return fallback;
  if (!value.startsWith('/')) return fallback;
  if (value.startsWith('//')) return fallback;
  if (value.includes('\\')) return fallback;
  if (CONTROL_CHAR.test(value)) return fallback;
  return value;
}

export function optionalSafeReturnTo(raw: string | null | undefined): string | null {
  const value = safeReturnTo(raw, '');
  return value || null;
}
