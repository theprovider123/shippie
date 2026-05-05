import { useEffect, useMemo, useState } from 'react';
import { createShippieIframeSdk } from '@shippie/iframe-sdk';

export interface LaunchMode {
  id: string;
  label: string;
  verb: string;
  detail: string;
  intent: string;
  metricLabel?: string;
  unit?: string;
  min?: number;
  max?: number;
  step?: number;
  defaultValue?: number;
  payload?: (entry: LaunchEntry) => Record<string, unknown>;
}

export interface LaunchEntry {
  id: string;
  modeId: string;
  modeLabel: string;
  intent: string;
  note: string;
  value: number | null;
  unit: string | null;
  createdAt: number;
}

export interface LaunchShowcaseConfig {
  appId: string;
  slug: string;
  eyebrow: string;
  title: string;
  subtitle: string;
  privacyLine: string;
  tone: 'paper' | 'ink' | 'sea' | 'rose';
  tags: string[];
  placeholder: string;
  emptyText: string;
  modes: LaunchMode[];
  consumes?: string[];
  workspaceTitle?: string;
  workspaceItems?: LaunchWorkspaceItem[];
  handoff?: LaunchHandoff;
}

export interface LaunchWorkspaceItem {
  modeId: string;
  label: string;
  detail: string;
}

export interface LaunchHandoff {
  title: string;
  description: string;
  empty: string;
  actionLabel?: string;
  format?: 'summary' | 'csv';
}

export interface LaunchSummary {
  total: number;
  signalCount: number;
  totalValue: number;
  counts: Record<string, number>;
  lastLabel: string | null;
}

const MAX_ENTRIES = 120;

export function summarizeLaunchEntries(
  entries: readonly LaunchEntry[],
  signalCount = 0,
): LaunchSummary {
  const counts: Record<string, number> = {};
  let totalValue = 0;

  for (const entry of entries) {
    counts[entry.modeId] = (counts[entry.modeId] ?? 0) + 1;
    totalValue += entry.value ?? 0;
  }

  return {
    total: entries.length,
    signalCount,
    totalValue,
    counts,
    lastLabel: entries[0]?.modeLabel ?? null,
  };
}

export function LaunchShowcaseApp({ config }: { config: LaunchShowcaseConfig }) {
  const shippie = useMemo(() => createShippieIframeSdk({ appId: config.appId }), [config.appId]);
  const [entries, setEntries] = useState<LaunchEntry[]>(() => load(config.slug));
  const [modeId, setModeId] = useState(config.modes[0]?.id ?? '');
  const selectedMode = config.modes.find((mode) => mode.id === modeId) ?? config.modes[0];
  const [value, setValue] = useState(selectedMode?.defaultValue ?? 1);
  const [note, setNote] = useState('');
  const [signalCount, setSignalCount] = useState(0);

  useEffect(() => save(config.slug, entries), [config.slug, entries]);

  useEffect(() => {
    const next = config.modes.find((mode) => mode.id === modeId) ?? config.modes[0];
    setValue(next?.defaultValue ?? 1);
  }, [config.modes, modeId]);

  useEffect(() => {
    const offs = (config.consumes ?? []).map((intent) => {
      shippie.requestIntent(intent);
      return shippie.intent.subscribe(intent, ({ rows }) => {
        setSignalCount((prev) => prev + Math.max(1, rows.length));
      });
    });
    return () => {
      for (const off of offs) off();
    };
  }, [config.consumes, shippie]);

  const summary = useMemo(() => summarizeLaunchEntries(entries, signalCount), [entries, signalCount]);
  const hasSlider = typeof selectedMode?.defaultValue === 'number';
  const recent = entries.slice(0, 8);
  const workspaceItems = config.workspaceItems ?? config.modes.map((mode) => ({
    modeId: mode.id,
    label: mode.label,
    detail: mode.detail,
  }));
  const handoffLines = handoffPreview(entries, config.handoff?.format);

  function addEntry() {
    if (!selectedMode) return;
    const createdAt = Date.now();
    const entry: LaunchEntry = {
      id: `${config.slug}_${createdAt}`,
      modeId: selectedMode.id,
      modeLabel: selectedMode.label,
      intent: selectedMode.intent,
      note: note.trim(),
      value: hasSlider ? value : null,
      unit: selectedMode.unit ?? null,
      createdAt,
    };

    setEntries((prev) => [entry, ...prev].slice(0, MAX_ENTRIES));
    setNote('');
    shippie.intent.broadcast(selectedMode.intent, [payloadFor(selectedMode, entry, config.slug)]);
    shippie.feel.texture('complete');
  }

  return (
    <main className={`launch-showcase ${config.tone}`}>
      <header className="launch-header">
        <p className="launch-eyebrow">{config.eyebrow}</p>
        <h1>{config.title}</h1>
        <p>{config.subtitle}</p>
        <button type="button" onClick={() => shippie.openYourData({ appSlug: config.slug })}>
          Your Data
        </button>
      </header>

      <section className="launch-tags" aria-label="Architecture">
        {config.tags.map((tag) => <span key={tag}>{tag}</span>)}
      </section>

      <section className="launch-summary" aria-label={`${config.eyebrow} summary`}>
        <div><strong>{summary.total}</strong><span>entries</span></div>
        <div><strong>{summary.signalCount}</strong><span>signals</span></div>
        <div><strong>{summary.lastLabel ?? '-'}</strong><span>latest</span></div>
      </section>

      <section className="launch-workspace" aria-label={config.workspaceTitle ?? `${config.eyebrow} workspace`}>
        <h2>{config.workspaceTitle ?? 'Workspace'}</h2>
        <div className="launch-lanes">
          {workspaceItems.map((item) => (
            <button
              key={item.modeId}
              type="button"
              className={item.modeId === selectedMode?.id ? 'launch-lane active' : 'launch-lane'}
              onClick={() => setModeId(item.modeId)}
            >
              <span>{summary.counts[item.modeId] ?? 0}</span>
              <strong>{item.label}</strong>
              <small>{item.detail}</small>
            </button>
          ))}
        </div>
      </section>

      <section className="launch-modes" aria-label={`${config.eyebrow} modes`}>
        {config.modes.map((mode) => (
          <button
            key={mode.id}
            type="button"
            className={mode.id === selectedMode?.id ? 'active' : ''}
            onClick={() => setModeId(mode.id)}
          >
            {mode.label}
          </button>
        ))}
      </section>

      <section className="launch-editor">
        <p>{selectedMode?.detail}</p>
        {hasSlider ? (
          <label>
            <span>{selectedMode.metricLabel ?? 'amount'} - {formatValue(value, selectedMode.unit)}</span>
            <input
              type="range"
              min={selectedMode.min ?? 1}
              max={selectedMode.max ?? 10}
              step={selectedMode.step ?? 1}
              value={value}
              onChange={(event) => setValue(Number(event.target.value))}
            />
          </label>
        ) : null}
        <textarea
          value={note}
          onChange={(event) => setNote(event.target.value)}
          placeholder={config.placeholder}
          aria-label={`${config.eyebrow} note`}
        />
        <button type="button" className="launch-primary" onClick={addEntry}>
          {selectedMode?.verb ?? 'Save'}
        </button>
      </section>

      <section className="launch-recent">
        <h2>Recent</h2>
        {recent.length === 0 ? (
          <p className="launch-empty">{config.emptyText}</p>
        ) : (
          <ul>
            {recent.map((entry) => (
              <li key={entry.id}>
                <strong>{entry.modeLabel}</strong>
                <small>{describeEntry(entry)}</small>
              </li>
            ))}
          </ul>
        )}
        <p className="launch-privacy">{config.privacyLine}</p>
      </section>

      {config.handoff ? (
        <section className="launch-handoff" aria-label={config.handoff.title}>
          <div>
            <h2>{config.handoff.title}</h2>
            <p>{config.handoff.description}</p>
          </div>
          {handoffLines.length === 0 ? (
            <p className="launch-empty">{config.handoff.empty}</p>
          ) : (
            <pre>{handoffLines.join('\n')}</pre>
          )}
          <button type="button" onClick={() => copyHandoff(config.slug, handoffLines)}>
            {config.handoff.actionLabel ?? 'Copy local summary'}
          </button>
        </section>
      ) : null}
    </main>
  );
}

function storageKey(slug: string): string {
  return `shippie.${slug}.v1`;
}

function load(slug: string): LaunchEntry[] {
  try {
    const raw = localStorage.getItem(storageKey(slug));
    if (!raw) return [];
    const parsed = JSON.parse(raw) as { entries?: unknown };
    return Array.isArray(parsed.entries) ? parsed.entries as LaunchEntry[] : [];
  } catch {
    return [];
  }
}

function save(slug: string, entries: readonly LaunchEntry[]): void {
  try {
    localStorage.setItem(storageKey(slug), JSON.stringify({ entries }));
  } catch {
    /* Local quota errors are non-fatal. */
  }
}

function payloadFor(mode: LaunchMode, entry: LaunchEntry, slug: string): Record<string, unknown> {
  if (mode.payload) return mode.payload(entry);
  return {
    id: entry.id,
    app: slug,
    kind: entry.modeId,
    note: entry.note,
    value: entry.value,
    unit: entry.unit,
    createdAt: new Date(entry.createdAt).toISOString(),
  };
}

function describeEntry(entry: LaunchEntry): string {
  const value = entry.value === null ? '' : `${formatValue(entry.value, entry.unit ?? undefined)} - `;
  const note = entry.note ? entry.note : new Date(entry.createdAt).toLocaleDateString();
  return `${value}${note}`;
}

function formatValue(value: number, unit?: string): string {
  const formatted = Number.isInteger(value) ? String(value) : value.toFixed(1);
  return unit ? `${formatted} ${unit}` : formatted;
}

function handoffPreview(entries: readonly LaunchEntry[], format: LaunchHandoff['format'] = 'summary'): string[] {
  if (format === 'csv') {
    return [
      'date,type,value,unit,note',
      ...entries.slice(0, 6).map((entry) => {
        const date = new Date(entry.createdAt).toLocaleDateString();
        return [
          csvCell(date),
          csvCell(entry.modeLabel),
          csvCell(entry.value ?? ''),
          csvCell(entry.unit ?? ''),
          csvCell(entry.note),
        ].join(',');
      }),
    ];
  }
  return entries.slice(0, 6).map((entry) => {
    const date = new Date(entry.createdAt).toLocaleDateString();
    const value = entry.value === null ? '' : ` ${formatValue(entry.value, entry.unit ?? undefined)}`;
    const note = entry.note ? ` - ${entry.note}` : '';
    return `${date} / ${entry.modeLabel}${value}${note}`;
  });
}

function csvCell(value: string | number): string {
  const raw = String(value);
  return /[",\n]/.test(raw) ? `"${raw.replace(/"/g, '""')}"` : raw;
}

function copyHandoff(slug: string, lines: readonly string[]): void {
  const text = lines.length > 0
    ? lines.join('\n')
    : `${slug}: no local entries yet`;
  void navigator.clipboard?.writeText(text);
}
