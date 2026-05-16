import { useEffect, useState } from 'react';

const STORAGE_KEY = 'match-room-theme';
type MatchRoomTheme = 'paper' | 'pitch';

function applyTheme(theme: MatchRoomTheme) {
  document.documentElement.dataset.matchRoomTheme = theme;
}

export function ThemeToggle() {
  const [theme, setTheme] = useState<MatchRoomTheme>(() => {
    if (typeof window === 'undefined') return 'paper';
    return window.localStorage.getItem(STORAGE_KEY) === 'pitch' ? 'pitch' : 'paper';
  });

  useEffect(() => {
    applyTheme(theme);
    window.localStorage.setItem(STORAGE_KEY, theme);
  }, [theme]);

  const isPitch = theme === 'pitch';

  return (
    <button
      type="button"
      className={`theme-toggle ${isPitch ? 'active' : ''}`}
      aria-pressed={isPitch}
      onClick={() => setTheme(isPitch ? 'paper' : 'pitch')}
    >
      <span aria-hidden="true" />
      {isPitch ? 'Pitch theme' : 'Paper theme'}
    </button>
  );
}
