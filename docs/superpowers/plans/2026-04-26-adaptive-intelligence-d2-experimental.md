# Adaptive Intelligence — Experimental (D2) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Two experimental capabilities on top of D1's foundation. (1) **Spatial memory** — the wrapper learns which physical context (WiFi network) the user is in and tags pattern data with it, so apps can ask "is the user in their typical kitchen-cooking context?". (2) **Predictive preload** — the wrapper pre-renders likely next pages based on D1's frequent-paths data, making the UX feel zero-latency on common navigation.

**Status when this lands:** experimental. Both subsystems ship behind a `shippie.json` opt-in. They're shippable v1 quality but the heuristics need tuning on real devices before promoting to the always-on default set.

**Hard prerequisites:** Plan D1 merged (`@shippie/intelligence` package + storage + pattern tracker).

---

## File Structure

**Modified `@shippie/intelligence`:**
- `src/spatial-memory.ts` (new)
- `src/predictive-preload.ts` (new)
- `src/storage.ts` — add `appendSpaceObservation`, `currentSpaceFingerprint`
- `src/index.ts` — export `currentSpace`, `enablePredictivePreload`

---

## Task 1: Spatial fingerprinting

**Background:** WebRTC's `RTCPeerConnection.getStats()` exposes the local interface's IP address. Browser fingerprinting protections (Safari, Brave) may block this; on those browsers, fall back to coarse geolocation cluster (rounded to 0.001° = ~100m). The fingerprint is a SHA-256 hash, never the raw value.

**Files:** `src/spatial-memory.ts` + test.

- [ ] **Step 1: Tests** — fake getUserMedia/RTCPeerConnection/geolocation; assert the fingerprint is stable across calls in the same context, different across contexts. Assert raw IP/coords never appear in the returned value.

- [ ] **Step 2: Implementation:**

```typescript
export interface SpaceFingerprint {
  /** SHA-256 hex of (preferred WiFi-derived signal OR rounded geo). */
  id: string;
  /** Source signal — for diagnostics, not user-facing. */
  source: 'wifi' | 'geo' | 'unavailable';
  /** Maker-set label. Default null until user names the space. */
  label: string | null;
  /** ms when first observed. */
  firstSeenAt: number;
  /** ms of most recent observation. */
  lastSeenAt: number;
  /** Number of observations in this space. */
  observations: number;
}

export async function currentSpace(): Promise<SpaceFingerprint | null> {
  const fingerprint = await fingerprint();
  if (!fingerprint) return null;
  return updateSpaceObservation(fingerprint);
}

async function fingerprint(): Promise<{ id: string; source: 'wifi' | 'geo' } | null> {
  const wifi = await tryWifiFingerprint();
  if (wifi) return { id: wifi, source: 'wifi' };
  const geo = await tryGeoFingerprint();
  if (geo) return { id: geo, source: 'geo' };
  return null;
}
```

`tryWifiFingerprint`: build a peer connection, gather candidates, hash the local IP. `tryGeoFingerprint`: `navigator.geolocation.getCurrentPosition`, round to 0.001°, hash. Both wrapped in try/catch returning null on any failure (permission denied, API absent, timeout > 1s).

- [ ] **Step 3:** Storage adds a `spaces` store keyed by fingerprint id; `updateSpaceObservation` upserts. Pattern data optionally tagged with `spaceId` so D1's `patterns()` can scope queries by space when caller passes `{spaceId}`.

- [ ] **Step 4:** Manual UX consideration — the maker can offer the user "label this space?" the second time they're observed in it. Out of scope for this plan beyond exposing `setSpaceLabel(id, label)`.

- [ ] **Step 5:** Commit.

---

## Task 2: Predictive preload

**Files:** `src/predictive-preload.ts` + test.

- [ ] **Step 1: Tests** — feed a synthetic `frequentPaths` rollup, simulate landing on the first page of a sequence, assert `predictNextPage(currentPath)` returns the next page in the most-frequent matching sequence with `confidence` proportional to occurrence ratio.

- [ ] **Step 2: Implementation:**

```typescript
export interface NextPagePrediction {
  url: string;
  confidence: number; // 0..1
}

export async function predictNextPage(currentPath: string): Promise<NextPagePrediction | null> {
  const p = await patterns();
  // Find sequences where currentPath appears, score by frequency * length-from-end.
  const candidates = new Map<string, number>();
  for (const seq of p.frequentPaths) {
    const idx = seq.indexOf(currentPath);
    if (idx === -1 || idx === seq.length - 1) continue;
    const next = seq[idx + 1]!;
    candidates.set(next, (candidates.get(next) ?? 0) + 1);
  }
  if (candidates.size === 0) return null;
  const sorted = [...candidates].sort((a, b) => b[1] - a[1]);
  const total = sorted.reduce((s, [, n]) => s + n, 0);
  return { url: sorted[0]![0], confidence: sorted[0]![1] / total };
}

export function enablePredictivePreload(opts?: { confidenceThreshold?: number }): () => void {
  const threshold = opts?.confidenceThreshold ?? 0.7;
  const handler = () => {
    void (async () => {
      const next = await predictNextPage(window.location.pathname);
      if (!next || next.confidence < threshold) return;
      preloadUrl(next.url);
    })();
  };
  // Run on initial load and after every history change.
  handler();
  window.addEventListener('shippie:pageview', handler);
  return () => window.removeEventListener('shippie:pageview', handler);
}

function preloadUrl(url: string): void {
  if (document.querySelector(`link[rel="prefetch"][href="${url}"]`)) return;
  const link = document.createElement('link');
  link.rel = 'prefetch';
  link.href = url;
  document.head.appendChild(link);
}
```

- [ ] **Step 3:** Commit.

---

## Task 3: Opt-in via shippie.json + dashboard surface

- [ ] **Step 1: Extend the catalog** in `apps/web/app/dashboard/[appSlug]/enhancements/catalog.ts` with two new entries:
  - `id: 'spatial'`, `snippet: { intelligence: { spatial: true } }`, blurb: "Notice when the user is in their typical kitchen / desk / commute and adapt accordingly."
  - `id: 'predictive-preload'`, `snippet: { intelligence: { predictivePreload: true } }`, blurb: "Pre-render the page the user usually visits next. Feels instant."

- [ ] **Step 2: Wire into observe-init.ts** — when `shippie.json` opts in, call `currentSpace()` once on app open (records the observation) and `enablePredictivePreload()`.

- [ ] **Step 3:** Update the catalog test (Plan G Task 2) to cover the two new ids.

- [ ] **Step 4:** Commit.

---

## Task 4: Real-device validation (manual)

- [ ] **On a phone** — install the Recipe showcase. Use it on Wi-Fi at home for several sessions. Open `/dashboard/recipe-saver/enhancements`. Confirm the spatial fingerprint records but stays unlabeled. (Labeling UI deferred.)

- [ ] **On the same phone** — repeat a navigation pattern (home → recipe list → specific recipe → back) several times. Then start a fresh navigation from home. Confirm the next page renders without the network round-trip — devtools should show the prefetch landed before the click.

- [ ] If predictive-preload is too aggressive (preloading wrong pages on first navigation) tune the confidence threshold up.

- [ ] Commit any tuning.

---

## Done When

- [ ] `currentSpace()` returns a stable fingerprint on a phone moved between two Wi-Fi networks
- [ ] `predictNextPage()` returns the empirically most-frequent next page given recent navigation
- [ ] `<link rel="prefetch">` appears on app open when a confident prediction exists
- [ ] Both opt-in via `shippie.json` and visible in the dashboard catalog
- [ ] No network egress beyond the initial geolocation prompt (if used) — confirm with devtools

## NOT in this plan (deferred)

- Space-aware UI (e.g. recipe app shows kitchen-mode UI when in the labelled "kitchen" space). Belongs in a per-app showcase plan.
- Predictive prerendering with full DOM mounting (vs prefetch). The Speculation Rules API would be the upgrade — defer until Safari supports it.
- Cross-app spatial cues — Plan F.
- Persistence-policy controls (forget this space) in a settings panel — out of scope.
