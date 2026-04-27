# Container Commons Package + Runtime Contract

**Date:** 2026-04-27  
**Status:** Draft  
**Depends on:** ADR 006, real SDK bundle, Deploy Truth artifacts  
**Scope:** Shippie container app, standalone URLs, custom domains, Hub installs, portable `.shippie` packages

## 1. One-line pitch

> **A Shippie app is a portable package that can run in the Shippie container, on its own URL, or on a local Hub.**

User promise:

> **Install Shippie once. Run every trusted app. Keep your data here.**

Maker promise:

> **You own the app identity. Shippie gives it a runtime, distribution, versioning, trust, and portability.**

Commons promise:

> **Apps can be inspected, forked, remixed, mirrored, archived, and self-hosted.**

## 2. Goals

- Make the installed Shippie PWA the preferred user home without making it a walled garden.
- Preserve standalone app URLs and custom domains as first-class ownership surfaces.
- Define `.shippie` as the portable artifact consumed by the container, standalone deploys, Hubs, and future federation.
- Keep third-party apps isolated through sandboxed frames and a capability bridge.
- Make GitHub-like versioning understandable to normal users: changelog, permission diff, trust diff, data migration preview, rollback.
- Make app provenance visible: maker, source repo, license, parent app, template, forks, collections.

## 3. Non-goals

- No mandatory container-only apps.
- No raw shared-origin storage access for third-party app code.
- No public federation protocol in v1.
- No social feed, algorithmic dopamine loop, or creator network in v1.
- No runtime shims for cloud backends in this spec. Localize remains a later source-migration path.

## 4. Product model

### 4.1 The four simple tabs

The Shippie container has four top-level surfaces:

- **Home:** installed apps, recent apps, pending updates, quick resume.
- **Discover:** marketplace, collections, templates, trusted apps.
- **Create:** remix, fork, deploy, connect Claude/Codex/MCP.
- **Your Data:** storage, receipts, permissions, backup, transfer, delete/export.

The UI should stay calm. The complexity lives behind trust cards and detail views.

### 4.2 App identity belongs to the maker

Every app can have:

- canonical Shippie URL: `https://slug.shippie.app`
- custom domains
- maker profile
- source repository
- license
- changelog
- roadmap
- feedback inbox
- release channels
- icon, screenshots, theme, category, description
- lineage: template, parent app, forks/remixes

The container should say "running in Shippie", not "owned by Shippie".

## 5. `.shippie` package

`.shippie` is a zip-compatible package with a deterministic manifest and content hashes.

```text
recipe-saver.shippie
  manifest.json
  app/
    index.html
    assets/
  version.json
  permissions.json
  source.json
  license.json
  changelog.json
  deploy-report.json
  trust-report.json
  migrations.json
  starter-content/
  collections.json
  signatures/
```

### 5.1 `manifest.json`

```json
{
  "schema": "shippie.package.v1",
  "id": "app_recipe_saver",
  "slug": "recipe-saver",
  "name": "Recipe Saver",
  "description": "Save recipes locally and look up ingredients when online.",
  "kind": "connected",
  "entry": "app/index.html",
  "packageHash": "sha256:...",
  "createdAt": "2026-04-27T12:00:00Z",
  "maker": {
    "id": "maker_devante",
    "name": "Devante",
    "profileUrl": "https://shippie.app/@devante"
  },
  "domains": {
    "canonical": "https://recipe-saver.shippie.app",
    "custom": ["https://recipes.example.com"]
  },
  "runtime": {
    "standalone": true,
    "container": true,
    "hub": true,
    "minimumSdk": "1.0.0"
  }
}
```

### 5.2 `version.json`

Versioning has three layers:

```json
{
  "code": {
    "version": "1.8.0",
    "channel": "stable",
    "sourceCommit": "abc123",
    "packageHash": "sha256:..."
  },
  "trust": {
    "permissionsVersion": 3,
    "trustReportHash": "sha256:...",
    "externalDomains": ["world.openfoodfacts.org"]
  },
  "data": {
    "schemaVersion": 7,
    "migrationPlanHash": "sha256:..."
  }
}
```

User-facing updates are generated from all three layers:

- code changes: features and fixes
- trust changes: permissions, domains, privacy/security posture
- data changes: schema migrations and local-data safety

### 5.3 `permissions.json`

```json
{
  "schema": "shippie.permissions.v1",
  "capabilities": {
    "localDb": {
      "enabled": true,
      "namespace": "recipe-saver"
    },
    "localFiles": {
      "enabled": true,
      "namespace": "recipe-saver"
    },
    "localAi": {
      "tasks": ["classify", "summarize"]
    },
    "network": {
      "allowedDomains": ["world.openfoodfacts.org"],
      "declaredPurpose": {
        "world.openfoodfacts.org": "Barcode ingredient lookup"
      }
    },
    "crossAppIntents": {
      "provides": ["shopping-list.write"],
      "consumes": ["budget-limit.read"]
    },
    "feedback": {
      "enabled": true
    },
    "analytics": {
      "enabled": true,
      "mode": "aggregate-only"
    }
  }
}
```

The container enforces this file at runtime. The deploy pipeline verifies it against static analysis and runtime proof.

### 5.4 `source.json`

```json
{
  "repo": "https://github.com/example/recipe-saver",
  "license": "MIT",
  "sourceAvailable": true,
  "remix": {
    "allowed": true,
    "commercialUse": true,
    "attributionRequired": true
  },
  "lineage": {
    "template": "shippie-template-local-recipe",
    "parentAppId": null,
    "forkedFromVersion": null
  }
}
```

Licensing is not optional for commons features. Fork/remix buttons are hidden until license metadata allows them.

### 5.5 `trust-report.json`

Generated by Deploy Truth and later proof rollups. It should be artifact-first, not DB-only.

```json
{
  "kind": {
    "detected": "connected",
    "status": "verifying",
    "reasons": ["fetches world.openfoodfacts.org"]
  },
  "security": {
    "stage": "maker-facing",
    "score": null,
    "findings": []
  },
  "privacy": {
    "grade": null,
    "externalDomains": [
      {
        "domain": "world.openfoodfacts.org",
        "purpose": "Barcode ingredient lookup",
        "personalData": false
      }
    ]
  },
  "containerEligibility": "curated"
}
```

### 5.6 `migrations.json`

```json
{
  "schema": "shippie.migrations.v1",
  "from": 6,
  "to": 7,
  "operations": [
    {
      "type": "addColumn",
      "table": "recipes",
      "column": "prep_time",
      "dataType": "integer",
      "default": null,
      "destructive": false
    }
  ]
}
```

Destructive operations require explicit declaration and local backup. The container presents a human migration preview before applying major data changes.

## 6. Runtime modes

### 6.1 Standalone mode

The app runs at its own origin:

- `slug.shippie.app`
- custom domain
- Hub URL

The wrapper injects the SDK and local runtime as it does today. The app can be shared by URL and run without the Shippie container.

### 6.2 Container mode

The app runs in a sandboxed iframe inside the installed Shippie PWA.

```html
<iframe
  src="/__container/apps/recipe-saver/app/index.html"
  sandbox="allow-scripts allow-forms allow-popups allow-downloads"
  title="Recipe Saver"
></iframe>
```

Do not include `allow-same-origin` for untrusted third-party apps unless the app is served from an isolated opaque origin or the security model has been reviewed. The base assumption is that app code talks to the container through the bridge, not through origin privileges.

### 6.3 Hub mode

The same package is installed into a Hub:

```text
shippie install recipe-saver.shippie --target hub.local
```

The Hub provides:

- local app file serving
- package registry
- local marketplace subset
- local analytics aggregation
- local feedback inbox
- SignalRoom / mesh coordinator

## 7. Capability bridge

The container bridge is request/response RPC over `postMessage` for iframe apps.

### 7.1 Envelope

```ts
interface BridgeRequest {
  protocol: 'shippie.bridge.v1';
  id: string;
  appId: string;
  capability: string;
  method: string;
  payload: unknown;
}

interface BridgeResponse {
  protocol: 'shippie.bridge.v1';
  id: string;
  ok: boolean;
  result?: unknown;
  error?: {
    code: string;
    message: string;
  };
}
```

### 7.2 Enforcement

For every request, the container checks:

1. iframe identity maps to installed app package
2. package is container-eligible
3. requested capability is granted
4. namespace belongs to the app
5. network domain is declared, if applicable
6. request fits rate limits and payload limits

The app never gets raw SQLite, OPFS, Cache Storage, or model handles.

## 8. App receipts

Every install creates a local app receipt:

```json
{
  "schema": "shippie.receipt.v1",
  "appId": "app_recipe_saver",
  "name": "Recipe Saver",
  "version": "1.8.0",
  "packageHash": "sha256:...",
  "installedAt": "2026-04-27T12:00:00Z",
  "source": "marketplace",
  "domains": ["https://recipe-saver.shippie.app"],
  "kind": "connected",
  "permissions": {
    "localDb": true,
    "network": ["world.openfoodfacts.org"]
  }
}
```

Receipts power:

- Your Data panel
- backup/restore
- transfer to new phone
- update diffs
- rollback
- audit trail

## 9. User data archive

`.shippie` packages move apps. Users also need a portable personal archive:

```text
my-shippie-data.backup
  receipts.json
  grants.json
  apps/
    recipe-saver/
      db.sqlite
      files/
      settings.json
    journal/
      db.sqlite
      files/
      settings.json
  container/
    preferences.json
```

Backups are encrypted by default. The archive should restore into the container, a new phone, a Hub, or future self-hosted Shippie.

## 10. Container compatibility tests

Every container-compatible app must pass:

- standalone smoke
- container smoke
- iframe boot
- SDK bridge handshake
- route navigation
- offline cached launch
- permission enforcement fixtures
- no raw forbidden APIs in iframe mode, where detectable

Compatibility is separate from App Kind. A Local app can be incompatible with the container if it relies on unsupported browser behavior. A Connected app can be compatible if it declares domains clearly and does not leak personal data.

## 11. Human update card

Generated from changelog, permission diff, trust diff, and migration plan:

```text
Recipe Saver updated.

Added:
- Cooking-time filters
- 4 new starter recipes

Trust:
- Privacy improved from A to A+
- No new external domains

Your data:
- Added prep_time to recipes
- No data deleted
```

Risky update:

```text
This update wants to connect to maps.googleapis.com.
Reason: map view added.

Allow update / Stay on current version
```

## 12. Collections and provenance

Collections are first-class discovery objects:

- official
- community
- maker
- Hub/local
- school/venue

Collection entries include package hashes and trust summaries so a Hub can mirror them safely.

## 13. Open questions

- Should package signatures be mandatory before container eligibility moves beyond curated apps?
- What is the minimum source/license metadata needed before showing Remix?
- Should custom-domain apps be allowed to request container deep links before they are marketplace-listed?
- Does the container app store package files in Cache Storage, OPFS, or both?
- How should browser URL handler differences on iOS be explained without confusing users?
