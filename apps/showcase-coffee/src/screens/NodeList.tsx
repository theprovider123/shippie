// Browse every node of one type (Origins / Varieties / Processes / Roasters).

import { C, F } from '../tokens.ts';
import { ChevronLeft, type NodeTypeLabel } from '../components/icons.tsx';
import { ORIGINS, PROCESSES, ROASTERS, VARIETIES, type WorldNodeType } from '../data/world.ts';

interface Row {
  slug: string;
  title: string;
  subtitle: string;
  type: WorldNodeType;
}

function rowsFor(label: NodeTypeLabel): Row[] {
  switch (label) {
    case 'Origins':
      return ORIGINS.map((o) => ({ slug: o.slug, title: o.name, subtitle: `${o.country} · ${o.region}`, type: 'Origin' }));
    case 'Varieties':
      return VARIETIES.map((v) => ({ slug: v.slug, title: v.name, subtitle: v.species, type: 'Variety' }));
    case 'Processes':
      return PROCESSES.map((p) => ({ slug: p.slug, title: p.name, subtitle: `${p.family} process`, type: 'Process' }));
    case 'Roasters':
      return ROASTERS.map((r) => ({ slug: r.slug, title: r.name, subtitle: `${r.city}, ${r.country}`, type: 'Roaster' }));
  }
}

export interface NodeListProps {
  label: NodeTypeLabel;
  onBack: () => void;
  onOpen: (type: WorldNodeType, slug: string) => void;
}

export function NodeList({ label, onBack, onOpen }: NodeListProps) {
  const rows = rowsFor(label);
  return (
    <div style={{ minHeight: '100%', padding: '10px 20px 32px' }}>
      <div style={{ marginBottom: 12 }}>
        <button type="button" className="tap-target" onClick={onBack} style={{ background: 'none', border: 'none', display: 'flex', alignItems: 'center', gap: 5, fontFamily: F.sans, fontSize: 13, color: C.terracotta, cursor: 'pointer' }}>
          <ChevronLeft />
          World
        </button>
      </div>
      <h2 style={{ fontFamily: F.serif, fontSize: 28, fontWeight: 600, color: C.espresso, marginBottom: 18 }}>{label}</h2>
      <div style={{ border: `1px solid ${C.tanLight}`, borderRadius: 12, overflow: 'hidden' }}>
        {rows.map((r, i) => (
          <button
            key={r.slug}
            type="button"
            onClick={() => onOpen(r.type, r.slug)}
            style={{ width: '100%', textAlign: 'left', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, padding: '13px 16px', background: i % 2 ? C.cream : C.creamDark, border: 'none', borderTop: i > 0 ? `1px solid ${C.tanLight}` : 'none', cursor: 'pointer' }}
          >
            <div style={{ minWidth: 0 }}>
              <div style={{ fontFamily: F.serif, fontSize: 16, color: C.espresso }}>{r.title}</div>
              <div style={{ fontFamily: F.sans, fontSize: 11, color: C.espressoLight }}>{r.subtitle}</div>
            </div>
            <span style={{ color: C.tan, fontSize: 16 }}>›</span>
          </button>
        ))}
      </div>
    </div>
  );
}
