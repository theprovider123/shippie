/**
 * Tiny markdown → HTML renderer for the print view + section preview.
 *
 * We deliberately don't pull in a markdown library. The print view
 * needs a small, predictable subset:
 *
 *   - Headings (#, ##, ###)
 *   - Paragraphs (blank-line separated)
 *   - Bullet lists (- or *)
 *   - Numbered lists (1. 2. ...)
 *   - **bold** and *italic*
 *   - `inline code`
 *   - Plain links don't need to be clickable in print, but we keep
 *     them as <a> for the in-app preview
 *
 * Everything is escaped first, then markdown tokens are reapplied —
 * which means the output is XSS-safe by construction. Tested in
 * markdown.test.ts with malicious inputs ("<script>", "javascript:").
 */

const ESC: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

export function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ESC[c] ?? c);
}

/** Render inline markdown (bold, italic, code, links) on already-escaped text. */
function inline(escaped: string): string {
  let out = escaped;
  // `code` first so we don't bold/italic inside it.
  out = out.replace(/`([^`]+)`/g, '<code>$1</code>');
  // **bold** and __bold__
  out = out.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  out = out.replace(/__([^_]+)__/g, '<strong>$1</strong>');
  // *italic* and _italic_ — careful not to capture across whole strings;
  // require non-space at the boundaries.
  out = out.replace(/(^|[\s(])\*([^*\s][^*]*[^*\s]|[^*\s])\*(?=[\s).,;:!?]|$)/g, '$1<em>$2</em>');
  out = out.replace(/(^|[\s(])_([^_\s][^_]*[^_\s]|[^_\s])_(?=[\s).,;:!?]|$)/g, '$1<em>$2</em>');
  // [text](url) — only http/https/mailto are honored. Everything else
  // is rendered as plain text (defence against javascript:).
  out = out.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_, text: string, url: string) => {
    const safe = /^(https?:|mailto:)/i.test(url.trim());
    if (!safe) return text;
    return `<a href="${url}">${text}</a>`;
  });
  return out;
}

/**
 * Render a markdown document to safe HTML. The supported subset is
 * documented above; everything outside it is treated as a paragraph.
 */
export function renderMarkdown(md: string): string {
  if (!md || md.trim().length === 0) return '';
  const escaped = escapeHtml(md);
  const lines = escaped.split('\n');

  type Block =
    | { kind: 'h'; level: 1 | 2 | 3; text: string }
    | { kind: 'p'; text: string }
    | { kind: 'ul'; items: string[] }
    | { kind: 'ol'; items: string[] };

  const blocks: Block[] = [];
  let buf: string[] = [];
  let listKind: 'ul' | 'ol' | null = null;
  let listItems: string[] = [];

  function flushPara() {
    if (buf.length === 0) return;
    blocks.push({ kind: 'p', text: buf.join(' ') });
    buf = [];
  }
  function flushList() {
    if (listItems.length === 0 || listKind === null) return;
    blocks.push({ kind: listKind, items: listItems });
    listKind = null;
    listItems = [];
  }

  for (const raw of lines) {
    const line = raw.trim();
    if (line.length === 0) {
      flushPara();
      flushList();
      continue;
    }
    const h3 = /^###\s+(.+)$/.exec(line);
    const h2 = /^##\s+(.+)$/.exec(line);
    const h1 = /^#\s+(.+)$/.exec(line);
    if (h1 || h2 || h3) {
      flushPara();
      flushList();
      const m = h1 ?? h2 ?? h3;
      const level: 1 | 2 | 3 = h1 ? 1 : h2 ? 2 : 3;
      blocks.push({ kind: 'h', level, text: m![1]! });
      continue;
    }
    const ul = /^[-*]\s+(.+)$/.exec(line);
    if (ul) {
      flushPara();
      if (listKind && listKind !== 'ul') flushList();
      listKind = 'ul';
      listItems.push(ul[1]!);
      continue;
    }
    const ol = /^(\d+)\.\s+(.+)$/.exec(line);
    if (ol) {
      flushPara();
      if (listKind && listKind !== 'ol') flushList();
      listKind = 'ol';
      listItems.push(ol[2]!);
      continue;
    }
    // Plain paragraph line.
    flushList();
    buf.push(line);
  }
  flushPara();
  flushList();

  return blocks
    .map((b) => {
      if (b.kind === 'h') return `<h${b.level}>${inline(b.text)}</h${b.level}>`;
      if (b.kind === 'p') return `<p>${inline(b.text)}</p>`;
      const tag = b.kind;
      return `<${tag}>${b.items.map((i) => `<li>${inline(i)}</li>`).join('')}</${tag}>`;
    })
    .join('\n');
}
