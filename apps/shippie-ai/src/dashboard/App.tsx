/**
 * Shippie AI dashboard — the user-facing PWA shell.
 *
 * Three sections:
 *   - Models: which micro-models are installed, with size.
 *   - Usage: per-origin inference counts pulled from IndexedDB.
 *   - Privacy: load-bearing footer text confirming nothing leaves the device.
 *
 * The dashboard is also a trust signal as product. Users open it and SEE
 * that we're keeping the promise. Keep the privacy section honest: never
 * add anything that contradicts it (e.g. analytics, error reporting,
 * remote config).
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { MODEL_REGISTRY } from '../inference/models/registry.ts';
import {
  clearUsage,
  listUsage,
  rollupByOrigin,
  type UsageRollup,
} from './usage-log.ts';
import {
  getStorageBreakdown,
  type StorageBreakdown,
} from './storage.ts';
import type { UsageEntry } from '../types.ts';

const FMT_MB = (bytes: number) =>
  bytes <= 0 ? '—' : `${(bytes / 1024 / 1024).toFixed(0)} MB`;

export function App() {
  const [usage, setUsage] = useState<UsageEntry[]>([]);
  const [storage, setStorage] = useState<StorageBreakdown | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [u, s] = await Promise.all([listUsage(), getStorageBreakdown()]);
      setUsage(u);
      setStorage(s);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'failed to load dashboard data');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const onResetUsage = useCallback(async () => {
    if (!confirm('Reset usage log? Inference will keep working — only the per-app counts are cleared.')) return;
    await clearUsage();
    await refresh();
  }, [refresh]);

  const rollup = useMemo<UsageRollup[]>(() => rollupByOrigin(usage), [usage]);

  const totalInstalledBytes = useMemo(() => {
    if (!storage) return 0;
    return storage.models
      .filter((m) => m.installed)
      .reduce((sum, m) => sum + m.approxBytes, 0);
  }, [storage]);

  return (
    <main className="dashboard">
      <header>
        <h1>Shippie AI Engine</h1>
        <p className="subtitle">
          Your on-device intelligence. All processing stays on this phone.
        </p>
      </header>

      {error ? <p className="error">Couldn’t load: {error}</p> : null}

      <section aria-labelledby="models-heading">
        <h2 id="models-heading">Models</h2>
        {loading && !storage ? (
          <p>Loading…</p>
        ) : (
          <ul className="model-list">
            {MODEL_REGISTRY.map((m) => {
              const info = storage?.models.find((s) => s.task === m.task);
              const installed = info?.installed ?? false;
              return (
                <li key={m.task} data-installed={installed}>
                  <span className="check" aria-hidden="true">
                    {installed ? '✓' : '○'}
                  </span>
                  <span className="label">{m.label}</span>
                  <span className="size">{FMT_MB(m.approxBytes)}</span>
                  {!installed && !m.autoInstall ? (
                    <button type="button" disabled>
                      Install
                    </button>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
        <p className="total">
          Installed: <strong>{FMT_MB(totalInstalledBytes)}</strong>
          {storage?.quotaBytes
            ? ` of ${FMT_MB(storage.quotaBytes)} available`
            : null}
        </p>
      </section>

      <section aria-labelledby="usage-heading">
        <h2 id="usage-heading">Usage</h2>
        {rollup.length === 0 ? (
          <p>No inference requests yet.</p>
        ) : (
          <ul className="usage-list">
            {rollup.map((r) => (
              <li key={r.origin}>
                <span className="origin">{prettyOrigin(r.origin)}</span>
                <span className="count">{r.count} inferences</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <footer className="privacy-footer">
        <h2>Privacy</h2>
        <p>
          All processing runs on this device. No data has been sent to any
          server. No inference inputs or outputs are stored — only counts.
        </p>
      </footer>

      <div className="actions">
        <button type="button" onClick={() => void refresh()}>
          Refresh
        </button>
        <button type="button" onClick={() => void onResetUsage()}>
          Reset usage
        </button>
      </div>
    </main>
  );
}

function prettyOrigin(origin: string): string {
  try {
    const u = new URL(origin);
    return u.hostname;
  } catch {
    return origin;
  }
}
