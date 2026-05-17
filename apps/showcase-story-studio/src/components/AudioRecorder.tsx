import { useEffect, useRef, useState } from 'react';
import { MAX_RECORDING_MS, pickRecordingMime } from '../lib/audio.ts';

interface Props {
  onSaved: (blob: Blob, ext: string) => void;
  hasExisting: boolean;
}

export function AudioRecorder({ onSaved, hasExisting }: Props) {
  const [recording, setRecording] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const recRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const startedAtRef = useRef<number>(0);
  const tickRef = useRef<number | null>(null);

  useEffect(() => () => stopAndCleanup(true), []);

  function stopAndCleanup(silent: boolean) {
    if (recRef.current && recRef.current.state !== 'inactive') {
      try { recRef.current.stop(); } catch { /* */ }
    }
    if (streamRef.current) {
      for (const t of streamRef.current.getTracks()) t.stop();
      streamRef.current = null;
    }
    if (tickRef.current) {
      window.clearInterval(tickRef.current);
      tickRef.current = null;
    }
    if (silent) {
      chunksRef.current = [];
      setRecording(false);
      setElapsed(0);
    }
  }

  async function start() {
    setError(null);
    if (typeof navigator === 'undefined' || !navigator.mediaDevices) {
      setError("This browser doesn't expose the microphone.");
      return;
    }
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch (err) {
      setError(`Couldn't reach the microphone: ${(err as Error).message}`);
      return;
    }
    streamRef.current = stream;
    const support = pickRecordingMime();
    if (!support) {
      setError("This browser can't record audio.");
      stopAndCleanup(true);
      return;
    }
    const rec = new MediaRecorder(stream, { mimeType: support.mime });
    chunksRef.current = [];
    rec.ondataavailable = (ev) => {
      if (ev.data && ev.data.size > 0) chunksRef.current.push(ev.data);
    };
    rec.onstop = () => {
      const blob = new Blob(chunksRef.current, { type: support.mime });
      stopAndCleanup(false);
      setRecording(false);
      setElapsed(0);
      if (blob.size > 0) onSaved(blob, support.ext);
    };
    rec.start();
    recRef.current = rec;
    startedAtRef.current = Date.now();
    setRecording(true);
    tickRef.current = window.setInterval(() => {
      const ms = Date.now() - startedAtRef.current;
      setElapsed(ms);
      if (ms >= MAX_RECORDING_MS) stop();
    }, 100);
  }

  function stop() {
    if (recRef.current && recRef.current.state !== 'inactive') {
      try { recRef.current.stop(); } catch { /* */ }
    }
  }

  const seconds = Math.floor(elapsed / 1000);
  const remaining = Math.max(0, Math.floor((MAX_RECORDING_MS - elapsed) / 1000));

  return (
    <div className="ss-audio">
      {!recording ? (
        <button type="button" className="ss-btn ss-btn-primary" onClick={start}>
          {hasExisting ? 'Re-record audio' : 'Record audio'}
        </button>
      ) : (
        <button type="button" className="ss-btn ss-btn-primary ss-recording" onClick={stop}>
          Stop ({seconds}s · {remaining}s left)
        </button>
      )}
      {error ? <p className="ss-error">{error}</p> : null}
    </div>
  );
}
