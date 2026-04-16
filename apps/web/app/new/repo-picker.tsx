'use client';

import { useEffect, useState } from 'react';

interface Repo {
  id: number;
  full_name: string;
  name: string;
  private: boolean;
  default_branch: string;
  pushed_at: string | null;
  language: string | null;
  description: string | null;
}

type LoadState =
  | { kind: 'loading' }
  | { kind: 'ready'; repos: Repo[] }
  | { kind: 'error'; message: string };

type DeployState =
  | { kind: 'idle' }
  | { kind: 'deploying'; repo: string }
  | { kind: 'done'; liveUrl: string; slug: string }
  | { kind: 'error'; message: string };

export function RepoPicker({ installationId }: { installationId: string }) {
  const [state, setState] = useState<LoadState>({ kind: 'loading' });
  const [query, setQuery] = useState('');
  const [deploy, setDeploy] = useState<DeployState>({ kind: 'idle' });
  const [selected, setSelected] = useState<Repo | null>(null);
  const [slug, setSlug] = useState('');
  const [branch, setBranch] = useState('');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/github/repos?installation_id=${encodeURIComponent(installationId)}`);
        if (!res.ok) {
          const body = (await res.json().catch(() => ({}))) as { error?: string };
          throw new Error(body.error ?? `Failed to list repos (${res.status})`);
        }
        const body = (await res.json()) as { repos: Repo[] };
        if (!cancelled) setState({ kind: 'ready', repos: body.repos });
      } catch (err) {
        if (!cancelled) setState({ kind: 'error', message: (err as Error).message });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [installationId]);

  async function onDeploy(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!selected) return;
    const cleanSlug = slug.trim() || defaultSlug(selected.name);
    setDeploy({ kind: 'deploying', repo: selected.full_name });

    const body = {
      repo_url: `https://github.com/${selected.full_name}`,
      slug: cleanSlug,
      branch: branch.trim() || selected.default_branch,
      installation_id: installationId,
      repo_full_name: selected.full_name,
    };

    try {
      const res = await fetch('/api/deploy/github', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
      const json = (await res.json().catch(() => ({}))) as {
        live_url?: string;
        slug?: string;
        error?: string;
        reason?: string;
      };
      if (!res.ok) {
        setDeploy({ kind: 'error', message: json.reason ?? json.error ?? `Deploy failed (${res.status})` });
        return;
      }
      setDeploy({ kind: 'done', liveUrl: json.live_url ?? '', slug: json.slug ?? cleanSlug });
    } catch (err) {
      setDeploy({ kind: 'error', message: (err as Error).message });
    }
  }

  if (state.kind === 'loading') {
    return <p className="text-sm text-neutral-500 font-mono">Loading repos…</p>;
  }
  if (state.kind === 'error') {
    return (
      <p className="text-sm text-red-500">
        Couldn&apos;t list repos: {state.message}
      </p>
    );
  }
  if (state.repos.length === 0) {
    return (
      <p className="text-sm text-neutral-500">
        No repos accessible through this installation.{' '}
        <a href="/api/github/install" className="underline text-brand-500">Re-run the install flow</a> to grant access.
      </p>
    );
  }

  if (deploy.kind === 'done') {
    return (
      <div className="rounded-lg border border-emerald-500/40 bg-emerald-50 dark:bg-emerald-950/30 p-4 space-y-2">
        <p className="text-sm font-semibold text-emerald-700 dark:text-emerald-200">
          ✓ Deployed {deploy.slug}
        </p>
        {deploy.liveUrl && (
          <p className="text-sm">
            Live at{' '}
            <a
              href={deploy.liveUrl}
              target="_blank"
              rel="noreferrer"
              className="font-mono text-emerald-700 dark:text-emerald-300 underline"
            >
              {deploy.liveUrl}
            </a>
          </p>
        )}
        <p className="text-xs text-neutral-500 font-mono">
          Push to <code>{branch || selected?.default_branch}</code> to auto-redeploy.
        </p>
      </div>
    );
  }

  const filtered = state.repos.filter((r) =>
    query ? r.full_name.toLowerCase().includes(query.toLowerCase()) : true,
  );

  return (
    <form onSubmit={onDeploy} className="space-y-4">
      <input
        type="search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Filter repos…"
        className="w-full h-10 px-3 rounded-md border border-neutral-300 dark:border-neutral-700 bg-transparent font-mono text-sm"
      />

      <div className="max-h-64 overflow-y-auto border border-neutral-200 dark:border-neutral-800 rounded-md">
        {filtered.map((repo) => {
          const isSelected = selected?.id === repo.id;
          return (
            <button
              type="button"
              key={repo.id}
              onClick={() => {
                setSelected(repo);
                if (!slug) setSlug(defaultSlug(repo.name));
                if (!branch) setBranch(repo.default_branch);
              }}
              className={`w-full text-left p-3 border-b border-neutral-100 dark:border-neutral-900 transition-colors ${
                isSelected ? 'bg-brand-50 dark:bg-brand-900/20' : 'hover:bg-neutral-50 dark:hover:bg-neutral-900/50'
              }`}
            >
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-mono text-sm truncate">{repo.full_name}</p>
                  {repo.description && (
                    <p className="text-xs text-neutral-500 truncate mt-0.5">{repo.description}</p>
                  )}
                </div>
                <div className="flex items-center gap-2 flex-shrink-0 text-xs text-neutral-500 font-mono">
                  {repo.private && <span>private</span>}
                  {repo.language && <span>{repo.language}</span>}
                </div>
              </div>
            </button>
          );
        })}
        {filtered.length === 0 && (
          <p className="p-3 text-sm text-neutral-500">No repos matched.</p>
        )}
      </div>

      {selected && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <label className="block">
            <span className="text-xs uppercase tracking-widest text-neutral-500 font-mono">Slug</span>
            <div className="flex items-center mt-1">
              <input
                value={slug}
                onChange={(e) => setSlug(e.target.value)}
                pattern="[a-z0-9][a-z0-9\-]*"
                required
                className="flex-1 h-10 rounded-l-md border border-neutral-300 dark:border-neutral-700 bg-transparent px-3 font-mono text-sm"
              />
              <span className="inline-flex h-10 items-center px-3 rounded-r-md border border-l-0 border-neutral-300 dark:border-neutral-700 text-neutral-500 font-mono text-sm">
                .shippie.app
              </span>
            </div>
          </label>
          <label className="block">
            <span className="text-xs uppercase tracking-widest text-neutral-500 font-mono">Branch</span>
            <input
              value={branch}
              onChange={(e) => setBranch(e.target.value)}
              required
              className="mt-1 block w-full h-10 rounded-md border border-neutral-300 dark:border-neutral-700 bg-transparent px-3 font-mono text-sm"
            />
          </label>
        </div>
      )}

      <button
        type="submit"
        disabled={!selected || deploy.kind === 'deploying'}
        className="inline-flex h-12 items-center rounded-full bg-brand-500 px-8 text-white font-medium hover:bg-brand-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {deploy.kind === 'deploying' ? `Shipping ${deploy.repo}…` : 'Ship this repo →'}
      </button>

      {deploy.kind === 'error' && (
        <p className="text-sm text-red-500">{deploy.message}</p>
      )}
    </form>
  );
}

function defaultSlug(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/^-+|-+$/g, '');
}
