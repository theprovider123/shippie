/**
 * Public entry point for @shippie/analyse.
 *
 * `analyseApp(files)` runs the full deploy-time inference pipeline:
 *   1. HTML scan → element inventory + visible text + icon hrefs
 *   2. CSS scan → primary colour + background + font + animation flag
 *   3. JS scan → framework + router + service-worker presence
 *   4. WASM detection → headers needed when serving .wasm files
 *   5. Category classification from visible text
 *   6. Capability recommendation from the structured signals above
 *
 * Pure function. No I/O. Deterministic. Fast (regex-only, no AST).
 */
export type * from './profile.ts';
export { classifyKind } from './kind-classifier.ts';
export type {
  AppKind,
  AppKindDetection,
  AppKindLocalization,
} from './kind-classifier.ts';
export { localize } from './localize.ts';
export type {
  LocalizePatch,
  LocalizeRequest,
  LocalizeTransform,
  FileChange,
  NewFile,
} from './localize.ts';
export { extractRemixSpec } from './remix-spec.ts';
export type {
  RemixSpec,
  RemixSpecRequest,
  RoutePoint,
  SchemaTable,
  FormPoint,
  ExternalApi,
} from './remix-spec.ts';
export { runSecurityScan } from './security-scan.ts';
export type {
  SecurityFinding,
  SecurityFindingSeverity,
  SecurityRuleId,
  SecurityScanReport,
} from './security-scan.ts';
export { runPrivacyAudit, classifyDomain } from './privacy-audit.ts';
export type {
  DomainCategory,
  DomainReference,
  PrivacyAuditReport,
} from './privacy-audit.ts';

export interface AppFiles {
  /** Maps relative path → file bytes. Path always uses '/' separators
   *  and never starts with '/'. */
  files: ReadonlyMap<string, Uint8Array>;
}

import type { AppProfile } from './profile.ts';
import { scanHtml } from './html-scanner.ts';
import { scanCss } from './css-scanner.ts';
import { scanJs } from './js-scanner.ts';
import { detectWasm } from './wasm-detector.ts';
import { classifyByText } from './semantic-classifier.ts';
import { recommend } from './capability-recommender.ts';

export async function analyseApp(input: AppFiles): Promise<AppProfile> {
  const html = scanHtml(input.files);
  const css = scanCss(input.files);
  const js = scanJs(input.files);
  const wasm = detectWasm(input.files);
  const category = classifyByText(html.visibleText);
  const recommended = recommend(html.elements, category, js);

  return {
    inferredName: html.inferredName || 'Untitled',
    elements: html.elements,
    category,
    design: {
      primaryColor: css.primaryColor,
      backgroundColor: css.backgroundColor,
      fontFamily: css.fontFamily,
      hasCustomAnimations: css.hasCustomAnimations,
      iconHrefs: html.iconHrefs,
    },
    framework: js,
    wasm,
    recommended,
  };
}
