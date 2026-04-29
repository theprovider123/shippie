/**
 * P3 — three-tap quick-entry flow.
 *
 * Step 1: mood slider (1..10).
 * Step 2: one sentence — with one-tap suggestions seeded from recent
 *   `cooked-meal`, `workout-completed`, `body-metrics-logged` events.
 * Step 3: confirm + save. Persists to the same local DB the existing
 *   WriteEntry uses, so Browse / Trends / Year-in-review pick it up.
 *
 * The full WriteEntry flow stays intact for users who want to write
 * a longer entry. QuickEntry is for the days you only have 8 seconds.
 */
import { useEffect, useState } from 'react';
import { createEntry } from '../db/queries.ts';
import { resolveLocalDb } from '../db/runtime.ts';
import { createShippieIframeSdk } from '@shippie/iframe-sdk';

const shippie = createShippieIframeSdk({ appId: 'app_journal' });

const PROMPT_INTENTS = [
  'cooked-meal',
  'workout-completed',
  'body-metrics-logged',
] as const;

type PromptIntent = (typeof PROMPT_INTENTS)[number];

interface IntentPrompt {
  intent: PromptIntent;
  /** A short, ready-to-tap sentence. */
  text: string;
  /** ms when the originating broadcast arrived. */
  receivedAt: number;
}

interface QuickEntryProps {
  onSaved: () => void;
}

const PROMPT_TEMPLATES: Record<PromptIntent, (label: string) => string> = {
  'cooked-meal': (label) => `Cooked ${label}.`,
  'workout-completed': (label) => `Worked out (${label}).`,
  'body-metrics-logged': (label) => `Tracked ${label}.`,
};

export function QuickEntry({ onSaved }: QuickEntryProps) {
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [mood, setMood] = useState(7);
  const [body, setBody] = useState('');
  const [prompts, setPrompts] = useState<IntentPrompt[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    for (const intent of PROMPT_INTENTS) shippie.requestIntent(intent);
    const offs = PROMPT_INTENTS.map((intent) =>
      shippie.intent.subscribe(intent, ({ rows }) => {
        const newest = (rows[0] ?? null) as Record<string, unknown> | null;
        const label = typeof newest?.title === 'string'
          ? newest.title
          : typeof newest?.kind === 'string'
            ? newest.kind
            : intent;
        setPrompts((prev) => {
          const text = PROMPT_TEMPLATES[intent](label);
          // De-dupe by text within a 60-second window.
          const cutoff = Date.now() - 24 * 60 * 60 * 1000;
          const filtered = prev.filter(
            (p) => p.text !== text && p.receivedAt >= cutoff,
          );
          return [{ intent, text, receivedAt: Date.now() }, ...filtered].slice(0, 5);
        });
      }),
    );
    return () => {
      for (const off of offs) off();
    };
  }, []);

  function next() {
    setStep((s) => (s < 3 ? ((s + 1) as 1 | 2 | 3) : s));
    shippie.feel.texture('navigate');
  }

  function back() {
    setStep((s) => (s > 1 ? ((s - 1) as 1 | 2 | 3) : s));
  }

  async function save() {
    if (!body.trim()) return;
    setSaving(true);
    try {
      // Score range: mood is 1..10, sentiment in DB is -1..+1. Map
      // 1 → -1, 10 → +1, with 5.5 as neutral (linear scale).
      const sentimentScore = (mood - 5.5) / 4.5;
      const label =
        sentimentScore > 0.2 ? 'positive' : sentimentScore < -0.2 ? 'negative' : 'neutral';
      await createEntry(resolveLocalDb(), {
        title: null,
        body: body.trim(),
        sentiment: sentimentScore,
        sentiment_label: label,
        topic: 'unclassified',
        embedding: null,
      });
      shippie.feel.texture('complete');
      setBody('');
      setMood(7);
      setStep(1);
      onSaved();
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="quick-entry" aria-label="Quick entry">
      <ol className="quick-stepper" aria-label={`Step ${step} of 3`}>
        {[1, 2, 3].map((n) => (
          <li key={n} className={n === step ? 'active' : n < step ? 'done' : ''}>
            <span aria-hidden="true">{n}</span>
          </li>
        ))}
      </ol>

      {step === 1 && (
        <div className="step">
          <h2>How are you?</h2>
          <input
            type="range"
            min={1}
            max={10}
            value={mood}
            onChange={(e) => setMood(Number(e.target.value))}
            aria-label="Mood from 1 to 10"
          />
          <div className="mood-readout">{mood}/10</div>
          <button className="primary" onClick={next}>
            Next
          </button>
        </div>
      )}

      {step === 2 && (
        <div className="step">
          <h2>One sentence</h2>
          {prompts.length > 0 && (
            <div className="prompt-chips" aria-label="Suggestions from your other apps">
              {prompts.map((p) => (
                <button
                  key={`${p.intent}-${p.receivedAt}`}
                  type="button"
                  className="chip"
                  onClick={() => setBody(p.text)}
                >
                  {p.text}
                </button>
              ))}
            </div>
          )}
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="What happened today?"
            rows={5}
            aria-label="Entry body"
          />
          <div className="quick-actions">
            <button className="ghost" onClick={back}>Back</button>
            <button className="primary" onClick={next} disabled={!body.trim()}>
              Next
            </button>
          </div>
        </div>
      )}

      {step === 3 && (
        <div className="step">
          <h2>Save?</h2>
          <p className="quick-summary">
            <strong>Mood:</strong> {mood}/10
          </p>
          <p className="quick-summary quick-body">{body}</p>
          <div className="quick-actions">
            <button className="ghost" onClick={back}>Back</button>
            <button className="primary" onClick={save} disabled={saving}>
              {saving ? 'Saving…' : 'Save'}
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
