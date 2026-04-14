/**
 * Client component: upload zip + POST to /api/deploy.
 *
 * Spec v6 §1 (onboarding flow), §10 (deploy pipeline).
 */
'use client';

import { useState } from 'react';

interface DeployResponse {
  success: boolean;
  slug?: string;
  version?: number;
  files?: number;
  total_bytes?: number;
  live_url?: string;
  error?: string;
  reason?: string;
  preflight?: {
    passed: boolean;
    blockers?: Array<{ rule: string; title: string }>;
    warnings?: Array<{ rule: string; title: string }>;
    duration_ms?: number;
  };
}

export function UploadForm() {
  const [slug, setSlug] = useState('recipes');
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<DeployResponse | null>(null);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!file || !slug) return;

    setLoading(true);
    setResult(null);

    const formData = new FormData();
    formData.append('slug', slug);
    formData.append('zip', file);

    try {
      const res = await fetch('/api/deploy', { method: 'POST', body: formData });
      const json = (await res.json()) as DeployResponse;
      setResult(json);
    } catch (err) {
      setResult({
        success: false,
        error: 'network_error',
        reason: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <label className="block">
        <span className="text-xs uppercase tracking-widest text-neutral-500 font-mono">
          Slug
        </span>
        <div className="flex items-center mt-1">
          <input
            name="slug"
            value={slug}
            onChange={(e) => setSlug(e.target.value)}
            pattern="[a-z0-9][a-z0-9\-]*"
            required
            className="flex-1 block h-11 rounded-l-md border border-neutral-300 dark:border-neutral-700 bg-transparent px-3 font-mono text-sm focus:border-brand-500 outline-none"
          />
          <span className="inline-flex h-11 items-center px-3 rounded-r-md border border-l-0 border-neutral-300 dark:border-neutral-700 text-neutral-500 font-mono text-sm">
            .shippie.app
          </span>
        </div>
      </label>

      <label className="block">
        <span className="text-xs uppercase tracking-widest text-neutral-500 font-mono">
          Zip (built output)
        </span>
        <input
          type="file"
          accept=".zip,application/zip"
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          required
          className="mt-1 block w-full text-sm file:mr-3 file:h-11 file:px-4 file:rounded-md file:border file:border-neutral-300 dark:file:border-neutral-700 file:bg-transparent file:text-neutral-700 dark:file:text-neutral-300 file:font-medium hover:file:border-brand-500 transition-colors"
        />
      </label>

      <button
        type="submit"
        disabled={loading || !file || !slug}
        className="inline-flex h-12 items-center rounded-full bg-brand-500 px-8 text-white font-medium hover:bg-brand-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {loading ? 'Shipping…' : 'Ship it →'}
      </button>

      {result && <ResultCard result={result} />}
    </form>
  );
}

function ResultCard({ result }: { result: DeployResponse }) {
  if (result.success && result.live_url) {
    return (
      <div className="rounded-lg border border-emerald-500/40 bg-emerald-50 dark:bg-emerald-950/30 p-4 space-y-2">
        <p className="text-sm font-semibold text-emerald-700 dark:text-emerald-200">
          ✅ Shipped — v{result.version}
        </p>
        <p className="text-sm">
          Live at{' '}
          <a
            href={result.live_url}
            target="_blank"
            rel="noreferrer"
            className="font-mono text-emerald-700 dark:text-emerald-300 underline"
          >
            {result.live_url}
          </a>
        </p>
        <p className="text-xs text-neutral-500 font-mono">
          {result.files} files · {formatBytes(result.total_bytes ?? 0)} · preflight{' '}
          {result.preflight?.duration_ms ?? 0}ms
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-red-500/40 bg-red-50 dark:bg-red-950/30 p-4 space-y-2">
      <p className="text-sm font-semibold text-red-700 dark:text-red-200">
        ❌ {result.error ?? 'Deploy failed'}
      </p>
      {result.reason && (
        <p className="text-sm text-red-700 dark:text-red-200">{result.reason}</p>
      )}
      {result.preflight?.blockers && result.preflight.blockers.length > 0 && (
        <ul className="text-xs font-mono space-y-1 mt-2">
          {result.preflight.blockers.map((b, i) => (
            <li key={i} className="text-red-700 dark:text-red-200">
              <strong>{b.rule}</strong>: {b.title}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n}B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)}KB`;
  return `${(n / (1024 * 1024)).toFixed(1)}MB`;
}
