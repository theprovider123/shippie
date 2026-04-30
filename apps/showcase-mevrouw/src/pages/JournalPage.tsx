import { useState } from 'react';
import type * as Y from 'yjs';
import { ScreenHeader } from '@/components/ScreenHeader.tsx';
import { Button } from '@/components/ui/button.tsx';
import {
  meName as resolveMyName,
  partnerOf,
  readCoupleMeta,
} from '@/features/couple/couple-state.ts';
import { addEntry, deleteEntry, readEntries } from '@/features/journal/journal-state.ts';
import { promptForDate } from '@/features/journal/prompts.ts';
import { useYjs } from '@/sync/useYjs.ts';
import { formatDateLong, relativePast, toLocalDateString } from '@/lib/dates.ts';
import { cn } from '@/lib/cn.ts';

interface Props {
  doc: Y.Doc;
  myDeviceId: string;
}

const MOODS = ['🌿', '☕', '☁️', '🌅', '🌙', '✨', '🫠', '💛'] as const;

export function JournalPage({ doc, myDeviceId }: Props) {
  const meta = useYjs(doc, readCoupleMeta);
  const entries = useYjs(doc, readEntries);
  const partner = partnerOf(meta, myDeviceId);
  const me = resolveMyName(meta, myDeviceId);

  const [composing, setComposing] = useState(false);
  const [content, setContent] = useState('');
  const [mood, setMood] = useState<string | null>(null);

  function send() {
    const trimmed = content.trim();
    if (!trimmed) return;
    addEntry(doc, myDeviceId, { content: trimmed, mood });
    setContent('');
    setMood(null);
    setComposing(false);
  }

  return (
    <div className="flex flex-col gap-4 px-4">
      <ScreenHeader
        eyebrow="Journal"
        title="What today was."
        lede="One short note. They see it next time they open the app."
        right={
          <Button size="sm" onClick={() => setComposing(true)}>
            + Entry
          </Button>
        }
      />

      {!composing && (
        <button
          type="button"
          onClick={() => {
            setContent(promptForDate(toLocalDateString(new Date())) + '\n\n');
            setComposing(true);
          }}
          className="rounded-2xl border border-[var(--gold-glow)] bg-[var(--gold-wash)] p-4 text-left active:scale-[0.99] transition-transform"
        >
          <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-[var(--gold)] mb-1.5">
            Today's prompt
          </p>
          <p className="font-serif text-base">
            {promptForDate(toLocalDateString(new Date()))}
          </p>
          <p className="text-[10px] font-mono text-[var(--muted-foreground)] mt-2">
            tap to start
          </p>
        </button>
      )}

      {composing && (
        <div className="rounded-2xl border border-[var(--gold-glow)] bg-[var(--card)] p-4 flex flex-col gap-3">
          <textarea
            autoFocus
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder="A line or three. Where you were, who you saw, what you noticed."
            rows={5}
            className="w-full bg-transparent border-0 resize-none focus:outline-none font-serif text-base leading-relaxed"
          />
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[10px] font-mono uppercase tracking-wider text-[var(--muted-foreground)] mr-1">
              mood
            </span>
            {MOODS.map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setMood(mood === m ? null : m)}
                className={cn(
                  'w-8 h-8 rounded-full flex items-center justify-center text-base border transition-all',
                  mood === m
                    ? 'bg-[var(--gold)] border-[var(--gold)] scale-110'
                    : 'bg-transparent border-[var(--border)] hover:border-[var(--gold-glow)]',
                )}
              >
                {m}
              </button>
            ))}
          </div>
          <div className="flex justify-end gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setComposing(false);
                setContent('');
                setMood(null);
              }}
            >
              Cancel
            </Button>
            <Button size="sm" onClick={send} disabled={!content.trim()}>
              Save entry
            </Button>
          </div>
        </div>
      )}

      <ul className="flex flex-col gap-3">
        {entries.length === 0 && !composing && (
          <li className="text-[var(--muted-foreground)] text-sm">
            No entries yet. The first one breaks the silence.
          </li>
        )}
        {entries.map((entry) => {
          const fromMe = entry.author_device === myDeviceId;
          const authorName = fromMe ? me : partner?.display_name ?? 'them';
          return (
            <li
              key={entry.id}
              className={cn(
                'rounded-2xl p-4 border bg-[var(--card)] flex flex-col gap-2',
                fromMe ? 'border-[var(--border)]' : 'border-[var(--gold-glow)]',
              )}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="font-mono text-[10px] uppercase tracking-wider text-[var(--muted-foreground)]">
                  {authorName} · {relativePast(entry.created_at)}
                  {entry.mood ? ` · ${entry.mood}` : ''}
                </span>
                {fromMe && (
                  <button
                    type="button"
                    onClick={() => deleteEntry(doc, entry.id)}
                    className="text-[var(--muted-foreground)] hover:text-[var(--destructive)] text-xs"
                    aria-label="Delete entry"
                  >
                    ×
                  </button>
                )}
              </div>
              <p className="font-serif text-base leading-relaxed whitespace-pre-wrap">
                {entry.content}
              </p>
              <p className="text-[10px] font-mono text-[var(--muted-foreground)]">
                {formatDateLong(entry.memory_date + 'T00:00:00')}
              </p>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
