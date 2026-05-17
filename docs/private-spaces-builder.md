# Build With Private Spaces

Private Spaces are Shippie's shared private context primitive. A space is a
small trust group for one or more apps: a family, class, pub table, fantasy
league, team, trip, or venue room.

Users should see "create a private space", "invite link", "QR", "role", and
"archive". Builders do not need to implement accounts, passwords, friend
requests, or a backend just to let phones work together.

## What A Builder Gets

- Invite links and QR codes from the dashboard.
- Role-bound joins such as `host`, `member`, `viewer`, or `coach`.
- Group-sized links for rooms, classes, pubs, or venues.
- Join-token rotation without removing current members.
- Space archive mode for finished events and memories.
- Focused container launches that pass `space`, `role`, and `space_join` to
  the app.
- Hub discovery for local rooms and cached packages when a venue runs a Hub.

Shippie can issue and claim the invite, but the private room contents stay in
the app's encrypted/local layer. Shippie should not be able to read messages,
votes, predictions, journals, or other app data unless the builder deliberately
posts that data to their own backend.

## Add Spaces To `shippie.json`

```json
{
  "spaces": {
    "enabled": true,
    "roles": [
      { "id": "host", "permissions": ["read", "write", "invite", "moderate", "archive"] },
      { "id": "member", "permissions": ["read", "write"] },
      { "id": "viewer", "permissions": ["read"] }
    ],
    "syncMode": "gossip",
    "archivable": true
  }
}
```

Roles are opaque strings. Shippie transports the chosen role; your app decides
what `host`, `member`, or `viewer` can do.

Use `syncMode` honestly:

| Mode | Use When |
|---|---|
| `gossip` | Live rooms, votes, predictions, group play, watch parties |
| `sealed-cloud` | Durable private data needs cross-device continuity |
| `hub` | Venue/classroom/pub deployments should prefer a local Hub |
| `inherited` | The app uses Shippie's generic data layer and does not own transport |

## In Your App

Inside the Shippie container, the app can read the active space from the SDK
bridge and from the focused-launch context. Standalone fallback URLs also carry
the same values as query parameters.

```ts
const info = await shippie.app.info();

if (info.space) {
  console.log(info.space.id, info.space.role, info.space.joinToken);
}
```

For non-SDK fallback:

```ts
const params = new URLSearchParams(location.search);
const spaceId = params.get('space');
const role = params.get('role');
const joinToken = params.get('space_join');
```

Never trust client role strings for irreversible actions. Treat them as the
user experience layer, then validate dangerous actions inside the app's own
signed/encrypted document, room host, or Hub coordinator.

## Dashboard Flow

For a deployed app with Spaces enabled, the dashboard access page shows
**Create Private Space**:

1. Pick an invite type: one friend, room QR, or team.
2. Choose a space name and role.
3. Generate the link or QR.
4. Share it.
5. Rotate the join link if it leaks.
6. Archive the space when the event is done.

This is intentionally group-first. A pub host usually wants one QR that can be
claimed 20 times before midnight. Per-person invites can be added later as a
power-user layer.

## Hub And Venue Use

A Hub is a local edge node for a building or event. It can cache `.shippie`
packages, serve apps over the LAN, coordinate signalling, and advertise visible
rooms/tools through `/api/hub/ambient`.

When a package contains `spaces` metadata, the Hub keeps that metadata in its
local registry. Phones and venue screens can tell that a local tool supports
private spaces before any public-cloud call is made.

Useful venue pattern:

1. Install `match-room.shippie` onto the Hub.
2. Set its group label to `Block 5`, `Class 3B`, or `Main Bar`.
3. Phones on Wi-Fi discover the Hub by mDNS.
4. The venue shell polls `http://hub.local/api/hub/ambient`.
5. Users choose a visible room, then explicitly join by QR/link.

No auto-join. Discovery can be ambient; membership must be intentional.

## Privacy And Legal Boundaries

Open-source freedom is compatible with safety if the boundary is clear:

- Public marketplace listings and package metadata are governed by Shippie's
  platform policies.
- Private space contents are user/app data. Shippie should not inspect them.
- Makers remain responsible for what their apps enable and what their own
  backends collect.
- Shippie should expose abuse reporting for public listings, not pretend it can
  moderate encrypted private rooms.
- Hubs are local infrastructure. The Hub admin controls the physical device and
  network; Shippie cannot guarantee venue policy or data retention on a
  self-hosted box.

For sensitive domains, builders should include their own visible policy inside
the app and avoid collecting personal data on any backend they do not need.

## MVP Checklist

- `shippie.json` declares `spaces.enabled`.
- Roles are simple and app-owned.
- App has a useful solo mode if no space is present.
- App shows the active space name/role somewhere obvious.
- Invite links can be rotated without deleting current members.
- Archived spaces become read-only or clearly marked as finished.
- Hub installs preserve `spaces` metadata in `/api/hub/ambient`.
- Private data remains local, encrypted, or user-cloud-owned.
