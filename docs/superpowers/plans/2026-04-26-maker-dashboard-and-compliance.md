# Maker Dashboard + Compliance Narrative Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

> **Paired milestone with Plan B.** This plan reads the `AppProfile` that Plan B writes to KV. Don't start until Plan B has merged or is in a worktree where the analyse package + KV reader are already present.

**Goal:** Two surfaces. (1) A per-app "Enhancements" tab in the maker dashboard at `apps/web` that shows what Shippie auto-detected from the maker's deploy and lets them opt into more capabilities. (2) A public `/professionals` page on `shippie.app` that pitches the platform to regulated professionals (solicitors, therapists, financial advisors, teachers) — same product, different framing, different price.

**Architecture:** The Enhancements tab is a Next.js App Router server component that calls `readAppProfile(slug)` from `apps/web/lib/deploy/kv.ts` (added in Plan B Task 11). It renders three sections: "Auto-detected" (the enhance map keys with human-friendly labels), "Available" (a static catalog of capabilities the maker hasn't opted into yet), and "Override" (a button that opens an inline `shippie.json` editor — a textarea with JSON validation, post via server action). The compliance page is a static App Router route at `apps/web/app/professionals/page.tsx` with marketing copy + pricing tiers.

**Tech Stack:** Next.js App Router (existing in `apps/web`), React server components, server actions for the JSON editor, Tailwind/CSS modules per existing convention (read first), Plan B's `@shippie/analyse` types for `AppProfile`.

---

## File Structure

**New files:**
- `apps/web/app/dashboard/[appSlug]/enhancements/page.tsx` — server component
- `apps/web/app/dashboard/[appSlug]/enhancements/EnhancementsClient.tsx` — interactive bits (editor, opt-in toggles)
- `apps/web/app/dashboard/[appSlug]/enhancements/actions.ts` — server actions (save shippie.json, toggle capability)
- `apps/web/app/dashboard/[appSlug]/enhancements/catalog.ts` — static catalog of opt-in capabilities + their docs links
- `apps/web/lib/dashboard/profile-loader.ts` — wraps `readAppProfile` with auth + ownership check
- `apps/web/app/professionals/page.tsx` — compliance narrative page
- `apps/web/app/professionals/page.test.tsx` — smoke test (renders, no crashes)
- `apps/web/components/marketing/PricingTier.tsx` — reusable pricing tier card
- Test files for each route + action

**Modified files:**
- `apps/web/app/dashboard/[appSlug]/layout.tsx` (or wherever the app's tab nav lives — locate first) — add an "Enhancements" tab link

---

## Task 1: Profile loader with auth

**Files:**
- Create: `apps/web/lib/dashboard/profile-loader.ts`
- Create: `apps/web/lib/dashboard/profile-loader.test.ts`

`readAppProfile(slug)` from Plan B's KV helper is unauthenticated. Wrap it with the dashboard's auth/ownership check so the server component can call it directly.

- [ ] **Step 1: Locate the existing dashboard auth helper**

Run: `grep -rn "requireMakerOwnsApp\|getCurrentMaker\|assertOwnership" apps/web/lib/ apps/web/app/dashboard/ 2>/dev/null | head -10`

Use whatever pattern the existing dashboard pages use to verify the current user owns this app slug.

- [ ] **Step 2: Implement the wrapper**

```typescript
// apps/web/lib/dashboard/profile-loader.ts
import type { AppProfile } from '@shippie/analyse';
import { readAppProfile } from '@/lib/deploy/kv';
// ... import the existing auth helper

export async function loadAppProfileForOwner(slug: string): Promise<AppProfile | null> {
  await requireMakerOwnsApp(slug);
  return readAppProfile(slug);
}

export async function loadAppProfileOrEmpty(slug: string): Promise<AppProfile | { empty: true }> {
  await requireMakerOwnsApp(slug);
  const profile = await readAppProfile(slug);
  return profile ?? { empty: true };
}
```

- [ ] **Step 3: Tests** — mock `readAppProfile` + the auth helper. Verify ownership check is called before KV read; if owner check throws, KV is never queried.

- [ ] **Step 4: Commit.**

---

## Task 2: Static capability catalog

**Files:**
- Create: `apps/web/app/dashboard/[appSlug]/enhancements/catalog.ts`

A hand-maintained list of capabilities a maker can opt into beyond what zero-config detected. Each entry: id, label, blurb, snippet (the JSON to add to shippie.json), docs link.

- [ ] **Step 1: Write the catalog**

```typescript
// apps/web/app/dashboard/[appSlug]/enhancements/catalog.ts
export interface CapabilityEntry {
  id: string;
  label: string;
  blurb: string;
  /** Snippet to merge into shippie.json. */
  snippet: Record<string, unknown>;
  docsHref: string;
  category: 'sound' | 'ai' | 'mesh' | 'device' | 'backup' | 'data';
}

export const CAPABILITY_CATALOG: CapabilityEntry[] = [
  {
    id: 'sound',
    label: 'Sound design',
    blurb: 'Add subtle audio feedback to taps and confirmations.',
    snippet: { sound: true },
    docsHref: '/docs/feel/sound',
    category: 'sound',
  },
  {
    id: 'barcode',
    label: 'Barcode scanning',
    blurb: 'Scan product barcodes via the device camera (Android Chrome).',
    snippet: { capabilities: ['barcode'] },
    docsHref: '/docs/device/barcode',
    category: 'device',
  },
  {
    id: 'ai-classify',
    label: 'On-device classification',
    blurb: 'Categorise text locally — no data leaves the phone.',
    snippet: { ai: ['classify'] },
    docsHref: '/docs/ai/classify',
    category: 'ai',
  },
  {
    id: 'ai-embed',
    label: 'Semantic search',
    blurb: 'Search by meaning, not just keywords. Vector embeddings on-device.',
    snippet: { ai: ['embed'] },
    docsHref: '/docs/ai/embed',
    category: 'ai',
  },
  {
    id: 'ambient',
    label: 'Background insights',
    blurb: 'Quietly analyse local data for trends and surface insights when the user opens the app.',
    snippet: { ambient: { analyse: true } },
    docsHref: '/docs/ambient',
    category: 'ai',
  },
  {
    id: 'groups',
    label: 'Local groups (mesh)',
    blurb: 'Real-time collaboration over the local network or internet — no server.',
    snippet: { groups: { enabled: true } },
    docsHref: '/docs/groups',
    category: 'mesh',
  },
  {
    id: 'backup',
    label: 'Cloud backup to user drive',
    blurb: 'User-controlled backups to their own Google Drive (Dropbox + WebDAV soon).',
    snippet: { backup: { provider: 'google-drive' } },
    docsHref: '/docs/backup',
    category: 'backup',
  },
];
```

- [ ] **Step 2: Test that ids are unique + every entry has docsHref starting with `/docs/`.** Commit.

---

## Task 3: Enhancements page (server component)

**Files:**
- Create: `apps/web/app/dashboard/[appSlug]/enhancements/page.tsx`
- Create: `apps/web/app/dashboard/[appSlug]/enhancements/EnhancementsClient.tsx`

Server component reads the profile, renders three sections. Auto-detected list is derived from `profile.recommended.enhance` keys + a humaniser map. Available list is the catalog minus what's already in the maker's `shippie.json`.

- [ ] **Step 1: Implement the server page**

```tsx
// apps/web/app/dashboard/[appSlug]/enhancements/page.tsx
import { notFound } from 'next/navigation';
import { loadAppProfileOrEmpty } from '@/lib/dashboard/profile-loader';
import { readShippieJson } from '@/lib/dashboard/shippie-json'; // see Task 4
import { CAPABILITY_CATALOG } from './catalog';
import { EnhancementsClient } from './EnhancementsClient';

const RULE_LABEL: Record<string, string> = {
  textures: 'Sensory textures (haptic + sound + visual)',
  wakelock: 'Keep screen awake during use',
  'share-target': 'Receive shared content from other apps',
};

interface PageProps {
  params: Promise<{ appSlug: string }>;
}

export default async function Page({ params }: PageProps) {
  const { appSlug } = await params;
  const profile = await loadAppProfileOrEmpty(appSlug);
  const shippieJson = await readShippieJson(appSlug);

  if ('empty' in profile) {
    return (
      <main>
        <h1>Enhancements</h1>
        <p>This app hasn't been analysed yet. The next deploy will populate this view.</p>
      </main>
    );
  }

  const detected = Object.entries(profile.recommended.enhance)
    .flatMap(([selector, rules]) => rules.map((rule) => ({ selector, rule })));

  const enabledCapabilityIds = new Set(extractEnabledCapabilities(shippieJson));
  const available = CAPABILITY_CATALOG.filter((c) => !enabledCapabilityIds.has(c.id));

  return (
    <main className="enhancements">
      <h1>Enhancements</h1>
      <p className="subtitle">
        Shippie auto-detected the following capabilities for{' '}
        <strong>{profile.inferredName}</strong>. Override anything in
        shippie.json.
      </p>

      <section>
        <h2>Active (auto-detected)</h2>
        {detected.length === 0 ? (
          <p>No enhancements active.</p>
        ) : (
          <ul>
            {detected.map(({ selector, rule }) => (
              <li key={`${selector}::${rule}`}>
                <code>{selector}</code> — {RULE_LABEL[rule] ?? rule}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <h2>Available (opt-in)</h2>
        <ul>
          {available.map((c) => (
            <li key={c.id}>
              <h3>{c.label}</h3>
              <p>{c.blurb}</p>
              <a href={c.docsHref}>Docs →</a>
            </li>
          ))}
        </ul>
      </section>

      <EnhancementsClient slug={appSlug} initialJson={shippieJson} />
    </main>
  );
}

function extractEnabledCapabilities(json: Record<string, unknown> | null): string[] {
  if (!json) return [];
  const ids: string[] = [];
  if (json.sound === true) ids.push('sound');
  const ai = json.ai as string[] | false | undefined;
  if (Array.isArray(ai)) {
    if (ai.includes('classify')) ids.push('ai-classify');
    if (ai.includes('embed')) ids.push('ai-embed');
  }
  const ambient = json.ambient as { analyse?: boolean } | undefined;
  if (ambient?.analyse) ids.push('ambient');
  const groups = json.groups as { enabled?: boolean } | undefined;
  if (groups?.enabled) ids.push('groups');
  const backup = json.backup as { provider?: string } | undefined;
  if (backup?.provider) ids.push('backup');
  const caps = json.capabilities as string[] | undefined;
  if (Array.isArray(caps) && caps.includes('barcode')) ids.push('barcode');
  return ids;
}
```

- [ ] **Step 2: Wire the tab nav** — modify `apps/web/app/dashboard/[appSlug]/layout.tsx` (read first) to add the link.

- [ ] **Step 3: Server-render smoke test** with a mocked profile. Commit.

---

## Task 4: shippie.json editor (client + server action)

**Files:**
- Create: `apps/web/app/dashboard/[appSlug]/enhancements/EnhancementsClient.tsx`
- Create: `apps/web/app/dashboard/[appSlug]/enhancements/actions.ts`
- Create: `apps/web/lib/dashboard/shippie-json.ts` (read + write helpers backed by KV)

The client component renders a textarea pre-filled with the current `shippie.json`. On save it calls a server action that validates JSON, validates against a schema (Zod — already a project dep per memory), and writes to KV. A "Reset to auto" button clears the maker's overrides so the platform falls back to the auto-detected config.

- [ ] **Step 1: KV read/write for shippie.json**

```typescript
// apps/web/lib/dashboard/shippie-json.ts
import { getKv } from '@/lib/deploy/kv';

export async function readShippieJson(slug: string): Promise<Record<string, unknown> | null> {
  const kv = await getKv();
  const raw = await kv.get(`app:${slug}:shippie-json`);
  return raw ? JSON.parse(raw) : null;
}

export async function writeShippieJson(slug: string, json: Record<string, unknown>): Promise<void> {
  const kv = await getKv();
  await kv.put(`app:${slug}:shippie-json`, JSON.stringify(json));
}

export async function clearShippieJson(slug: string): Promise<void> {
  const kv = await getKv();
  await kv.delete(`app:${slug}:shippie-json`);
}
```

- [ ] **Step 2: Server action with Zod validation**

```typescript
// apps/web/app/dashboard/[appSlug]/enhancements/actions.ts
'use server';
import { z } from 'zod';
import { requireMakerOwnsApp } from '@/lib/auth/maker';
import { writeShippieJson, clearShippieJson } from '@/lib/dashboard/shippie-json';

const ShippieJsonSchema = z.object({
  name: z.string().optional(),
  category: z.string().optional(),
  themeColor: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
  sound: z.boolean().optional(),
  ai: z.union([z.array(z.string()), z.literal(false)]).optional(),
  ambient: z.object({ analyse: z.boolean().optional() }).optional(),
  groups: z.object({ enabled: z.boolean().optional() }).optional(),
  enhance: z.record(z.string(), z.array(z.string())).optional(),
  capabilities: z.array(z.string()).optional(),
}).passthrough();

export async function saveShippieJson(slug: string, raw: string): Promise<{ ok: true } | { error: string }> {
  await requireMakerOwnsApp(slug);
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (e) {
    return { error: `Invalid JSON: ${(e as Error).message}` };
  }
  const validated = ShippieJsonSchema.safeParse(parsed);
  if (!validated.success) {
    return { error: validated.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ') };
  }
  await writeShippieJson(slug, validated.data as Record<string, unknown>);
  return { ok: true };
}

export async function resetShippieJson(slug: string): Promise<{ ok: true }> {
  await requireMakerOwnsApp(slug);
  await clearShippieJson(slug);
  return { ok: true };
}
```

- [ ] **Step 3: Client component**

```tsx
// apps/web/app/dashboard/[appSlug]/enhancements/EnhancementsClient.tsx
'use client';
import { useState, useTransition } from 'react';
import { saveShippieJson, resetShippieJson } from './actions';

interface Props {
  slug: string;
  initialJson: Record<string, unknown> | null;
}

export function EnhancementsClient({ slug, initialJson }: Props) {
  const [text, setText] = useState(() => JSON.stringify(initialJson ?? {}, null, 2));
  const [status, setStatus] = useState<{ kind: 'idle' } | { kind: 'error'; msg: string } | { kind: 'saved' }>({ kind: 'idle' });
  const [pending, startTransition] = useTransition();

  return (
    <section>
      <h2>shippie.json</h2>
      <textarea
        value={text}
        onChange={(e) => { setText(e.target.value); setStatus({ kind: 'idle' }); }}
        rows={14}
        spellCheck={false}
        style={{ width: '100%', fontFamily: 'ui-monospace, monospace', fontSize: 14 }}
      />
      {status.kind === 'error' ? <p className="error">{status.msg}</p> : null}
      {status.kind === 'saved' ? <p className="success">Saved. Next deploy uses the new config.</p> : null}
      <div>
        <button
          type="button"
          disabled={pending}
          onClick={() => {
            startTransition(async () => {
              const result = await saveShippieJson(slug, text);
              if ('error' in result) setStatus({ kind: 'error', msg: result.error });
              else setStatus({ kind: 'saved' });
            });
          }}
        >
          Save
        </button>
        <button
          type="button"
          disabled={pending}
          onClick={() => {
            if (!confirm('Reset to auto-detected enhancements? This clears your shippie.json overrides.')) return;
            startTransition(async () => {
              await resetShippieJson(slug);
              setText('{}');
              setStatus({ kind: 'saved' });
            });
          }}
        >
          Reset to auto
        </button>
      </div>
    </section>
  );
}
```

- [ ] **Step 4: Tests** — server action: invalid JSON → error; missing ownership → throws; valid JSON → KV write called. Client component: rendered with empty initialJson → textarea contains `{}`.

- [ ] **Step 5: Commit.**

---

## Task 5: Compliance narrative page

**Files:**
- Create: `apps/web/app/professionals/page.tsx`
- Create: `apps/web/components/marketing/PricingTier.tsx`
- Create: `apps/web/app/professionals/page.test.tsx`

Static page, no auth. Hero + three tiers + a "Why Shippie for professionals" section. Honest copy — same product, different framing.

- [ ] **Step 1: Page content**

```tsx
// apps/web/app/professionals/page.tsx
import type { Metadata } from 'next';
import { PricingTier } from '@/components/marketing/PricingTier';

export const metadata: Metadata = {
  title: 'Shippie for Professionals — AI that never sees your data',
  description:
    'Compliance-grade local-first apps for solicitors, therapists, financial advisors, and teachers. ' +
    'AI inference runs on the device. Data never leaves the device.',
};

export default function Page() {
  return (
    <main className="professionals">
      <header>
        <h1>AI that never sees your data.</h1>
        <p>
          Built for solicitors, therapists, financial advisors, and teachers
          — everyone who can't send client data to American clouds.
        </p>
      </header>

      <section>
        <h2>Compliant by architecture, not by policy</h2>
        <p>
          Shippie's local AI runs in a sandboxed iframe on the user's
          device, on the device's own neural processor. Data goes in.
          Inference happens. Result comes out. Nothing leaves.
        </p>
        <p>
          That's not a privacy promise — it's a network architecture. Your
          firm's compliance team can audit the egress logs and see the
          same thing every time: nothing.
        </p>
      </section>

      <section>
        <h2>Plans</h2>
        <div className="tiers">
          <PricingTier
            name="Pro"
            price="£10/month"
            audience="Indie makers"
            features={[
              'Unlimited apps',
              'Local AI inference',
              'User-controlled backup',
              'Mesh networking',
            ]}
          />
          <PricingTier
            name="Professional"
            price="£50–100/month per user"
            audience="Regulated solo practitioners"
            featured
            features={[
              'Everything in Pro',
              'GDPR + HIPAA compatibility statement',
              'On-device inference audit log (exportable)',
              'Architectural data-residency guarantee',
              'Priority support + SLA',
            ]}
          />
          <PricingTier
            name="Enterprise"
            price="£200–500/month per workspace"
            audience="Firms + practices"
            features={[
              'Everything in Professional',
              'On-prem Shippie Hub',
              'SSO + device management',
              'Custom fine-tuned models in the AI app',
              'Dedicated support',
            ]}
          />
        </div>
      </section>

      <section>
        <h2>What stays local</h2>
        <ul>
          <li>Every AI inference call.</li>
          <li>Every database row.</li>
          <li>Every backup (encrypted to your own Drive — Shippie cannot read it).</li>
          <li>Every cross-device sync (peer-to-peer, end-to-end encrypted).</li>
        </ul>
        <p>
          The only thing Shippie's servers ever see is which apps you've
          installed and the encrypted blobs they relay between your
          devices. We can't read those blobs because we don't have the keys.
        </p>
      </section>
    </main>
  );
}
```

- [ ] **Step 2: PricingTier component**

```tsx
// apps/web/components/marketing/PricingTier.tsx
interface Props {
  name: string;
  price: string;
  audience: string;
  features: string[];
  featured?: boolean;
}

export function PricingTier({ name, price, audience, features, featured }: Props) {
  return (
    <article className={`tier ${featured ? 'tier-featured' : ''}`}>
      <header>
        <h3>{name}</h3>
        <p className="price">{price}</p>
        <p className="audience">{audience}</p>
      </header>
      <ul>
        {features.map((f) => <li key={f}>{f}</li>)}
      </ul>
    </article>
  );
}
```

- [ ] **Step 3: Smoke test (renders without throwing)** — pattern from existing route tests in `apps/web/app/**/page.test.tsx` (locate first). Commit.

---

## Task 6: Manual smoke + final commit

- [ ] **Step 1: Local dev server**

```bash
bun run --filter @shippie/web dev
```

Visit `http://localhost:3000/dashboard/<an existing app slug>/enhancements` — confirm:
- Page renders
- "Auto-detected" section lists rules from the AppProfile
- "Available" section shows opt-in capabilities not already enabled
- shippie.json editor saves + reloads without errors

Visit `http://localhost:3000/professionals` — confirm:
- All three tiers render
- Featured (Professional) is visually distinct
- Copy reads honestly — no overclaiming

- [ ] **Step 2: Confirm AppProfile is actually being read from KV** — deploy a test app via the zip path (Plan B Task 11), then refresh the dashboard. The detected section should match the synthetic profile.

- [ ] **Step 3: Final commit + summary.**

---

## Done When

- [ ] `apps/web/app/dashboard/[appSlug]/enhancements/` route exists and renders the auto-detected + available + editor sections
- [ ] Server action saves `shippie.json` with Zod validation; rejects invalid JSON + invalid schema
- [ ] "Reset to auto" clears the maker's overrides
- [ ] Compliance page at `/professionals` is live, three pricing tiers visible
- [ ] Real maker zip → analyse → dashboard shows the same rules — end-to-end loop closed
- [ ] No regressions in `apps/web` test suite

## NOT in this plan (deferred)

- **Per-rule on/off toggles in the dashboard.** Today the maker overrides via the JSON editor. Toggle UI is a follow-up if usage shows JSON-editing friction.
- **Pricing tier signup flow.** The compliance page links to existing pricing/checkout (or a static `/contact` for Professional/Enterprise). Stripe wiring for the new tiers is a separate plan.
- **Apps overview page link to /enhancements.** The tab nav is enough. A summary card on the apps list page is a follow-up.
- **`/docs/*` pages referenced by the catalog.** Each catalog entry points to a docs URL; those pages are out of scope for this plan. Either pre-create stub pages or document them in a docs-content plan.
- **A11y audit of the new pages.** Standard project a11y review process applies; not duplicated here.
