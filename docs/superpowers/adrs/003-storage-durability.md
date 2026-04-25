# ADR 003: Local Storage Durability

**Status:** Accepted  
**Date:** 2026-04-24  
**Gate:** 3 - Storage durability

## Context

OPFS is the right default for local-first browser storage, but it is quota-managed and evictable. Safari can purge script-created storage for origins without recent user interaction, and all browsers may evict under storage pressure. A local-first database that cannot explain backup, restore, quota, and persistence will create trust breaks.

Durability is therefore part of the local DB contract, not marketplace polish.

## Decision

Every `shippie.local.db` implementation must include:

- Engagement-gated `navigator.storage.persist()` helper.
- Quota telemetry via `navigator.storage.estimate()` where available.
- 80% and 95% quota warning signals.
- Encrypted `.shippiebak` export using AES-GCM and a user passphrase.
- Restore with schema-version check and dry-run migration preview.
- Last-backup timestamp surfaced through the wrapper chrome.
- Eviction detection using a sentinel record and schema metadata.

Makers can replace the entire local runtime namespace, but they cannot opt out of these primitives while still claiming Shippie local DB badges.

## `.shippiebak` v1

The backup file is a binary container:

- Magic header: `SHIPPIEBAK`
- Version: `1`
- JSON header length as uint32
- JSON header: app id, schema version, created timestamp, KDF, salt, nonce, table list, content hash
- AES-GCM ciphertext payload

The plaintext payload is implementation-defined at first, but `json` and `sqlite` export formats must be supported by the DB package.

## Consequences

Local DB work takes slightly longer, but the platform can safely say "your data is local and portable" instead of implying the browser will keep it forever.

## Go/No-Go

Go for Pillar C when:

- The local runtime contract includes backup, restore, usage, and persistence primitives.
- The DB skeleton defines the `.shippiebak` header and dry-run restore shape.
- Wrapper compatibility report can mark storage probes as pending until client runtime telemetry arrives.

No-go for "Works Offline" or "Privacy First" public badges based only on `shippie.json`.
