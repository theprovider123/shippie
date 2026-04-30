# @shippie/share

Local-anonymous content sharing for Shippie. Pack a recipe / journal entry / memory into a self-contained signed blob, encode it in a URL fragment or QR code, send it via AirDrop / scan / text / nearby mesh — no account required, no server holds the bytes.

## Why it exists

Shippie's pitch is "your data lives on your device." Adding sharing that violates that would betray the brand. This package provides the primitives so showcase apps can ship "Share this recipe" buttons that:

- **don't require an account** — the sender's identity is a per-device ECDSA keypair
- **don't put the content on a server** — payload travels in a URL fragment (never sent to origin) or a QR code
- **survive Shippie disappearing** — the QR code itself encodes the recipe; reading it works in five years

## What's in the box

| File | Purpose |
|---|---|
| `src/blob.ts` | `ShareBlob` shape, ECDSA P-256 sign + verify, canonical JSON encoding, content hashing for lineage |
| `src/pubkey.ts` | Per-device keypair generation + persistence in localStorage; friendly display name |
| `src/url.ts` | Pack a blob into a base64url + gzip fragment, build/read share URLs, single-frame QR fit check |
| `src/index.ts` | Public re-exports + the `createSignedBlob()` convenience helper |

## API

```ts
import {
  createSignedBlob,
  buildShareUrl,
  readImportFragment,
  verifyBlob,
  hashCanonical,
  fragmentFitsInQr,
} from '@shippie/share';

// Sender:
const blob = await createSignedBlob({
  type: 'recipe',
  payload: { title: 'One-pan chicken thighs', ingredients: [...] },
});
const url = await buildShareUrl(blob, 'https://recipe.shippie.app/');
// → "https://recipe.shippie.app/#shippie-import=eJyrVk..."

// Recipient:
const blob = await readImportFragment(window.location.href);
if (!blob) return; // no import in URL
const result = await verifyBlob(blob);
if (result.valid) {
  // Trusted — show as "from <author.name>"
} else if (result.reason === 'tampered') {
  // Signature didn't match — refuse import
}

// Lineage tracking:
const parent_hash = await hashCanonical(blob.payload);
const remix = await createSignedBlob({
  type: 'recipe',
  payload: tweaked,
  parent_hash,
});
```

## Threat model

- **Tamper detection**: an attacker who modifies the blob mid-transit (changes ingredients, swaps the title) will fail signature verification. The recipient sees `valid: false, reason: 'tampered'`.
- **Identity impersonation**: someone could craft a blob with another person's display name. Recipients should only trust `author.name` if `author.pubkey` matches one they've imported from before. The signature proves the same private key signed; it does not prove human identity.
- **Replay**: out of scope for v1. A blob is a static document; "replay" would just be sharing the same recipe twice.
- **Photo + media exfil**: photos are embedded as data URLs in the blob, so they live on whichever device imports. No third-party server is involved unless the maker app chooses to fetch external resources from the recipe text.

## Limits

- **Blob size**: aim for < 1.8 KB compressed (≈ MAX_FRAGMENT_BYTES) for single-frame QR. Larger payloads work fine via Web Share / clipboard URL — the compression typically halves the size for repetitive JSON.
- **Browser support**: ECDSA P-256 + SubtleCrypto + CompressionStream. Universal in modern browsers (Chrome 80+, Safari 16.4+, Firefox 113+). Older browsers degrade gracefully — gzip falls back to identity, signing surfaces an error so the consumer can offer "share without signature."
- **Single-frame QR only in v1**. Chunked QR (multi-frame) lands with the v1.5 device-transfer plan.

## Tests

```bash
cd packages/share && bun test
```

Round-trip across signing + verification + URL encoding + lineage hashing. ECDSA tamper detection is exercised explicitly.
