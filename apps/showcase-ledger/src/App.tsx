import { useCallback, useEffect, useMemo, useState } from 'react';
import { createShippieIframeSdk } from '@shippie/iframe-sdk';
import { createLocalNavigation, migrateLocalDbTablesToDocument } from '@shippie/sdk/wrapper';
import { resolveLocalDb } from './db/runtime.ts';
import {
  formatCents,
  getCurrency,
  listCategories,
  parseAmountToCents,
  seedDefaultCategories,
} from './db/queries.ts';
import type { Category, Entry } from './db/schema.ts';
import {
  CATEGORIES_TABLE,
  ENTRIES_TABLE,
  RECURRING_TABLE,
  SETTINGS_TABLE,
  categoriesSchema,
  entriesSchema,
  recurringSchema,
  settingsSchema,
} from './db/schema.ts';
import { EntryList } from './pages/EntryList.tsx';
import { MonthView } from './pages/MonthView.tsx';
import { Categories } from './pages/Categories.tsx';
import { Recurring } from './pages/Recurring.tsx';
import { Export } from './pages/Export.tsx';
import { Settings } from './pages/Settings.tsx';

type Tab = 'entries' | 'month' | 'recurring' | 'categories' | 'export' | 'settings' | 'more';

// Bottom-nav rulebook: 4 primary tabs visible, everything else in More.
// "Cats" expanded to "Categories" (clarity over brevity once we have
// the breathing room). CSV + Settings demoted — settings only belongs
// primary if the app is settings-heavy (Ledger isn't).
const PRIMARY_TABS: Array<{ id: Tab; label: string }> = [
  { id: 'entries', label: 'Entries' },
  { id: 'month', label: 'Month' },
  { id: 'recurring', label: 'Recurring' },
  { id: 'more', label: 'More' },
];
const MORE_TABS: Array<{ id: Tab; label: string; subtitle: string }> = [
  { id: 'categories', label: 'Categories', subtitle: 'Manage spending categories' },
  { id: 'export', label: 'Export', subtitle: 'Download a CSV of your entries' },
  { id: 'settings', label: 'Settings', subtitle: 'Currency and preferences' },
];

const shippie = createShippieIframeSdk({ appId: 'app_ledger' });

interface ConsumePrompt {
  intent: 'dined-out' | 'shopping-list';
  amountCents: number | null;
  amountText: string;
  note: string;
  categoryHint: string;
}

export function App() {
  const db = useMemo(() => resolveLocalDb(), []);
  const today = useMemo(() => new Date(), []);
  const [tab, setTab] = useState<Tab>('entries');
  const localNavigation = useMemo(
    () => createLocalNavigation<Tab>('entries', setTab),
    [],
  );
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth() + 1);
  const [refreshKey, setRefreshKey] = useState(0);
  const [categories, setCategories] = useState<Category[]>([]);
  const [currency, setCurrencyState] = useState<string>('GBP');
  const [toast, setToast] = useState<string | null>(null);
  const [prompt, setPrompt] = useState<ConsumePrompt | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => () => localNavigation.destroy(), [localNavigation]);

  // Boot: ensure schema, seed defaults, load categories + currency.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        await seedDefaultCategories(db);
        await migrateLocalDbTablesToDocument(db, {
          appSlug: 'ledger',
          tables: [
            { name: ENTRIES_TABLE, schema: entriesSchema },
            { name: CATEGORIES_TABLE, schema: categoriesSchema },
            { name: RECURRING_TABLE, schema: recurringSchema },
            { name: SETTINGS_TABLE, schema: settingsSchema },
          ],
        });
        const [cats, cur] = await Promise.all([listCategories(db), getCurrency(db)]);
        if (cancelled) return;
        setCategories(cats);
        setCurrencyState(cur);
      } catch (err) {
        console.warn('[ledger] boot failed', err);
      } finally {
        if (!cancelled) setReady(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [db]);

  // Reload categories whenever something changes them.
  useEffect(() => {
    if (!ready) return;
    let cancelled = false;
    (async () => {
      const cats = await listCategories(db);
      if (!cancelled) setCategories(cats);
    })();
    return () => {
      cancelled = true;
    };
  }, [db, refreshKey, ready]);

  // Subscribe to dined-out / shopping-list — turn them into "log this as
  // an expense?" prompts. The user always confirms before a row is saved.
  useEffect(() => {
    const unsubDined = shippie.intent.subscribe('dined-out', (broadcast) => {
      const row = broadcast.rows[0] as
        | { amount?: number | string; cost?: number | string; note?: string; restaurant?: string }
        | undefined;
      if (!row) return;
      const raw = row.amount ?? row.cost;
      const text =
        typeof raw === 'number' ? raw.toFixed(2) : typeof raw === 'string' ? raw : '';
      const cents = text ? parseAmountToCents(String(text)) : null;
      setPrompt({
        intent: 'dined-out',
        amountText: text,
        amountCents: cents,
        note: typeof row.note === 'string' ? row.note : row.restaurant ?? 'Dining',
        categoryHint: 'Food',
      });
    });
    const unsubShop = shippie.intent.subscribe('shopping-list', (broadcast) => {
      const row = broadcast.rows[0] as
        | { total?: number | string; amount?: number | string; note?: string; store?: string }
        | undefined;
      if (!row) return;
      const raw = row.total ?? row.amount;
      const text =
        typeof raw === 'number' ? raw.toFixed(2) : typeof raw === 'string' ? raw : '';
      const cents = text ? parseAmountToCents(String(text)) : null;
      setPrompt({
        intent: 'shopping-list',
        amountText: text,
        amountCents: cents,
        note: typeof row.note === 'string' ? row.note : row.store ?? 'Shopping',
        categoryHint: 'Food',
      });
    });
    return () => {
      unsubDined();
      unsubShop();
    };
  }, []);

  const refresh = useCallback(() => setRefreshKey((n) => n + 1), []);

  const showToast = useCallback((message: string) => {
    setToast(message);
    window.setTimeout(() => setToast(null), 2400);
  }, []);

  const handleEntryCreated = useCallback(
    (entry: Entry) => {
      // Provide on the existing intents — kept verbatim from the prior
      // showcase config. `expense-logged` is the every-save signal;
      // `budget-limit` only fires when an entry's note hints at a limit
      // (note starts with "limit:" — a low-friction power-user feature
      // until we ship a proper budget UI).
      shippie.intent.broadcast('expense-logged', [
        {
          id: entry.id,
          kind: entry.kind,
          amount: entry.amount_cents / 100,
          currency: entry.currency,
          category: entry.category_id,
          note: entry.note,
          occurredOn: entry.occurred_on,
        },
      ]);
      const noteLower = (entry.note ?? '').trim().toLowerCase();
      if (entry.kind === 'spend' && noteLower.startsWith('limit:')) {
        shippie.intent.broadcast('budget-limit', [
          {
            id: entry.id,
            limit: entry.amount_cents / 100,
            currency: entry.currency,
            label: entry.note?.slice('limit:'.length).trim() ?? '',
          },
        ]);
      }
      shippie.feel.texture('confirm');
    },
    [],
  );

  const handleCurrencyChange = useCallback(
    (next: string) => {
      setCurrencyState(next);
      showToast(`Currency set to ${next}.`);
    },
    [showToast],
  );

  const acceptPrompt = useCallback(() => {
    if (!prompt) return;
    setPrompt(null);
    void localNavigation.navigate('entries', { kind: 'crossfade' });
    // EntryList opens the spend draft via the URL hash convention. Using
    // local state instead: we drop the prompt onto a starter draft by
    // toggling tab + a query param. Simplest path is to push the values
    // into a sessionStorage stash that EntryList reads on mount of its
    // editor — but we don't currently wire that. For now, surface a
    // toast that the prompt cleared and trust the user to retype if
    // needed. The intent here is to NOT silently log a row.
    const summary = prompt.amountText
      ? `${prompt.amountText} for ${prompt.note}`
      : prompt.note;
    showToast(`Tap "+ Log spending" to record ${summary}.`);
  }, [prompt, showToast]);

  if (!ready) {
    return (
      <div className="app">
        <main className="app-main">
          <section className="page">
            <div className="eyebrow-row">
              <span>Ledger</span>
            </div>
            <p style={{ color: 'var(--muted)' }}>Loading…</p>
          </section>
        </main>
      </div>
    );
  }

  return (
    <div className="app">
      <main className="app-main">
        {tab === 'entries' ? (
          <EntryList
            db={db}
            year={year}
            month={month}
            onMonthChange={(y, m) => {
              setYear(y);
              setMonth(m);
            }}
            categories={categories}
            refreshKey={refreshKey}
            onChanged={refresh}
            onEntryCreated={handleEntryCreated}
            onToast={showToast}
          />
        ) : null}
        {tab === 'month' ? (
          <MonthView
            db={db}
            year={year}
            month={month}
            onMonthChange={(y, m) => {
              setYear(y);
              setMonth(m);
            }}
            currency={currency}
            refreshKey={refreshKey}
            onExport={() => void localNavigation.navigate('export', { kind: 'crossfade' })}
          />
        ) : null}
        {tab === 'recurring' ? (
          <Recurring
            db={db}
            categories={categories}
            currency={currency}
            refreshKey={refreshKey}
            onChanged={refresh}
            onToast={showToast}
          />
        ) : null}
        {tab === 'categories' ? (
          <Categories
            db={db}
            categories={categories}
            onChanged={refresh}
            onToast={showToast}
          />
        ) : null}
        {tab === 'export' ? (
          <Export
            db={db}
            year={year}
            month={month}
            categories={categories}
            refreshKey={refreshKey}
            onToast={showToast}
          />
        ) : null}
        {tab === 'settings' ? (
          <Settings
            db={db}
            currency={currency}
            onCurrencyChange={handleCurrencyChange}
          />
        ) : null}
        {tab === 'more' ? (
          <section className="more-sheet" aria-label="More tools">
            <h2 className="more-sheet-title">More</h2>
            <ul className="more-sheet-list">
              {MORE_TABS.map((t) => (
                <li key={t.id}>
                  <button
                    type="button"
                    onClick={() => void localNavigation.navigate(t.id, { kind: 'crossfade' })}
                  >
                    <span className="more-label">{t.label}</span>
                    <span className="more-subtitle">{t.subtitle}</span>
                  </button>
                </li>
              ))}
            </ul>
          </section>
        ) : null}
      </main>

      <nav className="bottom-tabs" role="tablist" aria-label="Sections">
        {PRIMARY_TABS.map((t) => {
          const isMoreTab = t.id === 'more';
          const moreTabActive = isMoreTab && (tab === 'more' || MORE_TABS.some((m) => m.id === tab));
          const active = isMoreTab ? moreTabActive : tab === t.id;
          return (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={active}
              className={`tab ${active ? 'tab-active' : ''}`}
              onClick={() => void localNavigation.navigate(t.id, { kind: 'crossfade' })}
            >
              {t.label}
            </button>
          );
        })}
      </nav>

      {/* Single bottom alert slot — priority high→low: prompt (action) > toast (status). */}
      {prompt ? (
        <div className="consume-prompt" role="dialog" aria-label="Log this as an expense?">
          <span className="summary">
            <strong>Log this as an expense?</strong>
            <br />
            {prompt.intent === 'dined-out' ? 'Dining' : 'Shopping'}
            {prompt.amountCents !== null
              ? ` · ${formatCents(prompt.amountCents, currency)}`
              : ''}
            {prompt.note ? ` · ${prompt.note}` : ''}
          </span>
          <div className="actions">
            <button type="button" className="ghost" onClick={() => setPrompt(null)}>
              Dismiss
            </button>
            <button type="button" className="primary" onClick={acceptPrompt}>
              Open log form
            </button>
          </div>
        </div>
      ) : toast ? (
        <div className="toast" role="status" aria-live="polite">
          {toast}
        </div>
      ) : null}
    </div>
  );
}
