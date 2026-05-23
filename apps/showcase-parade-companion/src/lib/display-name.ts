const DISPLAY_NAME_KEY = 'parade-companion:display-name:v1';

export const DEFAULT_DISPLAY_NAME = 'Me';
export const MAX_DISPLAY_NAME_LENGTH = 24;

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
