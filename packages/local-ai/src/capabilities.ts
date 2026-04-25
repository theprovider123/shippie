import type { LocalAiAvailability } from '@shippie/local-runtime-contract';

export interface LocalAiCapabilityOptions {
  nav?: { gpu?: unknown };
  webAssembly?: typeof WebAssembly | false;
}

export function detectLocalAiAvailability(opts: LocalAiCapabilityOptions = {}): LocalAiAvailability {
  const nav = opts.nav ?? globalThis.navigator;
  const wasm = opts.webAssembly === undefined ? Boolean(globalThis.WebAssembly) : Boolean(opts.webAssembly);
  const gpu = Boolean(nav && 'gpu' in nav && nav.gpu);
  return {
    embeddings: wasm,
    classification: wasm,
    sentiment: wasm,
    vision: wasm && gpu,
    gpu,
    wasm,
  };
}
