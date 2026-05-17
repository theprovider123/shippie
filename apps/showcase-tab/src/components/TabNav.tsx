import type { Route } from '../router.ts';

const TABS: { route: Route; label: string }[] = [
  { route: 'tab', label: 'Tab' },
  { route: 'settle', label: 'Settle' },
  { route: 'members', label: 'Members' },
];

interface Props {
  current: Route;
  onChange: (route: Route) => void;
}

export function TabNav({ current, onChange }: Props) {
  return (
    <nav className="tab-tabnav" aria-label="Primary">
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
