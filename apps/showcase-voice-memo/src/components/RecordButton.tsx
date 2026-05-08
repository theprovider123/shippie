import { useEffect, useRef, useState } from 'react';
import { formatDuration, pickRecordingMime } from '../lib/audio.ts';

interface Props {
  maxDurationMs: number;
  disabled?: boolean;
  onSaved: (blob: Blob, ext: string, durationMs: number) => void;
  onError?: (message: string) => void;
}

/**
 * Big circular hold-to-record button with countdown ring + audio level
 * visualizer. Pointer-down starts; pointer-up stops. Auto-stops at
 * maxDurationMs. Tap-too-fast (<400ms) cancels without saving.
 */
export function RecordButton({ maxDurationMs, disabled, onSaved, onError }: Props) {
  const [recording, setRecording] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [level, setLevel] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const recRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const tickRef = useRef<number | null>(null);
  const rafRef = useRef<number | null>(null);
  const startedAtRef = useRef<number>(0);
  const extRef = useRef<string>('webm');
  const aborted = useRef<boolean>(false);

  useEffect(() => () => cleanup(true), []);

  function reportError(message: string) {
    setError(message);
    onError?.(message);
  }

  function cleanup(silent: boolean) {
    if (recRef.current && recRef.current.state !== 'inactive') {
      try {
        recRef.current.stop();
      } catch {
        /* */
      }
    }
    if (streamRef.current) {
      for (const t of streamRef.current.getTracks()) t.stop();
      streamRef.current = null;
    }
    if (tickRef.current) {
      window.clearInterval(tickRef.current);
      tickRef.current = null;
    }
    if (rafRef.current) {
      window.cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    if (audioCtxRef.current) {
      try {
        void audioCtxRef.current.close();
      } catch {
        /* */
      }
      audioCtxRef.current = null;
      analyserRef.current = null;
    }
    if (silent) {
      chunksRef.current = [];
      setRecording(false);
      setElapsed(0);
      setLevel(0);
    }
  }

  async function startRecording() {
    setError(null);
    aborted.current = false;
    if (typeof navigator === 'undefined' || !navigator.mediaDevices) {
      reportError("This browser doesn't expose the microphone.");
      return;
    }
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch (err) {
      reportError(`Couldn't reach the microphone: ${(err as Error).message}`);
      return;
    }
    streamRef.current = stream;
    const support = pickRecordingMime();
    if (!support) {
      reportError("This browser can't record audio.");
      cleanup(true);
      return;
    }
    extRef.current = support.ext;
    const rec = new MediaRecorder(stream, { mimeType: support.mime });
    chunksRef.current = [];
    rec.ondataavailable = (ev) => {
      if (ev.data && ev.data.size > 0) chunksRef.current.push(ev.data);
    };
    rec.onstop = () => {
      const blob = new Blob(chunksRef.current, { type: support.mime });
      const durationMs = Date.now() - startedAtRef.current;
      cleanup(false);
      setRecording(false);
      setElapsed(0);
      setLevel(0);
      if (aborted.current) return;
      if (blob.size > 0) onSaved(blob, support.ext, durationMs);
    };
    try {
      const Ctor: typeof AudioContext =
        (window as unknown as { AudioContext?: typeof AudioContext; webkitAudioContext?: typeof AudioContext })
          .AudioContext ??
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext!;
      if (Ctor) {
        const ctx = new Ctor();
        const src = ctx.createMediaStreamSource(stream);
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 1024;
        src.connect(analyser);
        audioCtxRef.current = ctx;
        analyserRef.current = analyser;
        const buf = new Uint8Array(analyser.frequencyBinCount);
        const tickLevel = () => {
          if (!analyserRef.current) return;
          analyserRef.current.getByteTimeDomainData(buf);
          let peak = 0;
          for (const v of buf) {
            const dev = Math.abs(v - 128);
            if (dev > peak) peak = dev;
          }
          setLevel(peak / 128);
          rafRef.current = window.requestAnimationFrame(tickLevel);
        };
        rafRef.current = window.requestAnimationFrame(tickLevel);
      }
    } catch {
      /* visualiser is best-effort; recording continues regardless */
    }
    rec.start();
    recRef.current = rec;
    startedAtRef.current = Date.now();
    setRecording(true);
    tickRef.current = window.setInterval(() => {
      const ms = Date.now() - startedAtRef.current;
      setElapsed(ms);
      if (ms >= maxDurationMs) stopRecording(false);
    }, 100);
  }

  function stopRecording(abort: boolean) {
    aborted.current = abort;
    if (recRef.current && recRef.current.state !== 'inactive') {
      try {
        recRef.current.stop();
      } catch {
        /* */
      }
    }
  }

  const seconds = Math.floor(elapsed / 1000);
  const remaining = Math.max(0, Math.floor((maxDurationMs - elapsed) / 1000));
  const fraction = Math.max(0, Math.min(1, elapsed / maxDurationMs));
  const ringDeg = Math.round(fraction * 360);
  const levelScale = 1 + Math.min(0.18, level * 0.5);

  function handlePointerDown(e: React.PointerEvent<HTMLButtonElement>) {
    if (disabled) return;
    e.preventDefault();
    void startRecording();
  }

  function handlePointerUp() {
    if (!recording) return;
    // Sub-400ms: treat as a misfire and discard. Lets the user glance
    // at the page without leaving a stub memo behind.
    if (elapsed < 400) {
      stopRecording(true);
      return;
    }
    stopRecording(false);
  }

  return (
    <div className="vm-record">
      <button
        type="button"
        className={`vm-record-btn ${recording ? 'is-recording' : ''}`}
        onPointerDown={handlePointerDown}
        onPointerUp={handlePointerUp}
        onPointerLeave={handlePointerUp}
        onPointerCancel={() => stopRecording(true)}
        disabled={disabled}
        aria-pressed={recording}
        aria-label={recording ? 'Recording — release to save' : 'Hold to record'}
        style={{
          backgroundImage: recording
            ? `conic-gradient(var(--accent-strong, #A86060) 0deg ${ringDeg}deg, var(--border) ${ringDeg}deg 360deg)`
            : undefined,
        }}
      >
        <span className="vm-record-mic" style={{ transform: `scale(${levelScale.toFixed(3)})` }}>
          {/* simple mic glyph */}
          <svg viewBox="0 0 24 24" width="28" height="28" aria-hidden="true">
            <rect x="9" y="3" width="6" height="12" rx="3" fill="currentColor" />
            <path
              d="M5 11a7 7 0 0014 0M12 18v3"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
            />
          </svg>
        </span>
      </button>
      <div className="vm-record-status">
        {recording ? (
          <>
            <span className="vm-record-time" role="status">
              {formatDuration(seconds)}
            </span>
            <span className="muted small">{formatDuration(remaining)} left · release to save</span>
          </>
        ) : (
          <span className="muted small">Hold to record</span>
        )}
      </div>
      {error ? <p className="vm-error">{error}</p> : null}
    </div>
  );
}
