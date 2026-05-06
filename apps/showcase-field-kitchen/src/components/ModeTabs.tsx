import type { ReactElement } from 'react';

export type ModeId = 'brew' | 'bake' | 'cook' | 'hydrate';

const TABS: Array<{ id: ModeId; label: string }> = [
  { id: 'brew', label: 'Brew' },
  { id: 'bake', label: 'Bake' },
  { id: 'cook', label: 'Cook' },
  { id: 'hydrate', label: 'Hydrate' },
];

interface ModeTabsProps {
  current: ModeId;
  onChange: (id: ModeId) => void;
}

export function ModeTabs({ current, onChange }: ModeTabsProps): ReactElement {
  return (
    <nav className="mode-tabs" role="tablist" aria-label="Kitchen modes">
      {TABS.map((t) => (
        <button
          key={t.id}
          type="button"
          role="tab"
          aria-selected={current === t.id}
          className={`mode-tab ${current === t.id ? 'mode-tab-active' : ''}`}
          onClick={() => onChange(t.id)}
        >
          {t.label}
        </button>
      ))}
    </nav>
  );
}
