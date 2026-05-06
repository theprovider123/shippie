import type { Route } from '../router.ts';

const TABS: { route: Route; label: string }[] = [
  { route: 'trips', label: 'Trips' },
  { route: 'pin', label: 'Pin' },
  { route: 'companions', label: 'Companions' },
];

interface Props {
  current: Route;
  onChange: (r: Route) => void;
}

export function TabNav({ current, onChange }: Props) {
  return (
    <nav className="atlas-tabnav" aria-label="Primary">
      {TABS.map((t) => (
        <button
          key={t.route}
          type="button"
          data-active={current === t.route || (t.route === 'trips' && current === 'trip')}
          onClick={() => onChange(t.route)}
        >
          {t.label}
        </button>
      ))}
    </nav>
  );
}
