/**
 * Queue card — one row in the Queue page.
 *
 * Pin/archive/delete actions live here so the page can stay short.
 * Drag handles are wired but the reorder commit is the page's job
 * (because reordering is a list-level operation).
 */
import type { SavedArticle } from '../lib/types.ts';
import { formatReadTime } from '../lib/read-time.ts';
import { SummaryBlock } from './SummaryBlock.tsx';

export interface ArticleCardProps {
  article: SavedArticle;
  position: number;
  /** Total in the visible queue, for "#3 of 12" copy. */
  total: number;
  highlightCount: number;
  onOpen: () => void;
  onTogglePin: () => void;
  onToggleRead: () => void;
  onRemove: () => void;
  onDragStart: () => void;
  onDragEnter: () => void;
  onDragEnd: () => void;
  isDragSource: boolean;
}

function hostname(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}

export function ArticleCard({
  article,
  position,
  total,
  highlightCount,
  onOpen,
  onTogglePin,
  onToggleRead,
  onRemove,
  onDragStart,
  onDragEnter,
  onDragEnd,
  isDragSource,
}: ArticleCardProps) {
  const tags = article.tags ?? [];
  return (
    <li
      className={[
        'card',
        article.read ? 'done' : '',
        article.pinned ? 'pinned' : '',
        isDragSource ? 'dragging' : '',
      ]
        .filter(Boolean)
        .join(' ')}
      draggable
      onDragStart={onDragStart}
      onDragEnter={onDragEnter}
      onDragOver={(e) => e.preventDefault()}
      onDragEnd={onDragEnd}
    >
      <button
        type="button"
        className="open"
        onClick={onOpen}
        aria-label={`Open ${article.title}`}
      >
        <div className="card-head">
          <span className="position" aria-hidden>
            #{position} of {total}
          </span>
          <span className="read-time">{formatReadTime(article.readMinutes)}</span>
        </div>
        <strong>{article.title}</strong>
        <small>{hostname(article.url)}</small>
        <SummaryBlock article={article} />
        {tags.length > 0 ? (
          <div className="card-tags" aria-label="Tags">
            {tags.map((t) => (
              <span key={t} className="tag-chip">
                #{t}
              </span>
            ))}
          </div>
        ) : null}
        {highlightCount > 0 ? (
          <p className="card-meta">
            {highlightCount} highlight{highlightCount === 1 ? '' : 's'}
          </p>
        ) : null}
      </button>
      <div className="actions">
        <button
          type="button"
          onClick={onTogglePin}
          aria-label={article.pinned ? 'Unpin' : 'Pin to top'}
          aria-pressed={!!article.pinned}
          title={article.pinned ? 'Unpin' : 'Pin to top'}
        >
          {article.pinned ? '★' : '☆'}
        </button>
        <button
          type="button"
          onClick={onToggleRead}
          aria-label={article.read ? 'Mark unread' : 'Archive (mark read)'}
          title={article.read ? 'Mark unread' : 'Archive'}
        >
          {article.read ? '↶' : '✓'}
        </button>
        <button
          type="button"
          onClick={onRemove}
          aria-label="Delete"
          title="Delete"
        >
          ×
        </button>
      </div>
    </li>
  );
}
