// Ported from lot-components.jsx — a single bag in the Cellar list.

import { C, F } from '../tokens.ts';
import type { Bag } from '../types.ts';
import { bagFreshness, originLine } from '../lib/format.ts';
import { FreshnessBar } from './FreshnessBar.tsx';

export interface BagCardProps {
  bag: Bag;
  isActive?: boolean;
  onSelect?: () => void;
}

export function BagCard({ bag, isActive = false, onSelect }: BagCardProps) {
  const f = bagFreshness(bag);
  return (
    <button
      type="button"
      onClick={onSelect}
      style={{
        textAlign: 'left',
        width: '100%',
        background: isActive ? C.paper : C.creamDark,
        borderRadius: 12,
        padding: '14px 16px',
        border: isActive ? `1.5px solid ${C.terracotta}` : `1px solid ${C.tanLight}`,
        boxShadow: isActive
          ? '0 2px 12px rgba(196,99,58,0.12),0 1px 4px rgba(44,26,14,0.06)'
          : '0 1px 3px rgba(44,26,14,0.04)',
        cursor: 'pointer',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10 }}>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ fontFamily: F.sans, fontSize: 10, letterSpacing: '0.1em', textTransform: 'uppercase', color: C.espressoMid, marginBottom: 3 }}>
            {bag.roasterName}
          </div>
          <div style={{ fontFamily: F.serif, fontSize: 17, fontWeight: 500, color: C.espresso, lineHeight: 1.2, marginBottom: 3 }}>
            {bag.name}
          </div>
          <div style={{ fontFamily: F.sans, fontSize: 12, color: C.espressoLight, fontStyle: 'italic' }}>{originLine(bag)}</div>
        </div>
        {isActive && (
          <div style={{ flexShrink: 0, display: 'flex', alignItems: 'center', gap: 5 }}>
            <div style={{ width: 6, height: 6, borderRadius: '50%', background: C.terracotta }} />
            <span style={{ fontFamily: F.mono, fontSize: 10, color: C.terracotta, letterSpacing: '0.04em' }}>now</span>
          </div>
        )}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 12 }}>
        <div style={{ flex: 1 }}>
          <FreshnessBar day={f.barDay} window={f.window} label={f.displayLabel} compact />
        </div>
        <span style={{ fontFamily: F.mono, fontSize: 11, color: C.espressoMid, flexShrink: 0 }}>{bag.gramsRemaining}g</span>
      </div>
    </button>
  );
}
