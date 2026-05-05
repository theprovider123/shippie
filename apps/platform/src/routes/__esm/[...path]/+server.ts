/**
 * `/__esm/<path>` — same-origin mirror of esm.sh.
 *
 * The container's AI worker dynamic-imports `@huggingface/transformers`
 * via this route so the on-device runtime stops needing a third-party
 * CDN at request time. The proxy library does the body rewriting and
 * cache-control; this file is the SvelteKit shim.
 */

import type { RequestHandler } from './$types';
import { proxyEsmRequest } from '$lib/server/esm-proxy';

export const GET: RequestHandler = async ({ params, url }) => {
  const path = params.path ?? '';
  return proxyEsmRequest(path, url.search);
};
