import { useState } from 'react';
import { RecordButton } from '../components/RecordButton.tsx';
import { TranscriptionProgressBar } from '../components/TranscriptionProgress.tsx';
import { MemoCard } from '../components/MemoCard.tsx';
import type { Memo, Settings } from '../lib/store.ts';
import type { TranscriptionProgress } from '../lib/transcribe.ts';

interface Props {
  memos: Memo[];
  settings: Settings;
  modelDownloaded: boolean;
  busy: boolean;
  progress: TranscriptionProgress | null;
  onSaved: (blob: Blob, ext: string, durationMs: number) => Promise<void> | void;
  onOpenMemo: (id: string) => void;
}

export function TodayPage({
  memos,
  settings,
  modelDownloaded,
  busy,
  progress,
  onSaved,
  onOpenMemo,
}: Props) {
  const [error, setError] = useState<string | null>(null);
  const recent = memos.slice(0, 6);
  return (
    <section className="page vm-today">
      <header className="page-header">
        <h2>Today</h2>
        <span className="muted small">{memos.length} memo{memos.length === 1 ? '' : 's'}</span>
      </header>

      <div className="vm-record-card">
        <RecordButton
          maxDurationMs={settings.max_duration_ms}
          disabled={busy}
          onSaved={(blob, ext, durationMs) => {
            setError(null);
            void onSaved(blob, ext, durationMs);
          }}
          onError={(message) => setError(message)}
        />
        <TranscriptionProgressBar progress={progress} modelDownloaded={modelDownloaded} />
        {error ? <p className="vm-error">{error}</p> : null}
      </div>

      <div className="vm-recent">
        <p className="eyebrow">Recent memos</p>
        {recent.length === 0 ? (
          <p className="empty">
            Nothing saved yet. Hold the mic; release when you're done.
          </p>
        ) : (
          <ul className="vm-memo-list">
            {recent.map((memo) => (
              <li key={memo.id}>
                <MemoCard memo={memo} onOpen={onOpenMemo} />
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
