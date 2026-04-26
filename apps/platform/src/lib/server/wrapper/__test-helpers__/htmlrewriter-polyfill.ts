/**
 * Minimal HTMLRewriter polyfill for vitest (Node) environment.
 *
 * The Cloudflare Workers / Bun runtime provides `HTMLRewriter` as a global
 * with a streaming, selector-driven API. Vitest runs in plain Node where
 * this global doesn't exist, which causes `rewriter.test.ts` and any test
 * that exercises `injectPwaTags` (e.g. files.test.ts SPA fallback) to fail.
 *
 * This polyfill implements only the surface area used by
 * `apps/platform/src/lib/server/wrapper/rewriter.ts`:
 *
 *   new HTMLRewriter()
 *     .on('link[rel="manifest"]', { element() {} })
 *     .on('script[src="/__shippie/sdk.js"]', { element() {} })
 *     .on('head', { element(el) { el.onEndTag(endTag => endTag.before(...)) } })
 *     .on('body', { element(el) { el.prepend(...) } })
 *     .transform(response): Response
 *
 * It is NOT a general-purpose HTML rewriter. It is specifically wired to
 * recognise the selectors above and rewrite simple HTML strings via regex.
 * That's sufficient for unit tests; production runs on the real workers
 * runtime which provides a streaming HTMLRewriter.
 *
 * Call `installHTMLRewriterPolyfill()` once at the top of a test file.
 */

interface PolyfillEndTag {
  before(content: string, opts: { html: boolean }): void;
  after(content: string, opts: { html: boolean }): void;
}

interface PolyfillElement {
  append(content: string, opts: { html: boolean }): void;
  prepend(content: string, opts: { html: boolean }): void;
  before(content: string, opts: { html: boolean }): void;
  after(content: string, opts: { html: boolean }): void;
  getAttribute(name: string): string | null;
  setAttribute(name: string, value: string): void;
  onEndTag(handler: (endTag: PolyfillEndTag) => void): void;
}

type Handler = { element?: (el: PolyfillElement) => void };

interface Registration {
  selector: string;
  handler: Handler;
}

class HTMLRewriterPolyfill {
  private registrations: Registration[] = [];

  on(selector: string, handler: Handler): this {
    this.registrations.push({ selector, handler });
    return this;
  }

  transform(response: Response): Response {
    const original = response;
    const promise = original.text().then((html) => this.rewrite(html));

    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        const out = await promise;
        controller.enqueue(new TextEncoder().encode(out));
        controller.close();
      }
    });

    return new Response(stream, {
      status: original.status,
      statusText: original.statusText,
      headers: original.headers
    });
  }

  private rewrite(html: string): string {
    // Each selector handler may inject before </head>, prepend into <body>,
    // or annotate. We emulate by walking each registration and applying
    // edits to the HTML string.

    let working = html;

    for (const { selector, handler } of this.registrations) {
      if (!handler.element) continue;

      if (selector === 'head') {
        // Find <head>...</head>; pass element with onEndTag → endTag.before
        const headOpenMatch = /<head\b[^>]*>/i.exec(working);
        const headCloseMatch = /<\/head\s*>/i.exec(working);
        if (!headOpenMatch || !headCloseMatch) continue;

        const beforeEndTag: string[] = [];
        const endTag: PolyfillEndTag = {
          before(content) {
            beforeEndTag.push(content);
          },
          after() {
            /* not needed by injectPwaTags */
          }
        };

        const el = makeElementProxy({});
        let endTagHandler: ((e: PolyfillEndTag) => void) | null = null;
        el.onEndTag = (fn: (e: PolyfillEndTag) => void) => {
          endTagHandler = fn;
        };
        handler.element(el);
        if (endTagHandler) (endTagHandler as (e: PolyfillEndTag) => void)(endTag);

        if (beforeEndTag.length > 0) {
          const insertPos = headCloseMatch.index;
          working =
            working.slice(0, insertPos) +
            beforeEndTag.join('') +
            working.slice(insertPos);
        }
      } else if (selector === 'body') {
        const bodyOpen = /<body\b[^>]*>/i.exec(working);
        if (!bodyOpen) continue;

        const prepended: string[] = [];
        const el = makeElementProxy({
          prepend(content) {
            prepended.push(content);
          }
        });
        handler.element(el);

        if (prepended.length > 0) {
          const insertPos = bodyOpen.index + bodyOpen[0].length;
          working =
            working.slice(0, insertPos) +
            prepended.join('') +
            working.slice(insertPos);
        }
      } else if (/^link\[rel="manifest"\]$/.test(selector)) {
        // Detect existing <link rel="manifest"> — call element() once for
        // each match so the test handler can flip a "seen" flag.
        const re = /<link\b[^>]*\brel\s*=\s*["']manifest["'][^>]*>/gi;
        let m;
        while ((m = re.exec(working)) !== null) {
          const el = makeElementProxy({});
          handler.element(el);
        }
      } else if (/^script\[src="\/__shippie\/sdk\.js"\]$/.test(selector)) {
        const re = /<script\b[^>]*\bsrc\s*=\s*["']\/__shippie\/sdk\.js["'][^>]*>/gi;
        let m;
        while ((m = re.exec(working)) !== null) {
          const el = makeElementProxy({});
          handler.element(el);
        }
      }
    }

    return working;
  }
}

function makeElementProxy(overrides: Partial<PolyfillElement>): PolyfillElement {
  const noop = () => {};
  const base: PolyfillElement = {
    append: noop,
    prepend: noop,
    before: noop,
    after: noop,
    getAttribute: () => null,
    setAttribute: noop,
    onEndTag: noop,
    ...overrides
  };
  return base;
}

let installed = false;
export function installHTMLRewriterPolyfill(): void {
  if (installed) return;
  const g = globalThis as { HTMLRewriter?: unknown };
  if (typeof g.HTMLRewriter === 'undefined') {
    g.HTMLRewriter = HTMLRewriterPolyfill;
    installed = true;
  }
}
