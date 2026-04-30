import { useState } from 'react';
import type * as Y from 'yjs';
import { ConstellationMap } from '@/components/ConstellationMap.tsx';
import { ScreenHeader } from '@/components/ScreenHeader.tsx';
import { Button } from '@/components/ui/button.tsx';
import { readCoupleMeta } from '@/features/couple/couple-state.ts';
import { addMemory, readMemories, toggleFavourite } from '@/features/memories/memories-state.ts';
import type { Memory } from '@/features/memories/memories-state.ts';
import { readTrips } from '@/features/schedule/schedule-state.ts';
import { ShareSheet } from '@/share/ShareSheet.tsx';
import { useYjs } from '@/sync/useYjs.ts';
import { cn } from '@/lib/cn.ts';
import { formatDateShort, toLocalDateString } from '@/lib/dates.ts';

interface Props {
  doc: Y.Doc;
  myDeviceId: string;
}

export function MemoriesPage({ doc, myDeviceId }: Props) {
  const memories = useYjs(doc, readMemories);
  const meta = useYjs(doc, readCoupleMeta);
  const trips = useYjs(doc, readTrips);
  const [composing, setComposing] = useState(false);
  const [sharing, setSharing] = useState<Memory | null>(null);

  return (
    <div className="flex flex-col gap-4 px-4">
      <ScreenHeader
        eyebrow="Memories"
        title="What you've kept."
        lede="Photos and lines, dated. The on-this-day feed pulls from here."
        right={
          <Button size="sm" onClick={() => setComposing(true)}>
            + Memory
          </Button>
        }
      />

      <ConstellationMap
        anniversaryDate={meta.anniversary_date}
        firstMet={meta.first_met_date}
        trips={trips}
        memories={memories}
      />

      {memories.length === 0 && (
        <p className="text-[var(--muted-foreground)] text-sm text-center py-8">
          Nothing yet. Add the first.
        </p>
      )}

      <ul className="grid grid-cols-2 gap-2">
        {memories.map((m) => (
          <li
            key={m.id}
            className={cn(
              'rounded-2xl border bg-[var(--card)] overflow-hidden flex flex-col',
              m.is_favourite ? 'border-[var(--gold)]' : 'border-[var(--border)]',
            )}
          >
            {m.photo_data_url ? (
              <img src={m.photo_data_url} alt="" className="w-full aspect-square object-cover" />
            ) : (
              <div className="w-full aspect-square bg-[var(--forest)] flex items-center justify-center">
                <span className="font-serif italic text-3xl text-[var(--muted-foreground)]">
                  ♡
                </span>
              </div>
            )}
            <div className="p-3 flex flex-col gap-1">
              <p className="font-mono text-[10px] uppercase tracking-wider text-[var(--muted-foreground)]">
                {formatDateShort(m.memory_date)}
              </p>
              {m.content && <p className="text-sm font-serif line-clamp-3">{m.content}</p>}
              <div className="flex items-center justify-between gap-2">
                <button
                  type="button"
                  onClick={() => toggleFavourite(doc, m.id)}
                  className={cn(
                    'text-xs font-mono uppercase tracking-wider',
                    m.is_favourite ? 'text-[var(--gold)]' : 'text-[var(--muted-foreground)]',
                  )}
                >
                  {m.is_favourite ? '★ favourite' : '☆ favourite'}
                </button>
                <button
                  type="button"
                  onClick={() => setSharing(m)}
                  className="text-xs font-mono uppercase tracking-wider text-[var(--gold)] hover:opacity-80"
                  aria-label="Share memory"
                >
                  ↗ share
                </button>
              </div>
            </div>
          </li>
        ))}
      </ul>

      {composing && (
        <ComposeMemory
          doc={doc}
          myDeviceId={myDeviceId}
          onClose={() => setComposing(false)}
        />
      )}

      {sharing ? (
        <ShareSheet memory={sharing} onClose={() => setSharing(null)} />
      ) : null}
    </div>
  );
}

function ComposeMemory({
  doc,
  myDeviceId,
  onClose,
}: {
  doc: Y.Doc;
  myDeviceId: string;
  onClose: () => void;
}) {
  const [content, setContent] = useState('');
  const [photo, setPhoto] = useState<string | null>(null);
  const [memoryDate, setMemoryDate] = useState(toLocalDateString(new Date()));

  function save() {
    if (!content.trim() && !photo) return;
    addMemory(doc, myDeviceId, {
      content: content.trim() || null,
      photo_data_url: photo,
      memory_date: memoryDate,
    });
    onClose();
  }

  function pickPhoto(file: File) {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') setPhoto(reader.result);
    };
    reader.readAsDataURL(file);
  }

  return (
    <div className="fixed inset-0 z-50 bg-[var(--background)]/80 backdrop-blur-sm flex items-end sm:items-center justify-center p-4">
      <div className="w-full max-w-md bg-[var(--card)] border border-[var(--border)] rounded-3xl p-5 flex flex-col gap-3">
        <h3 className="font-serif text-xl">A new memory</h3>
        <input
          type="file"
          accept="image/*"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) pickPhoto(f);
          }}
          className="text-xs"
        />
        {photo && <img src={photo} alt="" className="w-full max-h-48 object-cover rounded-xl" />}
        <textarea
          rows={3}
          value={content}
          onChange={(e) => setContent(e.target.value)}
          placeholder="What is this?"
          className="bg-[var(--background)] border border-[var(--border)] rounded-lg px-3 py-2 text-sm font-serif focus:outline-none focus:border-[var(--gold)]"
        />
        <input
          type="date"
          value={memoryDate}
          onChange={(e) => setMemoryDate(e.target.value)}
          className="bg-[var(--background)] border border-[var(--border)] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[var(--gold)]"
        />
        <div className="flex justify-end gap-2 mt-2">
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button disabled={!content.trim() && !photo} onClick={save}>
            Save
          </Button>
        </div>
      </div>
    </div>
  );
}
