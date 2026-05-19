/**
 * Shippie Body Metrics — root container.
 *
 * Five tabs: Today (entry + recent), Photos (timeline + compare),
 * Trend (chart + smoothing), Goal (target + projection), Settings
 * (privacy + export + wipe).
 *
 * Architecture invariants preserved from the previous version:
 *
 *   - Photos NEVER leave the device. There is no fetch path that
 *     uploads them. The privacy banner makes that contract visible.
 *   - The `body-metrics-logged` intent broadcast still fires on
 *     every Log so Journal's quick-entry prompts and Habit Tracker
 *     auto-checks can react. Body fat % stays out of the payload —
 *     it's a more sensitive number.
 */
import { useEffect, useMemo, useState } from 'react';
import { createShippieIframeSdk } from '@shippie/iframe-sdk';
import { createLocalNavigation } from '@shippie/sdk/wrapper';
import { Today } from './pages/Today.tsx';
import { Photos } from './pages/Photos.tsx';
import { TrendPage } from './pages/Trend.tsx';
import { GoalPage } from './pages/GoalPage.tsx';
import { Settings } from './pages/Settings.tsx';
import {
  loadEntries,
  loadGoal,
  saveEntries,
  saveGoal,
  type Entry,
  type Goal,
} from './lib/store.ts';
import { deletePhoto, savePhoto } from './photo-store.ts';

const shippie = createShippieIframeSdk({ appId: 'app_body_metrics' });

type Tab = 'today' | 'photos' | 'trend' | 'goal' | 'settings';

const TABS: Array<{ id: Tab; label: string }> = [
  { id: 'today', label: 'Today' },
  { id: 'photos', label: 'Photos' },
  { id: 'trend', label: 'Trend' },
  { id: 'goal', label: 'Goal' },
  { id: 'settings', label: 'Settings' },
];

export function App() {
  const [entries, setEntries] = useState<Entry[]>(() => loadEntries());
  const [goal, setGoalState] = useState<Goal | null>(() => loadGoal());
  const [tab, setTab] = useState<Tab>('today');
  const localNavigation = useMemo(
    () => createLocalNavigation<Tab>('today', setTab),
    [],
  );

  // Persistence — debounce-free; entries volume stays well under
  // localStorage's 5 MB ceiling because photo bytes live elsewhere.
  useEffect(() => {
    saveEntries(entries);
  }, [entries]);

  useEffect(() => {
    saveGoal(goal);
  }, [goal]);

  useEffect(() => () => localNavigation.destroy(), [localNavigation]);

  const photoCount = useMemo(
    () => entries.filter((e) => e.photoLocalId).length,
    [entries],
  );

  async function logEntry({
    entry,
    photoFile,
  }: {
    entry: Omit<Entry, 'id'>;
    photoFile: File | null;
  }) {
    const id = `e_${Date.now()}`;
    let photoLocalId: string | undefined = entry.photoLocalId;
    if (photoFile) {
      photoLocalId = `p_${Date.now()}`;
      await savePhoto(photoLocalId, photoFile);
    }
    const full: Entry = { ...entry, id, photoLocalId };
    setEntries((prev) => [full, ...prev.filter((x) => x.date !== entry.date)]);
    // Broadcast `body-metrics-logged` so Journal's quick-entry
    // prompts and Habit Tracker auto-checks can react. The payload
    // carries date + weightKg only — body fat % stays local.
    shippie.intent.broadcast('body-metrics-logged', [
      {
        date: entry.date,
        weightKg: entry.weightKg,
        loggedAt: new Date().toISOString(),
        kind: 'weight',
        title: `${entry.weightKg.toFixed(1)} kg`,
      },
    ]);
    shippie.feel.texture('confirm');
  }

  async function removeEntry(entry: Entry) {
    if (entry.photoLocalId) await deletePhoto(entry.photoLocalId).catch(() => undefined);
    setEntries((prev) => prev.filter((e) => e.id !== entry.id));
    shippie.feel.texture('delete');
  }

  async function wipeAll() {
    for (const e of entries) {
      if (e.photoLocalId) await deletePhoto(e.photoLocalId).catch(() => undefined);
    }
    setEntries([]);
    setGoalState(null);
    shippie.feel.texture('delete');
  }

  return (
    <main>
      <div className="privacy-ribbon" role="region" aria-label="Privacy notice">
        <span aria-hidden="true">🔒</span>
        <span>
          Photos stay on this device. No upload path exists.{' '}
          <a
            href="https://github.com/shippie-app/shippie/tree/main/apps/showcase-body-metrics"
            target="_blank"
            rel="noopener noreferrer"
          >
            Read the source
          </a>
          .
        </span>
      </div>

      <header>
        <h1 className="title-hero">Body</h1>
        <p className="eyebrow">
          <span className="score-numeric">{entries.length}</span> entr{entries.length === 1 ? 'y' : 'ies'} ·{' '}
          <span className="score-numeric">{photoCount}</span> photo{photoCount === 1 ? '' : 's'} on this device
        </p>
      </header>

      <nav className="tabs" role="tablist" aria-label="Body Metrics sections">
        {TABS.map((t) => (
          <button
            key={t.id}
            role="tab"
            type="button"
            aria-selected={tab === t.id}
            className={`tab${tab === t.id ? ' is-active' : ''}`}
            onClick={() => {
              void localNavigation.navigate(t.id, { kind: 'crossfade' });
              shippie.feel.texture('navigate');
            }}
          >
            {t.label}
          </button>
        ))}
      </nav>

      {tab === 'today' && (
        <Today entries={entries} onLog={logEntry} onRemove={removeEntry} />
      )}
      {tab === 'photos' && <Photos entries={entries} />}
      {tab === 'trend' && <TrendPage entries={entries} goal={goal} />}
      {tab === 'goal' && (
        <GoalPage entries={entries} goal={goal} onSave={setGoalState} />
      )}
      {tab === 'settings' && <Settings entries={entries} onWipe={wipeAll} />}
    </main>
  );
}
