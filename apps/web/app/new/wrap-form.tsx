'use client';

import { useState } from 'react';

type Phase =
  | { kind: 'idle' }
  | { kind: 'submitting' }
  | { kind: 'done'; liveUrl: string; redirectUri: string }
  | { kind: 'error'; message: string };

export function WrapForm() {
  const [phase, setPhase] = useState<Phase>({ kind: 'idle' });

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    setPhase({ kind: 'submitting' });

    const taglineRaw = String(form.get('tagline') ?? '');
    const body = {
      upstream_url: String(form.get('upstream_url') ?? ''),
      slug: String(form.get('slug') ?? ''),
      name: String(form.get('name') ?? ''),
      ...(taglineRaw ? { tagline: taglineRaw } : {}),
      type: String(form.get('type') ?? 'app'),
      category: String(form.get('category') ?? 'tools'),
    };

    const res = await fetch('/api/deploy/wrap', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    const j = (await res.json().catch(() => ({}))) as {
      success?: boolean;
      live_url?: string;
      runtime_config?: { required_redirect_uris?: string[] };
      reason?: string;
      error?: string;
    };

    if (res.ok && j.success && j.live_url) {
      setPhase({
        kind: 'done',
        liveUrl: j.live_url,
        redirectUri: j.runtime_config?.required_redirect_uris?.[0] ?? '',
      });
    } else {
      setPhase({ kind: 'error', message: j.reason ?? j.error ?? 'Wrap failed.' });
    }
  }

  if (phase.kind === 'done') {
    return (
      <div style={{ padding: 'var(--space-lg)', border: '1px solid var(--border-light)' }}>
        <p
          style={{
            fontFamily: 'var(--font-heading)',
            fontSize: 'var(--h3-size)',
            color: 'var(--sage-leaf, var(--sunset))',
            margin: 0,
          }}
        >
          ✓ Wrapped
        </p>
        <p style={{ marginTop: 'var(--space-sm)' }}>
          <a href={phase.liveUrl} style={{ color: 'var(--sunset)', fontFamily: 'var(--font-mono)' }}>
            {phase.liveUrl}
          </a>
        </p>
        {phase.redirectUri && (
          <>
            <p
              style={{
                marginTop: 'var(--space-md)',
                color: 'var(--text-secondary)',
                fontSize: 'var(--small-size)',
              }}
            >
              Add this redirect URI to your auth provider (Supabase, Auth0, Clerk):
            </p>
            <pre
              style={{
                background: 'var(--surface)',
                border: '1px solid var(--border-light)',
                padding: 'var(--space-sm)',
                fontFamily: 'var(--font-mono)',
                fontSize: 13,
                marginTop: 'var(--space-xs)',
                overflow: 'auto',
              }}
            >
              {phase.redirectUri}
            </pre>
          </>
        )}
      </div>
    );
  }

  return (
    <form
      onSubmit={onSubmit}
      style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-md)' }}
    >
      <Field
        label="Upstream URL"
        name="upstream_url"
        placeholder="https://mevrouw.vercel.app"
        required
        type="url"
      />
      <Field label="Slug" name="slug" placeholder="mevrouw" required pattern="[a-z0-9][a-z0-9-]*[a-z0-9]" />
      <Field label="Name" name="name" placeholder="Mevrouw" required />
      <Field label="Tagline (optional)" name="tagline" />
      <Row>
        <Select
          label="Type"
          name="type"
          options={[
            ['app', 'App'],
            ['web_app', 'Web app'],
            ['website', 'Website'],
          ]}
        />
        <Field label="Category" name="category" placeholder="tools" defaultValue="tools" />
      </Row>
      {phase.kind === 'error' && (
        <p style={{ color: '#c84a2a', fontSize: 'var(--small-size)' }}>{phase.message}</p>
      )}
      <button
        type="submit"
        className="btn-primary"
        disabled={phase.kind === 'submitting'}
        style={{ justifyContent: 'center' }}
      >
        {phase.kind === 'submitting' ? 'Wrapping…' : 'Wrap URL'}
      </button>
    </form>
  );
}

function Field({ label, ...rest }: { label: string } & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <span style={{ fontSize: 12, color: 'var(--text-light)' }}>{label}</span>
      <input
        {...rest}
        style={{
          height: 40,
          padding: '0 0.75rem',
          background: 'transparent',
          border: '1px solid var(--border-default)',
          color: 'var(--text-primary)',
          fontFamily: 'var(--font-mono)',
          fontSize: 14,
        }}
      />
    </label>
  );
}

function Select({
  label,
  name,
  options,
}: {
  label: string;
  name: string;
  options: [string, string][];
}) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 4, flex: 1 }}>
      <span style={{ fontSize: 12, color: 'var(--text-light)' }}>{label}</span>
      <select
        name={name}
        style={{
          height: 40,
          padding: '0 0.75rem',
          background: 'transparent',
          border: '1px solid var(--border-default)',
          color: 'var(--text-primary)',
        }}
      >
        {options.map(([v, l]) => (
          <option key={v} value={v}>
            {l}
          </option>
        ))}
      </select>
    </label>
  );
}

function Row({ children }: { children: React.ReactNode }) {
  return <div style={{ display: 'flex', gap: 'var(--space-md)' }}>{children}</div>;
}
