import { useState } from 'react';
import { renderMarkdown } from '../lib/markdown.ts';

export interface MarkdownEditorProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  rows?: number;
}

/**
 * Minimal split-view markdown editor: textarea + live preview.
 *
 * No toolbar — markdown is the contract here, not a WYSIWYG. The
 * preview re-renders on every keystroke; the supported subset is
 * documented in lib/markdown.ts.
 */
export function MarkdownEditor({ value, onChange, placeholder, rows = 12 }: MarkdownEditorProps) {
  const [view, setView] = useState<'edit' | 'preview'>('edit');
  return (
    <div className="md-editor">
      <div className="md-editor-tabs" role="tablist">
        <button
          type="button"
          role="tab"
          aria-selected={view === 'edit'}
          className={`md-tab ${view === 'edit' ? 'active' : ''}`}
          onClick={() => setView('edit')}
        >
          Edit
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={view === 'preview'}
          className={`md-tab ${view === 'preview' ? 'active' : ''}`}
          onClick={() => setView('preview')}
        >
          Preview
        </button>
      </div>
      {view === 'edit' ? (
        <textarea
          className="md-textarea"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder ?? 'Write in markdown…'}
          rows={rows}
        />
      ) : (
        <div
          className="md-preview"
          // renderMarkdown is XSS-safe by construction (see markdown.test.ts).
          dangerouslySetInnerHTML={{ __html: renderMarkdown(value) }}
        />
      )}
    </div>
  );
}
