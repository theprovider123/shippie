'use client';

import { useEffect, useState } from 'react';

type Theme = 'dark' | 'light';

function getStoredTheme(): Theme {
  if (typeof window === 'undefined') return 'dark';
  return (localStorage.getItem('shippie-theme') as Theme) ?? 'dark';
}

function applyTheme(theme: Theme) {
  document.documentElement.setAttribute('data-theme', theme);
  localStorage.setItem('shippie-theme', theme);
}

export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>('dark');

  useEffect(() => {
    const stored = getStoredTheme();
    setTheme(stored);
    applyTheme(stored);
  }, []);

  function toggle() {
    const next = theme === 'dark' ? 'light' : 'dark';
    setTheme(next);
    applyTheme(next);
  }

  return (
    <button
      onClick={toggle}
      aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
      className="theme-toggle"
      style={{ width: 32, height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: '50%', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)', transition: 'color 0.2s' }}
      title={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
    >
      {theme === 'dark' ? (
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
          <circle cx="8" cy="8" r="3.5" stroke="currentColor" strokeWidth="1.5"/>
          <path d="M8 1v2M8 13v2M1 8h2M13 8h2M3.05 3.05l1.41 1.41M11.54 11.54l1.41 1.41M3.05 12.95l1.41-1.41M11.54 4.46l1.41-1.41" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
        </svg>
      ) : (
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
          <path d="M14 10a6 6 0 1 1-8-8 7 7 0 0 0 8 8Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/>
        </svg>
      )}
    </button>
  );
}
