/**
 * VoiceRecorder — record a short voice note, save as a base64 data URL.
 * Uses MediaRecorder; codec falls back to whatever the browser supports.
 *
 * Future: persist to OPFS Blob, stream via WebRTC data channel for live
 * voice presence.
 */
import { useEffect, useRef, useState } from 'react';
import { Button } from './ui/button.tsx';
import { cn } from '@/lib/cn.ts';

interface Props {
  /** Called when the user finishes a recording with the data URL of the audio. */
  onRecorded: (dataUrl: string) => void;
  /** Optional max duration in seconds; defaults to 60. */
  maxSeconds?: number;
}

type State = 'idle' | 'requesting' | 'recording' | 'processing' | 'error';

export function VoiceRecorder({ onRecorded, maxSeconds = 60 }: Props) {
  const [state, setState] = useState<State>('idle');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const intervalRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      stop(false);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function start() {
    setErrorMsg(null);
    setState('requesting');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const mime = pickMime();
      const recorder = mime ? new MediaRecorder(stream, { mimeType: mime }) : new MediaRecorder(stream);
      recorderRef.current = recorder;
      chunksRef.current = [];
      recorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) chunksRef.current.push(e.data);
      };
      recorder.onstop = () => finalise();
      recorder.start();
      setState('recording');
      setElapsed(0);
      intervalRef.current = window.setInterval(() => {
        setElapsed((s) => {
          if (s + 1 >= maxSeconds) {
            stop(true);
            return s + 1;
          }
          return s + 1;
        });
      }, 1000);
    } catch (err) {
      setState('error');
      setErrorMsg(
        err instanceof Error
          ? err.name === 'NotAllowedError'
            ? 'Microphone access denied.'
            : err.message
          : String(err),
      );
    }
  }

  function stop(triggerFinalise: boolean) {
    if (intervalRef.current !== null) {
      window.clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    const recorder = recorderRef.current;
    if (recorder && recorder.state !== 'inactive' && triggerFinalise) {
      recorder.stop();
    } else {
      // Cleanup paths where we never reached `recording` (cancel after request).
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
      recorderRef.current = null;
    }
  }

  function finalise() {
    setState('processing');
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    const blob = new Blob(chunksRef.current, {
      type: recorderRef.current?.mimeType ?? 'audio/webm',
    });
    chunksRef.current = [];
    recorderRef.current = null;
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        onRecorded(reader.result);
      }
      setState('idle');
      setElapsed(0);
    };
    reader.onerror = () => {
      setState('error');
      setErrorMsg('Could not save the recording.');
    };
    reader.readAsDataURL(blob);
  }

  return (
    <div className="flex items-center gap-3">
      {state === 'idle' && (
        <Button type="button" variant="secondary" onClick={start}>
          ● Record
        </Button>
      )}
      {state === 'requesting' && <p className="text-xs text-[var(--muted-foreground)]">listening…</p>}
      {state === 'recording' && (
        <>
          <button
            type="button"
            onClick={() => stop(true)}
            className={cn(
              'h-10 px-4 rounded-xl bg-[var(--destructive)] text-white font-medium',
              'flex items-center gap-2 active:scale-95 transition-transform',
            )}
            aria-label="Stop recording"
          >
            <span className="w-2.5 h-2.5 rounded-sm bg-white" /> stop
          </button>
          <span className="font-mono text-sm text-[var(--gold)]">
            {formatTime(elapsed)} / {formatTime(maxSeconds)}
          </span>
        </>
      )}
      {state === 'processing' && (
        <p className="text-xs text-[var(--muted-foreground)]">saving…</p>
      )}
      {state === 'error' && errorMsg && (
        <p className="text-xs text-[var(--destructive)]">{errorMsg}</p>
      )}
    </div>
  );
}

function pickMime(): string | null {
  const candidates = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4'];
  for (const m of candidates) {
    if (typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(m)) return m;
  }
  return null;
}

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}
