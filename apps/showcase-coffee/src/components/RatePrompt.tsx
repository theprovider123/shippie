import { useState } from 'react';

interface RatePromptProps {
  onConfirm: (rating: number, note: string) => void;
  onSkip: () => void;
}

/**
 * Post-brew rating + short journal note. The user lands here right
 * after Finish — five stars + optional one-liner ("more bloom",
 * "perfect"). Both are optional but the prompt makes the cost low.
 */
export function RatePrompt({ onConfirm, onSkip }: RatePromptProps) {
  const [rating, setRating] = useState<number | null>(null);
  const [note, setNote] = useState('');

  return (
    <section className="rate" aria-label="Rate brew">
      <p className="muted small">how was it?</p>
      <div className="rate-stars" role="radiogroup" aria-label="Star rating">
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            type="button"
            role="radio"
            aria-checked={rating === n}
            className={`star ${rating !== null && n <= rating ? 'lit' : ''}`}
            onClick={() => setRating(n)}
            aria-label={`${n} of 5`}
          >
            ★
          </button>
        ))}
      </div>
      <input
        className="rate-note"
        type="text"
        placeholder="quick note? (e.g. more bloom next time)"
        value={note}
        onChange={(e) => setNote(e.target.value)}
        maxLength={200}
      />
      <div className="rate-actions">
        <button type="button" className="ghost" onClick={onSkip}>
          Skip
        </button>
        <button
          type="button"
          className="primary"
          disabled={rating === null}
          onClick={() => {
            if (rating !== null) onConfirm(rating, note.trim());
          }}
        >
          Save
        </button>
      </div>
    </section>
  );
}
