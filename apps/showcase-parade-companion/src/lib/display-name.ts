const DISPLAY_NAME_KEY = 'parade-companion:display-name:v1';
const SUPPORTER_TAG_KEY = 'parade-companion:supporter-tag:v1';

export const DEFAULT_DISPLAY_NAME = 'Me';
export const MAX_DISPLAY_NAME_LENGTH = 24;
export const SUPPORTER_TAG_LENGTH = 4;

export function cleanDisplayName(value: string | null | undefined): string {
  const cleaned = String(value ?? '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, MAX_DISPLAY_NAME_LENGTH)
    .trim();
  return cleaned || DEFAULT_DISPLAY_NAME;
}

export function getDisplayName(): string {
  if (typeof localStorage === 'undefined') return DEFAULT_DISPLAY_NAME;
  try {
    return cleanDisplayName(localStorage.getItem(DISPLAY_NAME_KEY));
  } catch {
    return DEFAULT_DISPLAY_NAME;
  }
}

export function hasDisplayName(): boolean {
  if (typeof localStorage === 'undefined') return false;
  try {
    return cleanDisplayName(localStorage.getItem(DISPLAY_NAME_KEY)) !== DEFAULT_DISPLAY_NAME;
  } catch {
    return false;
  }
}

export function setDisplayName(value: string): string {
  const cleaned = cleanDisplayName(value);
  if (typeof localStorage === 'undefined') return cleaned;
  try {
    localStorage.setItem(DISPLAY_NAME_KEY, cleaned);
  } catch {
    // Display name is a convenience only; storage failure should never block use.
  }
  return cleaned;
}

export function getSupporterTag(): string {
  if (typeof localStorage === 'undefined') return makeSupporterTag();
  try {
    const existing = cleanSupporterTag(localStorage.getItem(SUPPORTER_TAG_KEY));
    if (existing) return existing;
    const next = makeSupporterTag();
    localStorage.setItem(SUPPORTER_TAG_KEY, next);
    return next;
  } catch {
    return makeSupporterTag();
  }
}

export function formatSupporterHandle(name: string, tag = getSupporterTag()): string {
  return `${cleanDisplayName(name)} #${cleanSupporterTag(tag) ?? tag}`;
}

function cleanSupporterTag(value: string | null | undefined): string | null {
  const cleaned = String(value ?? '')
    .replace(/^#/, '')
    .replace(/[^A-Z0-9]/gi, '')
    .toUpperCase()
    .slice(0, SUPPORTER_TAG_LENGTH);
  return cleaned.length === SUPPORTER_TAG_LENGTH ? cleaned : null;
}

function makeSupporterTag(): string {
  const alphabet = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  const bytes = new Uint8Array(SUPPORTER_TAG_LENGTH);
  if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
    crypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < bytes.length; i += 1) bytes[i] = Math.floor(Math.random() * 256);
  }
  return [...bytes].map((byte) => alphabet[byte % alphabet.length]).join('');
}
