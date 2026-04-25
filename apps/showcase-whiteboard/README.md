# Shippie Whiteboard

Local-network collaborative whiteboard. Two devices on the same WiFi
pair via QR + 8-character join code, draw together, and watch each
other's strokes appear in under 30ms — the local stroke paints at 0ms
(predictive) and the remote stroke flies through the Yjs CRDT over a
P2P WebRTC datachannel.

## Run locally

```bash
# from the repo root
bun install
bun --filter @shippie/showcase-whiteboard dev
```

The app starts at <http://localhost:4400>.

For the WebRTC signalling channel to work locally you also need the
worker running:

```bash
bun --filter @shippie/worker dev
```

The whiteboard client connects to `/__shippie/signal/<roomId>` on the
worker — for development that means the proximity client's
`signalUrlBase` will need to point at the dev worker. The default
production base (`/__shippie/signal`) resolves to the same origin, so
no override is required when both apps are deployed under
`*.shippie.app`.

## Deploy

The build produces a static SPA in `dist/`:

```bash
bun --filter @shippie/showcase-whiteboard build
```

Zip and post `dist/` to the existing control-plane deploy pipeline:

```bash
cd dist && zip -r ../whiteboard.zip . && cd ..
curl -X POST https://shippie.app/api/deploy \
  -H "Authorization: Bearer $SHIPPIE_TOKEN" \
  -F "slug=whiteboard" \
  -F "zip=@whiteboard.zip"
```

That uploads the bundle to R2; the worker serves it from
`whiteboard.shippie.app/`.

## Acceptance

- Two browser tabs on the same machine pair via QR + join code, both
  tabs draw, both canvases stay in sync.
- The owner can clear the board (broadcasts a `board-cmds` clear
  command via the proximity event log).
- "Export" downloads the current canvas as PNG.
- Lighthouse PWA score 100 (manifest + service worker + standalone
  display + theme-color all wired up).

## Architecture

| Layer | What |
|---|---|
| Lobby | Create or join a group via 8-char base32 code. |
| Pairing | QR encodes `?j=<code>`; scanning auto-joins the room on load. |
| Mesh | `@shippie/proximity` handles signalling → WebRTC datachannel → X25519 handshake → AES-256-GCM/Ed25519 envelopes. |
| State | `group.sharedState('whiteboard')` exposes a Yjs doc; strokes live in `Y.Array<Y.Map>`. |
| Commands | `group.eventLog('board-cmds')` carries clear-board events with vector-clock causal ordering. |
| Render | One `<canvas>` repaints the doc on every Yjs update. Local pointer events also paint a predictive segment so the user never waits for a frame. |

## Latency claim

> Local stroke 0ms (predictive paint), remote stroke under 30ms on local
> WiFi. Both feel instant.

We never claim sub-5ms end-to-end — that's not possible across two
real devices. What we do claim is that the local user never perceives
their own stroke arriving, because the canvas is updated on the same
event-loop turn as the pointer move.
