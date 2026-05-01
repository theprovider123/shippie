import { useState } from 'react';
import type * as Y from 'yjs';
import { ScreenHeader } from '@/components/ScreenHeader.tsx';
import { SyncStatus } from '@/components/SyncStatus.tsx';
import { Button } from '@/components/ui/button.tsx';
import type { RelayProvider } from '@/sync/relay-provider.ts';
import {
  bothOptedInToAfterHours,
  meName as resolveMyName,
  partnerOf,
  readCoupleMeta,
  setAfterHoursOptIn,
  setAnniversary,
  setFirstMet,
  setNextVisitDate,
  setProfileAvatar,
  setProfileName,
} from '@/features/couple/couple-state.ts';
import { Avatar } from '@/components/Avatar.tsx';
import { useYjs } from '@/sync/useYjs.ts';
import { clearPairing, roomIdFor, type Pairing } from '@/sync/pairing.ts';
import type { Route } from '@/router.ts';

interface Props {
  doc: Y.Doc;
  myDeviceId: string;
  pairing: Pairing;
  relay: RelayProvider | null;
  onNavigate: (r: Route) => void;
  onUnpair: () => void;
}

export function MorePage({ doc, myDeviceId, pairing, relay, onNavigate, onUnpair }: Props) {
  const meta = useYjs(doc, readCoupleMeta);
  const partner = partnerOf(meta, myDeviceId);
  const me = resolveMyName(meta, myDeviceId);

  const [meDraft, setMeDraft] = useState<string>(me === 'me' ? '' : me);
  const [savedFlash, setSavedFlash] = useState(false);

  function saveMyName() {
    const trimmed = meDraft.trim();
    if (!trimmed) return;
    setProfileName(doc, myDeviceId, trimmed);
    setSavedFlash(true);
    window.setTimeout(() => setSavedFlash(false), 1500);
  }

  function nukeLocal() {
    if (
      !window.confirm(
        'Permanently delete every letter, journal entry, surprise, and memory on this device? This cannot be undone.',
      )
    ) {
      return;
    }
    if (
      !window.confirm(
        "Last chance. This wipes IndexedDB + the pairing token. They'll keep their copy on their phone.",
      )
    ) {
      return;
    }
    void (async () => {
      try {
        // Drop the IndexedDB store for this couple's room.
        const dbName = roomIdFor(pairing.coupleCode);
        await new Promise<void>((resolve) => {
          const req = indexedDB.deleteDatabase(dbName);
          req.onsuccess = () => resolve();
          req.onerror = () => resolve();
          req.onblocked = () => resolve();
        });
      } catch {
        // best-effort
      }
      clearPairing();
      // Hard reload so the empty Y.Doc is rebuilt from scratch.
      window.location.reload();
    })();
  }

  return (
    <div className="flex flex-col gap-4 px-4 pb-8">
      <ScreenHeader eyebrow="More" title="Settings & spaces." />

      <Section title="Sync">
        <SyncStatus relay={relay} />
        <p className="text-xs text-[var(--muted-foreground)] pt-2">
          Couple code: <span className="font-mono text-[var(--foreground)]">{pairing.coupleCode}</span>
          <br />
          If sync isn't working, check this code matches your partner's. If it does and the dot still isn't green, tap "Sync now" — that force-reconnects and pushes your full state across.
        </p>
      </Section>

      <Section title="You two">
        <Field label="My picture">
          <div className="flex items-center gap-3">
            <Avatar name={me} dataUrl={meta.avatars[myDeviceId] ?? null} size="lg" />
            <div className="flex flex-col gap-1">
              <label className="inline-flex items-center justify-center px-3 py-1.5 rounded-md text-xs font-mono uppercase tracking-wider bg-[var(--secondary)] text-[var(--foreground)] border border-[var(--border)] cursor-pointer hover:border-[var(--gold-glow)]">
                Choose photo
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (!f) return;
                    pickAvatar(f, (dataUrl) => setProfileAvatar(doc, myDeviceId, dataUrl));
                  }}
                />
              </label>
              {meta.avatars[myDeviceId] && (
                <button
                  type="button"
                  onClick={() => setProfileAvatar(doc, myDeviceId, null)}
                  className="text-[10px] font-mono uppercase tracking-wider text-[var(--muted-foreground)] hover:text-[var(--destructive)] self-start"
                >
                  remove
                </button>
              )}
            </div>
          </div>
        </Field>
        <Field label="My name">
          <div className="flex gap-2">
            <input
              type="text"
              value={meDraft}
              onChange={(e) => setMeDraft(e.target.value)}
              placeholder="Devante"
              className="flex-1 bg-[var(--background)] border border-[var(--border)] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[var(--gold)]"
            />
            <Button size="sm" onClick={saveMyName} disabled={!meDraft.trim()}>
              {savedFlash ? '✓' : 'Save'}
            </Button>
          </div>
        </Field>
        <Field label="Their name">
          <p className="text-sm text-[var(--muted-foreground)]">
            {partner?.display_name ?? 'They haven\'t set their name yet.'}
          </p>
        </Field>
        <Field label="Anniversary">
          <input
            type="date"
            value={meta.anniversary_date ?? ''}
            onChange={(e) => setAnniversary(doc, e.target.value || null)}
            className="bg-[var(--background)] border border-[var(--border)] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[var(--gold)]"
          />
        </Field>
        <Field label="First met (anchors the constellation)">
          <input
            type="date"
            value={meta.first_met_date ?? ''}
            onChange={(e) => setFirstMet(doc, e.target.value || null)}
            className="bg-[var(--background)] border border-[var(--border)] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[var(--gold)]"
          />
        </Field>
        <Field label="Next time you're together">
          <input
            type="date"
            value={meta.next_visit_date ?? ''}
            onChange={(e) => setNextVisitDate(doc, e.target.value || null)}
            className="bg-[var(--background)] border border-[var(--border)] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[var(--gold)]"
          />
        </Field>
      </Section>

      <Section title="Spaces">
        <ul className="grid grid-cols-2 gap-2">
          {(
            [
              ['gifts', 'Gift letters'],
              ['todos', 'Things to do'],
              ['memories', 'Memories'],
              ['glimpses', 'Glimpses'],
              ['games', 'Games'],
            ] as const
          ).map(([key, label]) => (
            <li key={key}>
              <Button
                variant="secondary"
                className="w-full justify-start"
                onClick={() => onNavigate(key)}
              >
                {label}
              </Button>
            </li>
          ))}
          {bothOptedInToAfterHours(meta) && (
            <li className="col-span-2">
              <Button
                variant="secondary"
                className="w-full justify-start"
                onClick={() => onNavigate('after-hours')}
              >
                After-Hours · just for you two
              </Button>
            </li>
          )}
        </ul>
      </Section>

      <Section title="After-Hours">
        <p className="text-xs text-[var(--muted-foreground)] leading-relaxed">
          A private 18+ space — Yes/No/Maybe list, position library, dice, and a
          fantasy box that only opens when you both tap together. Both phones
          have to opt in. Either of you can turn it off any time.
        </p>
        <label className="flex items-center justify-between gap-3 p-3 rounded-xl border border-[var(--border)] bg-[var(--background)]">
          <div className="flex flex-col">
            <span className="font-serif text-sm">My phone</span>
            <span className="font-mono text-[10px] uppercase tracking-wider text-[var(--muted-foreground)]">
              {meta.after_hours_optin[myDeviceId] ? 'opted in' : 'opted out'}
            </span>
          </div>
          <input
            type="checkbox"
            checked={!!meta.after_hours_optin[myDeviceId]}
            onChange={(e) => setAfterHoursOptIn(doc, myDeviceId, e.target.checked)}
            className="h-5 w-5 accent-[var(--gold)]"
          />
        </label>
        {partner && (
          <div className="flex items-center justify-between gap-3 p-3 rounded-xl border border-[var(--border)] bg-[var(--background)]">
            <div className="flex flex-col">
              <span className="font-serif text-sm">{partner.display_name}</span>
              <span className="font-mono text-[10px] uppercase tracking-wider text-[var(--muted-foreground)]">
                {meta.after_hours_optin[partner.device_id] ? 'opted in' : 'opted out'}
              </span>
            </div>
            <span
              className={`font-mono text-[10px] uppercase tracking-wider ${
                meta.after_hours_optin[partner.device_id]
                  ? 'text-[var(--gold)]'
                  : 'text-[var(--muted-foreground)]'
              }`}
            >
              {meta.after_hours_optin[partner.device_id] ? '✓' : '—'}
            </span>
          </div>
        )}
        {bothOptedInToAfterHours(meta) ? (
          <p className="text-[11px] font-mono uppercase tracking-wider text-[var(--gold)]">
            Unlocked. Find it under Spaces.
          </p>
        ) : (
          <p className="text-[11px] font-mono uppercase tracking-wider text-[var(--muted-foreground)]">
            {meta.after_hours_optin[myDeviceId]
              ? 'Waiting on the other phone.'
              : 'Both opt-ins required.'}
          </p>
        )}
      </Section>

      <Section title="Pairing">
        <p className="text-sm text-[var(--muted-foreground)]">
          Couple code:{' '}
          <span className="font-mono text-[var(--foreground)]">{pairing.coupleCode}</span>
        </p>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => {
            if (
              window.confirm(
                'Unpair this device? Your local letters stay on this phone; sync stops.',
              )
            ) {
              clearPairing();
              onUnpair();
            }
          }}
        >
          Unpair this device
        </Button>
      </Section>

      <Section title="Danger zone">
        <p className="text-xs text-[var(--muted-foreground)] leading-relaxed">
          Wipe every letter, journal entry, surprise, memory, and game on this
          device. Your partner's phone keeps its copy.
        </p>
        <Button variant="destructive" size="sm" onClick={nukeLocal} className="self-start">
          Delete all my local data
        </Button>
      </Section>

      <Section title="About">
        <p className="text-xs font-mono text-[var(--muted-foreground)] leading-relaxed">
          mevrouw-local · Shippie-native couple PWA. Your data lives on this device.
          Two phones with the same couple code stay in sync — no server holds anything
          between you.
        </p>
      </Section>
    </div>
  );
}

function pickAvatar(file: File, save: (dataUrl: string) => void): void {
  // Simple resize-to-512 to keep the data URL under ~80KB.
  const reader = new FileReader();
  reader.onload = () => {
    if (typeof reader.result !== 'string') return;
    const img = new Image();
    img.onload = () => {
      const max = 512;
      const scale = Math.min(1, max / Math.max(img.width, img.height));
      const w = Math.round(img.width * scale);
      const h = Math.round(img.height * scale);
      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        save(reader.result as string);
        return;
      }
      ctx.drawImage(img, 0, 0, w, h);
      save(canvas.toDataURL('image/jpeg', 0.82));
    };
    img.onerror = () => save(reader.result as string);
    img.src = reader.result;
  };
  reader.readAsDataURL(file);
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-4 flex flex-col gap-3">
      <h2 className="font-mono text-[10px] uppercase tracking-[0.16em] text-[var(--gold)]">
        {title}
      </h2>
      {children}
    </section>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-[11px] font-mono uppercase tracking-wider text-[var(--muted-foreground)]">
        {label}
      </span>
      {children}
    </label>
  );
}
