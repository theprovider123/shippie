# Shippie SDK Reference

## Installation

```bash
npm install @shippie/sdk
```

Or via script tag (auto-injected on every deployed app):
```html
<script src="/__shippie/sdk.js" async></script>
```

## Configuration

The SDK requires a backend for auth, storage, and files. Feedback, analytics, and install tracking work without configuration.

```javascript
import { createClient } from '@supabase/supabase-js'
import { shippie } from '@shippie/sdk'

const supabase = createClient(url, anonKey)
shippie.configure({ backend: 'supabase', client: supabase })
```

## API

### `shippie.configure(opts)`
Initialize the SDK with a BYO backend. Must be called before using auth/db/files.

### `shippie.auth`
| Method | Description |
|---|---|
| `getUser()` | Returns the current user or null |
| `signIn(returnTo?)` | Triggers sign-in flow |
| `signOut()` | Signs out the current user |
| `onChange(listener)` | Subscribe to auth state changes. Returns unsubscribe function. |
| `getToken()` | Returns the current session JWT (for `Authorization: Bearer` headers) |

### `shippie.db`
| Method | Description |
|---|---|
| `set(collection, key, value)` | Upsert a record |
| `get(collection, key)` | Get a record by key |
| `list(collection, { limit?, offset? })` | List records in a collection |
| `delete(collection, key)` | Delete a record |

### `shippie.files`
| Method | Description |
|---|---|
| `upload(blob, filename)` | Upload a file. Returns `{ key, url }`. |
| `get(key)` | Get the public URL for a file |
| `delete(key)` | Delete a file |

### `shippie.feedback` (no backend required)
| Method | Description |
|---|---|
| `submit({ type, title?, body?, rating? })` | Submit feedback to the Shippie marketplace |
| `open()` | Open the feedback UI |

### `shippie.install` (no backend required)
| Method | Description |
|---|---|
| `status()` | Returns `'installed'`, `'installable'`, or `'unsupported'` |
| `prompt()` | Trigger the native install prompt (Android). Returns `{ outcome }`. |
| `instructions()` | Returns platform-specific install instructions (useful for iOS) |

### `shippie.track(event, props?, opts?)` (no backend required)
Fire-and-forget analytics event. Batched and flushed automatically.

### `shippie.meta()` (no backend required)
Returns app metadata (name, type, theme, version, permissions).
