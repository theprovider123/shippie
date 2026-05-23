const ONBOARDING_KEY = 'parade-companion:onboarded:v1';

export function isOnboarded(): boolean {
  if (typeof localStorage === 'undefined') return true;
  try {
    return localStorage.getItem(ONBOARDING_KEY) === '1';
  } catch {
    return true;
  }
}

export function markOnboarded(): void {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(ONBOARDING_KEY, '1');
  } catch {
    // Onboarding is advisory; the app must still open if storage is unavailable.
  }
}
