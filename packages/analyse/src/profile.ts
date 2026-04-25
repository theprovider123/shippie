// packages/analyse/src/profile.ts
/**
 * Static-analysis output for a single deployed app. Produced once at
 * deploy time, stored in KV alongside the app's wrap meta, consumed by
 * (a) the PWA manifest generator, (b) the observe compiler, and (c) the
 * maker dashboard's "Enhancements" tab.
 *
 * Every field is a guess. Confidence is communicated implicitly by the
 * defaults that flow downstream — for instance, `category.primary` only
 * affects the recommended enhance map; the maker can always override.
 */

export interface AppProfile {
  /** Best-guess display title from the deploy bundle. */
  inferredName: string;

  elements: ElementInventory;
  category: CategoryGuess;
  design: DesignTokens;
  framework: FrameworkGuess;
  wasm: WasmReport;

  /** Suggested enhance rules, expressed as the same selector→behaviours
   *  map the observer consumes from shippie.json. The deploy pipeline
   *  flattens this through `compileEnhanceConfig`. */
  recommended: RecommendedConfig;
}

export interface ElementInventory {
  buttons: number;
  textInputs: { count: number; names: string[] };
  fileInputs: { count: number; accepts: string[] };
  lists: { count: number; itemCounts: number[] };
  images: number;
  videos: number;
  canvases: number;
  forms: number;
  links: number;
}

export interface CategoryGuess {
  primary:
    | 'cooking'
    | 'fitness'
    | 'finance'
    | 'journal'
    | 'tools'
    | 'media'
    | 'social'
    | 'reference'
    | 'unknown';
  confidence: number;
  signals: string[];
}

export interface DesignTokens {
  primaryColor: string | null;
  backgroundColor: string | null;
  fontFamily: string | null;
  hasCustomAnimations: boolean;
  /** Icon hrefs found in `<link rel="icon|apple-touch-icon|...">`. */
  iconHrefs: string[];
}

export interface FrameworkGuess {
  name: 'react' | 'vue' | 'svelte' | 'preact' | 'vanilla' | 'wasm' | null;
  version: string | null;
  hasRouter: boolean;
  hasServiceWorker: boolean;
}

export interface WasmReport {
  detected: boolean;
  files: string[];
  /** Headers the worker must apply when serving these files. */
  headers: Record<string, string>;
}

export interface RecommendedConfig {
  enhance: Record<string, string[]>;
  feel: {
    haptics: boolean;
    transitions: 'spring' | 'css' | 'off';
    scrollBounce: boolean;
    sound: boolean;
  };
  ambient: {
    wakeLock: 'auto' | 'off';
  };
  ai: string[] | false;
}
