import { useEffect, useState } from 'react';
import type { ShippieLocalDb, ShippieLocalFiles } from '@shippie/local-runtime-contract';
import type { StoryWithPages } from '../db/schema.ts';
import { getStory, markShared } from '../db/queries.ts';
import type { FamilyPairing } from '../sync/pairing.ts';
import { emitStoryShared } from '../lib/intents.ts';

interface Props {
  db: ShippieLocalDb;
  files: ShippieLocalFiles;
  storyId: string;
  pairings: FamilyPairing[];
  onDone: () => void;
}

interface PackedStory {
  v: 1;
  title: string;
  madeBy: string;
  pages: Array<{ svg?: string; audioBase64?: string; audioMime?: string }>;
}

async function packStory(
  db: ShippieLocalDb,
  files: ShippieLocalFiles,
  storyId: string,
): Promise<PackedStory | null> {
  const story = await getStory(db, storyId);
  if (!story) return null;
  const pages: PackedStory['pages'] = [];
  for (const p of story.pages) {
    const page: PackedStory['pages'][number] = {};
    if (p.svg_blob_id) {
      try {
        const blob = await files.read(p.svg_blob_id);
        page.svg = await blob.text();
      } catch { /* skip */ }
    }
    if (p.audio_blob_id) {
      try {
        const blob = await files.read(p.audio_blob_id);
        const ab = await blob.arrayBuffer();
        page.audioBase64 = bytesToBase64(new Uint8Array(ab));
        page.audioMime = p.audio_blob_id.endsWith('.webm') ? 'audio/webm' : 'audio/mp4';
      } catch { /* skip */ }
    }
    pages.push(page);
  }
  return { v: 1, title: story.title, madeBy: story.made_by, pages };
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]!);
  return typeof btoa === 'function' ? btoa(binary) : Buffer.from(binary, 'binary').toString('base64');
}

export function SharePage({ db, files, storyId, pairings, onDone }: Props) {
  const [story, setStory] = useState<StoryWithPages | null>(null);
  const [link, setLink] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    void (async () => {
      setStory(await getStory(db, storyId));
    })();
  }, [storyId]);

  async function generate(recipient: FamilyPairing | null) {
    setBusy(true);
    setError(null);
    try {
      const packed = await packStory(db, files, storyId);
      if (!packed) throw new Error('Story not found.');
      const json = JSON.stringify(packed);
      // Base64-encoded payload sits in the URL fragment so it never
      // hits any server. Recipients open the link; the bytes never
      // left the parent's phone.
      const base64 = bytesToBase64(new TextEncoder().encode(json));
      const url = `https://shippie.app/run/story-studio/?story=${encodeURIComponent(base64)}`;
      setLink(url);
      await markShared(db, storyId);
      emitStoryShared({
        storyId,
        title: packed.title,
        channel: 'signed-link',
        recipientLabel: recipient?.label ?? 'family',
      });
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function copy() {
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setError("Couldn't copy automatically. Long-press the link to copy.");
    }
  }

  if (!story) return <p className="ss-empty">Loading…</p>;

  return (
    <section className="ss-share">
      <button type="button" className="ss-btn ss-btn-ghost" onClick={onDone}>← Back</button>
      <p className="ss-eyebrow">Share</p>
      <h2 className="ss-section-title">{story.title}</h2>

      {pairings.length === 0 ? (
        <>
          <p>No paired family yet — that's fine. Generate a link to send via WhatsApp / email instead.</p>
          <button type="button" className="ss-btn ss-btn-primary" disabled={busy} onClick={() => void generate(null)}>
            {busy ? 'Packing…' : 'Generate a share link'}
          </button>
        </>
      ) : (
        <>
          <p>Send this story to:</p>
          <ul className="ss-share-list">
            {pairings.map((p) => (
              <li key={p.id}>
                <button type="button" className="ss-btn ss-btn-primary" onClick={() => void generate(p)}>
                  Send to {p.label}
                </button>
              </li>
            ))}
          </ul>
        </>
      )}

      {link ? (
        <div className="ss-share-link">
          <p className="ss-foot-note">A link to this story. Send it via WhatsApp, email, or AirDrop.</p>
          <code className="ss-link-code">{link}</code>
          <button type="button" className="ss-btn ss-btn-primary" onClick={() => void copy()}>
            {copied ? 'Copied' : 'Copy link'}
          </button>
        </div>
      ) : null}

      {error ? <p className="ss-error">{error}</p> : null}
    </section>
  );
}
