# @shippie/qr

Brand-styled QR codes for Shippie. One primitive, multiple consumers:

- Invite share (private app)
- Marketplace share (public app)
- Device-transfer key (whitepaper § Vault, v1.5)
- Hub kiosk install
- CLI deploy print

Wraps [`qr-code-styling`](https://www.npmjs.com/package/qr-code-styling)
with brand defaults baked in (rocket SVG centered, sage/sunset tokens,
sharp corners). Token-driven so a brand redesign propagates through every
consumer.

## API

```ts
import { qrSvg, qrPngDataUrl, scanQr } from '@shippie/qr';

// Synchronous, returns an SVG string. Drop into a Svelte template:
//   {@html qrSvg(invite.url, { ecc: 'H' })}
qrSvg('https://shippie.app/invite/abc', { ecc: 'H' });

// Returns a data: URL for <img src=...>.
await qrPngDataUrl('https://...', { size: 512 });

// Receiver leg of device transfer. Throws 'not_implemented' for v1 —
// BarcodeDetector lacks Safari support and pulling @zxing/browser doubles
// the bundle. Stub is here so the API shape doesn't change in v1.5.
await scanQr(stream);
```

## Client-only

`qr-code-styling` renders to canvas/DOM. **Do not call any of these
functions from server-side code** — `+page.server.ts`, hooks, workers.
SSR a placeholder; render the QR on the client. CreateInviteForm is
client-side, so this constraint is invisible to that consumer.

## Defaults

- ECC level **M** (raise to **H** for transfer keys — more redundancy
  survives the rocket logo punch-out).
- Size **256** px.
- `brand: 'rocket'` — Shippie rocket SVG centered with sunset glow.
- Foreground / background pull from the brand tokens (`--text` / `--bg`)
  with hex fallbacks if the consumer pre-renders before the stylesheet
  is available.
