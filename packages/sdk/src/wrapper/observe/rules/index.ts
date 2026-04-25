// packages/sdk/src/wrapper/observe/rules/index.ts
/**
 * Built-in rule registration. Importing this module registers the
 * default rule set with the registry; call sites that want a clean
 * slate can use `_resetForTest` from the registry module.
 */
import { registerRule } from '../registry.ts';
import { wakelockRule } from './wakelock.ts';
import { shareTargetRule } from './share-target.ts';
import { texturesRule } from './textures.ts';

let registered = false;

export function registerBuiltins(): void {
  if (registered) return;
  registered = true;
  registerRule(wakelockRule);
  registerRule(shareTargetRule);
  registerRule(texturesRule);
}

export { wakelockRule, shareTargetRule, texturesRule };
export { onReceive as onShareReceive } from './share-target.ts';
