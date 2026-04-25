/**
 * Loader for the transformers.js runtime, evaluated inside the dedicated
 * Worker (or the iframe main thread as a fallback).
 *
 * We import via dynamic ESM from the same origin so the model loader picks
 * up the iframe's Cache Storage scope. Failing that, fall back to the
 * Hugging Face CDN. Tests inject a fake via setTransformersLoaderForTest.
 */
import type { TransformersModule } from '@shippie/local-ai';

let loaderOverride: (() => Promise<TransformersModule>) | null = null;

export function setTransformersLoaderForTest(loader: (() => Promise<TransformersModule>) | null) {
  loaderOverride = loader;
}

export async function loadTransformers(): Promise<TransformersModule> {
  if (loaderOverride) return loaderOverride();
  // In production the model CDN serves transformers.js at /runtime/; the
  // build pipeline pins a specific version. In dev we let Vite resolve the
  // dependency from node_modules.
  const mod = (await import(
    /* @vite-ignore */ '@huggingface/transformers'
  ).catch(() => null)) as TransformersModule | null;
  if (!mod) {
    throw new Error(
      '@huggingface/transformers is unavailable — the AI app must ship the runtime to enable inference',
    );
  }
  return mod;
}
