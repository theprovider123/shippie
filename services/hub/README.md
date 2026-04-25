# Shippie Hub

Self-hosted local mesh + model cache. Lets a LAN run Shippie groups
end-to-end without ever touching the public internet (model cache
aside, on a cold first fetch).

## One-line install

```sh
docker run --rm -p 80:80 -v shippie-hub-data:/var/lib/shippie-hub \
  --name shippie-hub shippie/hub
```

## First-run

1. Plug the box in. Open `http://hub.local` from a phone on the same
   Wi-Fi.
2. The dashboard shows zero rooms, zero apps, zero models — that's
   correct; it's a fresh Hub.
3. Open a Shippie app on the same Wi-Fi. The wrapper auto-probes
   `http://hub.local/__shippie/health` first; if reachable, signalling
   goes through the Hub. Otherwise, it falls back to
   `proximity.shippie.app`.
4. Cached apps appear under "Cached apps" after the first device
   visits each `<slug>.hub.local` URL while the Hub has internet.
5. Models cache lazily: the first time a device asks the AI app for a
   model, the Hub pulls it from `ai.shippie.app` and serves it to
   every subsequent device on the LAN.

## Privacy

The Hub stores **nothing about user data**. Specifically:

- Signalling state is in-memory; SQLite (when present) records only
  room ids and last-active timestamps for restart-recovery, never
  message contents.
- The model cache mirrors the public `ai.shippie.app/models/*`
  catalogue verbatim — same files the cloud serves.
- App caches mirror the public `<slug>.shippie.app` builds — public
  HTML/JS/CSS only.

No outbound connections **except** the model cache fetching from
`ai.shippie.app` on a miss.

## Configuration

| Env var            | Default                    | Notes                                   |
|--------------------|----------------------------|-----------------------------------------|
| `HUB_PORT`         | `80`                       | Listening port.                         |
| `HUB_HOST`         | `0.0.0.0`                  | Bind address.                           |
| `HUB_CACHE_ROOT`   | `/var/lib/shippie-hub`     | Disk root for cached apps + models.     |
| `HUB_UPSTREAM`     | `https://ai.shippie.app`   | Model upstream. Override only for dev.  |
| `HUB_MDNS_NAME`    | `hub`                      | Advertised as `<HUB_MDNS_NAME>.local`.  |
| `HUB_DISABLE_MDNS` | unset                      | Set to `1` to disable mDNS broadcast.   |

## Wrapper transport-select

The Shippie wrapper probes `http://hub.local/__shippie/health` on the
first group action with a 500 ms timeout. If the probe succeeds,
signalling goes through the Hub for the rest of the session. The
result is cached per session — there's no per-action probing.

This deployment is **internal-network only** in v1. School-pilot
deployment is week 11+ once a partner is identified.

## Endpoints

```
GET  /__shippie/health                 → {ok:true, service:"shippie-hub"}
GET  /                                 → dashboard HTML
GET  /api/rooms                        → JSON room stats
WS   /__shippie/signal/<roomId>        → WebRTC signalling (client.ts)
GET  /models/<rest>                    → read-through model cache
GET  /apps/<slug>/<rest>               → static app cache
GET  /                                 → static app cache (Host: <slug>.hub.local)
```

## Building the image

```sh
docker build -t shippie/hub -f services/hub/Dockerfile .
```

The container exposes a single volume at `/var/lib/shippie-hub` for
cache durability across restarts.
