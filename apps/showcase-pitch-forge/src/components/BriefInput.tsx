import { useState } from 'react';

export interface BriefInputProps {
  value: string;
  onChange: (value: string) => void;
  onSave: () => void;
}

/**
 * Brief input — large textarea, paste-from-clipboard helper. The
 * brief drives every section draft, so this is intentionally roomy.
 */
export function BriefInput({ value, onChange, onSave }: BriefInputProps) {
  const [pasteError, setPasteError] = useState<string | null>(null);

  async function paste() {
    setPasteError(null);
    try {
      const text = await navigator.clipboard.readText();
      if (text.trim().length === 0) {
        setPasteError('Clipboard is empty.');
        return;
      }
      onChange(text);
    } catch (err) {
      setPasteError(err instanceof Error ? err.message : 'paste failed');
    }
  }

  const wordCount = value.trim().length === 0 ? 0 : value.trim().split(/\s+/).length;

  return (
    <div className="brief-input">
      <div className="brief-header">
        <h3>Brief</h3>
        <div className="brief-header-actions">
          <button type="button" className="ghost small" onClick={paste}>
            Paste
          </button>
          <span className="muted small">{wordCount} words</span>
        </div>
      </div>
      <textarea
        className="brief-textarea"
        rows={10}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Paste the project context here — the funder's prompt, the RFP, the sponsorship deck. Each section's draft pulls from this brief."
      />
      {pasteError ? <p className="draft-error small">{pasteError}</p> : null}
      <div className="brief-actions">
        <button type="button" className="primary" onClick={onSave}>
          Save brief
        </button>
      </div>
    </div>
  );
}
