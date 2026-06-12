import type { ParamMatcher } from '@sveltejs/kit';

// Top-level app URLs are human/share entry points: /golazo, /palate, /my-tool.
// Keep the matcher narrow so static platform routes and @profile routes stay
// unambiguous.
export const match: ParamMatcher = (param) =>
  /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(param);
