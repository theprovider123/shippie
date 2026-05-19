# Shippie SDK Reference

## Installation

```bash
npm install @shippie/sdk
```

Or via script tag, auto-injected on every deployed tool:

```html
<script src="/__shippie/sdk.js" async></script>
```

## Local Tool Surface

The public maker path starts here:

```ts
import { shippie } from '@shippie/sdk';

await shippie.local.db.save('receipts', receipt);
const receipts = await shippie.local.db.list('receipts');
await shippie.local.files.write('receipt.jpg', photoBlob);
await shippie.local.ai.classify('Uber to Heathrow', ['travel', 'food']);
```

No backend configuration is required. The deploy scanner blocks third-party user-data storage, external auth required for core use, trackers, ads, and silent user-data egress.

## `shippie.local.db`

| Method | Description |
|---|---|
| `save(table, value)` | Friendly alias for inserting a local record. |
| `list(table, opts?)` | Friendly alias for querying local records. |
| `create(table, schema)` | Create/ensure a local table. |
| `insert(table, value)` | Insert a local record. |
| `query(table, opts?)` | Query local records. |
| `search(table, query, opts?)` | Text search in a local table. |
| `vectorSearch(table, vector, opts?)` | Semantic/vector search when available. |
| `update(table, id, patch)` | Patch a local record. |
| `delete(table, id)` | Delete a local record. |
| `count(table, opts?)` | Count local records. |
| `export(table, opts?)` | Export a local table as JSON/SQLite/Shippie backup. |
| `restore(backup, opts?)` | Restore a local backup. |
| `lastBackup()` | Inspect the latest backup metadata. |
| `usage()` | Estimate local storage usage. |
| `requestPersistence()` | Ask the browser for durable storage. |

## `shippie.local.files`

| Method | Description |
|---|---|
| `write(path, blobOrBytes)` | Store a local file. |
| `read(path)` | Read a local file. |
| `list(path?)` | List local files. |
| `delete(path)` | Delete a local file. |
| `usage()` | Estimate local file usage. |
| `thumbnail(path, opts?)` | Generate/read a local thumbnail when supported. |

## `shippie.local.ai`

| Method | Description |
|---|---|
| `classify(text, labels)` | Local text classification. |
| `embed(text)` | Local embedding. |
| `sentiment(text)` | Local sentiment. |
| `moderate(text)` | Local moderation. |

External AI calls are allowed when visible. If a tool needs OpenAI, Claude, Gemini, or another provider, Shippie discloses the connection in the runtime surfaces; the best UX still says what is being sent near the action itself.

## Secure Backup

`shippie.backup` is optional continuity for a local tool. Backups are sealed before storage; Shippie cannot read them. Do not frame backup as a cloud account or replacement database.

## Wrapper Helpers

| API | Description |
|---|---|
| `shippie.install.status()` | Returns install state. |
| `shippie.install.prompt()` | Triggers native install prompt when available. |
| `shippie.openYourData()` | Opens the user's data/export/backup surface. |
| `useKeyboard()` | Lets the Shippie shell adapt to mobile keyboards. |
| `useSafeArea()` | Reads safe-area inset values. |
| `useViewport()` | Reads dynamic viewport metrics. |
| `matchesStandalone()` | Checks installed PWA display mode. |

## Legacy Adapter APIs

`shippie.configure()`, `shippie.auth`, `shippie.db`, and `shippie.files` still exist for backwards compatibility with old BYO-backend experiments. They are not accepted for new public marketplace tools when they require external auth or third-party user-data storage.

For the governing rule, see [`docs/strategy/local-tools-policy.md`](./strategy/local-tools-policy.md).
