/**
 * Photos page — the timeline scrubber + compare-view.
 *
 * The headline differentiator. People come for "I want to see whether
 * I look different from 12 weeks ago"; they stay because the
 * architecture earns the trust to ask for the photo.
 */
import { useMemo, useState } from 'react';
import { CompareView } from '../components/CompareView.tsx';
import { PhotoViewer } from '../components/PhotoViewer.tsx';
import { TimelineScrubber } from '../components/TimelineScrubber.tsx';
import type { TimelineEntry } from '../components/TimelineScrubber.tsx';
import type { Entry } from '../lib/store.ts';

interface PhotosProps {
  entries: readonly Entry[];
}

export function Photos({ entries }: PhotosProps) {
  const photoEntries = useMemo<TimelineEntry[]>(
    () =>
      entries
        .filter((e): e is Entry & { photoLocalId: string } => Boolean(e.photoLocalId))
        .map((e) => ({
          id: e.id,
          date: e.date,
          weightKg: e.weightKg,
          photoLocalId: e.photoLocalId,
        })),
    [entries],
  );

  const [viewing, setViewing] = useState<TimelineEntry | null>(null);
  const [comparing, setComparing] = useState(false);

  return (
    <>
      <p className="page-lede">
        Tap a photo for full size. Drag the scrubber to walk through your
        timeline. Photos stay on this device — there is no upload path.
      </p>

      <TimelineScrubber
        entries={photoEntries}
        onSelect={setViewing}
        onCompare={() => setComparing(true)}
      />

      {viewing && (
        <PhotoViewer
          photoLocalId={viewing.photoLocalId}
          date={viewing.date}
          weightKg={viewing.weightKg}
          onClose={() => setViewing(null)}
        />
      )}

      {comparing && (
        <CompareView entries={photoEntries} onClose={() => setComparing(false)} />
      )}
    </>
  );
}
