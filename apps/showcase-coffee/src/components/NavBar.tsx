// Ported from lot-components.jsx — the three-item bottom navigation.
// Exactly three items: Brew · Cellar · World.

import { C, F } from '../tokens.ts';
import { BrewIcon, CellarIcon, WorldIcon } from './icons.tsx';

export type Tab = 'brew' | 'cellar' | 'world';

const TABS: ReadonlyArray<{ id: Tab; label: string }> = [
  { id: 'brew', label: 'Brew' },
  { id: 'cellar', label: 'Cellar' },
  { id: 'world', label: 'World' },
];

export interface NavBarProps {
  active: Tab;
  onNav: (tab: Tab) => void;
}

export function NavBar({ active, onNav }: NavBarProps) {
  return (
    <div
      role="tablist"
      aria-label="lot. sections"
      style={{
        display: 'flex',
        background: C.cream,
        borderTop: `1px solid ${C.tanLight}`,
        paddingTop: 6,
        paddingBottom: `calc(10px + env(safe-area-inset-bottom, 0px))`,
        flexShrink: 0,
        position: 'relative',
        zIndex: 1,
      }}
    >
      {TABS.map((t) => {
        const on = active === t.id;
        const col = on ? C.terracotta : C.espressoLight;
        return (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={on}
            onClick={() => onNav(t.id)}
            style={{
              flex: 1,
              background: 'none',
              border: 'none',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: 3,
              padding: '4px 0',
              minHeight: 44,
            }}
          >
            {t.id === 'brew' && <BrewIcon color={col} />}
            {t.id === 'cellar' && <CellarIcon color={col} />}
            {t.id === 'world' && <WorldIcon color={col} />}
            <span style={{ fontFamily: F.sans, fontSize: 10, fontWeight: on ? 600 : 400, color: col, letterSpacing: '0.02em' }}>
              {t.label}
            </span>
          </button>
        );
      })}
    </div>
  );
}
