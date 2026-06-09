// Bag detail (the /bag/[id] view) — full info, freshness, recipes, brew
// history, and a cup-score radar derived from this bag's logged cups.

import { C, F } from '../tokens.ts';
import type { Bag, BrewLog, CupScore, Recipe } from '../types.ts';
import { bagFreshness, originLine } from '../lib/format.ts';
import { derivePalate } from '../lib/profile.ts';
import { ChevronLeft } from '../components/icons.tsx';
import { FreshnessBar } from '../components/FreshnessBar.tsx';
import { RadarChart } from '../components/RadarChart.tsx';
import { originBySlug } from '../data/world.ts';

const METHOD_LABEL: Record<Recipe['method'], string> = {
  v60: 'V60', aeropress: 'AeroPress', chemex: 'Chemex', espresso: 'Espresso', moka: 'Moka', frenchpress: 'French Press', coldbrew: 'Cold Brew',
};

const sectionLabel = { fontFamily: F.sans, fontSize: 10, letterSpacing: '0.1em', textTransform: 'uppercase', color: C.espressoLight, marginBottom: 12, display: 'block' } as const;

export interface BagDetailProps {
  bag: Bag;
  recipes: Recipe[];
  brews: BrewLog[];
  scores: CupScore[];
  onBack: () => void;
  onBrewThis: () => void;
  onLogCup: () => void;
  onOpenOrigin: (slug: string) => void;
  onToggleFinished: () => void;
}

export function BagDetail({ bag, recipes, brews, scores, onBack, onBrewThis, onLogCup, onOpenOrigin, onToggleFinished }: BagDetailProps) {
  const f = bagFreshness(bag);
  const palate = derivePalate(scores);
  const node = bag.worldNodeSlug ? originBySlug(bag.worldNodeSlug) : undefined;

  return (
    <div style={{ background: C.cream, minHeight: '100%', padding: '10px 20px 32px' }}>
      <div style={{ marginBottom: 12 }}>
        <button type="button" onClick={onBack} style={{ background: 'none', border: 'none', display: 'flex', alignItems: 'center', gap: 5, fontFamily: F.sans, fontSize: 13, color: C.terracotta, cursor: 'pointer' }}>
          <ChevronLeft />
          Cellar
        </button>
      </div>

      <div style={{ fontFamily: F.sans, fontSize: 11, letterSpacing: '0.1em', textTransform: 'uppercase', color: C.espressoMid, marginBottom: 4 }}>{bag.roasterName}</div>
      <h2 style={{ fontFamily: F.serif, fontSize: 30, fontWeight: 600, color: C.espresso, lineHeight: 1.1, marginBottom: 5 }}>{bag.name}</h2>
      <div style={{ fontFamily: F.sans, fontSize: 13, color: C.espressoLight, fontStyle: 'italic', marginBottom: 16 }}>{originLine(bag)}</div>

      <FreshnessBar day={f.barDay} window={f.window} label={f.displayLabel} />

      <div style={{ display: 'flex', gap: 18, margin: '18px 0 22px', borderTop: `1px solid ${C.tanLight}`, borderBottom: `1px solid ${C.tanLight}`, padding: '14px 0' }}>
        {[
          { label: 'Variety', value: bag.variety ?? '—' },
          { label: 'Roast', value: bag.roastLevel },
          { label: 'Remaining', value: `${bag.gramsRemaining}g` },
        ].map((s, i) => (
          <div key={s.label} style={{ flex: 1, textAlign: 'center', borderLeft: i > 0 ? `1px solid ${C.tanLight}` : 'none' }}>
            <div style={{ fontFamily: F.sans, fontSize: 9, letterSpacing: '0.08em', textTransform: 'uppercase', color: C.espressoLight, marginBottom: 5 }}>{s.label}</div>
            <div style={{ fontFamily: F.mono, fontSize: 13, color: C.espresso }}>{s.value}</div>
          </div>
        ))}
      </div>

      <div style={{ display: 'flex', gap: 10, marginBottom: 26 }}>
        {bag.status !== 'finished' && (
          <button type="button" onClick={onBrewThis} style={{ flex: 1, height: 42, borderRadius: 8, background: 'rgba(196,99,58,0.06)', color: C.terracotta, border: '1px solid rgba(196,99,58,0.5)', fontFamily: F.serif, fontStyle: 'italic', fontSize: 14, cursor: 'pointer' }}>
            Brew this
          </button>
        )}
        <button type="button" onClick={onLogCup} style={{ flex: 1, height: 42, borderRadius: 8, background: C.creamDark, color: C.espressoMid, border: `1px solid ${C.tanLight}`, fontFamily: F.sans, fontSize: 13, cursor: 'pointer' }}>
          Log a cup
        </button>
      </div>

      {scores.length > 0 && (
        <div style={{ marginBottom: 26 }}>
          <span style={sectionLabel}>Cup scores · {scores.length}</span>
          <div style={{ display: 'flex', justifyContent: 'center' }}>
            <RadarChart data={palate.scores} labels={palate.labels} size={160} color={C.terracotta} />
          </div>
          <p style={{ fontFamily: F.sans, fontSize: 12, color: C.espressoMid, fontStyle: 'italic', textAlign: 'center', marginTop: 10 }}>{palate.tendency}</p>
        </div>
      )}

      {recipes.length > 0 && (
        <div style={{ marginBottom: 26 }}>
          <span style={sectionLabel}>Recipes · {recipes.length}</span>
          {recipes.map((r) => (
            <div key={r.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 0', borderBottom: `1px solid ${C.tanLight}` }}>
              <span style={{ fontFamily: F.serif, fontSize: 15, color: C.espresso }}>{METHOD_LABEL[r.method]}</span>
              <span style={{ fontFamily: F.mono, fontSize: 12, color: C.espressoMid }}>{r.dose}g · {r.ratio} · {r.waterTemp}°C</span>
            </div>
          ))}
        </div>
      )}

      <div style={{ marginBottom: 26 }}>
        <span style={sectionLabel}>Brew history · {brews.length}</span>
        {brews.length === 0 ? (
          <p style={{ fontFamily: F.sans, fontSize: 12, color: C.espressoLight, fontStyle: 'italic' }}>No brews logged yet.</p>
        ) : (
          brews.slice(0, 8).map((b) => (
            <div key={b.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: `1px solid ${C.tanLight}` }}>
              <span style={{ fontFamily: F.sans, fontSize: 12, color: C.espressoMid }}>{b.createdAt.slice(0, 10)}</span>
              <span style={{ fontFamily: F.mono, fontSize: 12, color: C.espresso }}>{Math.floor(b.actualTime / 60)}:{String(b.actualTime % 60).padStart(2, '0')}</span>
            </div>
          ))
        )}
      </div>

      {node && (
        <button type="button" onClick={() => onOpenOrigin(node.slug)} style={{ width: '100%', textAlign: 'left', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 16px', background: C.creamDark, border: `1px solid ${C.tanLight}`, borderRadius: 12, cursor: 'pointer', marginBottom: 18 }}>
          <span style={{ fontFamily: F.sans, fontSize: 11, letterSpacing: '0.08em', textTransform: 'uppercase', color: C.espressoLight }}>In the World</span>
          <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontFamily: F.serif, fontSize: 15, color: C.espresso }}>{node.name}</span>
            <span style={{ color: C.tan }}>›</span>
          </span>
        </button>
      )}

      <div style={{ display: 'flex', justifyContent: 'center' }}>
        <button type="button" onClick={onToggleFinished} style={{ background: 'none', border: 'none', fontFamily: F.sans, fontSize: 12, color: C.espressoLight, cursor: 'pointer' }}>
          {bag.status === 'finished' ? 'Move back to shelf' : 'Mark as finished'}
        </button>
      </div>
    </div>
  );
}
