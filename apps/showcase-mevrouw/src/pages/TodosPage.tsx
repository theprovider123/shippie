import { useState } from 'react';
import type * as Y from 'yjs';
import { ScreenHeader } from '@/components/ScreenHeader.tsx';
import { Button } from '@/components/ui/button.tsx';
import {
  meName as resolveMyName,
  partnerOf,
  readCoupleMeta,
} from '@/features/couple/couple-state.ts';
import { addTodo, deleteTodo, readTodos, toggleTodo } from '@/features/todos/todos-state.ts';
import { useYjs } from '@/sync/useYjs.ts';
import { cn } from '@/lib/cn.ts';
import { relativePast } from '@/lib/dates.ts';

interface Props {
  doc: Y.Doc;
  myDeviceId: string;
}

export function TodosPage({ doc, myDeviceId }: Props) {
  const todos = useYjs(doc, readTodos);
  const meta = useYjs(doc, readCoupleMeta);
  const partner = partnerOf(meta, myDeviceId);
  const me = resolveMyName(meta, myDeviceId);

  const [text, setText] = useState('');
  const [watch, setWatch] = useState(false);

  function add() {
    const t = text.trim();
    if (!t) return;
    addTodo(doc, myDeviceId, t, watch);
    setText('');
    setWatch(false);
  }

  const open = todos.filter((t) => !t.done_at);
  const done = todos.filter((t) => t.done_at);

  return (
    <div className="flex flex-col gap-4 px-4">
      <ScreenHeader
        eyebrow="Things to do"
        title="Together."
        lede="Either of you can add or check off."
      />

      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          add();
        }}
      >
        <input
          type="text"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Buy flowers · Book the place · Call her mum"
          className="flex-1 bg-[var(--card)] border border-[var(--border)] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[var(--gold)]"
        />
        <Button type="submit" disabled={!text.trim()}>
          Add
        </Button>
      </form>
      <label className="flex items-center gap-2 text-xs font-mono text-[var(--muted-foreground)] -mt-2">
        <input
          type="checkbox"
          checked={watch}
          onChange={(e) => setWatch(e.target.checked)}
          className="accent-[var(--gold)]"
        />
        watch — flag this so {partner?.display_name ?? 'they'} see it
      </label>

      <ul className="flex flex-col gap-2">
        {open.length === 0 && (
          <li className="text-[var(--muted-foreground)] text-sm py-4 text-center">
            Empty. Lovely.
          </li>
        )}
        {open.map((t) => (
          <TodoRow key={t.id} t={t} doc={doc} myDeviceId={myDeviceId} me={me} partner={partner?.display_name ?? null} />
        ))}
      </ul>

      {done.length > 0 && (
        <>
          <h3 className="font-mono text-[10px] uppercase tracking-[0.16em] text-[var(--muted-foreground)] mt-3">
            Recently done
          </h3>
          <ul className="flex flex-col gap-2 opacity-60">
            {done.slice(0, 8).map((t) => (
              <TodoRow
                key={t.id}
                t={t}
                doc={doc}
                myDeviceId={myDeviceId}
                me={me}
                partner={partner?.display_name ?? null}
              />
            ))}
          </ul>
        </>
      )}
    </div>
  );
}

interface RowProps {
  t: ReturnType<typeof readTodos>[number];
  doc: Y.Doc;
  myDeviceId: string;
  me: string;
  partner: string | null;
}

function TodoRow({ t, doc, myDeviceId, me, partner }: RowProps) {
  const doneByName = t.done_by === myDeviceId ? me : t.done_by ? partner ?? 'them' : null;
  const addedByName = t.added_by === myDeviceId ? me : partner ?? 'them';
  return (
    <li
      className={cn(
        'rounded-xl border bg-[var(--card)] px-4 py-3 flex items-start gap-3',
        t.watch && !t.done_at ? 'border-[var(--gold)]' : 'border-[var(--border)]',
      )}
    >
      <button
        type="button"
        aria-label={t.done_at ? 'Mark not done' : 'Mark done'}
        onClick={() => toggleTodo(doc, t.id, myDeviceId)}
        className={cn(
          'w-5 h-5 mt-0.5 rounded-md border flex items-center justify-center text-xs flex-shrink-0',
          t.done_at
            ? 'bg-[var(--gold)] border-[var(--gold)] text-[var(--background)]'
            : 'bg-transparent border-[var(--muted-foreground)]',
        )}
      >
        {t.done_at ? '✓' : ''}
      </button>
      <div className="flex-1 flex flex-col gap-0.5 min-w-0">
        <p className={cn('text-sm', t.done_at && 'line-through')}>{t.text}</p>
        <p className="text-[10px] font-mono uppercase tracking-wider text-[var(--muted-foreground)]">
          added by {addedByName}
          {t.done_at && doneByName ? ` · checked by ${doneByName} · ${relativePast(t.done_at)}` : ''}
          {t.watch && !t.done_at ? ' · watch' : ''}
        </p>
      </div>
      <button
        type="button"
        aria-label="Delete"
        onClick={() => deleteTodo(doc, t.id)}
        className="text-[var(--muted-foreground)] hover:text-[var(--destructive)] text-sm"
      >
        ×
      </button>
    </li>
  );
}
