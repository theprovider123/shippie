/**
 * Share-first success screen.
 *
 * Shown after a successful deploy or URL-wrap. The maker's most common
 * need is "send this to a friend" — publicly or privately — so we lead
 * with a visibility toggle + share controls and keep the QR/install
 * hints below.
 *
 * Flipping to `Private` PATCHes visibility then mints a 7-day link
 * invite and swaps the displayed share URL to the short `/i/{code}`
 * form. Flipping back to `Public`/`Unlisted` PATCHes visibility and
 * restores the marketplace URL. Old invites are left intact (harmless
 * if unused, and useful if the maker toggles back).
 */
'use client';

import { useEffect, useMemo, useState } from 'react';
import QRCode from 'qrcode';

export interface SuccessMeta {
  slug: string;
  version?: number;
  liveUrl: string;
  files?: number;
  totalBytes?: number;
  preflightMs?: number;
  /** Optional: extra footer info (e.g. redirect URI for wrapped apps). */
  footer?: React.ReactNode;
  /** Header line, defaults to "Shipped". */
  headline?: string;
}

type Visibility = 'public' | 'unlisted' | 'private';

function formatBytes(n: number): string {
  if (n < 1024) return `${n}B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)}KB`;
  return `${(n / (1024 * 1024)).toFixed(1)}MB`;
}

async function patchVisibility(slug: string, visibility: Visibility): Promise<void> {
  const res = await fetch(`/api/apps/${encodeURIComponent(slug)}/visibility`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ visibility_scope: visibility }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error ?? `visibility_failed_${res.status}`);
  }
}

interface InviteResponse {
  invite: { id: string; token: string };
  url: string;
  short_url: string | null;
}

async function createInvite(slug: string): Promise<InviteResponse> {
  const expires = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
  const res = await fetch(`/api/apps/${encodeURIComponent(slug)}/invites`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ kind: 'link', expires_at: expires }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error ?? `invite_failed_${res.status}`);
  }
  return (await res.json()) as InviteResponse;
}

export function SuccessCard({ meta }: { meta: SuccessMeta }) {
  const { slug, liveUrl, version, files, totalBytes, preflightMs, footer } = meta;
  const headline = meta.headline ?? 'Shipped';

  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  const marketplaceUrl = useMemo(
    () => (origin ? `${origin}/apps/${slug}` : `/apps/${slug}`),
    [origin, slug],
  );

  const [visibility, setVisibility] = useState<Visibility>('public');
  const [shareUrl, setShareUrl] = useState<string>(marketplaceUrl);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  // Cache the private invite short URL across toggles to avoid re-minting
  // if the user flips away and back inside the same session.
  const [cachedPrivateUrl, setCachedPrivateUrl] = useState<string | null>(null);

  // Whenever marketplaceUrl settles (post-hydration), default shareUrl to it.
  useEffect(() => {
    setShareUrl((prev) => (prev.startsWith('/apps/') ? marketplaceUrl : prev));
  }, [marketplaceUrl]);

  async function selectVisibility(next: Visibility) {
    if (next === visibility || busy) return;
    setError(null);
    setBusy(true);
    try {
      await patchVisibility(slug, next);
      if (next === 'private') {
        if (cachedPrivateUrl) {
          setShareUrl(cachedPrivateUrl);
        } else {
          const inv = await createInvite(slug);
          const url = inv.short_url ?? inv.url;
          setCachedPrivateUrl(url);
          setShareUrl(url);
        }
      } else {
        setShareUrl(marketplaceUrl);
      }
      setVisibility(next);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  async function onCopy() {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      setError('clipboard_failed');
    }
  }

  async function onShare() {
    const payload = {
      url: shareUrl,
      title: `Shippie · ${slug}`,
      text: `Check out ${slug} on Shippie`,
    };
    // Web Share API is mobile-first; fall back to copy on desktop.
    if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
      try {
        await navigator.share(payload);
        return;
      } catch {
        // user cancelled — no error state
        return;
      }
    }
    await onCopy();
  }

  return (
    <div className="rounded-lg border border-emerald-500/40 bg-emerald-50 dark:bg-emerald-950/30 p-5 space-y-5">
      <div>
        <p className="text-sm font-semibold text-emerald-700 dark:text-emerald-200">
          ✅ {headline}
          {typeof version === 'number' ? ` — v${version}` : ''}
        </p>
        <p className="text-sm mt-1">
          Live at{' '}
          <a
            href={liveUrl}
            target="_blank"
            rel="noreferrer"
            className="font-mono text-emerald-700 dark:text-emerald-300 underline"
          >
            {liveUrl}
          </a>
        </p>
      </div>

      <ShareCard
        visibility={visibility}
        shareUrl={shareUrl}
        busy={busy}
        error={error}
        copied={copied}
        onSelectVisibility={selectVisibility}
        onCopy={onCopy}
        onShare={onShare}
      />

      <QrPanel shareUrl={shareUrl} visibility={visibility} slug={slug} />

      {(files != null || totalBytes != null || preflightMs != null) && (
        <p className="text-xs text-neutral-500 font-mono">
          {files != null ? `${files} files · ` : ''}
          {totalBytes != null ? `${formatBytes(totalBytes)} · ` : ''}
          {preflightMs != null ? `preflight ${preflightMs}ms` : ''}
        </p>
      )}
      {footer}
    </div>
  );
}

function ShareCard({
  visibility,
  shareUrl,
  busy,
  error,
  copied,
  onSelectVisibility,
  onCopy,
  onShare,
}: {
  visibility: Visibility;
  shareUrl: string;
  busy: boolean;
  error: string | null;
  copied: boolean;
  onSelectVisibility: (v: Visibility) => void;
  onCopy: () => void;
  onShare: () => void;
}) {
  return (
    <div className="rounded-md border border-emerald-500/30 bg-white/60 dark:bg-neutral-900/40 p-4 space-y-3">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <p className="text-sm font-semibold text-neutral-800 dark:text-neutral-100">
          Share this app
        </p>
        <VisibilityToggle value={visibility} busy={busy} onChange={onSelectVisibility} />
      </div>

      <p className="text-xs text-neutral-600 dark:text-neutral-400">
        {visibility === 'public' && 'Listed on the marketplace. Anyone with the link can open.'}
        {visibility === 'unlisted' &&
          'Not listed in the grid, but anyone with the link can still open it.'}
        {visibility === 'private' &&
          'Only people with this invite link can open it. Expires in 7 days.'}
      </p>

      <div className="flex items-stretch gap-2">
        <input
          type="text"
          readOnly
          value={shareUrl}
          aria-label="Share URL"
          className="flex-1 min-w-0 h-10 rounded-md border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-950 px-3 font-mono text-xs"
          onFocus={(e) => e.currentTarget.select()}
        />
        <button
          type="button"
          onClick={onCopy}
          disabled={busy}
          className="h-10 px-3 rounded-md border border-neutral-300 dark:border-neutral-700 text-xs font-medium hover:border-emerald-500 transition-colors disabled:opacity-50"
        >
          {copied ? 'Copied' : 'Copy'}
        </button>
        <button
          type="button"
          onClick={onShare}
          disabled={busy}
          className="h-10 px-4 rounded-md bg-emerald-600 text-white text-xs font-medium hover:bg-emerald-700 transition-colors disabled:opacity-50"
        >
          Share…
        </button>
      </div>

      {busy && (
        <p className="text-xs text-neutral-500" role="status">
          Updating…
        </p>
      )}
      {error && (
        <p className="text-xs text-red-600 dark:text-red-300" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

function VisibilityToggle({
  value,
  busy,
  onChange,
}: {
  value: Visibility;
  busy: boolean;
  onChange: (v: Visibility) => void;
}) {
  const options: Array<{ key: Visibility; label: string }> = [
    { key: 'public', label: 'Public' },
    { key: 'unlisted', label: 'Unlisted' },
    { key: 'private', label: 'Private' },
  ];
  return (
    <div
      role="radiogroup"
      aria-label="Visibility"
      className="inline-flex rounded-full border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-950 p-0.5"
    >
      {options.map((opt) => {
        const active = value === opt.key;
        return (
          <button
            key={opt.key}
            type="button"
            role="radio"
            aria-checked={active}
            disabled={busy}
            onClick={() => onChange(opt.key)}
            className={
              'h-8 px-3 rounded-full text-xs font-medium transition-colors disabled:opacity-60 ' +
              (active
                ? 'bg-emerald-600 text-white'
                : 'text-neutral-700 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-800')
            }
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}

function QrPanel({
  shareUrl,
  visibility,
  slug,
}: {
  shareUrl: string;
  visibility: Visibility;
  slug: string;
}) {
  const [qr, setQr] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    QRCode.toDataURL(shareUrl, { width: 180, margin: 1 })
      .then((url) => {
        if (!cancelled) setQr(url);
      })
      .catch(() => {
        /* best-effort */
      });
    return () => {
      cancelled = true;
    };
  }, [shareUrl]);

  return (
    <div className="flex flex-col sm:flex-row items-start gap-5">
      {qr && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={qr}
          alt={`QR code for ${shareUrl}`}
          className="w-[180px] h-[180px] rounded-md bg-white p-2"
        />
      )}
      <div className="space-y-2 text-sm text-neutral-700 dark:text-neutral-300">
        <p className="font-medium">Install on your phone</p>
        <ol className="list-decimal pl-5 space-y-1 text-neutral-600 dark:text-neutral-400">
          <li>Scan the QR on your phone.</li>
          <li>
            <span className="font-medium">iOS Safari:</span> tap Share → Add to Home Screen.
          </li>
          <li>
            <span className="font-medium">Android Chrome:</span> tap the menu → Install app.
          </li>
        </ol>
        {visibility !== 'private' && (
          <p className="pt-2">
            <a
              href={`/apps/${slug}`}
              className="inline-flex h-10 items-center rounded-full border border-emerald-500/40 px-4 text-sm font-medium text-emerald-700 dark:text-emerald-200 hover:border-emerald-500 transition-colors"
            >
              View marketplace page →
            </a>
          </p>
        )}
      </div>
    </div>
  );
}
