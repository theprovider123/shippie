// apps/web/app/apps/[slug]/rate-widget.tsx
/**
 * Star-picker + optional review text area that POSTs to
 * /api/apps/[slug]/rate and refreshes the page on success.
 *
 * Requires the caller to be signed in — the parent page guards this.
 */
'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';

interface Props {
  slug: string;
  initial?: { rating: number; review: string | null } | null;
}

export function RateWidget({ slug, initial }: Props) {
  const router = useRouter();
  const [rating, setRating] = useState<number>(initial?.rating ?? 0);
  const [review, setReview] = useState<string>(initial?.review ?? '');
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    if (!rating) {
      setError('Pick at least one star.');
      return;
    }
    setError(null);
    const res = await fetch(`/api/apps/${encodeURIComponent(slug)}/rate`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ rating, review: review.trim() || null }),
    });
    if (!res.ok) {
      setError('Submission failed.');
      return;
    }
    startTransition(() => router.refresh());
  }

  return (
    <div style={{ padding: 16, background: 'var(--surface-alt, #252019)', borderRadius: 10, marginTop: 20 }}>
      <p style={{ margin: '0 0 8px', fontSize: 13, color: 'var(--text-secondary)' }}>
        Rate this app
      </p>
      <div style={{ display: 'flex', gap: 4, marginBottom: 12 }}>
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            type="button"
            onClick={() => setRating(n)}
            style={{
              background: 'transparent',
              border: 'none',
              padding: 4,
              cursor: 'pointer',
              fontSize: 24,
              color: n <= rating ? 'var(--sunset, #E8603C)' : 'var(--text-light, #7A6B58)',
            }}
            aria-label={`${n} star${n === 1 ? '' : 's'}`}
          >
            ★
          </button>
        ))}
      </div>
      <textarea
        value={review}
        onChange={(e) => setReview(e.target.value)}
        placeholder="What did you think? (optional)"
        maxLength={2000}
        rows={3}
        style={{
          width: '100%',
          padding: 10,
          background: 'var(--surface, #1E1A15)',
          color: 'var(--text)',
          border: '1px solid var(--border, #3D3530)',
          borderRadius: 6,
          fontSize: 13,
          fontFamily: 'inherit',
          resize: 'vertical',
        }}
      />
      <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 12, marginTop: 8 }}>
        {error && <span style={{ fontSize: 12, color: '#d33' }}>{error}</span>}
        <button
          type="button"
          onClick={submit}
          disabled={pending}
          style={{
            padding: '8px 16px',
            background: 'var(--sunset, #E8603C)',
            color: 'var(--bg, #14120F)',
            border: 'none',
            borderRadius: 6,
            fontWeight: 600,
            cursor: pending ? 'wait' : 'pointer',
            opacity: pending ? 0.6 : 1,
          }}
        >
          {initial ? 'Update' : 'Submit'}
        </button>
      </div>
    </div>
  );
}
