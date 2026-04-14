import type { ShippieJson } from '@shippie/shared';

export interface InjectionOptions {
  manifest: ShippieJson;
  /**
   * The active deploy version number. Used in the service worker
   * cache name so updates are clean.
   */
  version: number;
  /**
   * If true, also inject a <meta http-equiv="Content-Security-Policy">
   * as a safety net. The runtime CSP from the Worker is still the
   * primary one.
   */
  injectInlineCsp?: boolean;
}

export interface InjectedFile {
  path: string;
  content: string;
  modified: boolean;
}

export interface InjectionResult {
  /** Total HTML files scanned. */
  scanned: number;
  /** Files that were modified (gained at least one new tag). */
  modified: number;
  /** Any warnings worth surfacing in the deploy report. */
  warnings: string[];
}
