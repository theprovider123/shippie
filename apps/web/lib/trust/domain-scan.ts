/**
 * Outbound domain scanner — walks a deploy's file tree and extracts
 * every external URL it can find, classifying by source file type.
 *
 * This is intentionally regex-based (not AST) so it catches patterns
 * across JS, TS, HTML, JSON, CSS, Svelte, Vue, and any minified output.
 * The trade-off is false positives (URLs in comments / strings that are
 * never actually fetched), which we accept: flagging an unused domain
 * is better than missing a real one.
 *
 * Classified sources:
 *   html      — any .html file
 *   js        — .js/.mjs/.cjs/.ts/.tsx/.jsx/.svelte/.vue
 *   manifest  — shippie.json, site.webmanifest, manifest.json
 *   function  — files under functions/
 *
 * Spec v6 §9 (trust enforcement — external domain scanning).
 */

export type DomainSource = 'html' | 'js' | 'manifest' | 'function';

export interface DomainHit {
  domain: string;
  source: DomainSource;
  evidence: string;
}

export interface DomainScanResult {
  hits: DomainHit[];
  uniqueDomains: string[];
}

const URL_PATTERN = /https?:\/\/([a-z0-9][a-z0-9.-]*[a-z0-9])(?::\d+)?(?:\/[^\s"'<>`)}\],]*)?/gi;

const SAFE_DOMAINS = new Set([
  // Same-origin SDK + MDN links in comments — these are never real
  // outbound fetches. Filter them out up front.
  'localhost',
  'shippie.app',
  'www.w3.org',
  'www.mozilla.org',
  'developer.mozilla.org',
]);

export function scanFilesForDomains(files: Map<string, Buffer>): DomainScanResult {
  const hits: DomainHit[] = [];

  for (const [path, buf] of files) {
    const source = classifyPath(path);
    if (!source) continue;

    const text = buf.toString('utf8');
    for (const match of text.matchAll(URL_PATTERN)) {
      const domain = match[1]!.toLowerCase();
      if (SAFE_DOMAINS.has(domain)) continue;
      // Strip trailing dots etc.
      const normalized = domain.replace(/\.+$/, '');
      hits.push({
        domain: normalized,
        source,
        evidence: `${path}: ${match[0].slice(0, 120)}`,
      });
    }
  }

  const uniqueDomains = [...new Set(hits.map((h) => h.domain))].sort();
  return { hits, uniqueDomains };
}

function classifyPath(path: string): DomainSource | null {
  const lower = path.toLowerCase();
  if (lower.startsWith('functions/')) return 'function';
  if (lower === 'shippie.json' || lower === 'site.webmanifest' || lower === 'manifest.json') {
    return 'manifest';
  }
  if (/\.html?$/.test(lower)) return 'html';
  if (/\.(js|mjs|cjs|ts|tsx|jsx|svelte|vue)$/.test(lower)) return 'js';
  return null;
}
