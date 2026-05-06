import { useEffect, useState } from 'react';
import { createShippieIframeSdk } from '@shippie/iframe-sdk';
import {
  load,
  save,
  MG_PER_GRAM,
  type Bean,
  type Brew,
  type TastingNote,
} from './db.ts';
import { BrewPage } from './pages/Brew.tsx';
import { BeansPage } from './pages/Beans.tsx';
import { BeanPage } from './pages/Bean.tsx';
import { HistoryPage } from './pages/History.tsx';

const shippie = createShippieIframeSdk({ appId: 'app_coffee' });

type Tab = 'brew' | 'beans' | 'history';

const TABS: ReadonlyArray<{ id: Tab; label: string }> = [
  { id: 'brew', label: 'Brew' },
  { id: 'beans', label: 'Beans' },
  { id: 'history', label: 'History' },
];

export function App() {
  const initial = load();
  const [beans, setBeans] = useState<Bean[]>(initial.beans);
  const [brews, setBrews] = useState<Brew[]>(initial.brews);
  const [tastingNotes, setTastingNotes] = useState<TastingNote[]>(initial.tasting_notes);
  const [tab, setTab] = useState<Tab>('brew');
  const [selectedBeanId, setSelectedBeanId] = useState<string | null>(initial.beans[0]?.id ?? null);
  // When set, render BeanPage instead of the active tab.
  const [openBeanId, setOpenBeanId] = useState<string | null>(null);

  useEffect(() => {
    save({ beans, brews, tasting_notes: tastingNotes });
  }, [beans, brews, tastingNotes]);

  function addBrew(b: Brew) {
    setBrews((prev) => [b, ...prev].slice(0, 200));
  }

  function rateLastBrew(rating: number, note: string) {
    setBrews((prev) => {
      if (prev.length === 0) return prev;
      const [head, ...rest] = prev;
      if (!head) return prev;
      return [{ ...head, taste_rating: rating, note: note || head.note }, ...rest];
    });
    shippie.feel.texture('confirm');
  }

  function broadcastBrew(brew: Brew) {
    // Rich payload for any app that wants the full brew context.
    shippie.intent.broadcast('coffee-brewed', [
      {
        bean_id: brew.bean_id,
        bean_name: brew.bean_name,
        weight_g: brew.weight_g,
        water_g: brew.water_g,
        ratio: brew.ratio,
        method: brew.method,
        brew_seconds: brew.brew_seconds,
        brewed_at: brew.brewed_at,
      },
    ]);
    // Drink-shaped — sleep-logger and daily-briefing pick this one up.
    const mg = Math.round(brew.weight_g * MG_PER_GRAM[brew.method]);
    shippie.intent.broadcast('caffeine-logged', [
      {
        kind: 'coffee',
        method: brew.method,
        mg,
        bean_name: brew.bean_name,
        logged_at: brew.brewed_at,
      },
    ]);
  }

  function saveBean(b: Bean) {
    setBeans((prev) => {
      const i = prev.findIndex((x) => x.id === b.id);
      if (i >= 0) {
        const out = [...prev];
        out[i] = b;
        return out;
      }
      return [b, ...prev];
    });
    setSelectedBeanId(b.id);
  }

  function deleteBean(id: string) {
    setBeans((prev) => prev.filter((b) => b.id !== id));
    if (selectedBeanId === id) {
      const next = beans.find((b) => b.id !== id) ?? null;
      setSelectedBeanId(next?.id ?? null);
    }
    if (openBeanId === id) setOpenBeanId(null);
    setTastingNotes((prev) => prev.filter((n) => n.bean_id !== id));
  }

  function addTastingNote(n: TastingNote) {
    setTastingNotes((prev) => [n, ...prev]);
    shippie.feel.texture('confirm');
  }

  function openYourData() {
    shippie.openYourData({ appSlug: 'coffee' });
  }

  const openBean = openBeanId ? beans.find((b) => b.id === openBeanId) ?? null : null;

  return (
    <div className="app">
      <header className="app-header">
        <h1>Coffee</h1>
        <p className="subtitle">ratio · grind · brew</p>
      </header>

      {!openBean ? (
        <nav className="tabs" role="tablist">
          {TABS.map((t) => (
            <button
              key={t.id}
              role="tab"
              type="button"
              aria-selected={t.id === tab}
              className={`tab ${t.id === tab ? 'active' : ''}`}
              onClick={() => setTab(t.id)}
            >
              {t.label}
            </button>
          ))}
        </nav>
      ) : null}

      {openBean ? (
        <BeanPage
          bean={openBean}
          brews={brews}
          tastingNotes={tastingNotes}
          onSave={saveBean}
          onDelete={(id) => {
            deleteBean(id);
            setOpenBeanId(null);
          }}
          onAddTastingNote={addTastingNote}
          onBack={() => setOpenBeanId(null)}
          onBrewWithThis={() => {
            setSelectedBeanId(openBean.id);
            setOpenBeanId(null);
            setTab('brew');
          }}
        />
      ) : tab === 'brew' ? (
        <BrewPage
          beans={beans}
          selectedBeanId={selectedBeanId}
          onSelectBean={setSelectedBeanId}
          onAddBrew={addBrew}
          onRateLast={rateLastBrew}
          onTextureConfirm={() => shippie.feel.texture('confirm')}
          onTextureMilestone={() => shippie.feel.texture('milestone')}
          onBroadcast={broadcastBrew}
        />
      ) : tab === 'beans' ? (
        <BeansPage
          beans={beans}
          onSelect={(id) => setOpenBeanId(id)}
          onSave={saveBean}
        />
      ) : (
        <HistoryPage brews={brews} />
      )}

      <button type="button" className="your-data" onClick={openYourData}>
        Your Data
      </button>
    </div>
  );
}
