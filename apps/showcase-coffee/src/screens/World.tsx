// World screen — the knowledge graph. Ported from lot-world.jsx with a live
// local search across every node and real "from your cellar" links.

import { useState } from 'react';
import { C, F } from '../tokens.ts';
import { NODE_ICONS, SearchIcon, type NodeTypeLabel } from '../components/icons.tsx';
import { TopoMap } from '../components/TopoMap.tsx';
import {
  flavourFor,
  searchWorld,
  type WorldHit,
  type WorldNodeType,
  type WorldOrigin,
} from '../data/world.ts';

function SectionLabel({ children, action, onAction }: { children: string; action?: string; onAction?: () => void }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 12 }}>
      <span style={{ fontFamily: F.sans, fontSize: 10, letterSpacing: '0.1em', textTransform: 'uppercase', color: C.espressoLight }}>{children}</span>
      {action && (
        <button type="button" className="tap-target" onClick={onAction} style={{ background: 'none', border: 'none', fontFamily: F.sans, fontSize: 12, color: C.terracotta, cursor: 'pointer' }}>
          {action}
        </button>
      )}
    </div>
  );
}

export interface CellarLink {
  bag: string;
  node: string;
  type: WorldNodeType;
  slug: string;
}

export interface WorldScreenProps {
  featured: WorldOrigin;
  cellarLinks: CellarLink[];
  onOpenOrigin: (slug: string) => void;
  onOpenNodeList: (label: NodeTypeLabel) => void;
  onOpenHit: (type: WorldNodeType, slug: string) => void;
}

export function WorldScreen({ featured, cellarLinks, onOpenOrigin, onOpenNodeList, onOpenHit }: WorldScreenProps) {
  const [query, setQuery] = useState('');
  const hits: WorldHit[] = query.trim() ? searchWorld(query) : [];
  const featuredFlavour = flavourFor(featured.slug);

  return (
    <div style={{ padding: '10px 20px 28px', minHeight: '100%' }}>
      <div style={{ fontFamily: F.mono, fontSize: 12, color: C.tan, letterSpacing: '0.16em', marginBottom: 16 }}>lot.</div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 9, background: C.creamDark, border: `1px solid ${C.tanLight}`, borderRadius: 22, padding: '10px 16px', marginBottom: 12 }}>
        <SearchIcon />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Ethiopia, Yirgacheffe, Square Mile…"
          aria-label="Search the coffee world"
          style={{ flex: 1, background: 'none', border: 'none', outline: 'none', fontFamily: F.sans, fontSize: 16, color: C.espresso, minWidth: 0 }}
        />
        {query && (
          <button type="button" className="tap-target" onClick={() => setQuery('')} aria-label="Clear search" style={{ background: 'none', border: 'none', color: C.espressoLight, fontFamily: F.sans, fontSize: 16, cursor: 'pointer', lineHeight: 1 }}>
            ×
          </button>
        )}
      </div>

      {query.trim() ? (
        <div style={{ marginTop: 8 }}>
          {hits.length === 0 ? (
            <div style={{ padding: '32px 0', textAlign: 'center', fontFamily: F.sans, fontSize: 13, color: C.espressoLight, fontStyle: 'italic' }}>
              Nothing matches “{query}”.
            </div>
          ) : (
            <div style={{ border: `1px solid ${C.tanLight}`, borderRadius: 10, overflow: 'hidden' }}>
              {hits.map((h, i) => (
                <button
                  key={`${h.type}-${h.slug}`}
                  type="button"
                  onClick={() => onOpenHit(h.type, h.slug)}
                  style={{
                    width: '100%',
                    textAlign: 'left',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: 10,
                    padding: '12px 14px',
                    background: 'none',
                    border: 'none',
                    borderTop: i > 0 ? `1px solid ${C.tanLight}` : 'none',
                    cursor: 'pointer',
                  }}
                >
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontFamily: F.serif, fontSize: 15, color: C.espresso }}>{h.title}</div>
                    <div style={{ fontFamily: F.sans, fontSize: 11, color: C.espressoLight }}>{h.subtitle}</div>
                  </div>
                  <span style={{ fontFamily: F.sans, fontSize: 9, color: C.espressoLight, textTransform: 'uppercase', letterSpacing: '0.07em', flexShrink: 0 }}>{h.type}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      ) : (
        <>
          <div style={{ display: 'flex', gap: 8, marginBottom: 22 }}>
            {['Near you', 'In season'].map((fl) => (
              <span key={fl} style={{ fontFamily: F.sans, fontSize: 12, color: C.espressoMid, background: C.creamDark, border: `1px solid ${C.tanLight}`, borderRadius: 20, padding: '5px 13px' }}>{fl}</span>
            ))}
          </div>

          <button
            type="button"
            onClick={() => onOpenOrigin(featured.slug)}
            style={{ display: 'block', width: '100%', padding: 0, border: 'none', borderRadius: 14, overflow: 'hidden', marginBottom: 24, cursor: 'pointer', boxShadow: '0 2px 16px rgba(44,26,14,0.12)' }}
          >
            <div style={{ position: 'relative', height: 174 }}>
              <TopoMap width={350} height={174} />
              <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to top, rgba(28,14,6,0.88) 0%, rgba(28,14,6,0.25) 55%, transparent 100%)' }} />
              <div style={{ position: 'absolute', bottom: 18, left: 18, right: 18, textAlign: 'left' }}>
                <div style={{ fontFamily: F.serif, fontSize: 27, fontWeight: 600, color: '#F4EFE3', lineHeight: 1.1, marginBottom: 3 }}>{featured.name}</div>
                <div style={{ fontFamily: F.sans, fontSize: 10, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'rgba(244,239,227,0.65)', marginBottom: 10 }}>{featured.country}</div>
                <div style={{ display: 'flex', gap: 7 }}>
                  {featuredFlavour.map((tag) => (
                    <span key={tag} style={{ fontFamily: F.sans, fontSize: 11, color: '#F4EFE3', background: 'rgba(244,239,227,0.18)', border: '1px solid rgba(244,239,227,0.28)', borderRadius: 20, padding: '3px 10px' }}>{tag}</span>
                  ))}
                </div>
              </div>
            </div>
          </button>

          <SectionLabel>Explore</SectionLabel>
          <div style={{ overflowX: 'auto', marginInline: -20, paddingInline: 20, marginBottom: 24 }}>
            <div style={{ display: 'flex', gap: 10, paddingRight: 20 }}>
              {(Object.keys(NODE_ICONS) as NodeTypeLabel[]).map((label) => (
                <button
                  key={label}
                  type="button"
                  onClick={() => onOpenNodeList(label)}
                  style={{ flexShrink: 0, width: 88, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, background: C.creamDark, border: `1px solid ${C.tanLight}`, borderRadius: 12, padding: '14px 8px 12px', cursor: 'pointer' }}
                >
                  <div style={{ width: 32, height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{NODE_ICONS[label]}</div>
                  <span style={{ fontFamily: F.sans, fontSize: 12, color: C.espressoMid }}>{label}</span>
                </button>
              ))}
            </div>
          </div>

          <SectionLabel action="See all" onAction={() => onOpenNodeList('Origins')}>From your cellar</SectionLabel>
          {cellarLinks.length === 0 ? (
            <div style={{ border: `1px dashed ${C.tanLight}`, borderRadius: 10, padding: '20px', textAlign: 'center', fontFamily: F.sans, fontSize: 12, color: C.espressoLight }}>
              Bags you add link to their origins here.
            </div>
          ) : (
            <div style={{ border: `1px solid ${C.tanLight}`, borderRadius: 10, overflow: 'hidden', marginBottom: 24 }}>
              {cellarLinks.map((link, i) => (
                <button
                  key={`${link.bag}-${link.slug}`}
                  type="button"
                  onClick={() => onOpenHit(link.type, link.slug)}
                  style={{ width: '100%', textAlign: 'left', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '11px 14px', minHeight: 44, background: 'none', border: 'none', borderTop: i > 0 ? `1px solid ${C.tanLight}` : 'none', cursor: 'pointer' }}
                >
                  <span style={{ fontFamily: F.sans, fontSize: 12, color: C.espressoMid, flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', paddingRight: 12 }}>{link.bag}</span>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 7, flexShrink: 0 }}>
                    <span style={{ fontFamily: F.serif, fontSize: 13, color: C.espresso }}>{link.node}</span>
                    <span style={{ fontFamily: F.sans, fontSize: 9, color: C.espressoLight, textTransform: 'uppercase', letterSpacing: '0.07em', paddingTop: 1 }}>{link.type}</span>
                  </span>
                </button>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
