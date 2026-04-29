/**
 * Config-driven micro-logger. The factory returns a React component
 * the showcase ships verbatim:
 *
 *   import { createMicroLoggerApp } from '@shippie/micro-logger';
 *   import config from './config.ts';
 *   export const App = createMicroLoggerApp(config);
 *
 * The component takes care of:
 *   - localStorage-backed entry list (de-dup, ordering)
 *   - field inputs from `rowSchema` (numbers, strings, dates)
 *   - tap-to-log button → broadcasts the configured intent
 *   - subscribes to `consumes` intents and surfaces a small "received"
 *     ribbon so the user sees the cross-app traffic
 *   - one of three chart variants above the entry list
 *   - delete + Your Data button via the SDK
 */
import { useEffect, useMemo, useState, type ReactElement } from 'react';
import { createShippieIframeSdk } from '@shippie/iframe-sdk';
import { CountChart, Heatmap, Sparkline } from './charts.tsx';
import { appendRow, loadRows, saveRows } from './storage.ts';
import type { ChartProps } from './charts.tsx';
import type { LoggedRow, MicroLoggerConfig } from './types.ts';

interface IncomingIntent {
  intent: string;
  /** Wall-clock ms when the broadcast arrived. */
  receivedAt: number;
  /** First-row title if one is present. */
  label?: string;
}

const SUPPORTED_FIELD_TYPES = new Set(['string', 'number', 'date']);

export function createMicroLoggerApp(config: MicroLoggerConfig): () => ReactElement {
  const shippie = createShippieIframeSdk({ appId: config.appId });

  return function MicroLoggerApp() {
    const [rows, setRows] = useState<LoggedRow[]>(() => loadRows(config.slug));
    const [draft, setDraft] = useState<Record<string, unknown>>(() => ({ ...(config.defaults ?? {}) }));
    const [recent, setRecent] = useState<IncomingIntent[]>([]);

    useEffect(() => {
      saveRows(config.slug, rows);
    }, [rows]);

    // Subscribe to declared `consumes` intents — the chip ribbon
    // gives users a sense of "what other apps are pinging me".
    useEffect(() => {
      if (!config.consumes || config.consumes.length === 0) return;
      for (const intent of config.consumes) shippie.requestIntent(intent);
      const offs = config.consumes.map((intent) =>
        shippie.intent.subscribe(intent, ({ rows }) => {
          const head = (rows[0] ?? null) as Record<string, unknown> | null;
          const label = typeof head?.title === 'string' ? head.title : undefined;
          setRecent((prev) =>
            [{ intent, receivedAt: Date.now(), label }, ...prev]
              .filter((entry, idx, arr) => arr.findIndex((e) => e.intent === entry.intent) === idx)
              .slice(0, config.consumes!.length),
          );
        }),
      );
      return () => {
        for (const off of offs) off();
      };
    }, []);

    function setField(name: string, value: unknown) {
      setDraft((prev) => ({ ...prev, [name]: value }));
    }

    function logEntry() {
      const fields = { ...draft };
      const { rows: nextRows, row } = appendRow(rows, fields, config.defaults);
      setRows(nextRows);
      setDraft({ ...(config.defaults ?? {}) });
      shippie.intent.broadcast(config.intent, [
        {
          ...row.fields,
          loggedAt: new Date(row.loggedAt).toISOString(),
          kind: config.slug,
          title: typeof row.fields.title === 'string' ? row.fields.title : config.name,
        },
      ]);
      shippie.feel.texture('confirm');
    }

    function remove(id: string) {
      setRows((prev) => prev.filter((r) => r.id !== id));
      shippie.feel.texture('delete');
    }

    const ChartComponent = useMemo(() => pickChart(config.chart), []);
    const fieldEntries = Object.entries(config.rowSchema).filter(([, type]) =>
      SUPPORTED_FIELD_TYPES.has(type),
    );

    return (
      <main className="ml-app" style={{ ['--ml-accent' as string]: config.themeColor }}>
        <header>
          <h1>{config.name}</h1>
          {config.description && <p>{config.description}</p>}
        </header>

        {recent.length > 0 && (
          <section className="ml-recent" aria-label="Recent activity from other apps">
            {recent.map((entry) => (
              <span key={entry.intent} className="ml-recent-chip">
                ↗ {entry.intent}
                {entry.label && `: ${entry.label}`}
              </span>
            ))}
          </section>
        )}

        <section className="ml-chart-wrap" aria-label={`${config.chart} chart`}>
          <ChartComponent
            rows={rows}
            themeColor={config.themeColor}
            countTarget={config.countTarget}
            windowDays={config.heatmapWindowDays ?? (config.chart === 'heatmap' ? 28 : 30)}
          />
        </section>

        <section className="ml-form">
          {fieldEntries.length > 0 && (
            <div className="ml-fields">
              {fieldEntries.map(([name, type]) => (
                <label key={name}>
                  <span>{name}</span>
                  <input
                    type={type === 'number' ? 'number' : type === 'date' ? 'date' : 'text'}
                    value={String(draft[name] ?? '')}
                    onChange={(e) =>
                      setField(name, type === 'number' ? Number(e.target.value) : e.target.value)
                    }
                    aria-label={name}
                  />
                </label>
              ))}
            </div>
          )}
          <button type="button" className="ml-button" onClick={logEntry}>
            {config.buttonLabel}
          </button>
        </section>

        <section className="ml-list" aria-label="Recent entries">
          <h2>Recent</h2>
          {rows.length === 0 ? (
            <p className="ml-empty">No entries yet. Tap above to log one.</p>
          ) : (
            <ul>
              {rows.slice(0, 12).map((row) => (
                <li key={row.id}>
                  <div>
                    <strong>{new Date(row.loggedAt).toLocaleString()}</strong>
                    {summariseFields(row.fields)}
                  </div>
                  <button onClick={() => remove(row.id)} aria-label="Remove">
                    ×
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      </main>
    );
  };
}

function pickChart(kind: MicroLoggerConfig['chart']): React.FC<ChartProps> {
  if (kind === 'sparkline') return Sparkline;
  if (kind === 'count') return CountChart;
  return Heatmap;
}

function summariseFields(fields: Record<string, unknown>): ReactElement | null {
  const entries = Object.entries(fields).filter(([, v]) => v !== undefined && v !== '');
  if (entries.length === 0) return null;
  return (
    <small>
      {entries
        .map(([k, v]) => `${k}: ${v}`)
        .join(' · ')}
    </small>
  );
}
