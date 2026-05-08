import type { Route } from '../router.ts';

interface Props {
  current: Route;
  unread: number;
  onChange: (route: Route) => void;
}

const TABS: { route: Route; label: string }[] = [
  { route: 'home', label: 'Today' },
  { route: 'meds', label: 'Meds' },
  { route: 'symptoms', label: 'Symptoms' },
  { route: 'handover', label: 'Handover' },
  { route: 'report', label: 'Report' },
  { route: 'settings', label: 'Settings' },
];

export function TabNav({ current, unread, onChange }: Props) {
  return (
    <nav className="cl-tabnav" aria-label="Primary">
      {TABS.map((t) => (
        <button
          key={t.route}
          type="button"
          data-active={current === t.route}
          onClick={() => onChange(t.route)}
        >
          <span>{t.label}</span>
          {t.route === 'handover' && unread > 0 ? (
            <span className="cl-tabnav-count">{unread}</span>
          ) : null}
        </button>
      ))}
    </nav>
  );
}
