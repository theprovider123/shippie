// Stateless share links. A bracket is encoded into the URL hash so a friend can
// open it with zero backend — the link *is* the data. UTF-8 safe base64url.

import { SCHEMA_VERSION, type Prediction } from "./types";
import type { GroupLetter } from "../data/tournament";

export interface SharePayload {
  name: string;
  uid: string;
  favTeam?: string;
  prediction: Prediction;
}

function b64urlEncode(bytes: Uint8Array): string {
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function b64urlDecode(s: string): Uint8Array {
  const pad = s.length % 4 === 0 ? "" : "=".repeat(4 - (s.length % 4));
  const bin = atob(s.replace(/-/g, "+").replace(/_/g, "/") + pad);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

// Compact wire shape — short keys keep links small enough for QR codes.
interface Wire {
  v: number;
  n: string; // name
  u: string; // uid
  f?: string; // fav team
  g: Partial<Record<GroupLetter, string[]>>; // groups
  k: Record<string, string>; // knockout
  t?: string; // top scorer
  c: number; // createdAt
}

export function encodeShare(p: SharePayload): string {
  const wire: Wire = {
    v: SCHEMA_VERSION,
    n: p.name.slice(0, 40),
    u: p.uid,
    f: p.favTeam,
    g: p.prediction.groups,
    k: p.prediction.knockout,
    t: p.prediction.topScorer,
    c: p.prediction.createdAt,
  };
  const json = JSON.stringify(wire);
  return b64urlEncode(new TextEncoder().encode(json));
}

export function decodeShare(code: string): SharePayload | null {
  try {
    const json = new TextDecoder().decode(b64urlDecode(code.trim()));
    const w = JSON.parse(json) as Wire;
    if (!w || typeof w !== "object" || !w.u || !w.g || !w.k) return null;
    const prediction: Prediction = {
      v: w.v ?? SCHEMA_VERSION,
      groups: w.g,
      knockout: w.k,
      topScorer: w.t,
      createdAt: w.c ?? 0,
    };
    return { name: w.n ?? "A mate", uid: w.u, favTeam: w.f, prediction };
  } catch {
    return null;
  }
}

/** Build a full shareable URL for the current origin + base path. */
export function shareUrl(payload: SharePayload, base?: string): string {
  const root =
    base ??
    (typeof location !== "undefined"
      ? location.origin + location.pathname
      : "https://shippie.app/golazo");
  return `${root}#b=${encodeShare(payload)}`;
}

/** Pull a shared bracket out of the current location hash, if present. */
export function readShareFromHash(hash: string): SharePayload | null {
  const m = /[#&]b=([^&]+)/.exec(hash);
  if (!m) return null;
  return decodeShare(m[1]);
}

// ── Shared sweepstake draws ──────────────────────────────────────────────────
// The organiser runs the draw once; the link IS the draw. Everyone who opens it
// recomputes the identical allocation from (members, seed, mode, scope). Still
// zero backend. We only need the config, not the dealt teams — the deal is
// deterministic.
import type { Sweep, SweepMode, SweepScope } from "./sweeps";

interface SweepWire {
  v: number;
  n: string; // sweep name
  s: string; // seed
  m: string[]; // members
  md?: SweepMode; // mode
  sc?: SweepScope; // scope
  st?: number; // stake
  cu?: string; // currency
  c?: number; // createdAt
}

export function encodeSweep(sweep: Sweep): string {
  const wire: SweepWire = {
    v: SCHEMA_VERSION,
    n: sweep.name.slice(0, 40),
    s: sweep.seed,
    m: sweep.members.map((x) => x.slice(0, 24)).slice(0, 64),
    md: sweep.mode,
    sc: sweep.scope,
    st: sweep.stake,
    cu: sweep.currency,
    c: sweep.createdAt,
  };
  return b64urlEncode(new TextEncoder().encode(JSON.stringify(wire)));
}

export function decodeSweep(code: string): Sweep | null {
  try {
    const w = JSON.parse(
      new TextDecoder().decode(b64urlDecode(code.trim())),
    ) as SweepWire;
    if (!w || !w.s || !Array.isArray(w.m)) return null;
    return {
      id: `shared-${w.s}`,
      name: w.n || "Sweepstake",
      seed: w.s,
      members: w.m,
      createdAt: w.c ?? 0,
      mode: w.md,
      scope: w.sc,
      stake: w.st,
      currency: w.cu,
    };
  } catch {
    return null;
  }
}

export function sweepUrl(sweep: Sweep, base?: string): string {
  const root =
    base ??
    (typeof location !== "undefined"
      ? location.origin + location.pathname
      : "https://shippie.app/golazo");
  return `${root}#sweep=${encodeSweep(sweep)}`;
}

export function readSweepFromHash(hash: string): Sweep | null {
  const m = /[#&]sweep=([^&]+)/.exec(hash);
  if (!m) return null;
  return decodeSweep(m[1]);
}
