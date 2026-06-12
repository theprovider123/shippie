/**
 * Statically-imported resvg wasm — the ONLY way wasm runs on Workers.
 *
 * Workers forbids compiling wasm from bytes at runtime
 * ("Wasm code generation disallowed by embedder"), so fetching the .wasm
 * from static assets can never work in production. Instead this import is:
 *   - externalized from vite's build (see vite.config rollupOptions), and
 *   - compiled into a WebAssembly.Module by wrangler's default
 *     CompiledWasm rule when `wrangler deploy` bundles _worker.js.
 *
 * Under vite dev / vitest this module fails to load — callers must reach
 * it through a guarded dynamic import and fall back to byte injection
 * (which IS allowed outside workerd).
 */
import wasmModule from '@resvg/resvg-wasm/index_bg.wasm';

export default wasmModule as WebAssembly.Module;
