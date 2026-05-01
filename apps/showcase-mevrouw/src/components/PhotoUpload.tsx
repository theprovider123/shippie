/**
 * PhotoUpload — file input wrapper with explicit reading / done / error
 * states. The raw <input type="file"> + FileReader pattern is silent
 * (file selected → ~500ms+ pause → preview appears for big photos),
 * which reads as broken on slower phones. This component surfaces
 * progress so the user knows their photo is being processed.
 *
 * Drop-in replacement anywhere mevrouw reads a photo from disk:
 * memories, trips, glimpses, surprises, profile avatars.
 *
 * Caps file size and downscales overly large images (3000px+) so the
 * Y.Doc doesn't get bloated by uncompressed phone-camera 12MP photos.
 */
import { useId, useState } from 'react';
import { cn } from '@/lib/cn.ts';

const MAX_DIMENSION = 1600;
const MAX_BYTES = 8 * 1024 * 1024;

interface Props {
  /** Called with the data URL once the photo is ready. */
  onPicked: (dataUrl: string) => void;
  /** Label on the button. Defaults to "Add photo". */
  label?: string;
  /** Optional accept hint; mevrouw uses image/* everywhere. */
  accept?: string;
  /** Visual variant — "button" matches the brand button styling, "compact" is for inline placement. */
  variant?: 'button' | 'compact';
  /** Pass a child to render alongside the input (e.g., the existing preview). */
  className?: string;
}

type State = 'idle' | 'reading' | 'done' | 'error';

async function downsize(file: File): Promise<string> {
  // Read into an Image, then draw onto a canvas at most MAX_DIMENSION on
  // the long edge, then export as JPEG with reasonable quality. Works
  // for HEIC on iOS (browser converts when drawing to canvas).
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => (typeof r.result === 'string' ? resolve(r.result) : reject(new Error('FileReader returned non-string')));
    r.onerror = () => reject(r.error ?? new Error('FileReader failed'));
    r.readAsDataURL(file);
  });

  const img = new Image();
  await new Promise<void>((resolve, reject) => {
    img.onload = () => resolve();
    img.onerror = () => reject(new Error('Image failed to decode'));
    img.src = dataUrl;
  });

  const longEdge = Math.max(img.naturalWidth, img.naturalHeight);
  if (longEdge <= MAX_DIMENSION) {
    // Already small enough — return the original data URL.
    return dataUrl;
  }
  const scale = MAX_DIMENSION / longEdge;
  const w = Math.round(img.naturalWidth * scale);
  const h = Math.round(img.naturalHeight * scale);
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) return dataUrl;
  ctx.drawImage(img, 0, 0, w, h);
  return canvas.toDataURL('image/jpeg', 0.85);
}

export function PhotoUpload({
  onPicked,
  label = 'Add photo',
  accept = 'image/*',
  variant = 'button',
  className,
}: Props) {
  const [state, setState] = useState<State>('idle');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const inputId = useId();

  async function handle(file: File) {
    setErrorMsg(null);
    if (file.size > MAX_BYTES) {
      setState('error');
      setErrorMsg(`File too large (${(file.size / 1024 / 1024).toFixed(1)}MB). Try a smaller photo.`);
      return;
    }
    setState('reading');
    try {
      const dataUrl = await downsize(file);
      onPicked(dataUrl);
      setState('done');
      // Auto-clear the "done" badge after 2s so the button returns to idle.
      setTimeout(() => setState('idle'), 2000);
    } catch (err) {
      setState('error');
      setErrorMsg(err instanceof Error ? err.message : 'Could not read photo.');
    }
  }

  const buttonClasses = cn(
    variant === 'button'
      ? 'inline-flex items-center justify-center px-3 py-2 rounded-md bg-[var(--secondary)] text-[var(--foreground)] border border-[var(--border)] cursor-pointer hover:border-[var(--gold-glow)]'
      : 'inline-flex items-center gap-2 px-2 py-1 text-xs',
    'font-mono uppercase tracking-wider transition-colors',
    state === 'reading' && 'opacity-70 cursor-wait',
    state === 'done' && 'border-[var(--gold)] text-[var(--gold)]',
    state === 'error' && 'border-[var(--destructive)] text-[var(--destructive)]',
    className,
  );

  const labelText =
    state === 'reading' ? 'Reading photo…' :
    state === 'done' ? '✓ Photo added' :
    state === 'error' ? '↻ Try again' :
    label;

  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={inputId} className={buttonClasses}>
        <input
          id={inputId}
          type="file"
          accept={accept}
          className="hidden"
          disabled={state === 'reading'}
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void handle(f);
            e.target.value = '';
          }}
        />
        <span>{labelText}</span>
      </label>
      {errorMsg ? (
        <p className="text-[11px] text-[var(--destructive)]">{errorMsg}</p>
      ) : null}
    </div>
  );
}
