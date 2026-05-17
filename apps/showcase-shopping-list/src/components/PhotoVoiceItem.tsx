/**
 * Photo / voice capture button. Hold the +Add button (or tap the
 * camera icon) to attach a photo or voice note. We use the browser's
 * file/media capture so this works cross-platform without a native
 * shell — iPhone and Android both surface the camera/mic from a
 * `<input type="file" capture>` and `MediaRecorder`.
 *
 * Captured media is held in memory as a data URL for preview and the
 * caller is responsible for persisting (this iteration: localStorage
 * if small enough, else nothing — OPFS plumbing parked for later).
 */
import { useEffect, useRef, useState } from 'react';
import type { MediaRef } from '../lib/types.ts';

interface PhotoVoiceItemProps {
  onCapture: (media: MediaRef, suggestedName: string) => void;
}

type Mode = 'idle' | 'recording';

export function PhotoVoiceItem({ onCapture }: PhotoVoiceItemProps) {
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [mode, setMode] = useState<Mode>('idle');
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    return () => {
      try {
        recorderRef.current?.stop();
      } catch {
        /* noop */
      }
    };
  }, []);

  async function handlePhoto(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    const dataUrl = await readAsDataUrl(file);
    const media: MediaRef = {
      id: `m_${Date.now()}`,
      kind: 'photo',
      mime: file.type || 'image/jpeg',
      size: file.size,
      dataUrl,
    };
    onCapture(media, suggestedNameFor(file.name) || 'photo item');
  }

  async function startVoice() {
    setError(null);
    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
      setError('Voice not supported on this device.');
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      chunksRef.current = [];
      recorder.ondataavailable = (ev) => chunksRef.current.push(ev.data);
      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: recorder.mimeType || 'audio/webm' });
        stream.getTracks().forEach((t) => t.stop());
        void readAsDataUrl(blob).then((dataUrl) => {
          const media: MediaRef = {
            id: `m_${Date.now()}`,
            kind: 'voice',
            mime: blob.type,
            size: blob.size,
            dataUrl,
          };
          onCapture(media, 'voice note');
        });
      };
      recorder.start();
      recorderRef.current = recorder;
      setMode('recording');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not access mic.');
    }
  }

  function stopVoice() {
    try {
      recorderRef.current?.stop();
    } catch {
      /* noop */
    }
    setMode('idle');
  }

  return (
    <div className="photo-voice">
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        capture="environment"
        onChange={handlePhoto}
        style={{ display: 'none' }}
      />
      <button
        type="button"
        className="chip"
        onClick={() => fileRef.current?.click()}
        aria-label="Add photo item"
      >
        Photo
      </button>
      {mode === 'idle' ? (
        <button type="button" className="chip" onClick={startVoice} aria-label="Record voice item">
          Voice
        </button>
      ) : (
        <button
          type="button"
          className="chip recording"
          onClick={stopVoice}
          aria-label="Stop recording"
        >
          ● Stop
        </button>
      )}
      {error && <span className="hint danger">{error}</span>}
    </div>
  );
}

function readAsDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : '');
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

function suggestedNameFor(filename: string): string {
  const base = filename.replace(/\.[^.]+$/, '').trim();
  if (!base) return 'photo';
  return base.slice(0, 32);
}
