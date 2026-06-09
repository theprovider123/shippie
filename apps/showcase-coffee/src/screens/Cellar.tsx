// Cellar screen — the collection. Ported from lot-cellar.jsx with real,
// status-filtered bags and a palate radar derived from logged cup scores.

import { useState } from 'react';
import { C, F } from '../tokens.ts';
import type { Bag } from '../types.ts';
import type { Palate } from '../lib/profile.ts';
import { BagCard } from '../components/BagCard.tsx';
import { RadarChart } from '../components/RadarChart.tsx';

type CellarTab = 'active' | 'wishlist' | 'history';

export interface CellarScreenProps {
  bags: Bag[];
  activeBagId: string | null;
  palate: Palate;
  brewCount: number;
  originCount: number;
  onAddBag: () => void;
  onOpenBag: (id: string) => void;
}

export function CellarScreen({ bags, activeBagId, palate, brewCount, originCount, onAddBag, onOpenBag }: CellarScreenProps) {
  const [tab, setTab] = useState<CellarTab>('active');
  const active = bags.filter((b) => b.status === 'active');
  const wishlist = bags.filter((b) => b.status === 'wishlist');
  const history = bags.filter((b) => b.status === 'finished');

  return (
    <div style={{ padding: '10px 20px 28px', background: C.cream, minHeight: '100%' }}>
      <div style={{ fontFamily: F.mono, fontSize: 12, color: C.tan, letterSpacing: '0.16em', marginBottom: 14 }}>lot.</div>
      <h1 style={{ fontFamily: F.serif, fontSize: 28, fontWeight: 600, color: C.espresso, marginBottom: 18 }}>Cellar</h1>

      <div style={{ display: 'flex', borderBottom: `1px solid ${C.tanLight}`, marginBottom: 20 }}>
        {(['Active', 'Wishlist', 'History'] as const).map((t) => {
          const id = t.toLowerCase() as CellarTab;
          const on = tab === id;
          return (
            <button
              key={id}
              type="button"
              onClick={() => setTab(id)}
              style={{
                flex: 1,
                background: 'none',
                border: 'none',
                fontFamily: F.sans,
                fontSize: 14,
                fontWeight: on ? 500 : 400,
                color: on ? C.espresso : C.espressoLight,
                padding: '8px 0 10px',
                borderBottom: on ? `2px solid ${C.terracotta}` : '2px solid transparent',
                marginBottom: -1,
                cursor: 'pointer',
              }}
            >
              {t}
            </button>
          );
        })}
      </div>

      {tab === 'active' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 20 }}>
          {active.map((bag) => (
            <BagCard key={bag.id} bag={bag} isActive={bag.id === activeBagId} onSelect={() => onOpenBag(bag.id)} />
          ))}
          <button type="button" onClick={onAddBag} style={{ width: '100%', background: 'none', border: 'none', display: 'flex', alignItems: 'center', gap: 14, padding: '12px 2px', cursor: 'pointer' }}>
            <div style={{ flex: 1, height: 1, background: C.tanLight }} />
            <span style={{ fontFamily: F.sans, fontSize: 12, color: C.espressoLight, letterSpacing: '0.05em', flexShrink: 0 }}>add a bag</span>
            <div style={{ flex: 1, height: 1, background: C.tanLight }} />
          </button>
        </div>
      )}

      {tab === 'wishlist' && (
        wishlist.length === 0 ? (
          <div style={{ padding: '44px 0', textAlign: 'center' }}>
            <div style={{ fontFamily: F.serif, fontStyle: 'italic', fontSize: 18, color: C.espressoLight, marginBottom: 8 }}>Nothing on the list</div>
            <div style={{ fontFamily: F.sans, fontSize: 12, color: C.espressoLight, lineHeight: 1.65 }}>Mark a bag from World when something catches your eye.</div>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 20 }}>
            {wishlist.map((bag) => (
              <BagCard key={bag.id} bag={bag} onSelect={() => onOpenBag(bag.id)} />
            ))}
          </div>
        )
      )}

      {tab === 'history' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 20 }}>
          {history.length === 0 ? (
            <div style={{ padding: '44px 0', textAlign: 'center', fontFamily: F.sans, fontSize: 12, color: C.espressoLight }}>
              Finished bags will rest here.
            </div>
          ) : (
            history.map((bag) => <BagCard key={bag.id} bag={bag} onSelect={() => onOpenBag(bag.id)} />)
          )}
        </div>
      )}

      <div style={{ borderTop: `1px solid ${C.tanLight}`, background: C.paperWarm, marginInline: -20, padding: '20px 20px 24px', borderRadius: '0 0 2px 2px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 16 }}>
          <span style={{ fontFamily: F.serif, fontStyle: 'italic', fontSize: 15, color: C.espressoMid }}>Your palate</span>
          <span style={{ fontFamily: F.mono, fontSize: 10, color: C.espressoLight, letterSpacing: '0.04em' }}>{brewCount} brews · {originCount} origins</span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'center' }}>
          <RadarChart data={palate.scores} labels={palate.labels} size={170} color="#7B5438" />
        </div>
        <div style={{ marginTop: 14, display: 'grid', gridTemplateColumns: 'repeat(5,1fr)', gap: 4 }}>
          {palate.labels.map((lb, i) => (
            <div key={lb} style={{ textAlign: 'center' }}>
              <div style={{ fontFamily: F.mono, fontSize: 13, color: '#5C3620', marginBottom: 2 }}>{(palate.scores[i] ?? 0).toFixed(1)}</div>
              <div style={{ fontFamily: F.sans, fontSize: 9, color: C.espressoLight, letterSpacing: '0.05em' }}>{lb}</div>
            </div>
          ))}
        </div>
        {palate.sampleCount > 0 && (
          <p style={{ fontFamily: F.sans, fontSize: 12, color: C.espressoMid, fontStyle: 'italic', textAlign: 'center', marginTop: 14, lineHeight: 1.5 }}>
            {palate.tendency}
          </p>
        )}
      </div>
    </div>
  );
}
