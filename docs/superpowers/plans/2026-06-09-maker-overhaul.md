# Maker Overhaul — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add inline visibility dropdowns to all maker app rows, a kebab quick-actions menu, drafts counter, and a full app identity modal (rename + slug + icon).

**Architecture:** New migration 0059 (iconEmoji column + app_slug_redirects table). New endpoints: PATCH /api/apps/[slug]/identity, POST /api/apps/[slug]/icon, GET /api/apps/slug-check. New IdentityModal.svelte component. Maker pages get inline controls.

**Tech Stack:** SvelteKit 5 runes, Drizzle ORM on D1, Cloudflare R2 (icon uploads), Cloudflare KV.

**Branch:** `feat/dock-harmonization`

---

## Task 1: Migration — iconEmoji column + app_slug_redirects table

**Files:**
- Create: `apps/platform/drizzle/0059_app_identity.sql`
- Modify: `apps/platform/src/lib/server/db/schema/apps.ts`
- Create: `apps/platform/src/lib/server/db/schema/app-slug-redirects.ts`
- Modify: `apps/platform/src/lib/server/db/schema/index.ts`

- [ ] **Step 1: Create the migration SQL**

```sql
-- Migration 0059: app identity fields + slug redirect table

-- Add iconEmoji column to apps
ALTER TABLE apps ADD COLUMN icon_emoji TEXT;

-- Slug redirect table for app renames
CREATE TABLE IF NOT EXISTS app_slug_redirects (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  old_slug TEXT NOT NULL,
  new_slug TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);
CREATE INDEX IF NOT EXISTS app_slug_redirects_old_slug_idx ON app_slug_redirects(old_slug);
CREATE INDEX IF NOT EXISTS app_slug_redirects_expires_idx ON app_slug_redirects(expires_at);
```

Save to `apps/platform/drizzle/0059_app_identity.sql`.

- [ ] **Step 2: Add `iconEmoji` to apps schema**

In `apps/platform/src/lib/server/db/schema/apps.ts`, after the `iconUrl` field:
```ts
iconEmoji: text('icon_emoji'),
```

- [ ] **Step 3: Create `app-slug-redirects.ts` schema**

```ts
import { index, sqliteTable, text } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';

export const appSlugRedirects = sqliteTable(
  'app_slug_redirects',
  {
    id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
    oldSlug: text('old_slug').notNull(),
    newSlug: text('new_slug').notNull(),
    expiresAt: text('expires_at').notNull(),
    createdAt: text('created_at').notNull().default(sql`(strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))`),
  },
  (t) => [
    index('app_slug_redirects_old_slug_idx').on(t.oldSlug),
    index('app_slug_redirects_expires_idx').on(t.expiresAt),
  ],
);
```

- [ ] **Step 4: Export from schema index**

In `apps/platform/src/lib/server/db/schema/index.ts`, add:
```ts
export * from './app-slug-redirects';
```

- [ ] **Step 5: Run local migration**

```bash
cd /Users/devante/Documents/Shippie/apps/platform && bun run db:migrate:local 2>&1 | tail -10
```

- [ ] **Step 6: Commit**

```bash
git add apps/platform/drizzle/0059_app_identity.sql apps/platform/src/lib/server/db/schema/apps.ts apps/platform/src/lib/server/db/schema/app-slug-redirects.ts apps/platform/src/lib/server/db/schema/index.ts
git commit -m "feat: migration 0059 — iconEmoji column + app_slug_redirects table"
```

---

## Task 2: Slug check endpoint

**Files:**
- Create: `apps/platform/src/routes/api/apps/slug-check/+server.ts`

- [ ] **Step 1: Create the endpoint**

```ts
/**
 * GET /api/apps/slug-check?slug=X&exclude=current-slug
 * Returns { available: boolean }
 */
import { json } from '@sveltejs/kit';
import { eq, and, ne } from 'drizzle-orm';
import type { RequestHandler } from './$types';
import { getDrizzleClient, schema } from '$server/db/client';
import { reservedSlugs } from '$server/db/schema/reserved-slugs';

const SLUG_RE = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;

export const GET: RequestHandler = async (event) => {
  const env = event.platform?.env;
  if (!env?.DB) return json({ available: false });

  const slug = event.url.searchParams.get('slug') ?? '';
  const exclude = event.url.searchParams.get('exclude') ?? '';

  if (!SLUG_RE.test(slug)) return json({ available: false });

  const db = getDrizzleClient(env.DB);

  const [existing] = await db
    .select({ slug: schema.apps.slug })
    .from(schema.apps)
    .where(
      exclude
        ? and(eq(schema.apps.slug, slug), ne(schema.apps.slug, exclude))
        : eq(schema.apps.slug, slug),
    )
    .limit(1);

  if (existing) return json({ available: false });

  // Also check reserved slugs
  const [reserved] = await db
    .select({ slug: reservedSlugs.slug })
    .from(reservedSlugs)
    .where(eq(reservedSlugs.slug, slug))
    .limit(1);

  return json({ available: !reserved });
};
```

Check if `reservedSlugs` is the correct import path with:
```bash
grep -rn "reservedSlugs\|reserved_slugs" apps/platform/src/lib/server/db/schema/ | head -5
```

- [ ] **Step 2: Commit**

```bash
git add apps/platform/src/routes/api/apps/slug-check/+server.ts
git commit -m "feat: GET /api/apps/slug-check endpoint for slug availability"
```

---

## Task 3: Icon upload endpoint

**Files:**
- Create: `apps/platform/src/routes/api/apps/[slug]/icon/+server.ts`

- [ ] **Step 1: Create the endpoint**

```ts
/**
 * POST /api/apps/[slug]/icon
 * Accepts multipart form with `file` field. Stores to R2, returns { iconUrl }.
 */
import { json, error } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';
import type { RequestHandler } from './$types';
import { resolveRequestUserId } from '$server/auth/resolve-user';
import { getDrizzleClient, schema } from '$server/db/client';

const ALLOWED_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml']);
const MAX_BYTES = 1 * 1024 * 1024; // 1 MB

export const POST: RequestHandler = async (event) => {
  const env = event.platform?.env;
  if (!env?.DB) throw error(500, 'platform bindings unavailable');

  const who = await resolveRequestUserId(event);
  if (!who) return json({ error: 'unauthenticated' }, { status: 401 });

  const slug = event.params.slug!;
  const db = getDrizzleClient(env.DB);

  const [app] = await db
    .select({ id: schema.apps.id, makerId: schema.apps.makerId })
    .from(schema.apps)
    .where(eq(schema.apps.slug, slug))
    .limit(1);

  if (!app) return json({ error: 'not_found' }, { status: 404 });
  if (app.makerId !== who.userId) return json({ error: 'forbidden' }, { status: 403 });

  const form = await event.request.formData().catch(() => null);
  const file = form?.get('file');
  if (!(file instanceof File)) return json({ error: 'no_file' }, { status: 400 });
  if (!ALLOWED_TYPES.has(file.type)) return json({ error: 'invalid_type' }, { status: 400 });

  const bytes = await file.arrayBuffer();
  if (bytes.byteLength > MAX_BYTES) return json({ error: 'too_large' }, { status: 400 });

  if (!env.R2) throw error(500, 'R2 binding unavailable');

  const ext = file.type.split('/')[1]?.replace('svg+xml', 'svg') ?? 'png';
  const hash = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)))
    .slice(0, 8)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
  const key = `icons/${slug}/${hash}.${ext}`;

  await (env.R2 as R2Bucket).put(key, bytes, {
    httpMetadata: { contentType: file.type },
  });

  const iconUrl = `https://r2.shippie.app/${key}`;

  await db
    .update(schema.apps)
    .set({ iconUrl, updatedAt: new Date().toISOString() })
    .where(eq(schema.apps.id, app.id));

  return json({ iconUrl });
};
```

Check R2 binding name in wrangler.toml: `grep "R2\|bucket" apps/platform/wrangler.toml | head -5`

- [ ] **Step 2: Commit**

```bash
git add apps/platform/src/routes/api/apps/\[slug\]/icon/+server.ts
git commit -m "feat: POST /api/apps/[slug]/icon — icon upload to R2"
```

---

## Task 4: App identity PATCH endpoint

**Files:**
- Create: `apps/platform/src/routes/api/apps/[slug]/identity/+server.ts`

- [ ] **Step 1: Create the endpoint**

```ts
/**
 * PATCH /api/apps/[slug]/identity
 * Body: { name?, slug?, themeColor?, iconEmoji?, iconUrl? }
 * Updates D1, syncs to KV, inserts slug redirect if slug changed.
 */
import { json, error } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';
import type { RequestHandler } from './$types';
import { resolveRequestUserId } from '$server/auth/resolve-user';
import { getDrizzleClient, schema } from '$server/db/client';
import { patchAppMeta } from '$server/deploy/kv-write';

const SLUG_RE = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;

export const PATCH: RequestHandler = async (event) => {
  const env = event.platform?.env;
  if (!env?.DB) throw error(500, 'platform bindings unavailable');

  const who = await resolveRequestUserId(event);
  if (!who) return json({ error: 'unauthenticated' }, { status: 401 });

  const currentSlug = event.params.slug!;
  let body: Record<string, unknown>;
  try {
    body = (await event.request.json()) as Record<string, unknown>;
  } catch {
    return json({ error: 'invalid_json' }, { status: 400 });
  }

  const db = getDrizzleClient(env.DB);

  const [app] = await db
    .select({
      id: schema.apps.id,
      makerId: schema.apps.makerId,
      slug: schema.apps.slug,
      name: schema.apps.name,
      themeColor: schema.apps.themeColor,
    })
    .from(schema.apps)
    .where(eq(schema.apps.slug, currentSlug))
    .limit(1);

  if (!app) return json({ error: 'not_found' }, { status: 404 });
  if (app.makerId !== who.userId) return json({ error: 'forbidden' }, { status: 403 });

  const newName = typeof body.name === 'string' ? body.name.trim().slice(0, 64) : app.name;
  const newSlug = typeof body.slug === 'string' ? body.slug.trim() : currentSlug;
  const newThemeColor = typeof body.themeColor === 'string' ? body.themeColor : undefined;
  const newIconEmoji = typeof body.iconEmoji === 'string' ? body.iconEmoji : undefined;
  const newIconUrl = typeof body.iconUrl === 'string' ? body.iconUrl : undefined;

  if (!newName) return json({ error: 'name_required' }, { status: 400 });
  if (!SLUG_RE.test(newSlug)) return json({ error: 'invalid_slug' }, { status: 400 });

  // Slug uniqueness check (exclude self)
  if (newSlug !== currentSlug) {
    const [conflict] = await db
      .select({ id: schema.apps.id })
      .from(schema.apps)
      .where(eq(schema.apps.slug, newSlug))
      .limit(1);
    if (conflict) return json({ error: 'slug_taken' }, { status: 409 });
  }

  const updates: Record<string, unknown> = {
    name: newName,
    slug: newSlug,
    updatedAt: new Date().toISOString(),
  };
  if (newThemeColor !== undefined) updates.themeColor = newThemeColor;
  if (newIconEmoji !== undefined) updates.iconEmoji = newIconEmoji;
  if (newIconUrl !== undefined) updates.iconUrl = newIconUrl;

  await db.update(schema.apps).set(updates).where(eq(schema.apps.id, app.id));

  // Slug redirect
  if (newSlug !== currentSlug) {
    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
    await db.insert(schema.appSlugRedirects).values({
      oldSlug: currentSlug,
      newSlug,
      expiresAt,
    });

    // Write KV redirect key for instant 301s
    if (env.CACHE) {
      await env.CACHE.put(
        `apps:${currentSlug}:redirect`,
        newSlug,
        { expirationTtl: 30 * 24 * 60 * 60 },
      );
    }
  }

  // Sync KV meta with new name/identity
  if (env.CACHE) {
    await patchAppMeta(env.CACHE, newSlug, {
      slug: newSlug,
      ...(newThemeColor !== undefined && { theme_color: newThemeColor }),
    }).catch((err: unknown) => console.error('[identity] KV sync failed', err));
  }

  return json({ success: true, slug: newSlug, name: newName });
};
```

- [ ] **Step 2: Commit**

```bash
git add apps/platform/src/routes/api/apps/\[slug\]/identity/+server.ts
git commit -m "feat: PATCH /api/apps/[slug]/identity — rename, re-slug, icon, theme"
```

---

## Task 5: IdentityModal component

**Files:**
- Create: `apps/platform/src/lib/components/maker/IdentityModal.svelte`

- [ ] **Step 1: Create the modal**

```svelte
<script lang="ts">
  import { toast } from '$lib/stores/toast';

  interface Props {
    slug: string;
    name: string;
    themeColor: string;
    iconEmoji?: string | null;
    iconUrl?: string | null;
    remixSourceName?: string | null;
    remixSourceSlug?: string | null;
    onClose: () => void;
    onSaved: (newSlug: string, newName: string) => void;
  }

  let {
    slug,
    name,
    themeColor,
    iconEmoji = null,
    iconUrl = null,
    remixSourceName = null,
    remixSourceSlug = null,
    onClose,
    onSaved,
  }: Props = $props();

  let editName = $state(name);
  let editSlug = $state(slug);
  let editThemeColor = $state(themeColor);
  let editIconEmoji = $state(iconEmoji ?? '');
  let iconTab = $state<'colour' | 'emoji' | 'upload'>('colour');
  let slugAvailable = $state<boolean | null>(null);
  let checkingSlug = $state(false);
  let saving = $state(false);
  let uploadFile = $state<File | null>(null);
  let uploadPreview = $state<string | null>(null);
  let newIconUrl = $state(iconUrl ?? '');

  const slugChanged = $derived(editSlug !== slug);
  const SLUG_RE = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;
  const slugValid = $derived(SLUG_RE.test(editSlug));

  const PRESET_COLORS = [
    '#e8603c', '#f5a623', '#2d9a6c', '#3b82f6',
    '#8b5cf6', '#ec4899', '#14120f', '#ffffff',
  ];

  const EMOJI_GRID = [
    '⚽','🏆','🎮','🎯','📱','💻','🎨','📚',
    '🌍','☀️','🌙','⭐','🔥','💎','🎵','🎲',
    '🚀','🌊','🌸','🍕','☕','🏠','🎭','🦁',
    '🐝','🌈','💡','🔮','🎪','🏔️','🌺','⚡',
    '🎸','🎹','🎺','🥁',
  ];

  let slugDebounce: ReturnType<typeof setTimeout> | null = null;

  async function checkSlug(val: string) {
    if (val === slug) { slugAvailable = null; return; }
    if (!SLUG_RE.test(val)) { slugAvailable = false; return; }
    checkingSlug = true;
    const res = await fetch(`/api/apps/slug-check?slug=${encodeURIComponent(val)}&exclude=${encodeURIComponent(slug)}`);
    const data = await res.json() as { available: boolean };
    slugAvailable = data.available;
    checkingSlug = false;
  }

  function onSlugInput(e: Event) {
    editSlug = (e.target as HTMLInputElement).value.toLowerCase().replace(/[^a-z0-9-]/g, '-');
    if (slugDebounce) clearTimeout(slugDebounce);
    slugDebounce = setTimeout(() => checkSlug(editSlug), 400);
  }

  function onNameInput(e: Event) {
    editName = (e.target as HTMLInputElement).value.slice(0, 64);
    const auto = editName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 64);
    if (editSlug === slug) editSlug = auto;
  }

  async function handleFileChange(e: Event) {
    const file = (e.target as HTMLInputElement).files?.[0] ?? null;
    if (!file) return;
    uploadFile = file;
    uploadPreview = URL.createObjectURL(file);
    // Upload immediately
    const fd = new FormData();
    fd.set('file', file);
    const res = await fetch(`/api/apps/${encodeURIComponent(slug)}/icon`, { method: 'POST', body: fd });
    if (res.ok) {
      const j = await res.json() as { iconUrl: string };
      newIconUrl = j.iconUrl;
    } else {
      toast.push({ kind: 'error', message: 'Icon upload failed' });
    }
  }

  async function save() {
    if (!editName.trim()) return;
    if (!slugValid) return;
    if (slugChanged && slugAvailable === false) return;
    saving = true;
    const body: Record<string, unknown> = { name: editName, slug: editSlug, themeColor: editThemeColor };
    if (iconTab === 'emoji' && editIconEmoji) body.iconEmoji = editIconEmoji;
    if (iconTab === 'upload' && newIconUrl) body.iconUrl = newIconUrl;
    const res = await fetch(`/api/apps/${encodeURIComponent(slug)}/identity`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    saving = false;
    if (!res.ok) {
      const j = await res.json().catch(() => ({})) as { error?: string };
      toast.push({ kind: 'error', message: j.error === 'slug_taken' ? 'That slug is already taken.' : 'Save failed.' });
      return;
    }
    const j = await res.json() as { slug: string; name: string };
    toast.push({ kind: 'success', message: 'Identity saved.' });
    onSaved(j.slug, j.name);
  }
</script>

<div class="modal-backdrop" role="dialog" aria-modal="true" aria-label="Edit app identity">
  <div class="modal">
    <button class="close" type="button" onclick={onClose} aria-label="Close">×</button>
    <h2>App identity</h2>

    {#if remixSourceName}
      <p class="lineage">Forked from <a href="/apps/{remixSourceSlug}">{remixSourceName}</a></p>
    {/if}

    <label class="field">
      <span>Name</span>
      <input type="text" value={editName} oninput={onNameInput} maxlength="64" placeholder="App name" />
    </label>

    <label class="field">
      <span>Slug</span>
      <div class="slug-row">
        <input
          type="text"
          value={editSlug}
          oninput={onSlugInput}
          placeholder="my-app"
          class:invalid={editSlug && !slugValid}
          class:taken={slugChanged && slugAvailable === false}
        />
        {#if checkingSlug}
          <span class="slug-state">…</span>
        {:else if slugChanged && slugAvailable === true}
          <span class="slug-state ok">✓ available</span>
        {:else if slugChanged && slugAvailable === false}
          <span class="slug-state err">✗ taken</span>
        {/if}
      </div>
      {#if slugChanged}
        <p class="slug-warn">Old URL ({slug}.shippie.app) will redirect for 30 days.</p>
      {/if}
    </label>

    <fieldset class="icon-tabs">
      <legend>Icon</legend>
      <div class="tab-row">
        <button type="button" class:active={iconTab === 'colour'} onclick={() => iconTab = 'colour'}>🎨 Colour</button>
        <button type="button" class:active={iconTab === 'emoji'} onclick={() => iconTab = 'emoji'}>😀 Emoji</button>
        <button type="button" class:active={iconTab === 'upload'} onclick={() => iconTab = 'upload'}>🖼 Upload</button>
      </div>

      {#if iconTab === 'colour'}
        <div class="colour-picker">
          {#each PRESET_COLORS as c (c)}
            <button
              type="button"
              class="swatch"
              class:selected={editThemeColor === c}
              style:background={c}
              onclick={() => editThemeColor = c}
              aria-label={`Colour ${c}`}
            ></button>
          {/each}
          <input type="color" bind:value={editThemeColor} title="Custom colour" />
        </div>
      {:else if iconTab === 'emoji'}
        <div class="emoji-grid">
          {#each EMOJI_GRID as em (em)}
            <button
              type="button"
              class="emoji-btn"
              class:selected={editIconEmoji === em}
              onclick={() => editIconEmoji = em}
            >{em}</button>
          {/each}
        </div>
      {:else}
        <label class="upload-zone">
          <input type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" onchange={handleFileChange} class="sr-only" />
          {#if uploadPreview}
            <img src={uploadPreview} alt="Icon preview" class="upload-preview" />
            <span>Change</span>
          {:else}
            <span>Drop or tap to upload (PNG, JPG, WebP, SVG — max 1 MB)</span>
          {/if}
        </label>
      {/if}
    </fieldset>

    <div class="actions">
      <button type="button" class="ghost" onclick={onClose}>Cancel</button>
      <button
        type="button"
        class="primary"
        onclick={save}
        disabled={saving || !editName.trim() || !slugValid || (slugChanged && slugAvailable === false)}
      >{saving ? 'Saving…' : 'Save'}</button>
    </div>
  </div>
</div>

<style>
  .modal-backdrop {
    position: fixed; inset: 0; z-index: 900;
    background: rgba(0,0,0,0.72);
    display: grid; place-items: center; padding: 1rem;
  }
  .modal {
    background: var(--surface); border: 1px solid var(--border);
    padding: 1.5rem; width: 100%; max-width: 480px;
    position: relative; max-height: 90dvh; overflow-y: auto;
  }
  .close {
    position: absolute; top: 1rem; right: 1rem;
    background: none; border: none; font-size: 1.5rem; color: var(--text-secondary); cursor: pointer;
  }
  h2 { margin: 0 0 1rem; font-size: var(--text-heading); }
  .lineage { font-size: var(--text-small); color: var(--text-secondary); margin: 0 0 1rem; }
  .field { display: grid; gap: 0.4rem; margin-bottom: 1rem; }
  .field span { font-size: var(--text-small); color: var(--text-secondary); font-family: var(--font-mono); }
  .field input { padding: 0.6rem 0.75rem; border: 1px solid var(--border); background: var(--surface); color: var(--text); font-family: var(--font-mono); font-size: var(--text-body); width: 100%; box-sizing: border-box; }
  .field input.invalid, .field input.taken { border-color: var(--danger); }
  .slug-row { display: flex; gap: 0.5rem; align-items: center; }
  .slug-row input { flex: 1; }
  .slug-state { font-family: var(--font-mono); font-size: var(--text-small); white-space: nowrap; }
  .slug-state.ok { color: var(--sage-leaf); }
  .slug-state.err { color: var(--danger); }
  .slug-warn { font-size: var(--text-caption); color: var(--amber, #f5a623); margin: 0.3rem 0 0; font-family: var(--font-mono); }
  .icon-tabs { border: 1px solid var(--border); padding: 1rem; margin-bottom: 1rem; }
  .icon-tabs legend { font-size: var(--text-small); color: var(--text-secondary); font-family: var(--font-mono); padding: 0 0.25rem; }
  .tab-row { display: flex; gap: 0.5rem; margin-bottom: 1rem; }
  .tab-row button { padding: 0.35rem 0.75rem; border: 1px solid var(--border); background: none; color: var(--text-secondary); font-family: var(--font-mono); font-size: var(--text-small); cursor: pointer; }
  .tab-row button.active { border-color: var(--sunset); color: var(--text); background: rgba(232,96,60,0.06); }
  .colour-picker { display: flex; flex-wrap: wrap; gap: 0.5rem; align-items: center; }
  .swatch { width: 32px; height: 32px; border: 2px solid transparent; cursor: pointer; }
  .swatch.selected { border-color: var(--text); }
  .emoji-grid { display: grid; grid-template-columns: repeat(9, 1fr); gap: 4px; }
  .emoji-btn { background: none; border: 1px solid transparent; font-size: 1.25rem; cursor: pointer; padding: 4px; text-align: center; }
  .emoji-btn.selected { border-color: var(--sunset); background: rgba(232,96,60,0.08); }
  .upload-zone { display: flex; flex-direction: column; align-items: center; gap: 0.5rem; border: 1px dashed var(--border); padding: 1.5rem; cursor: pointer; text-align: center; font-size: var(--text-small); color: var(--text-secondary); }
  .upload-preview { width: 80px; height: 80px; object-fit: contain; }
  .sr-only { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0,0,0,0); }
  .actions { display: flex; justify-content: flex-end; gap: 0.75rem; margin-top: 1.5rem; }
  .primary { padding: 0.6rem 1.25rem; background: var(--sunset); color: #fff; border: none; font-family: var(--font-heading); font-size: var(--text-body); cursor: pointer; }
  .primary:disabled { opacity: 0.5; cursor: default; }
  .ghost { padding: 0.6rem 1.25rem; background: none; border: 1px solid var(--border); color: var(--text-secondary); font-family: var(--font-heading); font-size: var(--text-body); cursor: pointer; }
</style>
```

- [ ] **Step 2: Commit**

```bash
git add apps/platform/src/lib/components/maker/IdentityModal.svelte
git commit -m "feat: IdentityModal component — rename, slug, icon (colour/emoji/upload)"
```

---

## Task 6: Maker home page — inline visibility select + kebab + drafts count

**Files:**
- Modify: `apps/platform/src/routes/maker/+page.svelte`
- Modify: `apps/platform/src/routes/maker/+page.server.ts` (or `+page.ts`) to add drafts count

- [ ] **Step 1: Add drafts count to the server load**

Find the server load file for `/maker`. It likely calculates `counts.total`, `counts.live`, `counts.private`. Add:
```ts
// After existing count queries:
const draftCount = apps.filter(a => a.latestDeployStatus === 'draft' || !a.latestDeployStatus).length;
// Return in counts: { ...existing, drafts: draftCount }
```

- [ ] **Step 2: Add "Drafts" to the summary grid in `+page.svelte`**

In the summary grid section, add a fourth cell after Private:
```svelte
<div>
  <span>Drafts</span>
  <strong>{data.counts.drafts ?? 0}</strong>
</div>
```

- [ ] **Step 3: Add inline visibility select + kebab to each app row**

Replace the current `<span class="vis">{app.visibilityScope}</span>` and `<span class="status ...">` in the app row with:
```svelte
<article class="app-row">
  <a class="app-main" href={`/maker/apps/${app.slug}`}>
    <span class="swatch" style:background={app.themeColor}></span>
    <span>
      <strong>{app.name}</strong>
      <small>{app.slug}.shippie.app</small>
    </span>
  </a>
  <div class="row-controls">
    <span class="status status-{app.latestDeployStatus ?? 'draft'}">{app.latestDeployStatus ?? 'draft'}</span>
    <select
      class="vis-select"
      value={app.visibilityScope}
      onchange={(e) => changeVisibility(app.slug, (e.target as HTMLSelectElement).value)}
      aria-label="Visibility for {app.name}"
    >
      <option value="public">Public</option>
      <option value="unlisted">Unlisted</option>
      <option value="private">Private</option>
    </select>
    <div class="kebab-wrap">
      <button type="button" class="kebab" onclick={(e) => toggleKebab(e, app.slug)} aria-label="Actions for {app.name}">⋮</button>
      {#if kebabOpen === app.slug}
        <div class="kebab-menu">
          <a href={`/run/${app.slug}`} target="_blank">Open</a>
          <button type="button" onclick={() => shareApp(app.slug)}>Share</button>
          <button type="button" onclick={() => openIdentity(app)}>Edit identity</button>
          <a href={`/maker/apps/${app.slug}`}>Manage</a>
        </div>
      {/if}
    </div>
  </div>
</article>
```

- [ ] **Step 4: Add script logic for changeVisibility, kebab, identity modal**

```ts
import IdentityModal from '$lib/components/maker/IdentityModal.svelte';
import { toast } from '$lib/stores/toast';
import { invalidateAll } from '$app/navigation';

let kebabOpen = $state<string | null>(null);
let identityTarget = $state<typeof apps[0] | null>(null);

function toggleKebab(e: MouseEvent, slug: string) {
  e.stopPropagation();
  kebabOpen = kebabOpen === slug ? null : slug;
}

function openIdentity(app: typeof apps[0]) {
  identityTarget = app;
  kebabOpen = null;
}

async function changeVisibility(slug: string, next: string) {
  const res = await fetch(`/api/apps/${encodeURIComponent(slug)}/visibility`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ visibility_scope: next }),
  });
  if (!res.ok) {
    toast.push({ kind: 'error', message: 'Visibility change failed.' });
    return;
  }
  const j = await res.json() as { metadata_synced: boolean };
  if (j.metadata_synced === false) {
    toast.push({ kind: 'warning', message: `Set to ${next}. May take 30 s to propagate.` });
  } else {
    toast.push({ kind: 'success', message: `Set to ${next}.` });
  }
  await invalidateAll();
}

async function shareApp(slug: string) {
  const url = `https://${slug}.shippie.app`;
  if ('share' in navigator) {
    await navigator.share({ url }).catch(() => {});
  } else {
    await navigator.clipboard.writeText(url).catch(() => {});
    toast.push({ kind: 'success', message: 'Link copied.' });
  }
  kebabOpen = null;
}
```

- [ ] **Step 5: Add identity modal render**

Before the closing `</main>` or equivalent wrapper:
```svelte
{#if identityTarget}
  <IdentityModal
    slug={identityTarget.slug}
    name={identityTarget.name}
    themeColor={identityTarget.themeColor}
    onClose={() => identityTarget = null}
    onSaved={async () => { identityTarget = null; await invalidateAll(); }}
  />
{/if}
```

- [ ] **Step 6: Update the "View all →" link to icon-only arrow and increase list from 6 to 8**

```svelte
<!-- Change: apps.slice(0, 6) → apps.slice(0, 8) -->
{#each apps.slice(0, 8) as app (app.id)}

<!-- Change: <a href="/maker/apps">View all →</a> → <a href="/maker/apps" aria-label="View all apps">→</a> -->
<a href="/maker/apps" aria-label="View all apps">→</a>
```

- [ ] **Step 7: Add CSS for new controls**

```css
.row-controls { display: flex; align-items: center; gap: 0.5rem; }
.vis-select {
  padding: 0.25rem 0.5rem;
  background: var(--surface);
  border: 1px solid var(--border-light);
  color: var(--text-secondary);
  font-family: var(--font-mono);
  font-size: var(--text-caption);
  cursor: pointer;
}
.kebab-wrap { position: relative; }
.kebab { background: none; border: none; color: var(--text-secondary); font-size: 1.1rem; cursor: pointer; padding: 0.25rem 0.5rem; }
.kebab-menu {
  position: absolute; right: 0; top: 100%; z-index: 50;
  background: var(--surface); border: 1px solid var(--border);
  display: flex; flex-direction: column; min-width: 140px;
}
.kebab-menu a, .kebab-menu button {
  padding: 0.6rem 1rem; text-decoration: none; color: var(--text);
  font-size: var(--text-small); background: none; border: none;
  text-align: left; cursor: pointer; font-family: inherit;
}
.kebab-menu a:hover, .kebab-menu button:hover { background: color-mix(in srgb, var(--text) 6%, transparent); }
```

- [ ] **Step 8: Commit**

```bash
git add apps/platform/src/routes/maker/+page.svelte apps/platform/src/routes/maker/+page.server.ts
git commit -m "feat: maker home — inline visibility select, kebab menu, drafts count, identity modal"
```

---

## Task 7: Health check

- [ ] **Run typecheck + tests**

```bash
cd /Users/devante/Documents/Shippie && bun run typecheck 2>&1 | tail -20 && bun run test 2>&1 | grep -E "pass|fail|FAIL" | tail -15
```

Fix any errors. Common pitfalls:
- `appSlugRedirects` not exported from schema index — check the `index.ts` export
- R2 type — may need `/// <reference types="@cloudflare/workers-types" />` 
- `updatedAt` field on apps — check if it exists with `grep "updatedAt" apps/platform/src/lib/server/db/schema/apps.ts`
