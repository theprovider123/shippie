# Shippie Live Room

A four-to-eight-player local quiz that demonstrates Shippie's full stack: mesh
networking via the Proximity Protocol, sensory textures (haptic + sound +
visual), the wrapper PWA shell, and the observer runtime.

## Run locally

```bash
bun install
bun run --filter @shippie/showcase-live-room dev
```

Open http://localhost:4500 in two browser tabs (or two real phones on the same
network). One picks "Host a room"; the other picks "Join a room" and enters
the 6-character code. Tap "Start quiz" on the host.

## Real-phone test

Both phones must be on the same Wi-Fi (signal server reachable; Hub or worker
backend up). Open http://<your-laptop-ip>:4500 on each phone. Install the PWA
("Add to Home Screen"); launch from the home icon to feel the install texture.

## What this validates

- Proximity Protocol: room creation, join, Y.Doc sync
- Sensory textures: confirm on every tap (auto-fired by the observer rule),
  complete on win (explicit `fireTexture('complete')` in Buzzer), milestone on
  end-of-quiz winner (Scoreboard)
- First-buzzer-wins: deterministic across two-peer divergence + sync, tiebreak
  by lowest peerId on equal timestamp
- Observer runtime: the platform's defaults auto-fire the `confirm` texture on
  every `<button>` click in this app, with no per-component texture imports

## Architecture note

The Yjs document is the source of truth for everything: phase, currentIndex,
buzzes, scores. Host advances; guests are write-restricted to the buzzes log.
Lockout is purely UI — the CRDT itself accepts any buzz, but
`firstBuzzerForQuestion` deterministically picks the earliest by timestamp,
breaking ties by peer-id.
