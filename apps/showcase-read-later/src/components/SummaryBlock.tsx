/**
 * Summary block — renders the cached 3-sentence summary on the queue
 * card. Honest about origin: "on-device summary" when the worker ran,
 * "extractive preview" when we fell back. No badge for `unavailable`
 * because no summary lives in that state — the row hides it.
 */
import type { SavedArticle } from '../lib/types.ts';

interface SummaryBlockProps {
  article: SavedArticle;
}

export function SummaryBlock({ article }: SummaryBlockProps) {
  const summary = article.summary;
  if (!summary || summary.sentences.length === 0) return null;
  const label = summary.source === 'ai' ? 'on-device summary' : 'extractive preview';
  return (
    <div className="summary" aria-label={label}>
      <p className="summary-source">{label}</p>
      <ul className="summary-sentences">
        {summary.sentences.map((sentence, idx) => (
          <li key={idx}>{sentence}</li>
        ))}
      </ul>
    </div>
  );
}
