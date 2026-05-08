import type { ParamMatcher } from '@sveltejs/kit';

export const match: ParamMatcher = (param) => /^@[a-z0-9][a-z0-9_-]{1,31}$/.test(param);
