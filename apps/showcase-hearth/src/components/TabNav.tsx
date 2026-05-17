import type { Route } from '../router.ts';

const TABS: { route: Route; label: string }[] = [
  { route: 'today', label: 'Today' },
  { route: 'chores', label: 'Chores' },
  { route: 'fridge', label: 'Fridge' },
  { route: 'dinner', label: 'Dinner' },
  { route: 'house', label: 'House' },
];

interface Props {
  current: Route;
  onChange: (route: Route) => void;
}

export function TabNav({ current, onChange }: Props) {
  return (
    <nav className="hearth-tabnav" aria-label="Primary">
      {TABS.map((t) => (
        <button
          key={t.route}
          type="button"
          data-active={current === t.route}
          onClick={() => onChange(t.route)}
        >
          {t.label}
        </button>
      ))}
    </nav>
  );
}
