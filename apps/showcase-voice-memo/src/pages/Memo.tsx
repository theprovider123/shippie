import { useEffect, useMemo, useRef, useState } from 'react';
import { EditableTranscript } from '../components/EditableTranscript.tsx';
import { Waveform } from '../components/Waveform.tsx';
import { formatDuration } from '../lib/audio.ts';
import { loadAudioBlob } from '../lib/store.ts';
import type { Memo } from '../lib/store.ts';
import { addTag, parseTags, removeTag } from '../lib/tags.ts';
import { buildMemoShare, memoForShare } from '../share/memo-share.ts';

interface Props {
  memo: Memo;
  onBack: () => void;
  onChange: (next: Memo) => void;
  onDelete: (id: string) => void;
}

export function MemoPage({ memo, onBack, onChange, onDelete }: Props) {
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  const [tagInput, setTagInput] = useState('');
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const [shareError, setShareError] = useState<string | null>(null);
  const [sharing, setSharing] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    let cancelled = false;
    let url: string | null = null;
    (async () => {
      const blob = await loadAudioBlob(memo.id);
      if (cancelled) return;
      setAudioBlob(blob);
      if (blob) {
        url = URL.createObjectURL(blob);
        setAudioUrl(url);
      }
    })();
    return () => {
      cancelled = true;
      if (url) URL.revokeObjectURL(url);
    };
  }, [memo.id]);

  function handleTimeUpdate() {
    const a = audioRef.current;
    if (!a || !a.duration || !Number.isFinite(a.duration)) return;
    setProgress(a.currentTime / a.duration);
  }

  function handleSeek(fraction: number) {
    const a = audioRef.current;
    if (!a || !a.duration || !Number.isFinite(a.duration)) return;
    a.currentTime = fraction * a.duration;
    setProgress(fraction);
  }

  function jumpToSegment(start: number) {
    const a = audioRef.current;
    if (!a) return;
    a.currentTime = start;
    void a.play();
  }

  function handleTranscriptChange(next: string) {
    onChange({ ...memo, transcript: next, edited: true });
  }

  function commitTagInput() {
    const tokens = parseTags(tagInput);
    if (tokens.length === 0) {
      setTagInput('');
      return;
    }
    let nextTags = [...memo.tags];
    for (const token of tokens) nextTags = addTag(nextTags, token);
    onChange({ ...memo, tags: nextTags });
    setTagInput('');
  }

  function handleRemoveTag(tag: string) {
    onChange({ ...memo, tags: removeTag(memo.tags, tag) });
  }

  async function handleShare() {
    setSharing(true);
    setShareError(null);
    try {
      const { url } = await buildMemoShare(memoForShare(memo));
      setShareUrl(url);
      if (typeof navigator !== 'undefined' && 'share' in navigator) {
        try {
          await navigator.share({
            title: memo.title || 'Voice memo',
            text: 'Voice-memo transcript · open in Shippie to import.',
            url,
          });
          return;
        } catch {
          /* user cancelled — fall through to clipboard */
        }
      }
      try {
        await navigator.clipboard.writeText(url);
      } catch {
        /* leave the URL on screen */
      }
    } catch (err) {
      setShareError((err as Error).message ?? 'Could not build share link.');
    } finally {
      setSharing(false);
    }
  }

  const segments = useMemo(() => memo.segments ?? [], [memo.segments]);
  const tagBadge = memo.edited ? 'edited' : 'auto';

  return (
    <section className="page vm-memo-page">
      <header className="page-header">
        <button type="button" className="ghost" onClick={onBack}>
          ← Back
        </button>
        <span className="vm-memo-page-meta muted small">
          {formatDuration(memo.duration_s)} · {tagBadge} · {memo.language.toUpperCase()}
        </span>
      </header>

      <h2 className="vm-memo-page-title">{memo.title || 'Untitled memo'}</h2>

      <div className="vm-player">
        <Waveform blob={audioBlob} progress={progress} onSeek={handleSeek} />
        {audioUrl ? (
          <audio
            ref={audioRef}
            src={audioUrl}
            controls
            preload="metadata"
            onTimeUpdate={handleTimeUpdate}
            onEnded={() => setProgress(1)}
            className="vm-audio"
          />
        ) : (
          <p className="muted small">Loading audio…</p>
        )}
      </div>

      <EditableTranscript value={memo.transcript} edited={memo.edited} onChange={handleTranscriptChange} />

      {segments.length > 0 ? (
        <div className="vm-segments">
          <p className="eyebrow">Timestamps · tap to jump</p>
          <ul className="vm-segments-list">
            {segments.map((seg, i) => (
              <li key={`${seg.start}-${i}`}>
                <button type="button" className="vm-segment" onClick={() => jumpToSegment(seg.start)}>
                  <span className="vm-segment-time">{formatDuration(seg.start)}</span>
                  <span className="vm-segment-text">{seg.text}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="vm-tags-editor">
        <p className="eyebrow">Tags</p>
        <div className="vm-tags-row">
          {memo.tags.map((tag) => (
            <span key={tag} className="vm-tag">
              {tag}
              <button
                type="button"
                aria-label={`Remove ${tag}`}
                className="vm-tag-x"
                onClick={() => handleRemoveTag(tag)}
              >
                ×
              </button>
            </span>
          ))}
          <input
            type="text"
            value={tagInput}
            placeholder="add tag"
            className="vm-tag-input"
            onChange={(e) => setTagInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ',') {
                e.preventDefault();
                commitTagInput();
              }
            }}
            onBlur={commitTagInput}
          />
        </div>
      </div>

      <div className="vm-memo-actions">
        <button type="button" className="primary" onClick={handleShare} disabled={sharing}>
          {sharing ? 'Building…' : 'Share transcript'}
        </button>
        <button
          type="button"
          className="ghost danger"
          onClick={() => {
            if (typeof window === 'undefined' || window.confirm('Delete this memo?')) {
              onDelete(memo.id);
            }
          }}
        >
          Delete memo
        </button>
      </div>

      {shareUrl ? (
        <p className="muted small">
          Signed link copied. Audio stays on this device — only the transcript travels.
        </p>
      ) : null}
      {shareError ? <p className="vm-error">{shareError}</p> : null}
    </section>
  );
}
