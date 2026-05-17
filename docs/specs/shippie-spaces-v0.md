# Shippie Spaces v0

Last updated: 2026-05-17

## Purpose

Spaces are Shippie's shared private context primitive. A space lets a user or
builder attach one or more apps to the same private group, issue scoped invite
links, sync sealed data, and later archive the result as a durable memory.

The product language is "private space", "invite link", "QR", "role", and
"archive". "Capsule" is implementation language for the signed/encrypted link
payload.

## Non-goals

- Generic internet SSO.
- Phone-as-always-on LAN server.
- Full third-party app signing/reproducible builds.
- Complex global RBAC.
- Distributed encrypted storage without a reliable cloud or Hub fallback.

## Entities

### Space

```ts
interface Space {
  id: string;
  name: string;
  createdAt: string;
  status: 'active' | 'archived';
  archivedAt?: string;
}
```

A space is not owned by a single app. A family space can contain Recipe,
Journal, Chores, and Meal Planner. A tournament space may start in Match Room
and later become a read-only archive.

### Space App

```ts
interface SpaceApp {
  spaceId: string;
  appSlug: string;
  packageHash?: string;
}
```

`packageHash` binds a join link to the app package identity when available. Full
marketplace signing can arrive later; hash binding is v0.

### Member

```ts
interface SpaceMember {
  memberId: string;
  displayName?: string;
  role: string;
  status: 'active' | 'revoked';
  joinedAt: string;
}
```

Roles are opaque strings. Apps declare role names in `shippie.json` and interpret
their own permissions. Shippie only transports the role and handles link claims.

### Join Token

```ts
interface JoinToken {
  tokenId: string;
  spaceId: string;
  role: string;
  maxClaims: number;
  claimCount: number;
  expiresAt: string;
  revokedAt?: string;
}
```

Join tokens rotate independently from members and encryption keys. If a pub QR
leaks, the host regenerates the join link. Current members stay active.

### Capsule

```ts
interface SpaceCapsuleV0 {
  schema: 'shippie.space.capsule.v0';
  spaceId: string;
  joinToken: string;
  appSlug?: string;
  packageHash?: string;
  role: string;
  maxClaims?: number;
  expiresAt?: string;
  routes?: Array<{ kind: 'cloud' | 'hub' | 'peer'; url?: string }>;
}
```

A capsule is the payload behind an invite link or QR. Sensitive material should
live in the URL fragment or an encrypted blob addressed by the public link code,
not in normal query parameters.

## URL Shape

Hosted cloud:

```text
https://shippie.app/join/<token>#c=<encoded-capsule>
```

App-specific fallback:

```text
https://shippie.app/run/<appSlug>/?space=<spaceId>&join=<token>&role=<role>#k=<spaceSecret>
```

Hub:

```text
http://hub.local/join/<token>#c=<encoded-capsule>
```

The fragment is not sent in normal HTTP requests. The server can see the public
join token, but client-held key material stays client-side.

## Sync Routes

Routes are tried in this order when present:

1. local cache
2. Hub
3. sealed cloud
4. peer/local transport

Phone-to-phone LAN seeding is not v0. Hub-assisted LAN is the first production
local route.

## Built Surface

- `@shippie/spaces` owns the reusable primitives: space creation, join-token
  rotation, capsule URL encoding, encrypted gossip rooms, role helpers, and
  offline event queues.
- Deployed package manifests can carry `spaces` metadata. The container and Hub
  can therefore show "join a space" surfaces from a portable `.shippie` package,
  not just from hosted metadata.
- The dashboard "Share private space" flow generates one space id, one role
  specific invite URL, a QR, and a host link. Role, space, join-token, and sealed
  transfer details are HMAC-bound to the app invite token so a recipient cannot
  edit `role=viewer` into a stronger role. This is intentionally group-first:
  one QR can allow 20 claims for a pub/classroom; per-person links can arrive as
  a power-user layer.
- The dashboard access page persists and lists private spaces via
  `spaces`, `space_apps`, `space_join_tokens`, and `space_audit_log`.
  Builders can reuse an existing space to rotate a fresh join link without
  removing current members, open the host view, or archive the space when the
  event/memory is finished.
- Focused container launches expose the active space to package apps via
  `window.__SHIPPIE_SPACE__` and `app.info().space`. Standalone runtime URLs
  still receive `space`, `role`, and `space_join` query parameters.
- The Hub exposes `/api/hub/ambient` as a local discovery endpoint for phones or
  venue screens to see which rooms/tools are visible on this LAN.
- Hub package ingest preserves portable package `spaces` metadata in the local
  tool registry, so ambient discovery can show which cached tools support
  private spaces even when the public platform is unreachable.
- The app-kind classifier treats either `@shippie/spaces` imports or
  `shippie.json` `spaces.enabled` metadata as Shippie-mediated connectivity, so
  marketplace labels do not regress when apps inherit Spaces without custom
  networking code.
- Social recovery is modelled as owner/member re-issue: any active member whose
  role has `invite` permission can issue a fresh one-use join token for a
  stranded member. This keeps recovery inside the private space rather than
  adding an email/password reset surface.
- Production can be smoke-tested with
  `cd apps/platform && bun run smoke:private-spaces`. The script creates a
  scratch private app, issues a signed role-bound invite, verifies the claim
  counters, archives the scratch space, and cleans the remote D1 rows.

## Archive Mode

Archived spaces are read-only by default. Apps may still render history, share
cards, and exports. Writes should be refused unless an app explicitly declares an
archive migration action.

## Match Room Mapping

Current Match Room concepts map directly:

- `roomId` -> `spaceId`
- `roomKey` -> `spaceSecret`
- `role=host|play|display` -> opaque space roles
- encrypted relay gossip -> `createEncryptedGossipRoom<T>()`
- sealed room archive -> app document inside the space
- saved room shortcut -> local remembered space

The first migration should preserve existing URLs while routing the mechanics
through `@shippie/spaces`.

## Builder Guide

See [`docs/private-spaces-builder.md`](../private-spaces-builder.md) for the
practical builder workflow: `shippie.json`, role design, dashboard invites,
Hub discovery, and privacy/legal boundaries.
