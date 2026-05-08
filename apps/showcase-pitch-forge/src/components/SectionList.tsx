import { useState } from 'react';
import type { Section } from '../lib/store.ts';

export interface SectionListProps {
  sections: Section[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onReorder: (orderedIds: string[]) => void;
  onDelete: (id: string) => void;
}

/**
 * Drag-to-reorder section list.
 *
 * We use HTML5 drag events rather than a library — sections are a
 * short list (typical pitch has 4-6 sections, capped by the template).
 * The drop target is the section row itself; the drop zone is "before
 * this section" if dragging up, "after this section" if dragging down.
 */
export function SectionList({ sections, selectedId, onSelect, onReorder, onDelete }: SectionListProps) {
  const [draggingId, setDraggingId] = useState<string | null>(null);

  function handleDragOver(e: React.DragEvent<HTMLLIElement>) {
    e.preventDefault();
  }

  function handleDrop(e: React.DragEvent<HTMLLIElement>, overId: string) {
    e.preventDefault();
    if (!draggingId || draggingId === overId) return;
    const ids = sections.map((s) => s.id);
    const from = ids.indexOf(draggingId);
    const to = ids.indexOf(overId);
    if (from < 0 || to < 0) return;
    const reordered = [...ids];
    reordered.splice(from, 1);
    reordered.splice(to, 0, draggingId);
    onReorder(reordered);
    setDraggingId(null);
  }

  if (sections.length === 0) {
    return <p className="empty">No sections yet. Add one below.</p>;
  }

  return (
    <ul className="section-list">
      {sections.map((s) => (
        <li
          key={s.id}
          className={`section-row ${selectedId === s.id ? 'active' : ''} ${
            draggingId === s.id ? 'dragging' : ''
          }`}
          draggable
          onDragStart={() => setDraggingId(s.id)}
          onDragEnd={() => setDraggingId(null)}
          onDragOver={handleDragOver}
          onDrop={(e) => handleDrop(e, s.id)}
        >
          <button
            type="button"
            className="section-row-main"
            onClick={() => onSelect(s.id)}
          >
            <span className="section-grip" aria-hidden="true">
              ⋮⋮
            </span>
            <span className="section-row-text">
              <span className="section-title">{s.title}</span>
              <span className="section-meta">
                {s.body_md.trim().length > 0
                  ? `${wordCount(s.body_md)} words`
                  : 'empty'}
              </span>
            </span>
          </button>
          <button
            type="button"
            className="section-delete ghost"
            aria-label={`Remove ${s.title}`}
            onClick={() => onDelete(s.id)}
          >
            ×
          </button>
        </li>
      ))}
    </ul>
  );
}

function wordCount(text: string): number {
  const trimmed = text.trim();
  if (trimmed.length === 0) return 0;
  return trimmed.split(/\s+/).length;
}
