# Shippie SDK Reference

## Installation

```bash
npm install @shippie/sdk
```

Auto-injected on every deployed tool:

```html
<script src="/__shippie/sdk.js" async></script>
```

## Quick start

```ts
import { shippie } from '@shippie/sdk';

await shippie.local.db.save('receipts', receipt);
const receipts = await shippie.local.db.list('receipts');
await shippie.local.files.write('receipt.jpg', photoBlob);
await shippie.local.ai.classify('Uber to Heathrow', ['travel', 'food']);
```

No backend configuration required.

---

## `shippie.local.db`

| Method | Description |
|---|---|
| `save(table, value)` | Insert a local record (friendly alias). |
| `list(table, opts?)` | Query local records (friendly alias). |
| `create(table, schema)` | Create or ensure a local table exists. |
| `insert(table, value)` | Insert a local record. |
| `query(table, opts?)` | Query local records with filtering/sorting. |
| `search(table, query, opts?)` | Full-text search in a local table. |
| `vectorSearch(table, vector, opts?)` | Semantic search when available. |
| `update(table, id, patch)` | Patch a local record by ID. |
| `delete(table, id)` | Delete a local record by ID. |
| `count(table, opts?)` | Count records matching opts. |
| `export(table, opts?)` | Export a table as JSON, SQLite, or Shippie backup. |
| `restore(backup, opts?)` | Restore from a local backup. |
| `lastBackup()` | Return latest backup metadata. |
| `usage()` | Estimate local storage usage. |
| `requestPersistence()` | Ask the browser for durable storage. |

---

## `shippie.local.files`

| Method | Description |
|---|---|
| `write(path, blobOrBytes)` | Store a local file. |
| `read(path)` | Read a local file. |
| `list(path?)` | List local files. |
| `delete(path)` | Delete a local file. |
| `usage()` | Estimate local file storage usage. |
| `thumbnail(path, opts?)` | Generate or read a local thumbnail. |

---

## `shippie.local.ai`

Runs on-device. No data leaves unless the tool makes that explicit.

| Method | Description |
|---|---|
| `classify(text, labels)` | Classify text against a label list. |
| `embed(text)` | Generate a local embedding vector. |
| `sentiment(text)` | Return sentiment score for text. |
| `moderate(text)` | Run local content moderation. |

External AI (OpenAI, Claude, Gemini, etc.) is allowed when the connection is visible to the user. The best UX names what is being sent, near the action itself.

---

## `shippie.backup`

Optional continuity for a local tool. Backups are sealed client-side before storage — Shippie cannot read them. Do not present backup as a cloud account or replacement database.

---

## Shell helpers

| API | Description |
|---|---|
| `shippie.install.status()` | Returns current install state. |
| `shippie.install.prompt()` | Triggers native install prompt when available. |
| `shippie.openYourData()` | Opens the user's data / export / backup surface. |
| `useKeyboard()` | Signals to the shell that a mobile keyboard is active. |
| `useSafeArea()` | Reads safe-area inset values. |
| `useViewport()` | Reads dynamic viewport metrics. |
| `matchesStandalone()` | Returns true when running as an installed PWA. |

---

## Legacy APIs

`shippie.configure()`, `shippie.auth`, `shippie.db`, and `shippie.files` (top-level, not `shippie.local.*`) are kept for backwards compatibility with old BYO-backend experiments. They are not accepted for new marketplace tools that require external auth or third-party user-data storage.

See `docs/strategy/local-tools-policy.md` for the full rule.
