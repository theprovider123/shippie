# Platform Fixes — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship 5 cross-cutting platform fixes: visibility P0 bug, offline UX indicator, PWA manifest, OG cleanup, and app update UX.

**Architecture:** All changes are in `apps/platform/`. No new packages needed. Visibility fix is a 3-line client change + warning toast. Offline indicator adds a readable store + ToolRow/ToolCard sub-labels. PWA/OG are manifest/head tag tweaks. Update UX adds a dedicated update flow.

**Tech Stack:** SvelteKit 5 runes (`$state`, `$derived`, `$effect`), Cloudflare Workers KV, Drizzle ORM on D1.

**Branch:** `feat/dock-harmonization`

---

## Task 1: Visibility P0 — surface `metadata_synced: false` to the user

**Root cause:** `env.CACHE` KV binding IS set in `wrangler.toml`. But if `setAppVisibility` returns `metadataSynced: false` (e.g. KV write failed, or in dev), `VisibilityPicker.svelte` shows "Visibility set to X" regardless. The Worker reads only from KV, so the D1 change is invisible to it.

**Files:**
- Modify: `apps/platform/src/lib/components/dashboard/VisibilityPicker.svelte`

- [ ] **Step 1: Open `VisibilityPicker.svelte` and read the `onChange` function**

The current success path just sets `scope = next` and shows a success toast with no check of `metadata_synced`.

- [ ] **Step 2: Add metadata_synced check after the fetch**

```svelte
// After: if (!res.ok) { ... return; }
const j = (await res.json()) as { success: boolean; visibility_scope: string; metadata_synced: boolean };
scope = j.visibility_scope as Scope ?? next;
if (j.metadata_synced === false) {
  toast.push({ kind: 'warning', message: `Visibility set to ${next}. Changes may take up to 30 s to go live.` });
} else {
  toast.push({ kind: 'success', message: `Visibility set to ${next}.` });
}
void invalidate('app:apps');
```

Replace the existing `scope = next; toast.push(...)` block in the `if (!res.ok)` else branch with the above. Remove the old `toast.push({ kind: 'success', ... })` call since we now always toast after the JSON parse.

- [ ] **Step 3: Verify the toast store supports `'warning'` kind**

Run: `grep -n "warning\|kind" apps/platform/src/lib/stores/toast.ts | head -20`

If `warning` isn't a valid kind, add it or map it to `error` temporarily:
```ts
// In toast store, add 'warning' to the Kind union if not present:
export type ToastKind = 'success' | 'error' | 'warning';
```

- [ ] **Step 4: Commit**

```bash
git add apps/platform/src/lib/components/dashboard/VisibilityPicker.svelte apps/platform/src/lib/stores/toast.ts
git commit -m "fix: surface metadata_synced:false in VisibilityPicker as a warning toast"
```

---

## Task 2: Offline network status store

**Files:**
- Create: `apps/platform/src/lib/stores/network-status.ts`

- [ ] **Step 1: Create the store**

```ts
import { readable } from 'svelte/store';

/** True when the browser has network. Seeds from navigator.onLine so SSR-safe. */
export const isOnline = readable(true, (set) => {
  if (typeof window === 'undefined') return;
  set(navigator.onLine);
  const on = () => set(true);
  const off = () => set(false);
  window.addEventListener('online', on);
  window.addEventListener('offline', off);
  return () => {
    window.removeEventListener('online', on);
    window.removeEventListener('offline', off);
  };
});
```

- [ ] **Step 2: Commit**

```bash
git add apps/platform/src/lib/stores/network-status.ts
git commit -m "feat: add isOnline readable store (seeds from navigator.onLine)"
```

---

## Task 3: ToolRow offline indicator — amber pill + sub-label

Replace the grey `dot-offline` dot (currently shown when `offlineReady === true`) with a context-aware sub-label shown when the device is offline.

**Files:**
- Modify: `apps/platform/src/lib/components/tool-surface/ToolRow.svelte`

- [ ] **Step 1: Import the network store**

At the top of `<script lang="ts">`:
```ts
import { isOnline } from '$lib/stores/network-status';
```

- [ ] **Step 2: Add derived offline sub-label**

After the existing `const offlineReady = ...` line:
```ts
const offlineSubLabel = $derived(
  !$isOnline
    ? offlineReady
      ? '● ready offline'
      : '● not saved'
    : ''
);
const showOfflineLabel = $derived(!$isOnline && offlineSubLabel !== '');
```

- [ ] **Step 3: Update the `rowInner` snippet — replace the dot**

Remove:
```svelte
{#if offlineReady}
  <span class="dot dot-offline" aria-hidden="true" title="Saved offline"></span>
{/if}
```

Add offline sub-label in the `row-body` block, inside `.row-status`:
```svelte
{#if showOfflineLabel}
  <span class="row-offline-label" class:ready={offlineReady}>{offlineSubLabel}</span>
{/if}
```

Place it AFTER the `{#if showRel}` block so it reads beneath the relationship label.

Update `hasStatus`:
```ts
const hasStatus = $derived(showRel || isSaving || showCaption || showOfflineLabel);
```

- [ ] **Step 4: Add CSS for the offline sub-label**

```css
.row-offline-label {
  font-family: var(--font-mono);
  font-size: var(--text-caption);
  color: var(--text-secondary);
  white-space: nowrap;
}
.row-offline-label.ready {
  color: var(--amber, #f5a623);
}
```

- [ ] **Step 5: Keep the `.dot-offline` CSS but delete the dot render** (CSS can stay; it's used nowhere visible now but don't break older references).

- [ ] **Step 6: Commit**

```bash
git add apps/platform/src/lib/components/tool-surface/ToolRow.svelte
git commit -m "feat: replace dot-offline with amber/grey sub-label when device is offline"
```

---

## Task 4: ToolCard offline indicator

**Files:**
- Modify: `apps/platform/src/lib/components/tool-surface/ToolCard.svelte`

- [ ] **Step 1: Read ToolCard.svelte** — it has a similar `dot-offline` pattern; apply the same network store import and sub-label approach as ToolRow. The card variant doesn't have a `row-status` area — add a `card-offline-label` below the card name in the `tileInner` snippet.

- [ ] **Step 2: Follow the same 4 sub-steps as Task 3** (import store, add derived label, replace dot, add CSS).

- [ ] **Step 3: Commit**

```bash
git add apps/platform/src/lib/components/tool-surface/ToolCard.svelte
git commit -m "feat: ToolCard offline sub-label (matches ToolRow treatment)"
```

---

## Task 5: Section-level offline pill in the dock/drawer layout

When offline, show an amber "offline" pill next to the Dock / Tools section heading.

**Files:**
- Find: `apps/platform/src/routes/dock/+page.svelte` or the shell layout that wraps the tool sections. Run `grep -rn "Dock\|Tools\|section.*head" apps/platform/src/routes/dock/ | head -20` to identify the right file.

- [ ] **Step 1: Import isOnline** in the relevant layout/page file.

- [ ] **Step 2: Add the pill** in each section heading:
```svelte
<div class="section-head">
  <h2>Dock</h2>
  {#if !$isOnline}
    <span class="offline-pill" aria-label="You are offline">offline</span>
  {/if}
</div>
```

- [ ] **Step 3: Add CSS**:
```css
.offline-pill {
  display: inline-flex;
  align-items: center;
  padding: 2px 8px;
  background: rgba(245, 166, 35, 0.15);
  border: 1px solid rgba(245, 166, 35, 0.4);
  color: var(--amber, #f5a623);
  font-family: var(--font-mono);
  font-size: var(--text-caption);
  border-radius: 999px;
}
```

- [ ] **Step 4: Commit**

```bash
git add apps/platform/src/routes/dock/+page.svelte
git commit -m "feat: amber offline pill in dock/tools section heading when device is offline"
```

---

## Task 6: PWA manifest — screenshots + prefer_related_applications

**Files:**
- Modify: `apps/platform/src/routes/manifest.webmanifest/+server.ts`

- [ ] **Step 1: Add `prefer_related_applications: false`**

In the `manifest` object, add:
```ts
prefer_related_applications: false,
```

- [ ] **Step 2: Add `screenshots` array** (two entries — narrow phone + wide tablet):
```ts
screenshots: [
  {
    src: '/__shippie-pwa/screenshot-narrow.png',
    sizes: '390x844',
    type: 'image/png',
    form_factor: 'narrow',
    label: 'Shippie Dock — your saved tools, offline-ready',
  },
  {
    src: '/__shippie-pwa/screenshot-wide.png',
    sizes: '1280x800',
    type: 'image/png',
    form_factor: 'wide',
    label: 'Shippie Tools — browse and save tools to your Dock',
  },
],
```

- [ ] **Step 3: Add placeholder screenshot PNGs to static/__shippie-pwa/**

The screenshots just need to exist so the manifest doesn't 404. Create minimal placeholder PNGs:
```bash
# Create 1x1 placeholder PNGs (they'll be replaced with real screenshots later)
node -e "
const {createCanvas} = require('canvas'); // if available
" 2>/dev/null || true
# Simpler: copy existing icon as placeholder for now
cp apps/platform/static/__shippie-pwa/icon.svg apps/platform/static/__shippie-pwa/screenshot-narrow.svg 2>/dev/null || true
```

If canvas isn't available, create a minimal 390×844 PNG programmatically or copy the icon resized. The key is the manifest field exists. Note in a TODO to replace with real screenshots.

- [ ] **Step 4: Commit**

```bash
git add apps/platform/src/routes/manifest.webmanifest/+server.ts
git commit -m "feat: add prefer_related_applications:false + screenshots to PWA manifest"
```

---

## Task 7: OG cleanup — app-first share cards

**Files:**
- Modify: `apps/platform/src/routes/apps/[slug]/+page.svelte`

- [ ] **Step 1: Fix `<svelte:head>` block**

Replace the existing head block:
```svelte
<svelte:head>
  <title>{data.app.name} — Shippie</title>
  <meta name="description" content={data.app.tagline ?? data.app.description ?? `${data.app.name} on Shippie`} />
  <meta property="og:title" content={`${data.app.name} — Shippie`} />
  <meta property="og:description" content={data.app.tagline ?? data.app.description ?? `${data.app.name} on Shippie`} />
  <meta property="og:type" content="website" />
  {#if ogImage}<meta property="og:image" content={ogImage} />{/if}
  <meta name="twitter:card" content="summary" />
  <meta name="twitter:title" content={data.app.name} />
  <meta name="twitter:description" content={data.app.tagline ?? `${data.app.name} on Shippie`} />
  {#if ogImage}<meta name="twitter:image" content={ogImage} />{/if}
</svelte:head>
```

With:
```svelte
<svelte:head>
  <title>{data.app.name}</title>
  <meta name="description" content={data.app.tagline ?? data.app.description ?? `${data.app.name} on Shippie`} />
  <meta property="og:title" content={data.app.name} />
  <meta property="og:site_name" content="Shippie" />
  <meta property="og:description" content={data.app.tagline ?? data.app.description ?? `${data.app.name} on Shippie`} />
  <meta property="og:type" content="website" />
  {#if ogImage}<meta property="og:image" content={ogImage} />{/if}
  <meta name="twitter:card" content={ogImage ? 'summary_large_image' : 'summary'} />
  <meta name="twitter:title" content={data.app.name} />
  <meta name="twitter:description" content={data.app.tagline ?? `${data.app.name} on Shippie`} />
  {#if ogImage}<meta name="twitter:image" content={ogImage} />{/if}
</svelte:head>
```

- [ ] **Step 2: Also update the title in `apps/platform/src/routes/run/[slug]/+page.svelte`** if it exists and has the same pattern:

```bash
grep -n "og:title\|— Shippie" apps/platform/src/routes/run/*/+page.svelte 2>/dev/null | head -10
```

Apply the same fix if found.

- [ ] **Step 3: Commit**

```bash
git add apps/platform/src/routes/apps/\[slug\]/+page.svelte
git commit -m "fix: app-first og:title (remove '— Shippie' suffix), add og:site_name"
```

---

## Task 8: Health check

- [ ] **Step 1: Run typecheck**

```bash
cd /Users/devante/Documents/Shippie && bun run typecheck 2>&1 | tail -20
```

Expected: 0 errors.

- [ ] **Step 2: Run tests**

```bash
cd /Users/devante/Documents/Shippie && bun run test 2>&1 | grep -E "pass|fail|error" | tail -10
```

Expected: all passing.

- [ ] **Step 3: Fix any type errors** before moving on. Common ones: if `ToastKind` union doesn't include `'warning'`, the VisibilityPicker change will fail typecheck.
