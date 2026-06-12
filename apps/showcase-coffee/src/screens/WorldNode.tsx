// Variety / Process / Roaster node detail pages. The design specced Origin in
// full; these keep the same cream node language for the other three types.

import { C, F } from '../tokens.ts';
import { ChevronLeft } from '../components/icons.tsx';
import { RadarChart } from '../components/RadarChart.tsx';
import { originBySlug, type WorldProcess, type WorldRoaster, type WorldVariety } from '../data/world.ts';

function NodeHeader({ onBack }: { onBack: () => void }) {
  return (
    <div style={{ padding: '10px 20px 8px', display: 'flex', alignItems: 'center' }}>
      <button type="button" className="tap-target" onClick={onBack} style={{ background: 'none', border: 'none', display: 'flex', alignItems: 'center', gap: 5, fontFamily: F.sans, fontSize: 13, color: C.terracotta, cursor: 'pointer' }}>
        <ChevronLeft />
        World
      </button>
    </div>
  );
}

function ScoreBars({ labels, values, color }: { labels: string[]; values: number[]; color: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
      <RadarChart data={values} labels={labels} size={150} color={color} />
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 8 }}>
        {labels.map((lb, i) => {
          const v = values[i] ?? 0;
          return (
            <div key={lb} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontFamily: F.sans, fontSize: 10, color: C.espressoLight, width: 66, flexShrink: 0 }}>{lb}</span>
              <div style={{ flex: 1, height: 3, borderRadius: 99, background: C.tanLight, overflow: 'hidden' }}>
                <div style={{ width: `${(v / 5) * 100}%`, height: '100%', background: color, borderRadius: 99 }} />
              </div>
              <span style={{ fontFamily: F.mono, fontSize: 10, color: C.espressoMid, width: 22, textAlign: 'right', flexShrink: 0 }}>{v.toFixed(1)}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

const h2Style = { fontFamily: F.serif, fontSize: 30, fontWeight: 600, color: C.espresso, lineHeight: 1.1, marginBottom: 4 } as const;
const eyebrowStyle = { fontFamily: F.sans, fontSize: 11, letterSpacing: '0.1em', textTransform: 'uppercase', color: C.espressoLight, marginBottom: 18 } as const;
const sectionLabel = { fontFamily: F.sans, fontSize: 10, letterSpacing: '0.1em', textTransform: 'uppercase', color: C.espressoLight, marginBottom: 12, display: 'block' } as const;
const bodyStyle = { fontFamily: F.sans, fontSize: 13, color: C.espressoMid, lineHeight: 1.65, marginBottom: 26 } as const;

const PALATE_LABELS = ['Brightness', 'Body', 'Sweetness', 'Complexity', 'Clean'];

export function VarietyNode({ variety, onBack, onOpenOrigin }: { variety: WorldVariety; onBack: () => void; onOpenOrigin: (slug: string) => void }) {
  const home = originBySlug(variety.originSlug);
  return (
    <div style={{ minHeight: '100%' }}>
      <NodeHeader onBack={onBack} />
      <div style={{ padding: '8px 20px 32px' }}>
        <h2 style={h2Style}>{variety.name}</h2>
        <div style={eyebrowStyle}>{variety.species}</div>
        <p style={bodyStyle}>{variety.description}</p>

        {home && (
          <div style={{ marginBottom: 26 }}>
            <span style={sectionLabel}>Ancestral home</span>
            <button type="button" onClick={() => onOpenOrigin(home.slug)} style={chip}>{home.name}, {home.country}</button>
          </div>
        )}

        <div style={{ marginBottom: 26 }}>
          <span style={sectionLabel}>Flavour profile</span>
          <ScoreBars labels={PALATE_LABELS} values={variety.flavourProfile} color={C.terracotta} />
        </div>

        <div>
          <span style={sectionLabel}>Community cup score</span>
          <ScoreBars labels={PALATE_LABELS} values={variety.communityScore} color={C.sage} />
        </div>
      </div>
    </div>
  );
}

export function ProcessNode({ process, onBack }: { process: WorldProcess; onBack: () => void }) {
  return (
    <div style={{ minHeight: '100%' }}>
      <NodeHeader onBack={onBack} />
      <div style={{ padding: '8px 20px 32px' }}>
        <h2 style={h2Style}>{process.name}</h2>
        <div style={eyebrowStyle}>{process.family} family</div>
        <p style={bodyStyle}>{process.description}</p>

        <div style={{ marginBottom: 26 }}>
          <span style={sectionLabel}>Effect on the cup</span>
          <ScoreBars labels={PALATE_LABELS} values={process.effectOnCup} color={C.terracotta} />
        </div>

        <div>
          <span style={sectionLabel}>Community cup score</span>
          <ScoreBars labels={PALATE_LABELS} values={process.communityScore} color={C.sage} />
        </div>
      </div>
    </div>
  );
}

export function RoasterNode({ roaster, onBack }: { roaster: WorldRoaster; onBack: () => void }) {
  return (
    <div style={{ minHeight: '100%' }}>
      <NodeHeader onBack={onBack} />
      <div style={{ padding: '8px 20px 32px' }}>
        <h2 style={h2Style}>{roaster.name}</h2>
        <div style={eyebrowStyle}>{roaster.city} · {roaster.country}</div>
        <p style={bodyStyle}>{roaster.philosophy}</p>

        <div style={{ display: 'flex', borderTop: `1px solid ${C.tanLight}`, borderBottom: `1px solid ${C.tanLight}`, padding: '14px 0', marginBottom: 24 }}>
          <div style={{ flex: 1, textAlign: 'center', padding: '0 6px' }}>
            <div style={{ fontFamily: F.sans, fontSize: 9, letterSpacing: '0.08em', textTransform: 'uppercase', color: C.espressoLight, marginBottom: 5 }}>Sourcing</div>
            <div style={{ fontFamily: F.sans, fontSize: 12, color: C.espresso, lineHeight: 1.4 }}>{roaster.sourcingModel}</div>
          </div>
          <div style={{ flex: 1, textAlign: 'center', borderLeft: `1px solid ${C.tanLight}`, padding: '0 6px' }}>
            <div style={{ fontFamily: F.sans, fontSize: 9, letterSpacing: '0.08em', textTransform: 'uppercase', color: C.espressoLight, marginBottom: 5 }}>Transparency</div>
            <div style={{ display: 'flex', justifyContent: 'center', gap: 4 }}>
              {[1, 2, 3, 4, 5].map((n) => (
                <span key={n} style={{ width: 8, height: 8, borderRadius: '50%', background: n <= roaster.transparencyScore ? C.sage : C.tanLight }} />
              ))}
            </div>
          </div>
        </div>

        <span style={sectionLabel}>Current offerings</span>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {roaster.currentOfferings.map((o) => (
            <div key={o} style={{ fontFamily: F.serif, fontSize: 15, color: C.espresso, paddingBottom: 8, borderBottom: `1px solid ${C.tanLight}` }}>{o}</div>
          ))}
        </div>
      </div>
    </div>
  );
}

const chip = {
  fontFamily: F.sans,
  fontSize: 12,
  color: C.espresso,
  background: C.creamDark,
  border: `1px solid ${C.tanLight}`,
  borderRadius: 22,
  padding: '11px 16px', // >= 44px tap target
  cursor: 'pointer',
} as const;
