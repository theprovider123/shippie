# Round 5 — Side tings · handoff for codex

> Companion to `2026-05-23-parade-companion-round5-side-tings.md`.
> Spec lives there; **this doc** is the implementation hand-off.
> Status when written: branch clean + committed, **typecheck · 31/31 tests · build all green** with the new files in the working tree.

---

## What I shipped (uncommitted, working tree)

Six new files, all in the design language (paper / sharp / mono / Arsenal red · sage · gold). No edits to existing files; codex picks them up and wires them in.

| File | Purpose |
|---|---|
| `apps/showcase-parade-companion/src/lib/side-tings.ts` | Storage + cap (5) + `chipForGroupName` (2-letter mono cap). Self-contained — no shippie-db schema change for parade day. |
| `apps/showcase-parade-companion/src/lib/side-tings.test.ts` | 6 bun-tests covering add/list/duplicate/cap/remove/touch/chip derivation. |
| `apps/showcase-parade-companion/src/components/SideTingsCard.tsx` | The "Side tings" card for the Group screen: list + chip + last-seen + remove + add CTA. |
| `apps/showcase-parade-companion/src/components/ImportPreviewSheet.tsx` | Two-button import dialog (**Watch on map** · **Join group**) with sender-`roleHint` pre-ordering. |
| `apps/showcase-parade-companion/src/components/LayerToggleRow.tsx` | Tiny chip row above the map: Bus · Friends · Side tings · Reports · My taps. Reuses the design palette. |
| `apps/showcase-parade-companion/src/components/ShareMyDotEmptyState.tsx` | "Just you" card for solo users — the **Share my dot** affordance that creates a one-person group. |

---

## CSS to append to `apps/showcase-parade-companion/src/styles.css`

Paste at the end of the file (after the `@media (prefers-reduced-motion: reduce)` block). Uses only existing tokens — no new colours, no new fonts.

```css
/* ----- Side tings card (Group screen) ----- */
.side-tings-card { padding: 16px; }
.side-tings-card__header {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 12px;
}
.side-tings-card__header h2 { margin: 0; }
.side-tings-card__add {
  min-width: 0;
  padding: 6px 10px;
  font-size: 12px;
}
.side-tings-card__empty {
  margin: 12px 0 0;
  color: var(--ink-mute);
  font-family: var(--mono);
  font-size: 12px;
  line-height: 1.4;
}
.side-tings-card__list {
  list-style: none;
  margin: 12px 0 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.side-tings-card__row {
  display: grid;
  grid-template-columns: 28px 1fr 28px;
  gap: 10px;
  align-items: center;
  padding: 8px 0;
  border-top: 1px solid var(--line);
}
.side-tings-card__row:first-child { border-top: 0; }
.side-tings-card__chip {
  display: grid;
  place-items: center;
  width: 28px;
  height: 28px;
  background: var(--gold);
  color: var(--ink);
  font-family: var(--mono);
  font-size: 11px;
  font-weight: 700;
  letter-spacing: .04em;
  border: 1px solid var(--ink);
}
.side-tings-card__meta {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}
.side-tings-card__meta strong {
  font-family: var(--sans);
  font-weight: 600;
  font-size: 13px;
  color: var(--ink);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.side-tings-card__meta small {
  font-family: var(--mono);
  font-size: 10px;
  letter-spacing: .04em;
  color: var(--ink-mute);
}
.side-tings-card__remove {
  width: 28px;
  height: 28px;
  padding: 0;
  border: 1px solid var(--line-strong);
  background: var(--paper);
  color: var(--ink-dim);
  font-size: 18px;
  line-height: 1;
  cursor: pointer;
}
.side-tings-card__remove:active { transform: translateY(1px); }

/* ----- Import preview modal (Join vs Watch) ----- */
.import-preview {
  position: fixed;
  inset: 0;
  z-index: 998;
  display: grid;
  place-items: end center;
  padding: 16px;
  background: rgba(20, 18, 15, .42);
}
@media (min-width: 561px) { .import-preview { place-items: center; } }
.import-preview__surface {
  width: min(100%, 420px);
  padding: 18px 18px 16px;
  background: var(--paper);
  border: 1px solid var(--line-strong);
  border-top: 3px solid var(--red);
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.import-preview__title {
  margin: 4px 0 0;
  font-family: var(--serif);
  font-style: italic;
  font-weight: 500;
  font-size: 1.5rem;
  line-height: 1.05;
  color: var(--ink);
}
.import-preview__meta {
  margin: 0;
  font-family: var(--mono);
  font-size: 11px;
  letter-spacing: .02em;
  color: var(--ink-dim);
}
.import-preview__fallback {
  margin: 0;
  font-family: var(--mono);
  font-size: 11px;
  color: var(--ink-mute);
}
.import-preview__actions {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
  margin-top: 8px;
}
.import-preview__actions button {
  min-height: 44px;
  padding: 8px 12px;
}
.import-preview__actions button[disabled] {
  opacity: .5;
  cursor: not-allowed;
}
.import-preview__dismiss {
  margin: 2px auto 0;
  background: transparent;
  border: none;
  color: var(--ink-mute);
  font-family: var(--mono);
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: .08em;
  cursor: pointer;
}

/* ----- Map layer toggle row ----- */
.layer-toggle-row {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  margin: 6px 0;
}
.layer-toggle {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  min-height: 28px;
  padding: 4px 8px;
  border: 1px solid var(--line-strong);
  background: var(--paper);
  color: var(--ink);
  font-family: var(--mono);
  font-size: 10px;
  letter-spacing: .04em;
  cursor: pointer;
}
.layer-toggle:active { transform: translateY(1px); }
.layer-toggle.is-off { color: var(--ink-faint); border-color: var(--line); }
.layer-toggle.is-off .layer-toggle__dot { opacity: .35; }
.layer-toggle__dot {
  width: 8px;
  height: 8px;
  background: var(--ink);
}
.layer-toggle--bus .layer-toggle__dot { background: var(--red); }
.layer-toggle--friends .layer-toggle__dot { background: var(--sage); }
.layer-toggle--side-tings .layer-toggle__dot { background: var(--gold); }
.layer-toggle--reports .layer-toggle__dot { background: var(--ink); }
.layer-toggle--my-taps .layer-toggle__dot { background: var(--red-deep); }

/* ----- "Just you" empty state ----- */
.share-my-dot { padding: 16px; }
.share-my-dot h2 {
  margin: 0 0 6px;
  font-family: var(--serif);
  font-style: italic;
  font-weight: 500;
  font-size: 1.5rem;
  color: var(--ink);
}
.share-my-dot p {
  margin: 0 0 12px;
  color: var(--ink-dim);
  font-size: 13px;
  line-height: 1.45;
}
.share-my-dot .primary-action { min-width: 0; padding: 10px 14px; }
```

---

## Integration tasks for codex

Five existing files to wire up. Each section is a focused diff sketch — apply, run `bun run typecheck && bun test src && bun run build`, commit.

### Task 1 — extend `SharePayload` to v2 in `src/lib/group-plan.ts`

Add the relay room + the role hint to `GroupPlan`, encode/decode through the existing `compactPlan`/`expandPlan` codec, **backwards-compatible** (v1 payloads still decode; room+role are optional).

```ts
// In src/lib/group-plan.ts

export interface RelayRoomRef {
  roomId: string;
  roomKey: string;
  issuedAt: string;
}

export interface GroupPlan {
  v: 1;
  name: string;
  members: string[];
  primary: PlanPoint;
  fallback: PlanPoint;
  ifSeparated: string;
  leavePlan?: string;
  note?: string;
  updatedAt: string;
  /** Optional relay room — present in v2 share payloads, absent in v1. */
  room?: RelayRoomRef;
  /** Sender's hint for receiver's import preview. Receiver still chooses. */
  roleHint?: 'join' | 'watch';
}

function compactPlan(plan: GroupPlan): Record<string, unknown> {
  return {
    v: 1,
    n: plan.name,
    m: plan.members,
    p: compactPoint(plan.primary),
    f: compactPoint(plan.fallback),
    s: plan.ifSeparated,
    l: plan.leavePlan ?? '',
    o: plan.note ?? '',
    u: plan.updatedAt,
    // NEW (v2 add-ons — short keys; absent for v1 sends)
    r: plan.room ? [plan.room.roomId, plan.room.roomKey, plan.room.issuedAt] : undefined,
    z: plan.roleHint ?? undefined,
  };
}

function expandPlan(input: unknown): unknown {
  if (!isRecord(input) || input.v !== 1 || !('n' in input)) return input;
  const room = Array.isArray(input.r) && input.r.length >= 3
    ? { roomId: String(input.r[0] ?? ''), roomKey: String(input.r[1] ?? ''), issuedAt: String(input.r[2] ?? '') }
    : undefined;
  const roleHint = input.z === 'join' || input.z === 'watch' ? input.z : undefined;
  return {
    v: 1,
    name: input.n,
    members: input.m,
    primary: expandPoint(input.p),
    fallback: expandPoint(input.f),
    ifSeparated: input.s,
    leavePlan: input.l,
    note: input.o,
    updatedAt: input.u,
    room,
    roleHint,
  };
}

// Bump validateGroupPlan to pass through room + roleHint when present.
// (Validate roomId/roomKey are non-empty strings; otherwise drop them.)
```

Also add to `validateGroupPlan` so `room` + `roleHint` survive the round-trip when present and are dropped silently when malformed.

### Task 2 — replace the import banner with `ImportPreviewSheet` in `src/App.tsx`

The existing `pendingImport` flow shows a banner in `PlanScreen`. Swap it for the modal `ImportPreviewSheet` mounted at App level so the user gets the **two buttons** regardless of which tab they're on. Plumb `Watch on map` into `addSideTing(...)`.

```tsx
// New imports
import { ImportPreviewSheet, type ImportPreview } from './components/ImportPreviewSheet';
import { addSideTing } from './lib/side-tings';
import { showToast } from './lib/toast';

// New state next to pendingImport
const [importPreview, setImportPreview] = useState<{ preview: ImportPreview; plan: GroupPlan } | null>(null);
const [sideTingsRefresh, setSideTingsRefresh] = useState(0); // pass into Group screen

// In handleHash, replace the `setPendingImport(decoded); setActive('group');` branch with:
const decoded = await decodePlan(fragment);
if (cancelled || !decoded) return;
setImportPreview({
  preview: {
    name: decoded.name,
    members: decoded.members,
    primary: decoded.primary,
    fallback: decoded.fallback,
    hasLiveRoom: Boolean(decoded.room),
    roleHint: decoded.roleHint,
  },
  plan: decoded,
});
clearShareHash();

// Handlers
const onJoin = () => {
  if (!importPreview) return;
  setPendingImport(importPreview.plan);
  setImportPreview(null);
  setActive('group');
};
const onWatch = () => {
  const plan = importPreview?.plan;
  if (!plan?.room) return;
  const result = addSideTing({
    roomId: plan.room.roomId,
    roomKey: plan.room.roomKey,
    name: plan.name,
    memberCount: plan.members.length,
  });
  if (result.ok) {
    showToast(`Watching ${plan.name}`, 'success');
    setSideTingsRefresh((n) => n + 1);
  } else if (result.reason === 'duplicate') {
    showToast(`Already watching ${plan.name}`);
  } else {
    showToast(`Side tings full — remove one first`, 'warn');
  }
  setImportPreview(null);
  setActive('group');
};

// In the render tree, add (e.g. just before <ToastHost />):
<ImportPreviewSheet
  preview={importPreview?.preview ?? null}
  onJoin={onJoin}
  onWatch={onWatch}
  onDismiss={() => setImportPreview(null)}
/>

// Pass `sideTingsRefresh` to PlanScreen so SideTingsCard can re-list after an import.
```

### Task 3 — `PlanScreen.tsx`: insert `ShareMyDotEmptyState` + `SideTingsCard`

If there's no plan yet, render `ShareMyDotEmptyState` *above* the form. After the existing plan content, render `SideTingsCard`.

```tsx
// New imports
import { SideTingsCard } from '../components/SideTingsCard';
import { ShareMyDotEmptyState } from '../components/ShareMyDotEmptyState';

// New prop
interface PlanScreenProps {
  // ...existing
  sideTingsRefresh?: number;
}

// In the render
return (
  <section className="screen plan-screen">
    {!plan ? (
      <ShareMyDotEmptyState onShare={() => { /* same as save+share for a one-person group: name = "Just me", members = [you] */ }} />
    ) : null}

    {/* ...existing pendingImport banner can be removed — ImportPreviewSheet covers it... */}
    {/* ...existing plan form... */}

    <SideTingsCard
      onAdd={() => { /* open scanner/paste sheet — reuses whatever scan UI codex builds */ }}
      refreshKey={sideTingsRefresh}
    />
  </section>
);
```

The **"Share my dot"** handler should:
1. Build a one-person plan: `name = "Just me"` (or use the user's display name if available), `members = [<display name>]`, `primary` defaulted, `fallback` defaulted.
2. Generate a relay room (`roomId`, `roomKey`, `issuedAt`) — same generator used for multi-person groups.
3. Save the plan; open the existing QR share sheet so the user can show it to a friend.

### Task 4 — `MapScreen.tsx`: insert `LayerToggleRow`

Add layer-visibility state and the toggle row above the `CorridorMap`. Pass the visibility down so CorridorMap can skip-draw the muted layers.

```tsx
import { LayerToggleRow, type MapLayerId } from '../components/LayerToggleRow';
import { listSideTings } from '../lib/side-tings';

// State
const [layers, setLayers] = useState<Record<MapLayerId, boolean>>({
  bus: true,
  friends: true,
  'side-tings': listSideTings().length > 0,
  reports: true,
  'my-taps': true,
});

// In the render, above CorridorMap:
<LayerToggleRow
  layers={layers}
  onToggle={(id) => setLayers((current) => ({ ...current, [id]: !current[id] }))}
/>

// Pass `layers` into CorridorMap:
<CorridorMap pack={pack} gpsFix={gpsFix} plan={plan} busMarkers={busMarkers} fanEvents={fanEvents} layers={layers} />
```

### Task 5 — `CorridorMap.tsx`: render side ting dots + honour the layer toggle

Add `layers?: Record<MapLayerId, boolean>` to `CorridorMapProps`, default each to `true`, and gate each draw pass on the matching flag. Add a `drawSideTings` pass.

```ts
import { listSideTings, chipForGroupName } from '../lib/side-tings';
// Plus a source of side ting positions from the relay subscriptions
// codex is wiring up — e.g. a `sideTingPositions: SideTingPosition[]` prop.

interface SideTingPosition {
  roomId: string;
  lng: number;
  lat: number;
  accuracyM: number;
  createdAt: string;   // for last-seen fade
}

// In the useEffect that draws:
// (existing draws gated by layer flags)
if (layers?.bus !== false && busMarkers.length > 0) drawBusMarkers(ctx, busMarkers);
if (layers?.friends !== false && groupPositions?.length) drawGroupPositions(ctx, groupPositions);
if (layers?.['side-tings'] !== false && sideTingPositions?.length) {
  drawSideTings(ctx, sideTingPositions, listSideTings());
}
if (layers?.reports !== false) drawReports(ctx, ...);
if (layers?.['my-taps'] !== false) drawMyTaps(ctx, fanEvents);

function drawSideTings(
  ctx: CanvasRenderingContext2D,
  positions: SideTingPosition[],
  sideTings: SideTing[],
) {
  ctx.save();
  for (const pos of positions) {
    const st = sideTings.find((s) => s.roomId === pos.roomId);
    if (!st) continue;
    const ageMin = (Date.now() - Date.parse(pos.createdAt)) / 60_000;
    const stale = ageMin > 10;
    const point = lngLatToPixel(pos);
    // Gold dot, outlined when stale
    ctx.beginPath();
    ctx.arc(point.x, point.y, 22, 0, Math.PI * 2);
    ctx.fillStyle = stale ? 'rgba(237, 187, 74, 0.18)' : '#EDBB4A';
    ctx.fill();
    ctx.lineWidth = 4;
    ctx.strokeStyle = '#14120F';
    ctx.stroke();
    // 2-letter chip beside the dot
    const chip = chipForGroupName(st.name);
    drawLabel(ctx, chip, point.x + 30, point.y - 4);
  }
  ctx.restore();
}
```

Stale (> 10 min) goes outline-only so the user can see freshness at a glance.

---

## Verification

Run from `apps/showcase-parade-companion/`:

```bash
bun run typecheck && bun test src && bun run build
```

Expected: typecheck clean · all tests pass (31 + any codex adds) · build succeeds. CSS bundle will grow by ~2 KB after the styles paste.

Manual sanity once Tasks 1–5 are in:

1. Create a group → tap **Share QR** → copy URL.
2. Open URL in a fresh tab → `ImportPreviewSheet` appears with both buttons.
3. Tap **Watch on map** → side ting added; Group screen shows it; gold chip appears in the side tings list. Map layer toggle for **Side tings** lights up.
4. Tap **Join group** path → existing behaviour, becomes primary.
5. With no plan saved → Group screen shows **"Just you"** card → tap **Share my dot** → one-person group + QR shown.
6. Tap a layer pill above the map → that layer's dots mute/unmute.

---

## Decisions still open (from round-5 §9)

1. **Side ting cap — 5 (recommended) or different?** Hard-coded as `MAX_SIDE_TINGS = 5` in the shipped lib. Easy to change in one place.
2. **`?role=watch` hint behaviour — always-prompt with pre-order (recommended) or auto-accept?** `ImportPreviewSheet` already uses the hint to pre-order buttons; always-prompt is the default. To auto-accept, App.tsx could shortcut to `onWatch()` when `decoded.roleHint === 'watch'` — one line change.

---

## What's deliberately **not** done in this hand-off

- **No edits to existing files.** Avoids collisions with codex's parallel iteration. Wiring is in Tasks 1–5 above.
- **No `shippie-db.ts` schema change.** Side tings live in plain `localStorage` for parade day; codex can migrate later.
- **No publish/read key separation** (v1.1 hardening per §6 of the spec).
- **No scan/paste sheet for the "Add side ting" affordance** — `SideTingsCard.onAdd` is a hook for whatever scan UI codex builds (camera scan, paste-code field, etc.).
- **No relay subscription wiring** for side ting positions — that lives in codex's relay client work; `CorridorMap.drawSideTings` consumes whatever shape codex lands on.

---

## Hard rules (carry into review)

1. **Side tings are read-only.** Never expose a "publish to side ting" affordance in any UI.
2. **Every dot still carries age + source.** Side-ting dots fade to outline past 10 min.
3. **Cap 5.** Map stays legible.
4. **Solo is a first-class state.** Never a "no plan yet, app broken" screen.
5. **No discovery.** Codes only.
6. **Design language holds.** Paper · Arsenal red · sage · gold · mono-for-data · sharp corners.
