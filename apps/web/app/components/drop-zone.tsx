'use client';

/**
 * Hero drop zone — the "Proof" move on the landing page.
 *
 * POSTs the file to /api/deploy/trial (no signup). On success, navigates
 * to the returned live_url. On rate-limit or deploy failure, surfaces the
 * reason in-place. Falls back to /new for error cases where a signed-in
 * upload would help (e.g., preflight warnings the trial can't resolve).
 *
 * Backend contract: see apps/web/app/api/deploy/trial/route.ts.
 */
import { useCallback, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';

type Phase =
  | { kind: 'idle' }
  | { kind: 'hover' }
  | { kind: 'uploading'; filename: string }
  | { kind: 'live'; liveUrl: string; slug: string; expiresAt: string }
  | { kind: 'error'; message: string; fatal?: boolean };

const MAX_MB = 50;

export function HeroDropZone() {
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>({ kind: 'idle' });
  const inputRef = useRef<HTMLInputElement | null>(null);

  const uploadTrial = useCallback(
    async (file: File) => {
      if (!file.name.toLowerCase().endsWith('.zip')) {
        setPhase({ kind: 'error', message: 'That doesn’t look like a zip. Drop a built-output .zip.' });
        return;
      }
      if (file.size > MAX_MB * 1024 * 1024) {
        setPhase({
          kind: 'error',
          message: `Trial limit is ${MAX_MB}MB. Bigger payloads via CLI or signed-in upload.`,
        });
        return;
      }

      setPhase({ kind: 'uploading', filename: file.name });

      try {
        const formData = new FormData();
        formData.append('zip', file);

        const res = await fetch('/api/deploy/trial', {
          method: 'POST',
          body: formData,
        });

        if (res.status === 429) {
          setPhase({
            kind: 'error',
            message: 'Trial rate limit hit. Try again in an hour, or sign in for an unrestricted deploy.',
            fatal: true,
          });
          return;
        }

        const body = (await res.json().catch(() => ({}))) as {
          success?: boolean;
          live_url?: string;
          slug?: string;
          expires_at?: string;
          error?: string;
          reason?: string;
        };

        if (res.ok && body.success && body.live_url && body.slug && body.expires_at) {
          setPhase({
            kind: 'live',
            liveUrl: body.live_url,
            slug: body.slug,
            expiresAt: body.expires_at,
          });
          return;
        }

        // Non-trivial failure → route into the signed-in flow, which will
        // surface preflight blockers in a proper form.
        setPhase({
          kind: 'error',
          message: body.reason ?? body.error ?? 'Trial deploy failed. Sign in to see detailed preflight output.',
        });
      } catch (err) {
        setPhase({
          kind: 'error',
          message: err instanceof Error ? err.message : 'Network error — try again.',
        });
      }
    },
    [],
  );

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files?.[0];
    if (file) void uploadTrial(file);
  };

  const onChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) void uploadTrial(file);
  };

  const borderColor =
    phase.kind === 'live'      ? 'var(--sage-leaf)' :
    phase.kind === 'hover'     ? 'var(--sunset)'    :
    phase.kind === 'uploading' ? 'var(--marigold)'  :
    phase.kind === 'error'     ? '#c84a2a'          :
    'var(--border)';

  const interactive = phase.kind === 'idle' || phase.kind === 'hover' || phase.kind === 'error';

  return (
    <div
      onDragOver={(e) => { if (interactive) { e.preventDefault(); setPhase({ kind: 'hover' }); } }}
      onDragLeave={() => { if (phase.kind === 'hover') setPhase({ kind: 'idle' }); }}
      onDrop={interactive ? onDrop : undefined}
      onClick={() => { if (interactive) inputRef.current?.click(); }}
      role="button"
      tabIndex={interactive ? 0 : -1}
      onKeyDown={(e) => {
        if (!interactive) return;
        if (e.key === 'Enter' || e.key === ' ') inputRef.current?.click();
      }}
      style={{
        border: `2px dashed ${borderColor}`,
        borderRadius: 8,
        padding: 'var(--space-2xl) var(--space-xl)',
        background: phase.kind === 'hover' ? 'var(--sunset-glow)' : 'var(--surface)',
        transition: 'all 0.2s var(--ease-out)',
        cursor: interactive ? 'pointer' : 'default',
        textAlign: 'center',
      }}
    >
      <input
        ref={inputRef}
        type="file"
        accept=".zip,application/zip"
        onChange={onChange}
        style={{ display: 'none' }}
      />

      {phase.kind === 'live' ? (
        <>
          <p style={{ fontFamily: 'var(--font-heading)', fontSize: 'var(--h3-size)', color: 'var(--sage-leaf)' }}>
            ✓ Live
          </p>
          <p style={{ marginTop: 'var(--space-sm)', fontSize: 'var(--body-size)' }}>
            <a
              href={phase.liveUrl}
              target="_blank"
              rel="noreferrer"
              style={{ fontFamily: 'var(--font-mono)', color: 'var(--sunset)', textDecoration: 'underline' }}
            >
              {phase.liveUrl}
            </a>
          </p>
          <p
            style={{
              marginTop: 'var(--space-md)',
              fontSize: 'var(--small-size)',
              color: 'var(--text-secondary)',
            }}
          >
            Expires <time dateTime={phase.expiresAt}>{formatWhen(phase.expiresAt)}</time>.
            <br />
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                router.push(`/auth/signin?claim_trial=${encodeURIComponent(phase.slug)}`);
              }}
              style={{
                marginTop: 'var(--space-md)',
                background: 'var(--sunset)',
                color: 'var(--bg-pure)',
                border: 'none',
                borderRadius: 4,
                padding: '0.6rem 1.25rem',
                fontWeight: 600,
                cursor: 'pointer',
                fontSize: 'var(--small-size)',
              }}
            >
              Claim it before it expires →
            </button>
          </p>
        </>
      ) : phase.kind === 'uploading' ? (
        <>
          <p style={{ fontFamily: 'var(--font-heading)', fontSize: 'var(--h3-size)', color: 'var(--marigold)' }}>
            Shipping {phase.filename}…
          </p>
          <p style={{ color: 'var(--text-secondary)', marginTop: 'var(--space-sm)', fontSize: 'var(--small-size)' }}>
            Preflight · trust scan · R2 upload · KV flip. Usually under a minute.
          </p>
        </>
      ) : phase.kind === 'error' ? (
        <>
          <p style={{ fontFamily: 'var(--font-heading)', fontSize: 'var(--h3-size)', color: 'var(--sunset-dim)' }}>
            Couldn’t ship the trial
          </p>
          <p style={{ color: 'var(--text-secondary)', marginTop: 'var(--space-sm)', fontSize: 'var(--small-size)' }}>
            {phase.message}
          </p>
          {!phase.fatal && (
            <p style={{ marginTop: 'var(--space-md)', fontSize: 'var(--small-size)' }}>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setPhase({ kind: 'idle' });
                }}
                style={{
                  background: 'transparent',
                  border: '1px solid var(--border)',
                  borderRadius: 4,
                  padding: '0.4rem 0.9rem',
                  color: 'var(--text)',
                  cursor: 'pointer',
                  fontSize: 'var(--small-size)',
                }}
              >
                Try again
              </button>
            </p>
          )}
        </>
      ) : (
        <>
          <p style={{ fontFamily: 'var(--font-heading)', fontSize: 'var(--h3-size)', marginBottom: 'var(--space-xs)' }}>
            Drop a zip here
          </p>
          <p style={{ color: 'var(--text-secondary)', fontSize: 'var(--small-size)' }}>
            Get a live <span style={{ fontFamily: 'var(--font-mono)' }}>*.shippie.app</span> URL in under a minute. No signup.
          </p>
          <p
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: 'var(--caption-size)',
              color: 'var(--text-light)',
              marginTop: 'var(--space-lg)',
            }}
          >
            or click to choose · {MAX_MB}MB max · zip of built output (dist/build/out) · lives 24h
          </p>
        </>
      )}
    </div>
  );
}

function formatWhen(iso: string): string {
  const date = new Date(iso);
  const ms = date.getTime() - Date.now();
  const hours = Math.max(0, Math.round(ms / 3_600_000));
  if (hours >= 1) return `in ${hours}h`;
  const minutes = Math.max(0, Math.round(ms / 60_000));
  return `in ${minutes}m`;
}
