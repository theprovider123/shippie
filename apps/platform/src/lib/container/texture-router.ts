/**
 * Container — sensory texture router.
 *
 * Phase B4 surface. Forwards iframe-app `feel.texture` bridge calls to
 * the container's already-running texture engine
 * (`@shippie/sdk/wrapper/textures`).
 *
 * Why a router and not a direct call: the container owns ONE engine
 * instance and ONE call to `registerBuiltinTextures()`, and we want to
 * mock/test the routing in isolation without dragging audio context +
 * rAF into vitest. The router accepts an injectable `fire` function so
 * the SDK is dynamic-imported only at runtime, never at typecheck time.
 *
 * Iframe apps cannot register custom textures — only the 9 built-in
 * presets are exposed. That's the YAGNI/NanoClaw guard for B4: makers
 * pick a preset by name, not compose their own.
 */

const VALID_TEXTURE_NAMES = new Set([
  'confirm',
  'complete',
  'error',
  'navigate',
  'delete',
  'refresh',
  'install',
  'milestone',
  'toggle',
] as const);

export type TextureName =
  | 'confirm'
  | 'complete'
  | 'error'
  | 'navigate'
  | 'delete'
  | 'refresh'
  | 'install'
  | 'milestone'
  | 'toggle';

export interface TextureRouter {
  /**
   * Fire a built-in texture by name. Returns false for unknown names so
   * the bridge handler can surface a clean error to the caller.
   */
  fire(name: string): { fired: true; name: TextureName } | { fired: false; reason: 'unknown_texture' };
}

export interface TextureRouterOptions {
  /**
   * Inject a fireTexture implementation. The container wires this from a
   * dynamic-imported `@shippie/sdk/wrapper`. Tests inject a mock.
   */
  fire: (name: TextureName) => void;
}

export function createTextureRouter(options: TextureRouterOptions): TextureRouter {
  return {
    fire(name) {
      if (!isTextureName(name)) {
        return { fired: false, reason: 'unknown_texture' };
      }
      options.fire(name);
      return { fired: true, name };
    },
  };
}

export function isTextureName(value: string): value is TextureName {
  return VALID_TEXTURE_NAMES.has(value as TextureName);
}

export function listBuiltinTextureNames(): readonly TextureName[] {
  return [...VALID_TEXTURE_NAMES] as readonly TextureName[];
}
