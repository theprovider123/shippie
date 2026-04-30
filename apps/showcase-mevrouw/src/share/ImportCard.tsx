import { useState } from 'react';
import type * as Y from 'yjs';
import { clearImportFragment, type ShareBlob } from '@shippie/share';
import {
  importMemory,
  type MemoryImportCheck,
  type MemorySharePayload,
} from './memory-share.ts';
import { Button } from '@/components/ui/button.tsx';
import { formatDateShort } from '@/lib/dates.ts';

interface Props {
  doc: Y.Doc;
  myDeviceId: string;
  check: Extract<MemoryImportCheck, { ok: true }>;
  onImported: () => void;
  onDiscard: () => void;
}

export function ImportCard({ doc, myDeviceId, check, onImported, onDiscard }: Props) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const blob: ShareBlob<MemorySharePayload> = check.blob;
  const author = blob.author.name ?? 'unnamed device';
  const fingerprint = blob.author.pubkey.slice(0, 12) + '…';

  let badge: { kind: 'ok' | 'warn' | 'err'; label: string };
  if (check.verified) {
    badge = { kind: 'ok', label: '✓ signature verified' };
  } else if (check.reason === 'tampered') {
    badge = { kind: 'err', label: '✗ signature does not match' };
  } else {
    badge = { kind: 'warn', label: '⚠ unverified — your browser cannot check' };
  }

  function handleImport() {
    setBusy(true);
    setErr(null);
    try {
      importMemory(doc, myDeviceId, blob);
      clearImportFragment();
      onImported();
    } catch (e) {
      setErr((e as Error).message ?? 'Could not import.');
      setBusy(false);
    }
  }

  function handleDiscard() {
    clearImportFragment();
    onDiscard();
  }

  const badgeColour =
    badge.kind === 'ok'
      ? 'text-[var(--gold)]'
      : badge.kind === 'warn'
        ? 'text-[var(--marigold,#C28A2D)]'
        : 'text-[var(--destructive)]';

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-[var(--card)] text-[var(--foreground)] border-t-2 border-[var(--gold)] p-5 flex flex-col gap-3 max-h-[calc(100vh-32px)] overflow-y-auto">
        <p className="font-mono text-[10px] uppercase tracking-wider text-[var(--muted-foreground)]">
          a memory was shared with you
        </p>
        <p className="font-mono text-[10px] uppercase tracking-wider text-[var(--gold)]">
          {formatDateShort(check.payload.memory_date)}
        </p>
        <p className={`font-mono text-[11px] tracking-wider ${badgeColour}`}>
          {badge.label}
        </p>
        <p className="text-xs text-[var(--muted-foreground)]">
          from <strong>{author}</strong>{' '}
          <span className="font-mono text-[10px] opacity-70">{fingerprint}</span>
        </p>

        {check.payload.photo_data_url ? (
          <img
            src={check.payload.photo_data_url}
            alt=""
            className="w-full max-h-72 object-cover border border-[var(--border)]"
          />
        ) : null}

        {check.payload.content ? (
          <p className="font-serif text-base whitespace-pre-wrap leading-relaxed">
            {check.payload.content}
          </p>
        ) : null}

        {err ? <p className="text-sm text-[var(--destructive)]">{err}</p> : null}

        <div className="flex gap-2 mt-2">
          <Button
            variant="secondary"
            onClick={handleDiscard}
            disabled={busy}
            className="flex-1 h-11"
          >
            Discard
          </Button>
          <Button
            onClick={handleImport}
            disabled={busy || badge.kind === 'err'}
            className="flex-1 h-11"
          >
            {busy ? 'Importing…' : 'Keep it'}
          </Button>
        </div>
      </div>
    </div>
  );
}
