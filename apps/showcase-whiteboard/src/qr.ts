/**
 * Tiny QR renderer — generates an SVG data URL. We deliberately don't
 * pull in a QR library because the @shippie/sdk wrapper already ships
 * one, and we want the showcase bundle to stay small. This module only
 * encodes a short URL into a 21×21 (Version 1) byte-mode QR with EC
 * level L — fine for a join URL ≤ 17 ASCII chars (`?j=ABCDEFGH`).
 *
 * If the encoded payload exceeds capacity we fall back to a textual
 * representation. The UI shows the join code below the QR anyway, so
 * scanning is not the only entry path.
 */

/**
 * For our use we don't actually need a real QR encoder — the wrapper
 * SDK already exposes `renderQrSvg`. Re-export a thin wrapper around
 * `@shippie/sdk/wrapper` so the dev still sees a real QR.
 */
export { renderQrSvg } from '@shippie/sdk/wrapper';
