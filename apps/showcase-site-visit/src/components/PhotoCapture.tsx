/**
 * Photo capture for site work. On-device camera via `<input
 * type="file" capture="environment">` (the OS camera UI shows up on
 * iOS + Android), with a paste fallback for desktop testing.
 *
 * Files are written to OPFS via @shippie/local-files; the path the
 * caller stores in the DB is the OPFS-relative location, not a blob
 * URL. Thumbnails are read back as object URLs so the strip can show
 * what was just snapped without keeping a giant base64 in memory.
 */

import { useEffect, useState } from 'react';
import type { ShippieLocalFiles } from '@shippie/local-runtime-contract';

export interface PhotoCaptureProps {
  files: ShippieLocalFiles | null;
  paths: ReadonlyArray<string>;
  onAdd: (path: string) => void;
  onRemove: (path: string) => void;
  /** Subdirectory under OPFS for these photos. Caller picks per scope. */
  prefix: string;
}

interface Thumb {
  path: string;
  url: string;
}

function newPhotoName(): string {
  const ts = Date.now().toString(36);
  const rnd = Math.random().toString(36).slice(2, 6);
  return `${ts}_${rnd}.jpg`;
}

export function PhotoCapture(props: PhotoCaptureProps) {
  const { files, paths, onAdd, onRemove, prefix } = props;
  const [thumbs, setThumbs] = useState<Thumb[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const urls: string[] = [];
    if (!files || paths.length === 0) {
      setThumbs([]);
      return () => undefined;
    }
    (async () => {
      const next: Thumb[] = [];
      for (const path of paths) {
        try {
          const blob = await files.read(path);
          const url = URL.createObjectURL(blob);
          urls.push(url);
          next.push({ path, url });
        } catch {
          // file missing — show nothing rather than crash
        }
      }
      if (!cancelled) setThumbs(next);
    })();
    return () => {
      cancelled = true;
      for (const url of urls) URL.revokeObjectURL(url);
    };
  }, [files, paths]);

  async function handleFile(file: File) {
    setError(null);
    if (!files) {
      setError('photo storage not ready yet');
      return;
    }
    try {
      const path = `${prefix}/${newPhotoName()}`;
      await files.write(path, file);
      onAdd(path);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'photo write failed');
    }
  }

  async function onChange(e: React.ChangeEvent<HTMLInputElement>) {
    const list = e.target.files;
    if (!list || list.length === 0) return;
    for (const f of Array.from(list)) await handleFile(f);
    e.target.value = '';
  }

  function onPaste(e: React.ClipboardEvent<HTMLDivElement>) {
    const items = e.clipboardData.items;
    for (const item of Array.from(items)) {
      if (item.kind === 'file') {
        const f = item.getAsFile();
        if (f) void handleFile(f);
      }
    }
  }

  function remove(path: string) {
    onRemove(path);
    if (files) {
      // Best-effort. If the delete fails the inspector keeps walking.
      void files.delete(path).catch(() => undefined);
    }
  }

  return (
    <div className="photo-capture" onPaste={onPaste}>
      <div className="photo-capture__strip">
        {thumbs.map((t) => (
          <div className="photo-thumb" key={t.path}>
            <img src={t.url} alt="" />
            <button
              type="button"
              className="photo-thumb__remove"
              aria-label="remove photo"
              onClick={() => remove(t.path)}
            >
              ×
            </button>
          </div>
        ))}
        <label className="photo-capture__add">
          <input
            type="file"
            accept="image/*"
            capture="environment"
            onChange={onChange}
            multiple
          />
          <span aria-hidden>+</span>
          <span className="visually-hidden">add photo</span>
        </label>
      </div>
      {error ? <p className="photo-capture__error">{error}</p> : null}
    </div>
  );
}
