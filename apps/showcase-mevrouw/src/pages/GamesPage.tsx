import { useState } from 'react';
import type * as Y from 'yjs';
import { ScreenHeader } from '@/components/ScreenHeader.tsx';
import { Button } from '@/components/ui/button.tsx';
import { WyrGame } from '@/features/games/WyrGame.tsx';
import { TtolGame } from '@/features/games/TtolGame.tsx';
import { DailyGame } from '@/features/games/DailyGame.tsx';
import { HwdkmGame } from '@/features/games/HwdkmGame.tsx';
import { TodGame } from '@/features/games/TodGame.tsx';
import { TotGame } from '@/features/games/TotGame.tsx';
import { WhispersGame } from '@/features/games/WhispersGame.tsx';
import { NhieGame } from '@/features/games/NhieGame.tsx';
import type { Route } from '@/router.ts';

interface Props {
  doc: Y.Doc;
  myDeviceId: string;
  onNavigate: (r: Route) => void;
}

type Pick = 'menu' | 'wyr' | 'ttol' | 'daily' | 'hwdkm' | 'tod' | 'tot' | 'whispers' | 'nhie';

const PLAYABLE = [
  {
    key: 'wyr' as const,
    label: 'Would you rather',
    desc: 'Pick one of two paths. See if your phones converge. 60 questions.',
  },
  {
    key: 'ttol' as const,
    label: 'Two truths, one lie',
    desc: 'Tell three things. They guess the false one.',
  },
  {
    key: 'daily' as const,
    label: 'Daily question',
    desc: 'One a day. You both answer in private. Reveal when both are in.',
  },
  {
    key: 'hwdkm' as const,
    label: 'How well do you know me',
    desc: "Set a question only you'd know. Multiple choice. Score on the spot.",
  },
  {
    key: 'tod' as const,
    label: 'Truth or Dare',
    desc: 'Pick a heat. Roll. Both phones see the same prompt — soft, warm, or spicy.',
  },
  {
    key: 'whispers' as const,
    label: 'Whispers',
    desc: 'Soft prompts. No score, just talking. Both write a response and the thread saves.',
  },
  {
    key: 'tot' as const,
    label: 'Twenty-one truths',
    desc: 'Slow turn-based prompts. End of the run, save the whole thread as a memory.',
  },
  {
    key: 'nhie' as const,
    label: 'Never have I ever',
    desc: 'Pick a tier. Tap I have / I have not. Sips count up. Drinking optional.',
  },
];

export function GamesPage({ doc, myDeviceId, onNavigate }: Props) {
  const [pick, setPick] = useState<Pick>('menu');

  if (pick === 'wyr') return <WyrGame doc={doc} myDeviceId={myDeviceId} onExit={() => setPick('menu')} />;
  if (pick === 'ttol') return <TtolGame doc={doc} myDeviceId={myDeviceId} onExit={() => setPick('menu')} />;
  if (pick === 'daily') return <DailyGame doc={doc} myDeviceId={myDeviceId} onExit={() => setPick('menu')} />;
  if (pick === 'hwdkm') return <HwdkmGame doc={doc} myDeviceId={myDeviceId} onExit={() => setPick('menu')} />;
  if (pick === 'tod') return <TodGame doc={doc} myDeviceId={myDeviceId} onExit={() => setPick('menu')} />;
  if (pick === 'tot') return <TotGame doc={doc} myDeviceId={myDeviceId} onExit={() => setPick('menu')} />;
  if (pick === 'whispers') return <WhispersGame doc={doc} myDeviceId={myDeviceId} onExit={() => setPick('menu')} />;
  if (pick === 'nhie') return <NhieGame doc={doc} myDeviceId={myDeviceId} onExit={() => setPick('menu')} />;

  return (
    <div className="flex flex-col gap-4 px-4 pb-4">
      <ScreenHeader
        eyebrow="Games"
        title="Things to play."
        lede="Each one runs locally on both phones, syncing as you play."
      />

      <ul className="flex flex-col gap-3">
        {PLAYABLE.map((g) => (
          <li
            key={g.key}
            className="rounded-2xl border border-[var(--gold-glow)] bg-[var(--card)] p-4 flex flex-col gap-2"
            onClick={() => setPick(g.key)}
            onKeyDown={(e) => e.key === 'Enter' && setPick(g.key)}
            role="button"
            tabIndex={0}
          >
            <h3 className="font-serif text-lg">{g.label}</h3>
            <p className="text-sm text-[var(--muted-foreground)]">{g.desc}</p>
            <Button size="sm" className="self-start">
              Play
            </Button>
          </li>
        ))}
      </ul>

      <Button variant="secondary" onClick={() => onNavigate('home')}>
        ← Back home
      </Button>
    </div>
  );
}
