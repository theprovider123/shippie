// packages/analyse/src/wasm-detector.ts
/**
 * Walks the deploy bundle's file map and reports any `.wasm` files plus
 * the response headers the worker must apply when serving them. The COEP
 * + COOP pair is required for SharedArrayBuffer + multi-threaded WASM to
 * work in modern browsers; without them, threaded WASM modules silently
 * fall back to single-threaded mode (or fail outright).
 */
import type { WasmReport } from './profile.ts';

export function detectWasm(files: ReadonlyMap<string, Uint8Array>): WasmReport {
  const wasmFiles = [...files.keys()].filter((p) => p.endsWith('.wasm'));
  if (wasmFiles.length === 0) {
    return { detected: false, files: [], headers: {} };
  }
  return {
    detected: true,
    files: wasmFiles,
    headers: {
      'Content-Type': 'application/wasm',
      // Required for SharedArrayBuffer + multi-threaded WASM.
      'Cross-Origin-Embedder-Policy': 'require-corp',
      'Cross-Origin-Opener-Policy': 'same-origin',
    },
  };
}
