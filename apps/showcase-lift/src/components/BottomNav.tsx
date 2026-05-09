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
    </nav>
  );
}
