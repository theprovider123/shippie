import type { Tab } from '../state/lift-state.tsx';

interface BottomNavProps {
  active: Tab;
  onChange: (tab: Tab) => void;
  hasOpenWorkout: boolean;
}

const TABS: { id: Tab; label: string }[] = [
  { id: 'today', label: 'Today' },
  { id: 'library', label: 'Library' },
  { id: 'progression', label: 'Progress' },
  { id: 'history', label: 'History' },
];

const NAV_TABS = new Set<Tab>(TABS.map((t) => t.id));

export function BottomNav({ active, onChange, hasOpenWorkout }: BottomNavProps) {
  // Hide the bottom nav on full-screen surfaces (settings/print/template-edit)
  if (!NAV_TABS.has(active)) return null;
  return (
    <nav className="lift-bottom-nav" aria-label="Sections">
      {TABS.map((t) => (
        <button
          key={t.id}
          type="button"
          className={`lift-bottom-nav__btn ${active === t.id ? 'lift-bottom-nav__btn--active' : ''}`}
          onClick={() => onChange(t.id)}
          aria-current={active === t.id ? 'page' : undefined}
        >
          <span className="lift-bottom-nav__label">{t.label}</span>
          {t.id === 'today' && hasOpenWorkout ? (
            <span className="lift-bottom-nav__dot" aria-hidden="true" />
          ) : null}
        </button>
      ))}
      {/* Settings reachable as a utility icon — Lift isn't settings-heavy,
          so per the bottom-nav rulebook it doesn't get a labelled tab. */}
      <button
        type="button"
        className="lift-bottom-nav__btn lift-bottom-nav__btn--utility"
        onClick={() => onChange('settings')}
        aria-label="Settings"
        title="Settings"
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="1.6" />
          <path
            d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6l1.4 1.4M17 17l1.4 1.4M5.6 18.4l1.4-1.4M17 7l1.4-1.4"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
          />
        </svg>
      </button>
    </nav>
  );
}
