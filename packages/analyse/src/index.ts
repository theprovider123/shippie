// packages/analyse/src/index.ts
export type * from './profile.ts';

export interface AppFiles {
  /** Maps relative path → file bytes. Path always uses '/' separators
   *  and never starts with '/'. */
  files: ReadonlyMap<string, Uint8Array>;
}

import type { AppProfile } from './profile.ts';

export async function analyseApp(_input: AppFiles): Promise<AppProfile> {
  throw new Error('analyseApp not yet implemented — see Tasks 2–8');
}
