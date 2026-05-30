import { useState } from 'react';
import {
  SENTIMENT_LABEL,
  TOUCH_KINDS,
  TOUCH_KIND_LABEL,
  type Sentiment,
  type TouchKind,
} from '../db/schema.ts';

interface Props {
  personName: string;
  /** Pre-fill kind (e.g. 'coffee' when triggered by a coffee-brewed intent). */
  kindHint?: TouchKind;
  /** Pre-fill summary (e.g. "Coffee with X — V60, Yirgacheffe"). */
  summaryHint?: string;
  onCancel: () => void;
  onSubmit: (input: {
    kind: TouchKind;
    summary: string;
    sentiment: Sentiment;
    link_url: string | null;
  }) => void;
}

export function LogTouchSheet({ personName, kindHint, summaryHint, onCancel, onSubmit }: Props) {
  const [kind, setKind] = useState<TouchKind>(kindHint ?? 'note');
  const [summary, setSummary] = useState(summaryHint ?? '');
  const [sentiment, setSentiment] = useState<Sentiment>('0');
  const [link, setLink] = useState('');

  return (
    <div className="sheet-backdrop" onClick={onCancel} role="dialog" aria-modal="true">
      <div className="sheet" onClick={(e) => e.stopPropagation()}>
        <h3>Log a touch · {personName}</h3>
        <div>
          <p className="eyebrow">Kind</p>
          <div className="row">
            {TOUCH_KINDS.map((k) => (
              <button
                key={k}
                type="button"
                className={`kind-chip ${k === kind ? 'active' : ''}`}
                onClick={() => setKind(k)}
              >
                {TOUCH_KIND_LABEL[k]}
              </button>
            ))}
          </div>
        </div>
        <label>
          What happened?
          <textarea
            placeholder="King's Head — talked roadmap, said yes to intro"
            value={summary}
            onChange={(e) => setSummary(e.target.value)}
          />
        </label>
        <label>
          Link (optional)
          <input
            type="text"
            placeholder="Paste a link"
            value={link}
            onChange={(e) => setLink(e.target.value)}
          />
        </label>
        <div>
          <p className="eyebrow">How was it?</p>
          <div className="sentiment-row">
            {(['+', '0', '-'] as const).map((s) => (
              <button
                key={s}
                type="button"
                className={`sentiment-chip ${
                  s === sentiment
                    ? `active ${s === '+' ? 'pos' : s === '-' ? 'neg' : 'neu'}`
                    : ''
                }`}
                onClick={() => setSentiment(s)}
              >
                {s === '+' ? 'Good' : s === '-' ? 'Rough' : 'Neutral'} ({SENTIMENT_LABEL[s]})
              </button>
            ))}
          </div>
        </div>
        <div className="row">
          <button type="button" className="ghost" onClick={onCancel}>
            Cancel
          </button>
          <button
            type="button"
            className="primary"
            onClick={() =>
              onSubmit({
                kind,
                summary: summary.trim(),
                sentiment,
                link_url: link.trim() || null,
              })
            }
          >
            Log it
          </button>
        </div>
      </div>
    </div>
  );
}
