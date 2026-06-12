// Origin node detail — ported from lot-world.jsx OriginNodeView, wired to real
// World data with tappable variety + roaster links.

import { C, F } from '../tokens.ts';
import { ChevronLeft } from '../components/icons.tsx';
import { TopoMap } from '../components/TopoMap.tsx';
import { RadarChart } from '../components/RadarChart.tsx';
import {
  flavourFor,
  roasterByName,
  varietyBySlug,
  type WorldOrigin,
} from '../data/world.ts';

function SectionLabel({ children }: { children: string }) {
  return (
    <div style={{ marginBottom: 12 }}>
      <span style={{ fontFamily: F.sans, fontSize: 10, letterSpacing: '0.1em', textTransform: 'uppercase', color: C.espressoLight }}>{children}</span>
    </div>
  );
}

export interface OriginNodeProps {
  origin: WorldOrigin;
  palateLabels: string[];
  onBack: () => void;
  onOpenVariety: (slug: string) => void;
  onOpenRoaster: (slug: string) => void;
}

export function OriginNode({ origin, palateLabels, onBack, onOpenVariety, onOpenRoaster }: OriginNodeProps) {
  const flavour = flavourFor(origin.slug);
  return (
    <div style={{ minHeight: '100%' }}>
      <div style={{ padding: '10px 20px 8px', display: 'flex', alignItems: 'center' }}>
        <button type="button" className="tap-target" onClick={onBack} style={{ background: 'none', border: 'none', display: 'flex', alignItems: 'center', gap: 5, fontFamily: F.sans, fontSize: 13, color: C.terracotta, cursor: 'pointer' }}>
          <ChevronLeft />
          World
        </button>
      </div>

      {/* Full-bleed map: fixed height, fluid width (the old fixed 390px width
          overflowed 360px phones horizontally). */}
      <div style={{ height: 130 }}>
        <TopoMap width={390} height={130} />
      </div>

      <div style={{ padding: '18px 20px 32px' }}>
        <h2 style={{ fontFamily: F.serif, fontSize: 30, fontWeight: 600, color: C.espresso, lineHeight: 1.1, marginBottom: 4 }}>{origin.name}</h2>
        <div style={{ fontFamily: F.sans, fontSize: 11, letterSpacing: '0.1em', textTransform: 'uppercase', color: C.espressoLight, marginBottom: 18 }}>{origin.country} · {origin.region}</div>

        <div style={{ display: 'flex', gap: 7, marginBottom: 22, flexWrap: 'wrap' }}>
          {flavour.map((tag) => (
            <span key={tag} style={{ fontFamily: F.sans, fontSize: 12, color: C.espressoMid, background: C.creamDark, border: `1px solid ${C.tanLight}`, borderRadius: 20, padding: '4px 11px' }}>{tag}</span>
          ))}
        </div>

        <div style={{ display: 'flex', borderTop: `1px solid ${C.tanLight}`, borderBottom: `1px solid ${C.tanLight}`, padding: '14px 0', marginBottom: 20 }}>
          {[
            { label: 'Elevation', value: origin.elevation },
            { label: 'Harvest', value: origin.harvestWindow },
            { label: 'Varieties', value: `${origin.varieties.length}` },
          ].map((s, i) => (
            <div key={s.label} style={{ flex: 1, textAlign: 'center', borderLeft: i > 0 ? `1px solid ${C.tanLight}` : 'none', padding: '0 6px' }}>
              <div style={{ fontFamily: F.sans, fontSize: 9, letterSpacing: '0.08em', textTransform: 'uppercase', color: C.espressoLight, marginBottom: 5 }}>{s.label}</div>
              <div style={{ fontFamily: F.mono, fontSize: 12, color: C.espresso, lineHeight: 1.3 }}>{s.value}</div>
            </div>
          ))}
        </div>

        <p style={{ fontFamily: F.sans, fontSize: 13, color: C.espressoMid, lineHeight: 1.65, marginBottom: 26 }}>{origin.description}</p>

        <div style={{ marginBottom: 26 }}>
          <SectionLabel>Community Cup Score</SectionLabel>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <RadarChart data={origin.communityScore} labels={palateLabels} size={150} color={C.sage} />
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 8 }}>
              {palateLabels.map((lb, i) => {
                const v = origin.communityScore[i] ?? 0;
                return (
                  <div key={lb} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontFamily: F.sans, fontSize: 10, color: C.espressoLight, width: 66, flexShrink: 0 }}>{lb}</span>
                    <div style={{ flex: 1, height: 3, borderRadius: 99, background: C.tanLight, overflow: 'hidden' }}>
                      <div style={{ width: `${(v / 5) * 100}%`, height: '100%', background: C.sage, borderRadius: 99 }} />
                    </div>
                    <span style={{ fontFamily: F.mono, fontSize: 10, color: C.espressoMid, width: 22, textAlign: 'right', flexShrink: 0 }}>{v.toFixed(1)}</span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {origin.varieties.length > 0 && (
          <div style={{ marginBottom: 26 }}>
            <SectionLabel>Varieties grown</SectionLabel>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {origin.varieties.map((slug) => {
                const v = varietyBySlug(slug);
                return (
                  <button key={slug} type="button" onClick={() => onOpenVariety(slug)} style={chipStyle}>
                    {v?.name ?? slug}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        <div>
          <SectionLabel>Currently sourcing</SectionLabel>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {origin.roasters.map((name) => {
              const slug = roasterByName(name)?.slug;
              return (
                <button key={name} type="button" onClick={() => slug && onOpenRoaster(slug)} style={chipStyle}>
                  {name}
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

const chipStyle = {
  fontFamily: F.sans,
  fontSize: 12,
  color: C.espresso,
  background: C.creamDark,
  border: `1px solid ${C.tanLight}`,
  borderRadius: 22,
  padding: '11px 16px', // >= 44px tap target
  cursor: 'pointer',
} as const;
