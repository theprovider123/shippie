export type AppTab = 'today' | 'room' | 'tournament';

const TABS: Array<{ id: AppTab; label: string; hint: string }> = [
  { id: 'today', label: 'Play', hint: 'Today' },
  { id: 'room', label: 'Rooms', hint: 'Manage' },
  { id: 'tournament', label: 'Cup', hint: 'Explore' },
];

export function AppTabs(props: { active: AppTab; onChange: (tab: AppTab) => void }) {
  return (
    <nav className="app-tabs" aria-label="Match Room sections">
      {TABS.map((tab) => (
        <button
          key={tab.id}
          type="button"
          className={props.active === tab.id ? 'active' : ''}
          onClick={() => props.onChange(tab.id)}
        >
          <strong>{tab.label}</strong>
          <span>{tab.hint}</span>
        </button>
      ))}
    </nav>
  );
}
