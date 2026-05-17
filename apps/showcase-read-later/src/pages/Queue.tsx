/**
 * Queue page — the list view. Save URL, see your queue, filter by tag,
 * drag to reorder. Honest stat strip up top: "12 unread, 5 saved this
 * week, you've read 8 — queue grows faster than you read".
 */
import { useMemo, useRef, useState } from 'react';
import type { ReadLaterState, SavedArticle } from '../lib/types.ts';
import { sortQueue, weekStats } from '../lib/store.ts';
import { aggregateTags, filterByTag } from '../lib/tags.ts';
import { ArticleCard } from '../components/ArticleCard.tsx';
import { TagFilter } from '../components/TagFilter.tsx';
import { SaveSheet } from '../components/SaveSheet.tsx';

interface QueueProps {
  state: ReadLaterState;
  onSave: (url: string) => Promise<void>;
  onOpen: (id: string) => void;
  onTogglePin: (id: string) => void;
  onToggleRead: (id: string) => void;
  onRemove: (id: string) => void;
  onReorder: (ids: string[]) => void;
  saving: boolean;
  saveStatus: string | null;
  saveError: string | null;
  moodHint: string | null;
}

export function Queue({
  state,
  onSave,
  onOpen,
  onTogglePin,
  onToggleRead,
  onRemove,
  onReorder,
  saving,
  saveStatus,
  saveError,
  moodHint,
}: QueueProps) {
  const [draftUrl, setDraftUrl] = useState('');
  const [activeTag, setActiveTag] = useState<string | null>(null);
  const dragIdRef = useRef<string | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);

  const tags = useMemo(() => aggregateTags(state.articles), [state.articles]);
  const stats = useMemo(() => weekStats(state), [state]);

  const visible = useMemo(() => {
    let queue = sortQueue(state.articles);
    if (activeTag) queue = filterByTag(queue, activeTag);
    if (moodHint) queue = [...queue].sort((a, b) => a.readMinutes - b.readMinutes);
    return queue;
  }, [state.articles, activeTag, moodHint]);

  const unreadVisible = visible.filter((a) => !a.read);
  const readVisible = visible.filter((a) => a.read);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const url = draftUrl.trim();
    if (!url) return;
    await onSave(url);
    setDraftUrl('');
  }

  function handleDragStart(id: string) {
    dragIdRef.current = id;
    setDragId(id);
  }

  function handleDragEnter(id: string) {
    const sourceId = dragIdRef.current;
    if (!sourceId || sourceId === id) return;
    // Reorder among unread visible articles. Pinned + read sit in
    // separate buckets so we don't let a drag mix them up; we let
    // the action buttons handle bucket transitions.
    const ordered = unreadVisible.map((a) => a.id);
    const fromIdx = ordered.indexOf(sourceId);
    const toIdx = ordered.indexOf(id);
    if (fromIdx < 0 || toIdx < 0) return;
    ordered.splice(fromIdx, 1);
    ordered.splice(toIdx, 0, sourceId);
    onReorder(ordered);
  }

  function handleDragEnd() {
    dragIdRef.current = null;
    setDragId(null);
  }

  const honestStat = honestQueueStat(stats);

  return (
    <main>
      <header>
        <h1>Read Later</h1>
        <p className="stats">
          {stats.unread} unread · {stats.total} saved
        </p>
        {honestStat ? <p className="honest">{honestStat}</p> : null}
      </header>

      <SaveSheet
        draftUrl={draftUrl}
        onChange={setDraftUrl}
        onSubmit={handleSubmit}
        busy={saving}
        status={saveStatus}
        error={saveError}
      />

      {moodHint ? <p className="hint">{moodHint}</p> : null}

      <TagFilter tags={tags} active={activeTag} onSelect={setActiveTag} />

      {visible.length === 0 ? (
        <p className="empty">
          {activeTag
            ? `No saved articles tagged #${activeTag}.`
            : 'Paste a URL above. Articles fetch via the SSRF-guarded proxy and stay on this device.'}
        </p>
      ) : (
        <>
          {unreadVisible.length > 0 ? (
            <ul className="queue-list">
              {unreadVisible.map((article, idx) => (
                <ArticleCard
                  key={article.id}
                  article={article}
                  position={idx + 1}
                  total={unreadVisible.length}
                  highlightCount={highlightCountFor(state, article.id)}
                  onOpen={() => onOpen(article.id)}
                  onTogglePin={() => onTogglePin(article.id)}
                  onToggleRead={() => onToggleRead(article.id)}
                  onRemove={() => onRemove(article.id)}
                  onDragStart={() => handleDragStart(article.id)}
                  onDragEnter={() => handleDragEnter(article.id)}
                  onDragEnd={handleDragEnd}
                  isDragSource={dragId === article.id}
                />
              ))}
            </ul>
          ) : null}

          {readVisible.length > 0 ? (
            <details className="archive">
              <summary>Archived ({readVisible.length})</summary>
              <ul className="queue-list">
                {readVisible.map((article, idx) => (
                  <ArticleCard
                    key={article.id}
                    article={article}
                    position={idx + 1}
                    total={readVisible.length}
                    highlightCount={highlightCountFor(state, article.id)}
                    onOpen={() => onOpen(article.id)}
                    onTogglePin={() => onTogglePin(article.id)}
                    onToggleRead={() => onToggleRead(article.id)}
                    onRemove={() => onRemove(article.id)}
                    onDragStart={() => handleDragStart(article.id)}
                    onDragEnter={() => handleDragEnter(article.id)}
                    onDragEnd={handleDragEnd}
                    isDragSource={dragId === article.id}
                  />
                ))}
              </ul>
            </details>
          ) : null}
        </>
      )}
    </main>
  );
}

function highlightCountFor(state: ReadLaterState, articleId: string): number {
  let n = 0;
  for (const h of state.highlights) if (h.articleId === articleId) n++;
  return n;
}

/**
 * Returns a one-line honest stat or null when there's nothing to say
 * (empty queue, no week activity).
 */
function honestQueueStat(stats: { savedThisWeek: number; readThisWeek: number; unread: number; total: number }): string | null {
  if (stats.total === 0) return null;
  if (stats.savedThisWeek === 0 && stats.readThisWeek === 0) return null;
  const parts: string[] = [];
  if (stats.savedThisWeek > 0) parts.push(`${stats.savedThisWeek} saved this week`);
  if (stats.readThisWeek > 0) parts.push(`${stats.readThisWeek} read this week`);
  if (stats.savedThisWeek > stats.readThisWeek + 2) {
    parts.push('queue grows faster than you read');
  }
  return parts.join(' · ');
}

// Re-export so callers can mark articles partly-read by id list
export type { SavedArticle };
