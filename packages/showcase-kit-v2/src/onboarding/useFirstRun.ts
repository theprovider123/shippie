import { useEffect, useState } from 'react';

const KEY = (slug: string) => `shippie:onboarding:${slug}:v`;

function safeStorage(override?: Storage): Storage | null {
  if (override) return override;
  try {
    return typeof window !== 'undefined' ? window.localStorage : null;
  } catch {
    return null;
  }
}

export function hasCompletedOnboarding(slug: string, version: number, store?: Storage): boolean {
  const s = safeStorage(store);
  if (!s) return false;
  const raw = s.getItem(KEY(slug));
  if (!raw) return false;
  const v = Number(raw);
  return Number.isFinite(v) && v >= version;
}

export function markOnboardingComplete(slug: string, version: number, store?: Storage): void {
  const s = safeStorage(store);
  if (!s) return;
  s.setItem(KEY(slug), String(version));
}

export function resetOnboarding(slug: string, store?: Storage): void {
  const s = safeStorage(store);
  if (!s) return;
  s.removeItem(KEY(slug));
}

export function useOnboardingGate(slug: string, version: number) {
  const [done, setDone] = useState(() => hasCompletedOnboarding(slug, version));
  useEffect(() => {
    setDone(hasCompletedOnboarding(slug, version));
  }, [slug, version]);
  return {
    done,
    complete: () => {
      markOnboardingComplete(slug, version);
      setDone(true);
    },
    reset: () => {
      resetOnboarding(slug);
      setDone(false);
    },
  };
}
