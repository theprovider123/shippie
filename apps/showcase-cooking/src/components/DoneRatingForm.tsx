/**
 * Post-cook rating form. Surfaces after the user marks a cook done.
 * Captures 1–5 stars + a free-form note ("pull at 200°F next time").
 *
 * Memory beats stars — a single concrete note is worth more than the
 * rating across five briskets.
 */

import { useState } from 'react';

interface DoneRatingFormProps {
  cutName: string;
  onSubmit(rating: number, note: string): void;
  onSkip(): void;
}

export function DoneRatingForm({ cutName, onSubmit, onSkip }: DoneRatingFormProps) {
  const [rating, setRating] = useState<number>(0);
  const [note, setNote] = useState('');

  function submit() {
    if (rating === 0 && !note.trim()) {
      onSkip();
      return;
    }
    onSubmit(rating || 0, note.trim());
  }

  return (
    <section className="done-form">
      <p className="eyebrow">how did the {cutName.toLowerCase()} land?</p>
      <div className="stars">
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            type="button"
            className={`star ${rating >= n ? 'star--on' : ''}`}
            onClick={() => setRating(n === rating ? 0 : n)}
            aria-label={`${n} star${n === 1 ? '' : 's'}`}
          >
            ★
          </button>
        ))}
      </div>
      <textarea
        className="note-input"
        placeholder="One line for next time — e.g. pull at 200°F, more salt the night before, ride the stall longer."
        value={note}
        onChange={(e) => setNote(e.target.value)}
        rows={3}
      />
      <div className="done-form-actions">
        <button type="button" className="primary" onClick={submit}>
          Save
        </button>
        <button type="button" className="ghost" onClick={onSkip}>
          Skip
        </button>
      </div>
    </section>
  );
}
