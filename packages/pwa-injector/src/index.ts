/**
 * @shippie/pwa-injector
 *
 * Build-time HTML + service worker + manifest generation.
 *
 * Usage:
 *   const injector = createInjector(shippieJson, version);
 *   const modified = injector.injectHtml(htmlString);
 *   const manifest = injector.manifest();
 *   const sw = injector.serviceWorker();
 *
 * Spec v6 §9.
 */
import type { ShippieJson } from '@shippie/shared';
import { injectPwaTags } from './inject-html.ts';
import { generateManifest, type GeneratedManifest } from './generate-manifest.ts';
import { generateServiceWorker } from './generate-sw.ts';
import type { InjectionOptions } from './types.ts';

export interface Injector {
  /** Inject tags into an HTML document. Returns the modified HTML + a flag. */
  injectHtml(html: string): { html: string; modified: boolean };
  /** Generated manifest.json payload. */
  manifest(): GeneratedManifest;
  /** Generated service worker source. */
  serviceWorker(): string;
}

export function createInjector(manifest: ShippieJson, version: number): Injector {
  const opts: InjectionOptions = {
    manifest,
    version,
    injectInlineCsp: false, // Runtime CSP from the Worker is primary
  };

  return {
    injectHtml(html) {
      return injectPwaTags(html, opts);
    },
    manifest() {
      return generateManifest(manifest);
    },
    serviceWorker() {
      return generateServiceWorker(manifest.slug ?? 'app', version);
    },
  };
}

export type { InjectionOptions, InjectedFile, InjectionResult } from './types.ts';
export type { GeneratedManifest } from './generate-manifest.ts';
export { injectPwaTags } from './inject-html.ts';
export { generateManifest } from './generate-manifest.ts';
export { generateServiceWorker } from './generate-sw.ts';
