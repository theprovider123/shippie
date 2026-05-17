import { useEffect, useRef, useState } from 'react';
import type { ShippieLocalDb, ShippieLocalFiles } from '@shippie/local-runtime-contract';
import { DrawingCanvas } from '../components/DrawingCanvas.tsx';
import { AudioRecorder } from '../components/AudioRecorder.tsx';
import {
  createStory,
  addPage,
  updatePageAssets,
  getStory,
} from '../db/queries.ts';
import { pageSvgPath, pageAudioPath } from '../files/runtime.ts';
import { drawingToSvg, type DrawingDoc } from '../lib/canvas.ts';
import { emitStoryMade } from '../lib/intents.ts';

interface Props {
  db: ShippieLocalDb;
  files: ShippieLocalFiles;
  kidName: string;
  storyId: string | null;
  onDone: (storyId: string) => void;
}

export function StudioPage({ db, files, kidName, storyId: initialStoryId, onDone }: Props) {
  const [storyId, setStoryId] = useState<string | null>(initialStoryId);
  const [pageId, setPageId] = useState<string | null>(null);
  const [doc, setDoc] = useState<DrawingDoc | null>(null);
  const [hasAudio, setHasAudio] = useState(false);
  const [pageCount, setPageCount] = useState(0);
  const initRef = useRef(false);

  useEffect(() => {
    if (initRef.current) return;
    initRef.current = true;
    void initFirstPage();
  }, []);

  async function initFirstPage() {
    let id = storyId;
    if (!id) {
      const story = await createStory(db, { madeBy: kidName });
      id = story.id;
      setStoryId(id);
    }
    const newPage = await addPage(db, id);
    setPageId(newPage.id);
    setDoc({ width: 800, height: 600, strokes: [] });
    const story = await getStory(db, id);
    setPageCount(story?.pages.length ?? 1);
  }

  async function persistDrawing(next: DrawingDoc) {
    setDoc(next);
    if (!storyId || !pageId) return;
    const svg = drawingToSvg(next);
    const path = pageSvgPath(storyId, pageId);
    await files.write(path, new Blob([svg], { type: 'image/svg+xml' }));
    await updatePageAssets(db, pageId, { svg_blob_id: path });
  }

  async function persistAudio(blob: Blob, ext: string) {
    if (!storyId || !pageId) return;
    const path = pageAudioPath(storyId, pageId, ext);
    await files.write(path, blob);
    await updatePageAssets(db, pageId, { audio_blob_id: path });
    setHasAudio(true);
  }

  async function nextPage() {
    if (!storyId) return;
    const newPage = await addPage(db, storyId);
    setPageId(newPage.id);
    setDoc({ width: 800, height: 600, strokes: [] });
    setHasAudio(false);
    const story = await getStory(db, storyId);
    setPageCount(story?.pages.length ?? pageCount + 1);
  }

  async function finish() {
    if (!storyId) return;
    const story = await getStory(db, storyId);
    if (!story) return;
    const audioCount = story.pages.filter((p) => p.audio_blob_id).length;
    emitStoryMade({
      storyId: story.id,
      title: story.title,
      pageCount: story.pages.length,
      hasAudio: audioCount > 0,
      madeBy: story.made_by,
    });
    onDone(story.id);
  }

  if (!doc) return <p className="ss-empty">Setting up the page…</p>;

  return (
    <section className="ss-studio">
      <p className="ss-page-counter">page {pageCount}</p>
      <DrawingCanvas initial={doc} onChange={(d) => void persistDrawing(d)} />
      <AudioRecorder hasExisting={hasAudio} onSaved={(blob, ext) => void persistAudio(blob, ext)} />

      <div className="ss-studio-actions">
        <button type="button" className="ss-btn" onClick={() => void nextPage()}>
          Next page
        </button>
        <button type="button" className="ss-btn ss-btn-primary" onClick={() => void finish()}>
          All done
        </button>
      </div>
    </section>
  );
}
