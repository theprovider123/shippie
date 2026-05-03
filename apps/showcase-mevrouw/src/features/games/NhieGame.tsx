/**
 * NhieGame — Never Have I Ever. Both phones see the same prompt; each
 * partner taps "I have" or "I have not". Reveal at once. Sip count
 * accrues across rounds.
 */
import type * as Y from 'yjs';
import { Button } from '@/components/ui/button.tsx';
import { partnerOf, readCoupleMeta } from '@/features/couple/couple-state.ts';
import {
  answer,
  bothAnswered,
  nextPrompt,
  promptAt,
  readNhie,
  reset,
  setTier,
  type Tier,
} from './nhie-state.ts';
import { useYjs } from '@/sync/useYjs.ts';
import { cn } from '@/lib/cn.ts';

interface Props {
  doc: Y.Doc;
  myDeviceId: string;
  onExit: () => void;
}

export function NhieGame({ doc, myDeviceId, onExit }: Props) {
  const meta = useYjs(doc, readCoupleMeta);
  const partner = partnerOf(meta, myDeviceId);
  const partnerId = partner?.device_id ?? null;
  const rec = useYjs(doc, readNhie);
  const prompt = rec.currentPromptIdx >= 0 ? promptAt(rec.currentPromptIdx) : null;

  const myAnswer = rec.answers[myDeviceId]?.[rec.currentPromptIdx] ?? null;
  const partnerAnswer = partnerId ? rec.answers[partnerId]?.[rec.currentPromptIdx] ?? null : null;
  const revealed = bothAnswered(rec, myDeviceId, partnerId);

  const mySips = rec.sips[myDeviceId] ?? 0;
  const partnerSips = partnerId ? rec.sips[partnerId] ?? 0 : 0;

  return (
    <div className="flex flex-col gap-4 px-4 pb-8">
      <header className="flex items-center justify-between">
        <div>
          <p className="font-mono text-[10px] uppercase tracking-wider text-[var(--gold)]">
            Never have I ever
          </p>
          <h2 className="font-serif text-2xl">Have you, though?</h2>
        </div>
        <Button variant="ghost" size="sm" onClick={onExit}>
          ← Back
        </Button>
      </header>

      <div className="flex items-center justify-between gap-2">
        <div className="flex gap-1">
          {(['all', 'soft', 'spicy'] as const).map((t) => (
            <button
              type="button"
              key={t}
              onClick={() => setTier(doc, t)}
              className={cn(
                'px-2 py-1 rounded-md text-[10px] font-mono uppercase tracking-wider border',
                rec.tier === t
                  ? 'border-[var(--gold)] text-[var(--gold)]'
                  : 'border-[var(--border)] text-[var(--muted-foreground)]',
              )}
            >
              {t === 'all' ? 'mix' : t}
            </button>
          ))}
        </div>
        <div className="flex gap-3 font-mono text-[10px] uppercase tracking-wider text-[var(--muted-foreground)]">
          <span>You · {mySips} sip{mySips === 1 ? '' : 's'}</span>
          <span>
            {partner?.display_name ?? 'them'} · {partnerSips} sip{partnerSips === 1 ? '' : 's'}
          </span>
        </div>
      </div>

      {!prompt ? (
        <div className="rounded-2xl border border-[var(--gold-glow)] bg-[var(--card)] p-5 flex flex-col gap-3">
          <p className="font-serif text-base">
            Tap below for the first prompt. Both phones see the same one. Pick a tier first if you want.
          </p>
          <Button onClick={() => nextPrompt(doc)} className="self-start">
            Draw a prompt
          </Button>
        </div>
      ) : (
        <div className="rounded-2xl border border-[var(--gold-glow)] bg-[var(--card)] p-5 flex flex-col gap-4">
          <p className="font-serif text-lg leading-snug">{prompt.text}</p>
          {myAnswer ? (
            <p className="font-mono text-[10px] uppercase tracking-wider text-[var(--muted-foreground)]">
              You said: <span className="text-[var(--foreground)]">{myAnswer === 'have' ? 'I have' : 'I have not'}</span>
            </p>
          ) : (
            <div className="flex gap-2">
              <Button onClick={() => answer(doc, myDeviceId, 'have')}>I have</Button>
              <Button variant="secondary" onClick={() => answer(doc, myDeviceId, 'havent')}>
                I have not
              </Button>
            </div>
          )}

          <div className="border-t border-[var(--border)] pt-3 flex flex-col gap-1">
            <p className="font-mono text-[10px] uppercase tracking-wider text-[var(--muted-foreground)]">
              {partner?.display_name ?? 'them'}
            </p>
            {revealed && partnerAnswer ? (
              <p className="text-sm text-[var(--foreground)]">
                {partnerAnswer === 'have' ? '☝️ I have' : '🙅 I have not'}
              </p>
            ) : partnerAnswer && !revealed ? (
              <p className="text-xs text-[var(--muted-foreground)] italic">
                Answered. Reveal pending.
              </p>
            ) : (
              <p className="text-xs text-[var(--muted-foreground)] italic">Waiting for them…</p>
            )}
          </div>

          {revealed && (
            <Button onClick={() => nextPrompt(doc)} className="self-start">
              Next prompt →
            </Button>
          )}
        </div>
      )}

      <Button
        variant="ghost"
        size="sm"
        onClick={() => {
          if (window.confirm('Reset the game? Sip counts go back to zero on both phones.')) reset(doc);
        }}
        className="self-start"
      >
        Reset sips
      </Button>
    </div>
  );
}
