/**
 * Two-button import preview. Shown when the app decodes a shared code/QR.
 * The caller decides what `Watch on map` and `Join group` do — this
 * component is purely presentational + role-aware (the sender's `role`
 * hint pre-orders the buttons; the receiver still chooses).
 */
export interface ImportPreview {
  name: string;
  members: string[];
  primary?: { label: string; time?: string };
  fallback?: { label: string };
  /** True when the payload carries a relay room (v2 share payload). */
  hasLiveRoom: boolean;
  /** Sender's hint about the intended role. The receiver still chooses. */
  roleHint?: 'join' | 'watch';
}

interface ImportPreviewSheetProps {
  preview: ImportPreview | null;
  onJoin: () => void;
  onWatch: () => void;
  onDismiss: () => void;
}

export function ImportPreviewSheet({ preview, onJoin, onWatch, onDismiss }: ImportPreviewSheetProps) {
  if (!preview) return null;
  const watchPrimary = preview.roleHint === 'watch';

  return (
    <div
      className="import-preview"
      role="dialog"
      aria-modal="true"
      aria-labelledby="import-preview-title"
      onClick={onDismiss}
    >
      <div className="import-preview__surface" onClick={(event) => event.stopPropagation()}>
        <p className="eyebrow">Code received</p>
        <h2 id="import-preview-title" className="import-preview__title">
          {preview.name}
        </h2>
        <p className="import-preview__meta">
          {preview.members.length} {preview.members.length === 1 ? 'member' : 'members'}
          {preview.primary
            ? ` · meet ${preview.primary.label}${preview.primary.time ? ` · ${preview.primary.time}` : ''}`
            : ''}
        </p>
        {preview.fallback ? (
          <p className="import-preview__fallback">Fallback: {preview.fallback.label}</p>
        ) : null}
        <div className="import-preview__actions">
          <button
            type="button"
            className={watchPrimary ? 'primary-action' : 'secondary-action'}
            onClick={onWatch}
            disabled={!preview.hasLiveRoom}
            title={!preview.hasLiveRoom ? 'This code does not include a live relay room.' : undefined}
          >
            Watch on map
          </button>
          <button
            type="button"
            className={watchPrimary ? 'secondary-action' : 'primary-action'}
            onClick={onJoin}
          >
            Join group
          </button>
        </div>
        <button type="button" className="import-preview__dismiss" onClick={onDismiss}>
          Not now
        </button>
      </div>
    </div>
  );
}
