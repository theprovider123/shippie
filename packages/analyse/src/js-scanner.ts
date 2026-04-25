// packages/analyse/src/js-scanner.ts
/**
 * Regex / string-fingerprint scanner for the JavaScript half of a deploy
 * bundle. Goal: cheap, zero-deps framework detection good enough to seed
 * the recommended-config map. We do NOT parse JS — we look for strings
 * that real bundles can't hide (createElement, __vue__, svelte/internal,
 * etc.). Version detection requires a real parser; v1 leaves it null.
 *
 * Priority (highest first):
 *   react > vue > svelte > preact > vanilla > wasm > null
 * Preact is intentionally lower than React/Vue because Preact bundles
 * sometimes ship a React compat layer and we want React to win there.
 */
import type { FrameworkGuess } from './profile.ts';

const decoder = new TextDecoder();

export function scanJs(files: ReadonlyMap<string, Uint8Array>): FrameworkGuess {
  let combinedJs = '';
  let hasJs = false;
  let hasHtml = false;
  let hasWasm = false;

  for (const [path, bytes] of files) {
    if (path.endsWith('.js') || path.endsWith('.mjs')) {
      hasJs = true;
      combinedJs += decoder.decode(bytes);
      // Separator so substring matches don't span files in unintended ways.
      combinedJs += '\n';
    } else if (path.endsWith('.html') || path.endsWith('.htm')) {
      hasHtml = true;
    } else if (path.endsWith('.wasm')) {
      hasWasm = true;
    }
  }

  const hasReact = combinedJs.includes('react') && combinedJs.includes('createElement');
  const hasVue =
    combinedJs.includes('__vue__') ||
    combinedJs.includes('Vue.createApp') ||
    combinedJs.includes('createApp(');
  const hasSvelte = combinedJs.includes('svelte/internal') || combinedJs.includes('__svelte');
  const hasPreact = combinedJs.includes('preact');

  let name: FrameworkGuess['name'] = null;
  if (hasReact) {
    name = 'react';
  } else if (hasVue) {
    name = 'vue';
  } else if (hasSvelte) {
    name = 'svelte';
  } else if (hasPreact) {
    name = 'preact';
  } else if (!hasJs && hasHtml) {
    name = 'vanilla';
  } else if (hasWasm) {
    name = 'wasm';
  }

  const hasRouter =
    combinedJs.includes('react-router') ||
    combinedJs.includes('vue-router') ||
    combinedJs.includes('svelte-routing') ||
    combinedJs.includes('@solidjs/router');

  const hasServiceWorker = combinedJs.includes('navigator.serviceWorker.register');

  return {
    name,
    version: null,
    hasRouter,
    hasServiceWorker,
  };
}
