// lot. — app root. Local-first state, three-screen navigation with the
// design's enter/rise transitions, and Shippie intent broadcasts on brew.

import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { createShippieIframeSdk } from '@shippie/iframe-sdk';
import { createLocalNavigation } from '@shippie/sdk/wrapper';

import { C } from './tokens.ts';
import { CUP_AXIS_LABELS, CUP_AXES, type Bag, type BrewLog, type BrewMethod, type Recipe } from './types.ts';
import {
  activeRecipeForBag,
  bagsByStatus,
  brewsForBag,
  distinctOrigins,
  isoNow,
  load,
  newId,
  save,
  scoresForBag,
  type Store,
} from './db.ts';
import { derivePalate } from './lib/profile.ts';
import { drain, publish } from './lib/sync.ts';
import { originBySlug, processBySlug, roasterBySlug, varietyBySlug, type WorldNodeType } from './data/world.ts';

import { NavBar, type Tab } from './components/NavBar.tsx';
import type { NodeTypeLabel } from './components/icons.tsx';
import { BrewScreen } from './screens/Brew.tsx';
import { CellarScreen } from './screens/Cellar.tsx';
import { WorldScreen, type CellarLink } from './screens/World.tsx';
import { OriginNode } from './screens/OriginNode.tsx';
import { VarietyNode, ProcessNode, RoasterNode } from './screens/WorldNode.tsx';
import { NodeList } from './screens/NodeList.tsx';
import { BagDetail } from './screens/BagDetail.tsx';
import { SwitchBagSheet } from './components/SwitchBagSheet.tsx';
import { AddBagSheet } from './components/AddBagSheet.tsx';
import { CupScoreSheet, draftToScore, type CupScoreDraft } from './components/CupScoreSheet.tsx';
import { CoffeeSplash } from './components/CoffeeSplash.tsx';

const shippie = createShippieIframeSdk({ appId: 'app_coffee' });

const PALATE_LABELS = CUP_AXES.map((a) => CUP_AXIS_LABELS[a]);

const MG_PER_GRAM: Record<BrewMethod, number> = {
  v60: 4.5, aeropress: 5.0, chemex: 4.0, espresso: 8.0, moka: 6.0, frenchpress: 4.5, coldbrew: 5.5,
};

type Detail =
  | { kind: 'origin'; slug: string }
  | { kind: 'variety'; slug: string }
  | { kind: 'process'; slug: string }
  | { kind: 'roaster'; slug: string }
  | { kind: 'nodeList'; label: NodeTypeLabel }
  | { kind: 'bag'; id: string };

interface Screen {
  tab: Tab;
  detail: Detail | null;
}

type SheetKind = null | 'switch' | 'add' | { cup: { bagId: string; brewLogId?: string } };

function detailEq(a: Detail | null, b: Detail | null): boolean {
  if (a === null || b === null) return a === b;
  if (a.kind !== b.kind) return false;
  if (a.kind === 'nodeList' && b.kind === 'nodeList') return a.label === b.label;
  if ('slug' in a && 'slug' in b) return a.slug === b.slug;
  if (a.kind === 'bag' && b.kind === 'bag') return a.id === b.id;
  return false;
}

export function App() {
  const [store, setStore] = useState<Store>(() => load());
  const [tab, setTab] = useState<Tab>('brew');
  const [detail, setDetail] = useState<Detail | null>(null);
  const [screenKey, setScreenKey] = useState(0);
  const [rise, setRise] = useState(false);
  const [sheet, setSheet] = useState<SheetKind>(null);
  const [activeBagId, setActiveBagId] = useState<string | null>(() => {
    const active = load().bags.filter((b) => b.status === 'active');
    return active[0]?.id ?? null;
  });

  const nav = useMemo(
    () =>
      createLocalNavigation<Screen>(
        { tab: 'brew', detail: null },
        (next) => {
          setTab(next.tab);
          setDetail(next.detail);
          setRise(next.detail != null);
          setScreenKey((k) => k + 1);
        },
        { isEqual: (a, b) => a.tab === b.tab && detailEq(a.detail, b.detail) },
      ),
    [],
  );
  useEffect(() => () => nav.destroy(), [nav]);

  // Debounced persistence.
  useEffect(() => {
    const id = window.setTimeout(() => save(store), 300);
    return () => window.clearTimeout(id);
  }, [store]);

  // Drain the sync queue on open (silent if offline / no endpoint).
  useEffect(() => {
    let cancelled = false;
    void drain(store.syncQueue).then((q) => {
      if (!cancelled) setStore((s) => ({ ...s, syncQueue: q }));
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ─── navigation helpers ─────────────────────────────────────
  const goTab = (t: Tab) => {
    setTab(t);
    setDetail(null);
    setRise(false);
    setScreenKey((k) => k + 1);
    void nav.navigate({ tab: t, detail: null }, { kind: 'crossfade' });
  };
  const open = (d: Detail) => {
    setDetail(d);
    setRise(true);
    setScreenKey((k) => k + 1);
    void nav.navigate({ tab, detail: d }, { kind: 'rise' });
  };
  const back = () => {
    setDetail(null);
    setRise(false);
    setScreenKey((k) => k + 1);
    void nav.backOrReplace({ tab, detail: null }, { kind: 'crossfade' });
  };
  const openHit = (type: WorldNodeType, slug: string) => {
    const kind = type.toLowerCase() as 'origin' | 'variety' | 'process' | 'roaster';
    open({ kind, slug });
  };

  // ─── mutations ──────────────────────────────────────────────
  const activeBags = bagsByStatus(store, 'active');
  const activeBag = activeBags.find((b) => b.id === activeBagId) ?? activeBags[0] ?? null;
  const activeRecipe = activeBag ? activeRecipeForBag(store, activeBag.id) : undefined;

  function logBrew(seconds: number) {
    if (!activeBag) return;
    const brew: BrewLog = {
      id: newId('brew'),
      bagId: activeBag.id,
      recipeId: activeRecipe?.id,
      actualDose: activeRecipe?.dose,
      actualYield: activeRecipe?.yield,
      actualTime: seconds,
      stepTimings: (activeRecipe?.steps ?? []).map((s) => ({ label: s.label, targetTime: s.targetTime, actualTime: s.targetTime })),
      published: false,
      createdAt: isoNow(),
    };
    const grams = activeRecipe?.dose ?? 18;
    setStore((s) => ({
      ...s,
      brewLogs: [brew, ...s.brewLogs].slice(0, 300),
      bags: s.bags.map((b) => (b.id === activeBag.id ? { ...b, gramsRemaining: Math.max(0, b.gramsRemaining - grams), updatedAt: isoNow() } : b)),
    }));
    const method = activeRecipe?.method ?? 'espresso';
    shippie.intent.broadcast('coffee-brewed', [
      { bag_name: activeBag.name, method, brew_seconds: seconds, brewed_at: brew.createdAt },
    ]);
    shippie.intent.broadcast('caffeine-logged', [
      { kind: 'coffee', method, mg: Math.round(grams * MG_PER_GRAM[method]), bean_name: activeBag.name, logged_at: brew.createdAt },
    ]);
    shippie.feel.texture('milestone');
  }

  function createRecipe() {
    if (!activeBag) return;
    const now = isoNow();
    const recipe: Recipe = {
      id: newId('recipe'),
      bagId: activeBag.id,
      method: 'v60',
      dose: 15,
      yield: 250,
      ratio: '1:16',
      grindSetting: 'medium-fine',
      waterTemp: 94,
      totalTime: 180,
      steps: [
        { label: 'Bloom', targetTime: 30, targetVolume: 45 },
        { label: 'Pour', targetTime: 75, targetVolume: 150 },
        { label: 'Pour', targetTime: 120, targetVolume: 250 },
        { label: 'Drawdown', targetTime: 180, targetVolume: 250 },
      ],
      isActive: true,
      isDialled: false,
      createdAt: now,
      updatedAt: now,
    };
    setStore((s) => ({ ...s, recipes: [recipe, ...s.recipes] }));
  }

  function saveCup(draft: CupScoreDraft, bagId: string, brewLogId?: string) {
    const score = draftToScore(draft, bagId, { id: newId('cup'), createdAt: isoNow() }, brewLogId);
    setStore((s) => ({ ...s, cupScores: [score, ...s.cupScores] }));
    shippie.feel.texture('confirm');
    if (draft.publish) {
      void publish(store.syncQueue, 'cupScore', {
        bagId,
        scores: draft.axes,
        tasteNotes: draft.tasteNotes,
        at: score.createdAt,
      }).then((q) => setStore((s) => ({ ...s, syncQueue: q })));
    }
    setSheet(null);
  }

  function addBag(bag: Bag) {
    setStore((s) => ({ ...s, bags: [bag, ...s.bags] }));
    if (bag.status === 'active') setActiveBagId(bag.id);
    setSheet(null);
  }

  function toggleFinished(bagId: string) {
    setStore((s) => ({
      ...s,
      bags: s.bags.map((b) =>
        b.id === bagId ? { ...b, status: b.status === 'finished' ? 'active' : 'finished', updatedAt: isoNow() } : b,
      ),
    }));
  }

  // ─── derived ────────────────────────────────────────────────
  const palate = useMemo(() => derivePalate(store.cupScores), [store.cupScores]);
  const cellarLinks: CellarLink[] = useMemo(
    () =>
      store.bags
        .filter((b) => b.status !== 'finished' && b.worldNodeSlug && originBySlug(b.worldNodeSlug))
        .slice(0, 4)
        .map((b) => {
          const o = originBySlug(b.worldNodeSlug as string);
          return { bag: b.name, node: o?.name ?? '', type: 'Origin' as WorldNodeType, slug: b.worldNodeSlug as string };
        }),
    [store.bags],
  );
  const featured = originBySlug('yirgacheffe') ?? originBySlug(store.bags[0]?.worldNodeSlug ?? '');

  // ─── render ─────────────────────────────────────────────────
  let content: ReactNode = null;
  if (detail) {
    content = renderDetail(detail);
  } else if (tab === 'brew') {
    content = activeBag ? (
      <BrewScreen
        bag={activeBag}
        recipe={activeRecipe}
        onLogBrew={logBrew}
        onLogCup={() => setSheet({ cup: { bagId: activeBag.id } })}
        onSwitchBag={() => setSheet('switch')}
        onCreateRecipe={createRecipe}
      />
    ) : (
      <EmptyBrew onAdd={() => setSheet('add')} />
    );
  } else if (tab === 'cellar') {
    content = (
      <CellarScreen
        bags={store.bags}
        activeBagId={activeBag?.id ?? null}
        palate={palate}
        brewCount={store.brewLogs.length}
        originCount={distinctOrigins(store)}
        onAddBag={() => setSheet('add')}
        onOpenBag={(id) => open({ kind: 'bag', id })}
      />
    );
  } else if (featured) {
    content = (
      <WorldScreen
        featured={featured}
        cellarLinks={cellarLinks}
        onOpenOrigin={(slug) => open({ kind: 'origin', slug })}
        onOpenNodeList={(label) => open({ kind: 'nodeList', label })}
        onOpenHit={openHit}
      />
    );
  }

  function renderDetail(d: Detail): ReactNode {
    switch (d.kind) {
      case 'origin': {
        const o = originBySlug(d.slug);
        return o ? (
          <OriginNode origin={o} palateLabels={PALATE_LABELS} onBack={back} onOpenVariety={(slug) => open({ kind: 'variety', slug })} onOpenRoaster={(slug) => open({ kind: 'roaster', slug })} />
        ) : null;
      }
      case 'variety': {
        const v = varietyBySlug(d.slug);
        return v ? <VarietyNode variety={v} onBack={back} onOpenOrigin={(slug) => open({ kind: 'origin', slug })} /> : null;
      }
      case 'process': {
        const p = processBySlug(d.slug);
        return p ? <ProcessNode process={p} onBack={back} /> : null;
      }
      case 'roaster': {
        const r = roasterBySlug(d.slug);
        return r ? <RoasterNode roaster={r} onBack={back} /> : null;
      }
      case 'nodeList':
        return <NodeList label={d.label} onBack={back} onOpen={openHit} />;
      case 'bag': {
        const bag = store.bags.find((b) => b.id === d.id);
        if (!bag) return null;
        return (
          <BagDetail
            bag={bag}
            recipes={store.recipes.filter((r) => r.bagId === bag.id)}
            brews={brewsForBag(store, bag.id)}
            scores={scoresForBag(store, bag.id)}
            onBack={back}
            onBrewThis={() => {
              setActiveBagId(bag.id);
              goTab('brew');
            }}
            onLogCup={() => setSheet({ cup: { bagId: bag.id } })}
            onOpenOrigin={(slug) => open({ kind: 'origin', slug })}
            onToggleFinished={() => toggleFinished(bag.id)}
          />
        );
      }
    }
  }

  const cupSheet = typeof sheet === 'object' && sheet !== null && 'cup' in sheet ? sheet.cup : null;
  const cupBag = cupSheet ? store.bags.find((b) => b.id === cupSheet.bagId) : null;

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', background: C.cream }}>
      <CoffeeSplash />
      <div style={{ flex: 1, overflowY: 'auto', paddingTop: 'env(safe-area-inset-top, 0px)' }}>
        <div key={screenKey} className={rise ? 'slide-up' : 'screen-enter'}>
          {content}
        </div>
      </div>
      {!detail && <NavBar active={tab} onNav={goTab} />}

      {sheet === 'switch' && activeBag && (
        <SwitchBagSheet bags={activeBags} activeBagId={activeBag.id} onSelect={setActiveBagId} onClose={() => setSheet(null)} />
      )}
      {sheet === 'add' && <AddBagSheet onClose={() => setSheet(null)} onAdd={addBag} />}
      {cupSheet && cupBag && (
        <CupScoreSheet bag={cupBag} brewLogId={cupSheet.brewLogId} onClose={() => setSheet(null)} onSave={(draft) => saveCup(draft, cupSheet.bagId, cupSheet.brewLogId)} />
      )}
    </div>
  );
}

function EmptyBrew({ onAdd }: { onAdd: () => void }) {
  return (
    <div style={{ padding: '60px 24px', textAlign: 'center', background: C.cream, minHeight: '100%' }}>
      <div style={{ fontFamily: "'Playfair Display', serif", fontSize: 26, fontStyle: 'italic', color: C.espressoMid, marginBottom: 10 }}>Nothing brewing</div>
      <p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13, color: C.espressoLight, marginBottom: 20, lineHeight: 1.6 }}>
        Add a bag to your shelf and lot. will keep its freshness, recipe, and palate.
      </p>
      <button type="button" onClick={onAdd} style={{ fontFamily: "'Playfair Display', serif", fontStyle: 'italic', fontSize: 15, color: C.terracotta, background: 'rgba(196,99,58,0.06)', border: '1px solid rgba(196,99,58,0.5)', borderRadius: 8, padding: '10px 22px', cursor: 'pointer' }}>
        Add a bag
      </button>
    </div>
  );
}
