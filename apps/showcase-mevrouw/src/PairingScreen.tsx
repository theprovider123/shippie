/**
 * Pairing — first-run experience for both devices. One person
 * generates a couple code; the other types it. After that, the two
 * devices share a room id and Yjs sync takes over.
 */
import { useState } from 'react';
import { Button } from '@/components/ui/button.tsx';
import {
  generateCoupleCode,
  generateDeviceId,
  type Pairing,
} from './sync/pairing.ts';

interface Props {
  onPaired: (pairing: Pairing) => void;
}

export function PairingScreen({ onPaired }: Props) {
  const [mode, setMode] = useState<'choose' | 'host' | 'join'>('choose');
  const [code, setCode] = useState('');

  function commit(coupleCode: string) {
    onPaired({
      coupleCode: coupleCode.trim().toUpperCase(),
      deviceId: generateDeviceId(),
      pairedAt: Date.now(),
    });
  }

  if (mode === 'choose') {
    return (
      <main className="min-h-dvh flex flex-col px-6 py-12 max-w-md mx-auto w-full">
        <header className="flex flex-col gap-3 mb-8">
          <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-[var(--gold)]">
            Mevrouw
          </p>
          <h1 className="font-serif text-4xl leading-none tracking-tight">
            Just the two of you.
          </h1>
          <p className="text-[var(--muted-foreground)] text-base leading-relaxed">
            One of you generates a code. The other types it. After that, you're
            paired — your phones talk directly, no server holding anything between you.
          </p>
        </header>
        <div className="flex flex-col gap-3 mt-auto">
          <Button size="lg" onClick={() => setMode('host')}>
            Generate a code
          </Button>
          <Button size="lg" variant="secondary" onClick={() => setMode('join')}>
            I have a code
          </Button>
        </div>
      </main>
    );
  }

  if (mode === 'host') {
    const generated = code || generateCoupleCode();
    if (!code) setCode(generated);
    return (
      <main className="min-h-dvh flex flex-col px-6 py-12 max-w-md mx-auto w-full">
        <header className="flex flex-col gap-3 mb-8">
          <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-[var(--gold)]">
            Your couple code
          </p>
          <h1 className="font-mono text-3xl tracking-wider text-[var(--gold)] break-all">
            {generated}
          </h1>
          <p className="text-[var(--muted-foreground)] text-base leading-relaxed">
            Tell them this code in any way you trust — text, voice, in person.
            They'll type it on their phone and you'll be paired.
          </p>
        </header>
        <div className="flex flex-col gap-3 mt-auto">
          <Button size="lg" onClick={() => commit(generated)}>
            I told them — pair me
          </Button>
          <Button size="lg" variant="ghost" onClick={() => setMode('choose')}>
            Back
          </Button>
        </div>
      </main>
    );
  }

  // mode === 'join'
  const trimmed = code.trim();
  const valid = /^[A-Z]+-[A-Z]+-\d{4}$/.test(trimmed);
  return (
    <main className="min-h-dvh flex flex-col px-6 py-12 max-w-md mx-auto w-full">
      <header className="flex flex-col gap-3 mb-8">
        <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-[var(--gold)]">
          Type their code
        </p>
        <h1 className="font-serif text-4xl leading-none tracking-tight">
          What's their code?
        </h1>
        <p className="text-[var(--muted-foreground)] text-base">
          It looks like TENDER-CRANE-3849.
        </p>
      </header>
      <input
        type="text"
        value={code}
        onChange={(e) => setCode(e.target.value.toUpperCase())}
        placeholder="TENDER-CRANE-3849"
        autoFocus
        className="w-full bg-[var(--card)] border border-[var(--border)] rounded-2xl px-4 py-4 font-mono text-xl tracking-wider text-center text-[var(--foreground)] placeholder:text-[var(--muted-foreground)] focus:outline-none focus:border-[var(--gold)]"
      />
      <div className="flex flex-col gap-3 mt-auto">
        <Button size="lg" disabled={!valid} onClick={() => commit(code)}>
          Pair
        </Button>
        <Button size="lg" variant="ghost" onClick={() => setMode('choose')}>
          Back
        </Button>
      </div>
    </main>
  );
}
