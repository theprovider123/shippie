import { useState } from 'react';
import {
  clampMaxDurationMs,
  formatDuration,
  MAX_MAX_RECORDING_MS,
  MIN_MAX_RECORDING_MS,
} from '../lib/audio.ts';
import type { Settings } from '../lib/store.ts';

interface Props {
  settings: Settings;
  modelDownloaded: boolean;
  memoCount: number;
  onChange: (next: Settings) => void;
  onClearAll: () => void;
}

const LANGUAGES: { code: string; label: string }[] = [
  { code: 'en', label: 'English' },
  { code: 'es', label: 'Spanish' },
  { code: 'fr', label: 'French' },
  { code: 'de', label: 'German' },
  { code: 'pt', label: 'Portuguese' },
  { code: 'nl', label: 'Dutch' },
  { code: 'it', label: 'Italian' },
];

export function SettingsPage({ settings, modelDownloaded, memoCount, onChange, onClearAll }: Props) {
  const [confirmClear, setConfirmClear] = useState(false);
  const minSeconds = MIN_MAX_RECORDING_MS / 1000;
  const maxSeconds = MAX_MAX_RECORDING_MS / 1000;

  return (
    <section className="page vm-settings-page">
      <header className="page-header">
        <h2>Settings</h2>
      </header>

      <div className="vm-banner">
        <p className="eyebrow">Privacy</p>
        <p>
          Audio and transcripts stay on this device. Whisper-tiny runs in the
          browser; memos are stored in IndexedDB and localStorage. Sharing
          sends the transcript only — not the audio.
        </p>
      </div>

      <div className="vm-setting">
        <label className="field">
          <span>Language</span>
          <select
            value={settings.language}
            onChange={(e) => onChange({ ...settings, language: e.target.value })}
          >
            {LANGUAGES.map((lang) => (
              <option key={lang.code} value={lang.code}>
                {lang.label}
              </option>
            ))}
          </select>
        </label>
        <p className="muted small">
          Whisper-tiny is best on English. Other languages work but expect
          rougher transcripts — edit them after auto-fill.
        </p>
      </div>

      <div className="vm-setting">
        <label className="field">
          <span>Max recording length · {formatDuration(settings.max_duration_ms / 1000)}</span>
          <input
            type="range"
            min={minSeconds}
            max={maxSeconds}
            step={10}
            value={Math.round(settings.max_duration_ms / 1000)}
            onChange={(e) =>
              onChange({
                ...settings,
                max_duration_ms: clampMaxDurationMs(Number(e.target.value) * 1000),
              })
            }
          />
        </label>
        <p className="muted small">
          Default 60s. Longer recordings take longer to transcribe — Whisper
          inference grows with audio length on a phone CPU.
        </p>
      </div>

      <div className="vm-setting">
        <p className="eyebrow">Model</p>
        <p>
          {modelDownloaded
            ? 'Whisper-tiny is cached on this device.'
            : 'Whisper-tiny will download (~10 MB) on the first transcription.'}
        </p>
      </div>

      <div className="vm-setting">
        <p className="eyebrow">Library</p>
        <p>
          {memoCount} memo{memoCount === 1 ? '' : 's'} stored locally.
        </p>
        {confirmClear ? (
          <div className="vm-confirm">
            <p className="vm-error">
              Permanently delete every memo and audio blob from this device?
            </p>
            <div className="vm-confirm-actions">
              <button type="button" className="ghost" onClick={() => setConfirmClear(false)}>
                Cancel
              </button>
              <button
                type="button"
                className="ghost danger"
                onClick={() => {
                  onClearAll();
                  setConfirmClear(false);
                }}
              >
                Yes, clear everything
              </button>
            </div>
          </div>
        ) : (
          <button type="button" className="ghost danger" onClick={() => setConfirmClear(true)}>
            Clear all memos
          </button>
        )}
      </div>
    </section>
  );
}
