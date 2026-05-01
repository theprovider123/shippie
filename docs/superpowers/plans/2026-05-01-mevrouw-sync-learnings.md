# 2026-05-01 — Mevrouw sync debugging: learnings for Shippie at large

> Two phones, three deploys, one bug. What the mevrouw cross-device
> sync taught us about how Shippie should ship sync features in
> general, and where the platform has gaps that bit us.

---

## What happened (capsule)

Mevrouw is a couples PWA — two phones share a Y.Doc keyed off a couple
code. The "sync between two phones" promise was on the box but never
actually wired. Three deploys to land it:

1. `9a12dca` — added a `t: 'relay'` message type to the SignalRoom DO
   for opaque-bytes fan-out, plus a client RelayProvider in mevrouw
   that opens a WebSocket and ships encrypted Y.Doc updates over it.
2. `7ec2847` — fixed a real race: the open-handler called
   `sendStateVector()` immediately, but PBKDF2 key derivation takes
   ~50ms on a real device, so the encrypted send silently bailed. The
   peer never received initial state. Added a `whenKey()` deferral
   queue, exposed observable `RelayState` + `subscribe`, added an
   in-app SyncStatus panel + "Sync now" button + pull-to-refresh.
3. (this commit) — InstallNudge dismiss is now a 7-day cooldown
   keyed on a timestamp, plus an `appinstalled` event handler so the
   nudge clears automatically when the user installs from the share
   sheet (rather than persisting in the still-open browser tab).

End-to-end live verification: a Node script connected two clients to
`wss://shippie.app/__shippie/signal/<roomId>`, exchanged hello + relay
frames, and confirmed the DO fans out (sender excluded, peerId stamped).
The wire path is sound; the bug had been client-side throughout.

---

## What this should change about how Shippie ships sync

### 1. Observable-by-default for any provider that owns a connection

The relay sat broken for two deploys partly because there was nowhere
to look. No status, no console logs, no peer count, no last-error.
Field debugging was impossible. **Every connection-owning module in
Shippie should expose a state object + a `subscribe(handler)` API the
moment it's introduced — not as polish later.**

The pattern:

```ts
interface ConnectionState {
  status: 'connecting' | 'open' | 'closed';
  peerCount?: number;
  lastActivity: number | null;
  lastError: { at: number; message: string } | null;
  // Anything else useful for "why isn't this working" diagnosis
}

interface Connection extends ConnectionState {
  subscribe(handler: (state: ConnectionState) => void): () => void;
  // Recovery affordance — closes + reopens the underlying transport
  reconnect(): void;
}
```

Plus a `console.info('[<feature>] ...', ...)` log at every
state-changing event (open, close, message, error). When a user reports
"it's not working," the first ask becomes "open Web Inspector and paste
the [feature] lines" — concrete signal in seconds rather than rounds of
back-and-forth.

This applies to: container bridge, AI worker, push subscription, OAuth
coordinator, any future sync transport.

### 2. Async preconditions need a queue, not a check

The bug that bit us:

```ts
socket.onopen = () => {
  socket.send(hello);
  void sendStateVector(); // ← key might not be ready; fails silent
};
```

`sendStateVector` checks `if (!key) return;` and bails. Open + key are
two independent async preconditions; the open handler fires first and
the send dies. Fix:

```ts
const onKeyReady: (() => void)[] = [];
function whenKey(fn: () => void): void {
  if (key) fn();
  else onKeyReady.push(fn);
}

socket.onopen = () => {
  socket.send(hello);
  whenKey(() => void sendStateVector());
};
```

Pattern: **when an action depends on N async preconditions, build a
deferral queue per precondition. Do not silently early-return when one
isn't ready.** This is a common bug shape across the codebase wherever
we're racing crypto + network + storage. Worth documenting in
`@shippie/sdk` as a primitive (`createGate(...predicates).whenReady(fn)`).

### 3. Stale-while-revalidate showcase bundles need an explicit user-facing recovery

The user reloaded twice and still saw old behavior because the SW's
stale-while-revalidate served cached `/run/mevrouw/index.html` with
old chunk hashes on the FIRST reload, the background fetch updated
the cache, then the SECOND reload picked up the new bundle. Painful
when iterating on a showcase fix.

Two improvements worth pursuing:

- **Showcase-update banner.** Same pattern as `25575b2`'s platform
  PWA-update-banner, but per-showcase. Showcase HTML carries the
  `__shippie-assets.json` `buildId` from commit `32b367f` as a
  `<meta>` tag; runtime compares against the current network value;
  if mismatch, banner says "New version of <Showcase> ready · Tap to
  refresh."
- **Force-refresh control in the container.** A small "↻" button in
  the focused-mode shell (next to the existing `.focused-exit-pill`)
  that hard-bypasses the SW cache for the active showcase. One tap
  guarantees a fresh bundle.

Both belong in the platform, not in each showcase. File a
`docs/superpowers/plans/...` if/when actually building.

### 4. The proximity protocol's "public IP" coupling needs an off-switch

`@shippie/proximity`'s `deriveRoomId(publicIp, appSlug, groupCode)`
locks the room id to the device's NAT-visible IP. That's correct for
Live Room (couples-in-the-same-room buzzer fairness) but **wrong for
mevrouw** (couples in different cities). We sidestepped it by going
direct to SignalRoom's relay. But this is a recurring constraint —
any future "two phones anywhere" showcase will hit it.

Recommendation: extend `@shippie/proximity` with a `mode: 'local' |
'global'` option on `createGroup`/`joinGroup`. Local (default) hashes
the public IP; global skips it. Document the trade-offs in the
package README so showcase makers don't reinvent the relay each time.

### 5. SignalRoom is becoming a generic relay; document that

The DO was originally pure WebRTC signalling — hello/offer/answer/ice
fan-out before peers go P2P. The new `t: 'relay'` type makes it ALSO
a steady-state opaque-bytes fan-out. That's a meaningful expansion.

The DO header comment was updated in `9a12dca` but the broader
proximity protocol docs (`packages/proximity/README.md` if it exists,
or the inline comments) should reflect this. Two distinct usage
modes: P2P-bootstrap (proximity protocol) and steady-state-relay
(mevrouw, future apps with similar shape).

Performance: the DO is per-room, in-memory, no persistence. For
mevrouw's two-peer steady-state traffic this is trivial. For a
hypothetical 50-peer showcase it would warrant either CF Hibernation
or moving to a different DO class. Capacity check belongs on the
roadmap.

### 6. E2E encryption belongs in a shared package, not per-showcase

Mevrouw's `crypto.ts` (PBKDF2 → AES-GCM with packed nonce-prefix
frames) is a small, well-defined module. Other showcases will want
the same primitive. Pull-out candidates: `@shippie/e2e-crypto` (or
add it to the existing `@shippie/session-crypto`) so device-to-device
E2E encryption stops being copy-pasted code with subtle parameter
drift between apps.

The platform-wide invariant should be: **if your showcase ships a
`crypto.ts`, you're probably doing it wrong.**

### 7. Pull-to-refresh as a reusable primitive

The PullToRefresh component built for mevrouw is generic — it's just
a touch-driven "user wants the latest of whatever this view shows."
Other showcases will want it: shopping-list, journal, restaurant-
memory, anywhere a view depends on async sync. Extract to either
`@shippie/sdk/wrapper` (alongside spring/haptics) or
`@shippie/templates` (as a reusable component).

The signature is small:

```ts
<PullToRefresh onRefresh={() => relay?.resync()} disabled={!relay} />
```

Implementation is ~80 lines of touchstart/touchmove/touchend; doesn't
need a third-party dep.

---

## Concrete action items (none blocking, file as needed)

| Item | Where | Why |
|---|---|---|
| Document the "observable-by-default" pattern | `packages/iframe-sdk/README.md` or new `docs/PATTERNS.md` | Stops the next sync feature from shipping silent |
| `createGate(...predicates).whenReady(fn)` primitive | `packages/sdk/src/wrapper/` | Ditto, for async preconditions |
| Per-showcase update banner | new platform plan | The reload-twice annoyance is real |
| `proximity.mode = 'local' \| 'global'` | `@shippie/proximity` API + README | Cross-network apps will keep hitting this |
| `@shippie/e2e-crypto` package | new workspace | Stop copy-pasting AES-GCM frame helpers |
| Extract `PullToRefresh` | `@shippie/sdk/wrapper` or `@shippie/templates` | Will be wanted across showcases |

---

## What I tested live, and what I didn't

✅ **WebSocket relay protocol against prod**: a Node script opened two
WebSockets to `wss://shippie.app/__shippie/signal/<roomId>`, exchanged
hello + relay frames. Sender was correctly excluded from the fan-out;
peer received the relay with `from` stamped. SignalRoom DO is sound.

✅ **Mevrouw bundle includes the relay code**: confirmed by curling
`/run/mevrouw/assets/<hash>.js` and grep-ing for the `mevrouw:relay`
log tag. The fix is in the deployed bundle.

⚠ **Real-device end-to-end with encryption**: not run from CLI (would
need Yjs + Web Crypto in Node, and the browser environment is the
ground truth anyway). The user's two-phone test is the load-bearing
verification — and the SyncStatus panel + console logs added in this
commit make that test diagnose-able if it fails.

❌ **What if both phones are paired with different couple codes**: the
SyncStatus panel now shows the couple code on each device, so the user
can compare manually. A future improvement: surface a checksum of the
roomId so partners can compare without reading the full code aloud.
