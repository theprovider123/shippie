export const meta = {
  name: 'shippie-sprint-round2',
  description: 'Implement remaining 3 tracks: platform fixes, maker backend, coffee polish',
  phases: [
    { title: 'Round 2', detail: 'Platform fixes + maker backend + coffee polish' },
    { title: 'Merge', detail: 'Merge worktree branches back' },
    { title: 'Health', detail: 'typecheck + test + build' },
  ],
};

phase('Round 2');
log('Dispatching 3 focused implementation agents in isolated worktrees...');

const PLATFORM_PROMPT = `Implement platform bug fixes for Shippie at /Users/devante/Documents/Shippie on branch feat/dock-harmonization. Work from the repo root.

TASK 1 — VisibilityPicker metadata_synced warning
File: apps/platform/src/lib/components/dashboard/VisibilityPicker.svelte
Read the file. In onChange(), after the 'if (!res.ok)' early return, replace the success block:
  OLD: scope = next; toast.push({ kind: 'success', message: ... }); void invalidate('app:apps');
  NEW (insert these 8 lines):
    const j = await res.json().catch(() => ({ metadata_synced: true }));
    scope = j.visibility_scope ?? next;
    if (j.metadata_synced === false) {
      toast.push({ kind: 'warning', message: 'Visibility saved. May take 30s to go live.' });
    } else {
      toast.push({ kind: 'success', message: 'Visibility set to ' + next + '.' });
    }
    void invalidate('app:apps');

Also read apps/platform/src/lib/stores/toast.ts and add 'warning' to the ToastKind type if missing.
Commit: "fix: VisibilityPicker shows warning when metadata_synced is false"

TASK 2 — Network status store
Create apps/platform/src/lib/stores/network-status.ts with:
  import { readable } from 'svelte/store';
  export const isOnline = readable(true, (set) => {
    if (typeof window === 'undefined') return;
    set(navigator.onLine);
    const on = () => set(true);
    const off = () => set(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => { window.removeEventListener('online', on); window.removeEventListener('offline', off); };
  });
Commit: "feat: isOnline readable store for offline detection"

TASK 3 — ToolRow offline sub-label
File: apps/platform/src/lib/components/tool-surface/ToolRow.svelte
Read the full file first. Then:
a) Add import at top of script: import { isOnline } from '$lib/stores/network-status';
b) After 'const offlineReady = ...' line, add:
   const offlineSubLabel = $derived(!$isOnline ? (offlineReady ? 'ready offline' : 'not saved') : '');
   const showOfflineLabel = $derived(!$isOnline);
c) Update hasStatus to include showOfflineLabel: const hasStatus = $derived(showRel || isSaving || showCaption || showOfflineLabel);
d) In the rowInner snippet, inside .row-status span, add after the {#if isSaving} block:
   {#if showOfflineLabel}
     <span class="row-offline-label" class:ready={offlineReady}>{offlineSubLabel}</span>
   {/if}
e) Remove the {#if offlineReady}<span class="dot dot-offline" ...>{/if} line from rowInner.
f) Add CSS: .row-offline-label { font-family: var(--font-mono); font-size: var(--text-caption); color: var(--text-secondary); white-space: nowrap; } .row-offline-label.ready { color: var(--amber, #f5a623); }
Commit: "feat: ToolRow offline sub-label — amber when ready, grey otherwise"

TASK 4 — ToolCard offline sub-label
File: apps/platform/src/lib/components/tool-surface/ToolCard.svelte
Read the full file. Apply the same treatment as ToolRow:
- Add isOnline import
- Add offlineSubLabel + showOfflineLabel derived values
- Remove dot-offline from the icon area
- Add sub-label below the tile name
- Add same CSS classes
Commit: "feat: ToolCard offline sub-label (matches ToolRow)"

TASK 5 — PWA manifest
File: apps/platform/src/routes/manifest.webmanifest/+server.ts
Read it. Add to the manifest object:
  prefer_related_applications: false,
  screenshots: [
    { src: '/__shippie-pwa/screenshot-narrow.png', sizes: '390x844', type: 'image/png', form_factor: 'narrow', label: 'Shippie Dock' },
    { src: '/__shippie-pwa/screenshot-wide.png', sizes: '1280x800', type: 'image/png', form_factor: 'wide', label: 'Shippie Tools' },
  ],
Create placeholder PNG files (1x1 transparent PNG, base64 decoded via shell):
  echo "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==" | base64 -d > apps/platform/static/__shippie-pwa/screenshot-narrow.png
  cp apps/platform/static/__shippie-pwa/screenshot-narrow.png apps/platform/static/__shippie-pwa/screenshot-wide.png
Commit: "feat: PWA manifest — prefer_related_applications:false and screenshots array"

TASK 6 — OG tag cleanup
File: apps/platform/src/routes/apps/[slug]/+page.svelte
Read lines 118-132. In the svelte:head block:
a) Change: <title>{data.app.name} — Shippie</title>  TO: <title>{data.app.name}</title>
b) Change: content={\`\${data.app.name} — Shippie\`}  in og:title  TO: content={data.app.name}
c) Add after og:type: <meta property="og:site_name" content="Shippie" />
d) Change twitter:card from "summary" to: content={ogImage ? 'summary_large_image' : 'summary'}
Commit: "fix: app-first og:title, add og:site_name, large twitter card when icon present"

AFTER ALL TASKS:
Run: cd /Users/devante/Documents/Shippie && bun run typecheck 2>&1 | tail -20
Fix any errors, then report what you committed.`;

const MAKER_PROMPT = `Implement Maker backend for Shippie at /Users/devante/Documents/Shippie on branch feat/dock-harmonization.

TASK 1 — Migration 0059
Check latest migration: ls apps/platform/drizzle/ | sort | tail -5
Create apps/platform/drizzle/0059_app_identity.sql:
  -- Migration 0059: iconEmoji column + slug redirect table
  ALTER TABLE apps ADD COLUMN icon_emoji TEXT;
  CREATE TABLE IF NOT EXISTS app_slug_redirects (
    id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
    old_slug TEXT NOT NULL,
    new_slug TEXT NOT NULL,
    expires_at TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
  );
  CREATE INDEX IF NOT EXISTS app_slug_redirects_old_slug_idx ON app_slug_redirects(old_slug);

Read apps/platform/src/lib/server/db/schema/apps.ts and add after iconUrl line:
  iconEmoji: text('icon_emoji'),

Create apps/platform/src/lib/server/db/schema/app-slug-redirects.ts:
  import { index, sqliteTable, text } from 'drizzle-orm/sqlite-core';
  import { sql } from 'drizzle-orm';
  export const appSlugRedirects = sqliteTable('app_slug_redirects', {
    id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
    oldSlug: text('old_slug').notNull(),
    newSlug: text('new_slug').notNull(),
    expiresAt: text('expires_at').notNull(),
    createdAt: text('created_at').notNull().default(sql('(strftime(\'%Y-%m-%dT%H:%M:%SZ\', \'now\')))' )),
  }, (t) => [index('app_slug_redirects_old_slug_idx').on(t.oldSlug)]);

Read apps/platform/src/lib/server/db/schema/index.ts and add: export * from './app-slug-redirects';
Run: cd /Users/devante/Documents/Shippie/apps/platform && bun run db:migrate:local 2>&1 | tail -8
Commit: "feat: migration 0059 — iconEmoji on apps, app_slug_redirects table"

TASK 2 — Slug check endpoint
Create apps/platform/src/routes/api/apps/slug-check/+server.ts:
  import { json } from '@sveltejs/kit';
  import { eq, and, ne } from 'drizzle-orm';
  import type { RequestHandler } from './$types';
  import { getDrizzleClient, schema } from '$server/db/client';
  const SLUG_RE = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;
  export const GET: RequestHandler = async (event) => {
    const env = event.platform?.env;
    if (!env?.DB) return json({ available: false });
    const slug = event.url.searchParams.get('slug') ?? '';
    const exclude = event.url.searchParams.get('exclude') ?? '';
    if (!SLUG_RE.test(slug)) return json({ available: false });
    const db = getDrizzleClient(env.DB);
    const conditions = exclude ? and(eq(schema.apps.slug, slug), ne(schema.apps.slug, exclude)) : eq(schema.apps.slug, slug);
    const [existing] = await db.select({ slug: schema.apps.slug }).from(schema.apps).where(conditions).limit(1);
    return json({ available: !existing });
  };
Commit: "feat: GET /api/apps/slug-check — slug availability check"

TASK 3 — Icon upload endpoint
First check: grep -n "R2" apps/platform/wrangler.toml | head -5
Create apps/platform/src/routes/api/apps/[slug]/icon/+server.ts:
  import { json, error } from '@sveltejs/kit';
  import { eq } from 'drizzle-orm';
  import type { RequestHandler } from './$types';
  import { resolveRequestUserId } from '$server/auth/resolve-user';
  import { getDrizzleClient, schema } from '$server/db/client';
  const ALLOWED = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml']);
  export const POST: RequestHandler = async (event) => {
    const env = event.platform?.env;
    if (!env?.DB) throw error(500, 'bindings unavailable');
    const who = await resolveRequestUserId(event);
    if (!who) return json({ error: 'unauthenticated' }, { status: 401 });
    const slug = event.params.slug;
    const db = getDrizzleClient(env.DB);
    const [app] = await db.select({ id: schema.apps.id, makerId: schema.apps.makerId }).from(schema.apps).where(eq(schema.apps.slug, slug)).limit(1);
    if (!app) return json({ error: 'not_found' }, { status: 404 });
    if (app.makerId !== who.userId) return json({ error: 'forbidden' }, { status: 403 });
    const form = await event.request.formData().catch(() => null);
    const file = form?.get('file');
    if (!(file instanceof File)) return json({ error: 'no_file' }, { status: 400 });
    if (!ALLOWED.has(file.type)) return json({ error: 'invalid_type' }, { status: 400 });
    const bytes = await file.arrayBuffer();
    if (bytes.byteLength > 1048576) return json({ error: 'too_large' }, { status: 400 });
    const r2 = env.R2;
    if (!r2) throw error(500, 'R2 unavailable');
    const ext = file.type.replace('image/', '').replace('svg+xml', 'svg');
    const arr = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes));
    const hash = Array.from(arr).slice(0, 8).map(b => b.toString(16).padStart(2, '0')).join('');
    const key = 'icons/' + slug + '/' + hash + '.' + ext;
    await r2.put(key, bytes, { httpMetadata: { contentType: file.type } });
    const iconUrl = 'https://r2.shippie.app/' + key;
    await db.update(schema.apps).set({ iconUrl }).where(eq(schema.apps.id, app.id));
    return json({ iconUrl });
  };
Commit: "feat: POST /api/apps/[slug]/icon — upload icon to R2"

TASK 4 — Identity PATCH endpoint
Check updatedAt: grep "updatedAt" apps/platform/src/lib/server/db/schema/apps.ts | head -3
Check patchAppMeta: grep -n "patchAppMeta" apps/platform/src/lib/server/deploy/kv-write.ts | head -3
Create apps/platform/src/routes/api/apps/[slug]/identity/+server.ts:
  import { json, error } from '@sveltejs/kit';
  import { eq } from 'drizzle-orm';
  import type { RequestHandler } from './$types';
  import { resolveRequestUserId } from '$server/auth/resolve-user';
  import { getDrizzleClient, schema } from '$server/db/client';
  import { patchAppMeta } from '$server/deploy/kv-write';
  const SLUG_RE = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;
  export const PATCH: RequestHandler = async (event) => {
    const env = event.platform?.env;
    if (!env?.DB) throw error(500, 'bindings unavailable');
    const who = await resolveRequestUserId(event);
    if (!who) return json({ error: 'unauthenticated' }, { status: 401 });
    const currentSlug = event.params.slug;
    let body;
    try { body = await event.request.json(); } catch { return json({ error: 'invalid_json' }, { status: 400 }); }
    const db = getDrizzleClient(env.DB);
    const [app] = await db.select({ id: schema.apps.id, makerId: schema.apps.makerId, slug: schema.apps.slug, name: schema.apps.name }).from(schema.apps).where(eq(schema.apps.slug, currentSlug)).limit(1);
    if (!app) return json({ error: 'not_found' }, { status: 404 });
    if (app.makerId !== who.userId) return json({ error: 'forbidden' }, { status: 403 });
    const newName = typeof body.name === 'string' ? body.name.trim().slice(0, 64) : app.name;
    const newSlug = typeof body.slug === 'string' ? body.slug.trim() : currentSlug;
    if (!newName) return json({ error: 'name_required' }, { status: 400 });
    if (!SLUG_RE.test(newSlug)) return json({ error: 'invalid_slug' }, { status: 400 });
    if (newSlug !== currentSlug) {
      const [conflict] = await db.select({ id: schema.apps.id }).from(schema.apps).where(eq(schema.apps.slug, newSlug)).limit(1);
      if (conflict) return json({ error: 'slug_taken' }, { status: 409 });
    }
    const updates = { name: newName, slug: newSlug };
    if (typeof body.themeColor === 'string') updates.themeColor = body.themeColor;
    if (typeof body.iconEmoji === 'string') updates.iconEmoji = body.iconEmoji;
    if (typeof body.iconUrl === 'string') updates.iconUrl = body.iconUrl;
    await db.update(schema.apps).set(updates).where(eq(schema.apps.id, app.id));
    if (newSlug !== currentSlug) {
      const exp = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
      await db.insert(schema.appSlugRedirects).values({ oldSlug: currentSlug, newSlug, expiresAt: exp }).catch(() => {});
      if (env.CACHE) { await env.CACHE.put('apps:' + currentSlug + ':redirect', newSlug, { expirationTtl: 2592000 }).catch(() => {}); }
    }
    if (env.CACHE) {
      const kvPatch = { slug: newSlug };
      if (typeof body.themeColor === 'string') kvPatch.theme_color = body.themeColor;
      await patchAppMeta(env.CACHE, newSlug, kvPatch).catch(() => {});
    }
    return json({ success: true, slug: newSlug, name: newName });
  };
Commit: "feat: PATCH /api/apps/[slug]/identity — rename, re-slug, icon emoji, theme"

TASK 5 — Typecheck
Run: cd /Users/devante/Documents/Shippie && bun run typecheck 2>&1 | tail -25
Fix errors. Common: iconEmoji not in Drizzle schema type (ensure apps.ts edit was saved), appSlugRedirects missing from index.ts export.
Report all commits and any remaining type errors.`;

const COFFEE_PROMPT = `Implement Coffee app (lot.) visual polish for Shippie at /Users/devante/Documents/Shippie.
All files in: apps/showcase-coffee/src/

TASK 1 — styles.css performance + animation fixes
Read apps/showcase-coffee/src/styles.css first.
a) Remove transition from button:active — find "transition: opacity 0.08s;" inside button:active and remove that line only.
b) Add will-change: transform to .screen-enter and .slide-up rules (keep existing animation property, just add will-change).
c) Run: grep -rn "100vh" apps/showcase-coffee/src/ — replace every occurrence with 100dvh.
d) Add at the end of styles.css:
   @media (prefers-reduced-motion: reduce) {
     body::before { display: none; }
     .screen-enter, .slide-up { animation: none; }
   }
Commit: "fix(coffee): remove button:active transition, will-change on animations, 100dvh, reduced-motion"

TASK 2 — CoffeeSplash component
Create apps/showcase-coffee/src/components/CoffeeSplash.tsx:
  export function CoffeeSplash() {
    return (
      <>
        <svg className="coffee-splash coffee-splash-large" viewBox="0 0 240 240" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
          <g fill="#6b3a14">
            <path d="M120,20 C200,10 260,80 230,155 C200,230 120,250 60,200 C0,150 -20,60 60,20 C80,12 100,22 120,20Z" opacity="0.9" />
            <circle cx="218" cy="80" r="14" opacity="0.85" />
            <circle cx="232" cy="130" r="10" opacity="0.8" />
            <circle cx="190" cy="205" r="12" opacity="0.75" />
            <circle cx="75" cy="215" r="9" opacity="0.7" />
            <ellipse cx="95" cy="75" rx="38" ry="22" fill="rgba(255,210,160,0.18)" transform="rotate(-22 95 75)" />
          </g>
        </svg>
        <svg className="coffee-splash coffee-splash-small" viewBox="0 0 120 120" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
          <g fill="#6b3a14">
            <path d="M60,8 C100,5 125,40 110,75 C95,110 55,120 25,100 C-5,80 -5,30 25,12 C38,5 50,10 60,8Z" opacity="0.9" />
            <circle cx="112" cy="38" r="8" opacity="0.8" />
            <circle cx="105" cy="68" r="6" opacity="0.75" />
            <circle cx="30" cy="108" r="5" opacity="0.7" />
            <ellipse cx="42" cy="38" rx="18" ry="10" fill="rgba(255,210,160,0.18)" transform="rotate(-18 42 38)" />
          </g>
        </svg>
      </>
    );
  }

Add these CSS rules to apps/showcase-coffee/src/styles.css (before the reduced-motion block):
  .coffee-splash {
    position: fixed; pointer-events: none; z-index: 0;
    opacity: 0; animation: splashEnter 1.2s ease forwards;
  }
  @keyframes splashEnter {
    from { opacity: 0; transform: scale(0.97); }
    to { opacity: 0.12; transform: scale(1); }
  }
  .coffee-splash-large { bottom: -8vw; right: -8vw; width: 48vw; max-width: 260px; }
  .coffee-splash-small { top: -4vw; left: -4vw; width: 24vw; max-width: 130px; animation-delay: 0.3s; }

Commit: "feat(coffee): CoffeeSplash SVG component — espresso liquid splash background"

TASK 3 — Wire CoffeeSplash into App.tsx
Read apps/showcase-coffee/src/App.tsx lines 1-30 (import section).
Add: import { CoffeeSplash } from './components/CoffeeSplash.tsx';
In the App() return statement, wrap in fragment and place CoffeeSplash first:
  return (
    <>
      <CoffeeSplash />
      {/* existing JSX here */}
    </>
  );
Read the current return statement shape first to understand how to wrap it correctly.
Commit: "feat(coffee): add CoffeeSplash to App root"

TASK 4 — useMemo for derived values
Read apps/showcase-coffee/src/App.tsx lines 70-120.
After the useState<Store> line, add useMemo for the most-called derived values:
  import { useEffect, useMemo, useState, type ReactNode } from 'react'; (update the existing import)
  const derivedBags = useMemo(() => bagsByStatus(store.bags), [store.bags]);
Replace any direct inline calls to bagsByStatus(store.bags) in JSX with derivedBags.
Only do this for bagsByStatus — don't over-engineer other calls.
Commit: "perf(coffee): useMemo for bagsByStatus to reduce renders"

TASK 5 — Build check
Run: cd /Users/devante/Documents/Shippie/apps/showcase-coffee && bun run build 2>&1 | tail -20
Fix any errors. Report results.`;

const results = await parallel([
  () => agent(PLATFORM_PROMPT, { label: 'platform-fixes-v2', phase: 'Round 2', isolation: 'worktree' }),
  () => agent(MAKER_PROMPT, { label: 'maker-backend-v2', phase: 'Round 2', isolation: 'worktree' }),
  () => agent(COFFEE_PROMPT, { label: 'coffee-polish-v2', phase: 'Round 2', isolation: 'worktree' }),
]);

log('Round 2 done. ' + results.filter(Boolean).length + '/3 agents completed.');

// Merge
phase('Merge');
const mergeResult = await agent(`Merge all worktree branches into feat/dock-harmonization for Shippie at /Users/devante/Documents/Shippie.

Steps:
1. git branch -a | grep worktree | head -20
2. For each worktree-* branch: check if it has commits ahead of feat/dock-harmonization:
   git log --oneline feat/dock-harmonization..<branch> 2>/dev/null | wc -l
3. If it has new commits, merge it:
   git checkout feat/dock-harmonization
   git merge --no-ff <branch> -m "merge: <branch> into sprint"
4. If there are conflicts: resolve by keeping both changes (they are in different files)
5. After all merges: git log --oneline -10

Report: which branches were merged, any conflicts, final log.`,
  { label: 'merge-v2', phase: 'Merge' });

// Health
phase('Health');
const healthResult = await agent(`Run health check for Shippie at /Users/devante/Documents/Shippie on branch feat/dock-harmonization.

Run:
1. git status
2. cd /Users/devante/Documents/Shippie && bun run typecheck 2>&1 | tail -25
3. bun run test 2>&1 | grep -E "pass|fail|FAIL" | tail -10
4. bun run build 2>&1 | tail -15

Common fixes if typecheck fails:
- 'warning' missing from ToastKind: read apps/platform/src/lib/stores/toast.ts, add 'warning' to the type union
- appSlugRedirects missing: ensure apps/platform/src/lib/server/db/schema/index.ts has export * from './app-slug-redirects'
- iconEmoji type error: ensure apps/platform/src/lib/server/db/schema/apps.ts has iconEmoji field

Report pass/fail for each step and any fixes applied.`,
  { label: 'health-v2', phase: 'Health' });

return {
  round2: results.filter(Boolean).length + '/3 agents succeeded',
  merge: mergeResult,
  health: healthResult,
};
