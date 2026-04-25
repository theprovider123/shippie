# ADR 004: Two-Layer `shippie.json` Schema

**Status:** Accepted  
**Date:** 2026-04-24  
**Gate:** 4 - `shippie.json` two-layer schema

## Context

The current internal schema in `packages/shared/src/shippie-json.ts` is rich and operational. It includes build configuration, PWA internals, permissions, compliance, listing, distribution, native, and store metadata fields.

The vision asks for a maker-facing file that is much simpler: app identity, icon, theme, display, categories, wrapper feel flags, and local runtime opt-ins.

Those two needs are different. The public file should feel like product configuration. The internal shape should remain the stable deploy/runtime contract.

## Decision

`shippie.json` is now two-layered:

- Makers write the flat public schema.
- Shippie compiles that public schema into the richer internal schema before preflight, deploy, CSP, manifest generation, and wrapper runtime work.
- Existing internal manifests remain supported as a compatibility input, but templates and CLI scaffolding should write the public schema.

The lowering is deterministic:

- `display`, `categories`, and screenshots lower into `pwa`.
- `local.database`, `local.files`, `local.ai`, and `local.sync` lower into internal permission declarations and metadata for later compatibility reporting.
- `haptics`, `transitions`, `sound`, and `ambient` lower into a reserved internal wrapper metadata object once that runtime surface exists.
- Unknown public fields are rejected by the schema.

## Consequences

The platform can keep its current internal consumers stable while making the maker API dramatically smaller. Docs and templates should show only the public schema. Dashboard/debug tooling may still surface the compiled internal shape when needed.

## Go/No-Go

Go for Pillar A when:

- A public schema exists in shared code.
- A lowering function compiles public config into the internal `ShippieJson`.
- The deploy hot path reads `shippie.json` from uploaded zips.
- `templates/shippie-starter/shippie.json` and `shippie init` write the flat schema.

No-go for Layer 3 if local runtime declarations only exist as ad hoc internal fields.
