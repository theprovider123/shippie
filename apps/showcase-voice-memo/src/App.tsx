import { useEffect, useMemo, useState } from 'react';
import { createShippieIframeSdk } from '@shippie/iframe-sdk';
import { TodayPage } from './pages/Today.tsx';
import { MemoPage } from './pages/Memo.tsx';
import { SearchPage } from './pages/Search.tsx';
import { SettingsPage } from './pages/Settings.tsx';
import {
  clearAllBlobs,
  deleteAudioBlob,
  deleteMemo as removeMemo,
  insertMemo,
  loadMemos,
  loadSettings,
  newId,
  saveAudioBlob,
  saveMemos,
  saveSettings,
  updateMemo,
  type Memo,
  type Settings,
} from './lib/store.ts';
import { deriveTitle, transcribe, type TranscriptionProgress } from './lib/transcribe.ts';

const shippie = createShippieIframeSdk({ appId: 'app_voice_memo' });

const MODEL_FLAG_KEY = 'shippie.voice-memo.model-warm.v1';

type Tab = 'today' | 'search' | 'settings';

const TABS: ReadonlyArray<{ id: Tab; label: string }> = [
  { id: 'today', label: 'Today' },
  { id: 'search', label: 'Search' },
  { id: 'settings', label: 'Settings' },
];

export function App() {
  const [memos, setMemos] = useState<Memo[]>(() => loadMemos());
  const [settings, setSettings] = useState<Settings>(() => loadSettings());
  const [tab, setTab] = useState<Tab>('today');
  const [openMemoId, setOpenMemoId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<TranscriptionProgress | null>(null);
  const [modelDownloaded, setModelDownloaded] = useState<boolean>(() => {
    if (typeof localStorage === 'undefined') return false;
    return localStorage.getItem(MODEL_FLAG_KEY) === '1';
  });

  useEffect(() => {
    saveMemos(memos);
  }, [memos]);

  useEffect(() => {
    saveSettings(settings);
  }, [settings]);

  const openMemo = useMemo(
    () => (openMemoId ? memos.find((m) => m.id === openMemoId) ?? null : null),
    [memos, openMemoId],
  );

  async function handleSaved(blob: Blob, ext: string, durationMs: number) {
    setBusy(true);
    setProgress({ stage: 'init', message: 'Preparing transcription…' });
    const id = newId('memo');
    const recordedAt = new Date().toISOString();
    try {
      await saveAudioBlob(id, blob);
    } catch (err) {
      console.warn('[voice-memo] saveAudioBlob failed', err);
      setBusy(false);
      setProgress(null);
      return;
    }

    const placeholder: Memo = {
      id,
      title: 'Transcribing…',
      transcript: '',
      segments: [],
      language: settings.language,
      duration_s: Math.max(1, Math.round(durationMs / 1000)),
      tags: [],
      edited: false,
      audio_ext: ext,
      recorded_at: recordedAt,
    };
    setMemos((prev) => insertMemo(prev, placeholder));

    try {
      const result = await transcribe(blob, {
        language: settings.language,
        onProgress: (event) => setProgress(event),
      });
      const title = deriveTitle(result.text);
      setMemos((prev) =>
        updateMemo(prev, id, {
          title,
          transcript: result.text,
          segments: result.segments,
        }),
      );
      if (typeof localStorage !== 'undefined') {
        try {
          localStorage.setItem(MODEL_FLAG_KEY, '1');
        } catch {
          /* */
        }
      }
      setModelDownloaded(true);
      shippie.feel.texture('confirm');
      shippie.intent.broadcast('memo-recorded', [
        {
          memo_id: id,
          title,
          duration_s: placeholder.duration_s,
          language: placeholder.language,
          recorded_at: recordedAt,
        },
      ]);
    } catch (err) {
      console.warn('[voice-memo] transcribe failed', err);
      setMemos((prev) =>
        updateMemo(prev, id, {
          title: 'Untitled memo',
          transcript:
            'Transcription failed on this device. The audio is saved — tap to add a transcript by hand.',
          edited: true,
        }),
      );
    } finally {
      setBusy(false);
      setProgress(null);
    }
  }

  function handleMemoChange(next: Memo) {
    setMemos((prev) => updateMemo(prev, next.id, next));
  }

  async function handleDeleteMemo(id: string) {
    try {
      await deleteAudioBlob(id);
    } catch {
      /* best-effort */
    }
    setMemos((prev) => removeMemo(prev, id));
    setOpenMemoId(null);
  }

  async function handleClearAll() {
    try {
      await clearAllBlobs();
    } catch {
      /* */
    }
    setMemos([]);
    setOpenMemoId(null);
  }

  function openYourData() {
    shippie.openYourData({ appSlug: 'voice-memo' });
  }

  return (
    <div className="app">
      <header className="app-header">
        <h1>Voice Memo</h1>
        <p className="subtitle">hold · transcribe · search</p>
      </header>

      {!openMemo ? (
        <nav className="tabs" role="tablist">
          {TABS.map((t) => (
            <button
              key={t.id}
              role="tab"
              type="button"
              aria-selected={t.id === tab}
              className={`tab ${t.id === tab ? 'active' : ''}`}
              onClick={() => setTab(t.id)}
            >
              {t.label}
            </button>
          ))}
        </nav>
      ) : null}

      {openMemo ? (
        <MemoPage
          memo={openMemo}
          onBack={() => setOpenMemoId(null)}
          onChange={handleMemoChange}
          onDelete={handleDeleteMemo}
        />
      ) : tab === 'today' ? (
        <TodayPage
          memos={memos}
          settings={settings}
          modelDownloaded={modelDownloaded}
          busy={busy}
          progress={progress}
          onSaved={handleSaved}
          onOpenMemo={(id) => setOpenMemoId(id)}
        />
      ) : tab === 'search' ? (
        <SearchPage memos={memos} onOpenMemo={(id) => setOpenMemoId(id)} />
      ) : (
        <SettingsPage
          settings={settings}
          modelDownloaded={modelDownloaded}
          memoCount={memos.length}
          onChange={setSettings}
          onClearAll={handleClearAll}
        />
      )}

      <button type="button" className="your-data" onClick={openYourData}>
        Your Data
      </button>
    </div>
  );
}
