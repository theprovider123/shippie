import { useState } from 'react';
import type * as Y from 'yjs';
import { ScreenHeader } from '@/components/ScreenHeader.tsx';
import { Button } from '@/components/ui/button.tsx';
import {
  bothOptedInToAfterHours,
  partnerOf,
  readCoupleMeta,
} from '@/features/couple/couple-state.ts';
import { YnmList } from '@/features/after-hours/YnmList.tsx';
import { PositionsList } from '@/features/after-hours/PositionsList.tsx';
import { DiceRoller } from '@/features/after-hours/DiceRoller.tsx';
import { FantasyBox } from '@/features/after-hours/FantasyBox.tsx';
import { useYjs } from '@/sync/useYjs.ts';
import type { Route } from '@/router.ts';
import { cn } from '@/lib/cn.ts';

interface Props {
  doc: Y.Doc;
  myDeviceId: string;
  onNavigate: (r: Route) => void;
}

type Tab = 'ynm' | 'positions' | 'dice' | 'fantasy';

const TABS: ReadonlyArray<{ key: Tab; label: string; sub: string }> = [
  { key: 'ynm', label: 'Yes/No/Maybe', sub: 'Mutual reveal only' },
  { key: 'positions', label: 'Positions', sub: 'Tried · want' },
  { key: 'dice', label: 'Dice', sub: 'Place · position · extra' },
  { key: 'fantasy', label: 'Fantasy box', sub: 'Sealed until both tap' },
];

export function AfterHoursPage({ doc, myDeviceId, onNavigate }: Props) {
  const meta = useYjs(doc, readCoupleMeta);
  const partner = partnerOf(meta, myDeviceId);
  const opened = bothOptedInToAfterHours(meta);
  const [tab, setTab] = useState<Tab>('ynm');

  if (!opened) {
    return (
      <div className="flex flex-col gap-4 px-4 pb-8">
        <ScreenHeader eyebrow="After-Hours" title="Locked." />
        <p className="text-sm text-[var(--muted-foreground)] leading-relaxed">
          This space is only here when both of you opt in. Visit{' '}
          <button
            type="button"
            onClick={() => onNavigate('more')}
            className="text-[var(--gold)] underline underline-offset-2"
          >
            More
          </button>{' '}
          to turn it on. The other phone has to do the same. Either of you can
          turn it back off at any time.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4 px-4 pb-8">
      <ScreenHeader
        eyebrow="After-Hours"
        title={partner ? `Just for you two.` : 'Just for you two.'}
        lede="Private. Stays on your phones. Not part of the daily app."
      />

      <nav className="grid grid-cols-2 gap-2">
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setTab(t.key)}
            className={cn(
              'rounded-xl border px-3 py-2.5 text-left flex flex-col gap-0.5 transition-colors',
              tab === t.key
                ? 'border-[var(--gold)] bg-[var(--gold-wash)]'
                : 'border-[var(--border)] bg-[var(--card)] hover:border-[var(--gold-glow)]',
            )}
          >
            <span className="font-serif text-base">{t.label}</span>
            <span className="font-mono text-[9px] uppercase tracking-wider text-[var(--muted-foreground)]">
              {t.sub}
            </span>
          </button>
        ))}
      </nav>

      <div className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-4">
        {tab === 'ynm' && (
          <YnmList doc={doc} myDeviceId={myDeviceId} partnerId={partner?.device_id ?? null} />
        )}
        {tab === 'positions' && (
          <PositionsList doc={doc} myDeviceId={myDeviceId} partnerId={partner?.device_id ?? null} />
        )}
        {tab === 'dice' && <DiceRoller doc={doc} myDeviceId={myDeviceId} />}
        {tab === 'fantasy' && (
          <FantasyBox doc={doc} myDeviceId={myDeviceId} partnerId={partner?.device_id ?? null} />
        )}
      </div>

      <Button variant="ghost" size="sm" onClick={() => onNavigate('home')}>
        ← Back home
      </Button>
    </div>
  );
}
