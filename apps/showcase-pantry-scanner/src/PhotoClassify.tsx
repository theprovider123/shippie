/**
 * P5 — photo-to-item identification for Pantry Scanner.
 *
 * The user picks an image, we route it through `shippie.ai.run({
 * task: 'vision', input: blob })` and surface the top suggestions
 * as one-tap chips. Tapping a chip pre-fills the manual-add form
 * with the chosen label.
 *
 * P5 invariant: when the AI worker returns `source: 'unavailable'`
 * we hide the entire card. The user can still scan via barcode or
 * type the name — the photo path is a bonus, not a load-bearing
 * surface.
 */
import { useState } from 'react';
import type { ShippieIframeSdk } from '@shippie/iframe-sdk';

interface PhotoClassifyProps {
  shippie: ShippieIframeSdk;
  onPick: (label: string) => void;
}

interface Suggestion {
  label: string;
  confidence: number;
}

export function PhotoClassify({ shippie, onPick }: PhotoClassifyProps) {
  const [busy, setBusy] = useState(false);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [available, setAvailable] = useState<boolean | null>(null);

  async function handlePick(file: File) {
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      const result = await shippie.ai.run({ task: 'vision', input: file });
      if (result.source === 'unavailable') {
        setAvailable(false);
        return;
      }
      setAvailable(true);
      const labels = (result.output ?? []) as Array<{ label?: string; score?: number }>;
      const cleaned: Suggestion[] = labels
        .filter((l) => typeof l?.label === 'string' && typeof l?.score === 'number')
        .slice(0, 5)
        .map((l) => ({
          label: friendlyLabel(l.label as string),
          confidence: l.score as number,
        }));
      if (cleaned.length === 0) {
        setError('No confident match. Try a closer photo or scan the barcode.');
      } else {
        setSuggestions(cleaned);
      }
    } catch {
      setAvailable(false);
    } finally {
      setBusy(false);
    }
  }

  if (available === false) return null;

  return (
    <section className="photo-classify">
      <h2>Photo identify</h2>
      <p className="hint">Snap an item — the on-device vision model suggests labels.</p>
      <input
        type="file"
        accept="image/*"
        capture="environment"
        disabled={busy}
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void handlePick(file);
        }}
      />
      {busy && <p className="hint">Running on-device…</p>}
      {error && <p className="status error">{error}</p>}
      {suggestions.length > 0 && (
        <div className="suggestions">
          {suggestions.map((s) => (
            <button
              key={s.label}
              type="button"
              className="chip"
              onClick={() => {
                onPick(s.label);
                setSuggestions([]);
              }}
              title={`${(s.confidence * 100).toFixed(0)}%`}
            >
              {s.label}
            </button>
          ))}
        </div>
      )}
    </section>
  );
}

/**
 * ImageNet-style labels are noisy ("Granny_Smith, n07742313"). Strip
 * the cruft so the chip surface stays readable.
 */
function friendlyLabel(raw: string): string {
  const head = raw.split(',')[0]?.trim() ?? raw;
  return head.replace(/_/g, ' ').replace(/\bn\d+\b/g, '').trim();
}
