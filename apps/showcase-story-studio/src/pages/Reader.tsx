import { useEffect, useState } from 'react';
import type { ShippieLocalDb, ShippieLocalFiles } from '@shippie/local-runtime-contract';
import type { StoryWithPages, Page } from '../db/schema.ts';
import { getStory } from '../db/queries.ts';

interface Props {
  db: ShippieLocalDb;
  files: ShippieLocalFiles;
  storyId: string;
  onBack: () => void;
}

export function ReaderPage({ db, files, storyId, onBack }: Props) {
  const [story, setStory] = useState<StoryWithPages | null>(null);
  const [pageIndex, setPageIndex] = useState(0);
  const [svg, setSvg] = useState<string | null>(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      const s = await getStory(db, storyId);
      setStory(s);
    })();
  }, [storyId]);

  useEffect(() => {
    let cancelled = false;
    let revoke: string | null = null;
    void (async () => {
      if (!story) return;
      const p: Page | undefined = story.pages[pageIndex];
      if (!p) {
        setSvg(null);
        setAudioUrl(null);
        return;
      }
      if (p.svg_blob_id) {
        try {
          const blob = await files.read(p.svg_blob_id);
          if (!cancelled) setSvg(await blob.text());
        } catch { if (!cancelled) setSvg(null); }
      } else {
        setSvg(null);
      }
      if (p.audio_blob_id) {
        try {
          const blob = await files.read(p.audio_blob_id);
          const url = URL.createObjectURL(blob);
          revoke = url;
          if (!cancelled) setAudioUrl(url);
        } catch { if (!cancelled) setAudioUrl(null); }
      } else {
        setAudioUrl(null);
      }
    })();
    return () => {
      cancelled = true;
      if (revoke) URL.revokeObjectURL(revoke);
    };
  }, [story, pageIndex, files]);

  if (!story) return <p className="ss-empty">Loading…</p>;
  const total = story.pages.length;

  return (
    <section className="ss-reader">
      <button type="button" className="ss-btn ss-btn-ghost" onClick={onBack}>← Back</button>
      <h2 className="ss-reader-title">{story.title}</h2>
      <p className="ss-reader-meta">by {story.made_by} · page {pageIndex + 1} of {total}</p>

      <div
        className="ss-reader-page"
        // SVG comes from our own serialiser; safe.
        // eslint-disable-next-line react/no-danger
        dangerouslySetInnerHTML={{ __html: svg ?? '<svg viewBox="0 0 800 600" xmlns="http://www.w3.org/2000/svg"/>' }}
      />

      {audioUrl ? (
        <audio controls src={audioUrl} className="ss-reader-audio" />
      ) : null}

      <div className="ss-reader-nav">
        <button type="button" className="ss-btn" disabled={pageIndex === 0} onClick={() => setPageIndex((i) => Math.max(0, i - 1))}>
          Previous
        </button>
        <button type="button" className="ss-btn" disabled={pageIndex >= total - 1} onClick={() => setPageIndex((i) => Math.min(total - 1, i + 1))}>
          Next
        </button>
      </div>
    </section>
  );
}
