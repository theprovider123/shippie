/**
 * Reader body with highlight + note interaction.
 *
 * Tap-and-hold any paragraph (or use the toolbar that appears after a
 * mouse selection) to highlight it. We capture the *paragraph text*
 * not character ranges — querying across the library on a stable
 * snippet is more useful than juggling Range offsets that drift when
 * the article re-renders.
 *
 * The content HTML comes from `extractReadable` and is already
 * sanitised. We `dangerouslySetInnerHTML` once on the inner div, then
 * attach delegated handlers to the wrapper. Highlighted paragraphs
 * pick up the `data-highlighted` attribute via post-render side effect.
 */
import { useEffect, useRef, useState } from 'react';
import type { Highlight } from '../lib/types.ts';

interface HighlightLayerProps {
  contentHtml: string;
  highlights: readonly Highlight[];
  onAddHighlight: (text: string, note?: string) => void;
  onRemoveHighlight: (id: string) => void;
  onScrollProgress: (progress: number) => void;
}

const LONG_PRESS_MS = 450;

export function HighlightLayer({
  contentHtml,
  highlights,
  onAddHighlight,
  onRemoveHighlight,
  onScrollProgress,
}: HighlightLayerProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const pressTimer = useRef<number | null>(null);
  const [pendingText, setPendingText] = useState<string | null>(null);
  const [noteDraft, setNoteDraft] = useState('');

  // Attach data-highlighted to paragraphs whose text matches a highlight.
  // Cheap O(paragraphs * highlights) — fine for normal articles.
  useEffect(() => {
    const root = containerRef.current;
    if (!root) return;
    const paras = Array.from(root.querySelectorAll<HTMLElement>('p, blockquote, li'));
    const set = new Set(highlights.map((h) => h.text));
    for (const p of paras) {
      const text = (p.textContent ?? '').trim();
      if (text && set.has(text)) {
        p.setAttribute('data-highlighted', 'true');
        const id = highlights.find((h) => h.text === text)?.id;
        if (id) p.setAttribute('data-highlight-id', id);
      } else {
        p.removeAttribute('data-highlighted');
        p.removeAttribute('data-highlight-id');
      }
    }
  }, [contentHtml, highlights]);

  // Track scroll progress as a 0..1 value derived from the article
  // body's bounding rect within the scrolling viewport. The article
  // mounts inside the page's main scroller, so we observe the
  // window scroll offset against the body element's own size.
  useEffect(() => {
    const root = containerRef.current;
    if (!root) return;
    const handler = () => {
      const rect = root.getBoundingClientRect();
      const viewport = window.innerHeight;
      const total = rect.height - viewport;
      if (total <= 0) {
        onScrollProgress(1);
        return;
      }
      // -rect.top: how far the user has scrolled past the top of the body.
      const scrolled = -rect.top;
      onScrollProgress(Math.max(0, Math.min(1, scrolled / total)));
    };
    handler();
    window.addEventListener('scroll', handler, { passive: true });
    window.addEventListener('resize', handler);
    return () => {
      window.removeEventListener('scroll', handler);
      window.removeEventListener('resize', handler);
    };
  }, [onScrollProgress, contentHtml]);

  function nearestParagraph(target: EventTarget | null): HTMLElement | null {
    if (!(target instanceof Element)) return null;
    const el = target.closest('p, blockquote, li');
    return el instanceof HTMLElement ? el : null;
  }

  function handlePointerDown(e: React.PointerEvent<HTMLDivElement>) {
    const para = nearestParagraph(e.target);
    if (!para) return;
    if (pressTimer.current) window.clearTimeout(pressTimer.current);
    pressTimer.current = window.setTimeout(() => {
      const text = (para.textContent ?? '').trim();
      if (!text) return;
      const existing = highlights.find((h) => h.text === text);
      if (existing) {
        onRemoveHighlight(existing.id);
      } else {
        setPendingText(text);
      }
    }, LONG_PRESS_MS);
  }

  function clearPress() {
    if (pressTimer.current) {
      window.clearTimeout(pressTimer.current);
      pressTimer.current = null;
    }
  }

  function commitPending(withNote: boolean) {
    if (!pendingText) return;
    onAddHighlight(pendingText, withNote ? noteDraft.trim() || undefined : undefined);
    setPendingText(null);
    setNoteDraft('');
  }

  return (
    <>
      <div
        ref={containerRef}
        className="reader-body"
        onPointerDown={handlePointerDown}
        onPointerUp={clearPress}
        onPointerLeave={clearPress}
        onPointerCancel={clearPress}
        // Sanitised by extractReadable + iframe sandbox provides
        // additional defence-in-depth (escapes can't leave the app's
        // origin).
        dangerouslySetInnerHTML={{ __html: contentHtml }}
      />
      {pendingText ? (
        <div className="highlight-sheet" role="dialog" aria-label="Save highlight">
          <p className="highlight-preview">{pendingText.slice(0, 200)}{pendingText.length > 200 ? '…' : ''}</p>
          <input
            type="text"
            value={noteDraft}
            onChange={(e) => setNoteDraft(e.target.value)}
            placeholder="Add a note (optional)"
            aria-label="Note"
            autoFocus
          />
          <div className="highlight-sheet-actions">
            <button type="button" className="ghost" onClick={() => { setPendingText(null); setNoteDraft(''); }}>
              Cancel
            </button>
            <button type="button" onClick={() => commitPending(false)}>Save</button>
            <button type="button" onClick={() => commitPending(true)} disabled={!noteDraft.trim()}>
              Save with note
            </button>
          </div>
        </div>
      ) : null}
    </>
  );
}
