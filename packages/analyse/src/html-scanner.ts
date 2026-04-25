/**
 * Regex-based HTML scanner. Trades parser correctness for speed and
 * zero-deps. Counts may be ±5% on adversarial input — acceptable for an
 * inference heuristic. Refine with a real parser if accuracy becomes a
 * problem in production.
 */
import type { ElementInventory } from './profile.ts';

export interface HtmlScanResult {
  elements: ElementInventory;
  inferredName: string;
  iconHrefs: string[];
  hasOwnManifest: boolean;
  /** Concatenated visible text — used downstream by semantic-classifier. */
  visibleText: string;
}

const TAG_RE = (tag: string) => new RegExp(`<${tag}\\b[^>]*>`, 'gi');
const INPUT_RE = /<input\b[^>]*>/gi;
const ATTR_RE = (name: string) => new RegExp(`${name}\\s*=\\s*["']([^"']*)["']`, 'i');
const TITLE_RE = /<title[^>]*>([^<]+)<\/title>/i;
const H1_RE = /<h1[^>]*>([^<]+)<\/h1>/gi;
const LINK_RE = /<link\b[^>]*>/gi;
const LI_IN_LIST_RE = /<(ul|ol)\b[^>]*>([\s\S]*?)<\/\1>/gi;
const LI_RE = /<li\b[^>]*>/gi;
const TEXT_RE = />([^<]+)</g;

const decoder = new TextDecoder();

export function scanHtml(files: ReadonlyMap<string, Uint8Array>): HtmlScanResult {
  const elements: ElementInventory = {
    buttons: 0,
    textInputs: { count: 0, names: [] },
    fileInputs: { count: 0, accepts: [] },
    lists: { count: 0, itemCounts: [] },
    images: 0,
    videos: 0,
    canvases: 0,
    forms: 0,
    links: 0,
  };

  let inferredName = '';
  let largestH1 = '';
  const iconHrefs: string[] = [];
  let hasOwnManifest = false;
  const visibleParts: string[] = [];

  for (const [path, bytes] of files) {
    if (!path.endsWith('.html') && !path.endsWith('.htm')) continue;
    const html = decoder.decode(bytes);

    elements.buttons += match(html, TAG_RE('button')).length;
    elements.images += match(html, TAG_RE('img')).length;
    elements.videos += match(html, TAG_RE('video')).length;
    elements.canvases += match(html, TAG_RE('canvas')).length;
    elements.forms += match(html, TAG_RE('form')).length;
    elements.links += match(html, TAG_RE('a')).length;

    for (const m of html.matchAll(INPUT_RE)) {
      const tag = m[0];
      const type = tag.match(ATTR_RE('type'))?.[1]?.toLowerCase() ?? 'text';
      const name = tag.match(ATTR_RE('name'))?.[1];
      if (type === 'file') {
        elements.fileInputs.count += 1;
        const accept = tag.match(ATTR_RE('accept'))?.[1];
        if (accept) elements.fileInputs.accepts.push(accept);
      } else if (
        type === 'text' || type === 'email' || type === 'search' ||
        type === 'tel' || type === 'url' || type === 'password' || type === 'number'
      ) {
        elements.textInputs.count += 1;
        if (name) elements.textInputs.names.push(name);
      }
    }

    for (const m of html.matchAll(LI_IN_LIST_RE)) {
      const inner = m[2] ?? '';
      const items = match(inner, LI_RE).length;
      elements.lists.count += 1;
      elements.lists.itemCounts.push(items);
    }

    if (!inferredName) {
      const t = html.match(TITLE_RE)?.[1]?.trim();
      if (t) inferredName = t;
    }
    for (const m of html.matchAll(H1_RE)) {
      const text = m[1]?.trim() ?? '';
      if (text.length > largestH1.length) largestH1 = text;
    }

    for (const m of html.matchAll(LINK_RE)) {
      const tag = m[0];
      const rel = tag.match(ATTR_RE('rel'))?.[1]?.toLowerCase();
      const href = tag.match(ATTR_RE('href'))?.[1];
      if (!rel || !href) continue;
      if (rel === 'manifest') hasOwnManifest = true;
      if (rel.includes('icon')) iconHrefs.push(href);
    }

    for (const m of html.matchAll(TEXT_RE)) {
      const text = m[1]?.trim();
      if (text && text.length > 1) visibleParts.push(text);
    }
  }

  if (!inferredName) inferredName = largestH1;
  return {
    elements,
    inferredName,
    iconHrefs,
    hasOwnManifest,
    visibleText: visibleParts.join(' '),
  };
}

function match(text: string, re: RegExp): RegExpMatchArray[] {
  return [...text.matchAll(re)];
}
