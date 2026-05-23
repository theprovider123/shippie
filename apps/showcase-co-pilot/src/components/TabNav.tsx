import type { Route } from '../router.ts';

interface Props {
  current: Route;
  unread: number;
  onChange: (route: Route) => void;
}

const TABS: { route: Route; label: string }[] = [
  { route: 'home', label: 'Today' },
  { route: 'schedule', label: 'Schedule' },
  { route: 'meds', label: 'Meds' },
  { route: 'handover', label: 'Handover' },
  { route: 'settings', label: 'Settings' },
];

export function TabNav({ current, unread, onChange }: Props) {
  return (
    <nav className="co-tabnav" aria-label="Primary" role="tablist">
      {TABS.map((t) => {
        const active = current === t.route;
        return (
          <button
            key={t.route}
            type="button"
            role="tab"
            aria-selected={active}
            aria-current={active ? 'page' : undefined}
            data-active={active}
            onClick={() => onChange(t.route)}
          >
            <span>{t.label}</span>
            {t.route === 'handover' && unread > 0 ? (
              <span className="co-tabnav-count" aria-label={`${unread} unread`}>{unread}</span>
            ) : null}
          </button>
        );
      })}
    </nav>
  );
}
