export const SHIPPIE_MODEL_CACHE_NAME = 'shippie.models.v1';

/**
 * Same-origin path served by `apps/platform/src/routes/__esm/[...path]/+server.ts`,
 * which proxies the pinned esm.sh artifact and rewrites transitive
 * imports back into our own namespace. Keeping the runtime same-origin
 * means the SW can pre-cache it on install and the dynamic import in
 * `ai-worker.ts` does not depend on a third-party CDN at request time.
 */
export const TRANSFORMERS_RUNTIME_PATH = '/__esm/@huggingface/transformers@3.0.0';
export const TRANSFORMERS_RUNTIME_URL = TRANSFORMERS_RUNTIME_PATH;
export const AI_RUNTIME_URLS = [TRANSFORMERS_RUNTIME_PATH] as const;
