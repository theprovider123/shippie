/**
 * Reader page — full article render from cached extracted HTML.
 *
 * Typography: max-width 680, line-height 1.6, system font with
 * Fraunces hint when the platform's font stack provides it. Light
 * and dark themes via a toggle stored in localStorage.
 *
 * Highlight + note interaction is delegated to HighlightLayer.
 */
import { useEffect, useState } from 'react';
import type { Highlight, SavedArticle } from '../lib/types.ts';
import { ReadProgress } from '../components/ReadProgress.tsx';
import { HighlightLayer } from '../components/HighlightLayer.tsx';
import { addTag, removeTag, normaliseTag } from '../lib/tags.ts';
import { SummaryBlock } from '../components/SummaryBlock.tsx';

interface ReaderProps {
  article: SavedArticle;
  highlights: readonly Highlight[];
  onClose: () => void;
  onAddHighlight: (text: string, note?: string) => void;
  onRemoveHighlight: (id: string) => void;
  onProgress: (progress: number) => void;
  onUpdateArticle: (next: SavedArticle) => void;
  onMarkFinished: () => void;
}

const THEME_KEY = 'shippie.read-later.theme';

export function Reader({
  article,
  highlights,
  onClose,
  onAddHighlight,
  onRemoveHighlight,
  onProgress,
  onUpdateArticle,
  onMarkFinished,
}: ReaderProps) {
  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    if (typeof localStorage === 'undefined') return 'light';
    return (localStorage.getItem(THEME_KEY) as 'light' | 'dark' | null) ?? 'light';
  });
  const [progress, setProgress] = useState(article.progress ?? 0);
  const [tagDraft, setTagDraft] = useState('');

  useEffect(() => {
    if (typeof document === 'undefined') return;
    document.documentElement.dataset.readerTheme = theme;
    if (typeof localStorage !== 'undefined') localStorage.setItem(THEME_KEY, theme);
    return () => {
      delete document.documentElement.dataset.readerTheme;
    };
  }, [theme]);

  // Reset scroll on article change so the previous article's scroll
  // position doesn't bleed into the next.
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [article.id]);

  function handleProgress(next: number) {
    setProgress(next);
    onProgress(next);
  }

  function handleAddTag(e: React.FormEvent) {
    e.preventDefault();
    const t = normaliseTag(tagDraft);
    if (!t) return;
    onUpdateArticle(addTag(article, t));
    setTagDraft('');
  }

  return (
    <article className={`reader theme-${theme}`} aria-label={article.title}>
      <ReadProgress progress={progress} totalMinutes={article.readMinutes} />
      <div className="reader-toolbar">
        <button type="button" className="ghost" onClick={onClose} aria-label="Back to queue">
          ← Back
        </button>
        <div className="reader-toolbar-right">
          <button
            type="button"
            className="ghost"
            onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
            aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
            title={theme === 'dark' ? 'Light mode' : 'Dark mode'}
          >
            {theme === 'dark' ? '☀' : '☾'}
          </button>
          <button
            type="button"
            className="ghost"
            onClick={onMarkFinished}
            aria-label="Mark finished and archive"
            title="Mark finished"
          >
            Finished
          </button>
        </div>
      </div>
      <header className="reader-header">
        <h1>{article.title}</h1>
        <p className="meta">
          {article.readMinutes} min read ·{' '}
          <a href={article.url} target="_blank" rel="noopener noreferrer">
            source
          </a>
        </p>
        <SummaryBlock article={article} />
        <div className="reader-tags">
          {(article.tags ?? []).map((t) => (
            <button
              key={t}
              type="button"
              className="tag-chip removable"
              onClick={() => onUpdateArticle(removeTag(article, t))}
              aria-label={`Remove tag ${t}`}
              title={`Remove #${t}`}
            >
              #{t} ×
            </button>
          ))}
          <form onSubmit={handleAddTag} className="tag-form">
            <input
              type="text"
              value={tagDraft}
              onChange={(e) => setTagDraft(e.target.value)}
              placeholder="add tag"
              aria-label="Add tag"
              maxLength={24}
            />
          </form>
        </div>
      </header>
      <HighlightLayer
        contentHtml={article.contentHtml}
        highlights={highlights}
        onAddHighlight={onAddHighlight}
        onRemoveHighlight={onRemoveHighlight}
        onScrollProgress={handleProgress}
      />
      <footer className="reader-footer">
        <p className="meta">Long-press a paragraph to highlight or remove a highlight.</p>
      </footer>
    </article>
  );
}
