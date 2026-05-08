/**
 * Save URL sheet — the input + status the user sees while a save runs.
 *
 * Two-state status: idle (form) and busy (we surface what's happening
 * — fetch, extract, summarise — so a slow save isn't a black box).
 */

interface SaveSheetProps {
  draftUrl: string;
  onChange: (value: string) => void;
  onSubmit: (e: React.FormEvent) => void;
  busy: boolean;
  /** Free-form status string when busy (e.g. "Summarising…"). */
  status?: string | null;
  error?: string | null;
}

export function SaveSheet({ draftUrl, onChange, onSubmit, busy, status, error }: SaveSheetProps) {
  return (
    <>
      <form onSubmit={onSubmit} className="save-sheet">
        <input
          type="url"
          value={draftUrl}
          onChange={(e) => onChange(e.target.value)}
          placeholder="Paste a URL"
          aria-label="Article URL"
          disabled={busy}
        />
        <button type="submit" disabled={busy || !draftUrl.trim()}>
          {busy ? 'Saving…' : 'Save'}
        </button>
      </form>
      {busy && status ? (
        <p className="status" role="status">
          {status}
        </p>
      ) : null}
      {error ? (
        <p className="error" role="alert">
          {error}
        </p>
      ) : null}
    </>
  );
}
