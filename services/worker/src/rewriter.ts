// services/worker/src/rewriter.ts
/**
 * PWA-tag injection into an upstream HTML stream.
 *
 * Uses Bun/Workers-native HTMLRewriter. For HTML responses, inserts:
 *   - <link rel="manifest" href="/__shippie/manifest">
 *   - <script src="/__shippie/sdk.js" async></script>
 * before </head>.
 *
 * Non-HTML bodies are passed through unchanged. Duplicate-injection is
 * prevented by a `data-shippie-injected` marker attribute, plus a pre-scan
 * for an existing SDK/manifest tag.
 *
 * If upstream HTML is malformed and has no <head>, we fall back to
 * prepending the tags at the start of <body> so manifest + SDK still load.
 */

declare const HTMLRewriter: {
  new (): {
    on(
      selector: string,
      handler: {
        element?: (el: HTMLRewriterElement) => void;
      },
    ): HTMLRewriterInstance;
    transform(response: Response): Response;
  };
};

interface HTMLRewriterEndTag {
  before(content: string, opts: { html: boolean }): void;
  after(content: string, opts: { html: boolean }): void;
}

interface HTMLRewriterElement {
  append(content: string, opts: { html: boolean }): void;
  prepend(content: string, opts: { html: boolean }): void;
  before(content: string, opts: { html: boolean }): void;
  after(content: string, opts: { html: boolean }): void;
  getAttribute(name: string): string | null;
  setAttribute(name: string, value: string): void;
  onEndTag(handler: (endTag: HTMLRewriterEndTag) => void): void;
}

interface HTMLRewriterInstance {
  on(
    selector: string,
    handler: {
      element?: (el: HTMLRewriterElement) => void;
    },
  ): HTMLRewriterInstance;
  transform(response: Response): Response;
}

export interface InjectOpts {
  slug: string;
  contentType?: string;
}

const MANIFEST_TAG =
  '<link rel="manifest" href="/__shippie/manifest" data-shippie-injected="1">';
const SDK_TAG =
  '<script src="/__shippie/sdk.js" async data-shippie-injected="1"></script>';

export function injectPwaTags(
  body: ReadableStream<Uint8Array>,
  opts: InjectOpts,
): ReadableStream<Uint8Array> {
  const ct = opts.contentType ?? '';
  if (!ct.toLowerCase().includes('text/html')) return body;

  let sdkSeen = false;
  let manifestSeen = false;
  let headSeen = false;

  const res = new Response(body, { headers: { 'content-type': 'text/html' } });
  const rewriter = new HTMLRewriter()
    .on('link[rel="manifest"]', {
      element() {
        manifestSeen = true;
      },
    })
    .on('script[src="/__shippie/sdk.js"]', {
      element() {
        sdkSeen = true;
      },
    })
    .on('head', {
      element(el) {
        headSeen = true;
        // Use onEndTag so our dedupe flags reflect everything we saw
        // inside <head>. Element-start fires BEFORE children are walked,
        // so sdkSeen/manifestSeen aren't reliable at that point.
        el.onEndTag((endTag) => {
          if (!manifestSeen) endTag.before(MANIFEST_TAG, { html: true });
          if (!sdkSeen) endTag.before(SDK_TAG, { html: true });
        });
      },
    })
    .on('body', {
      // Fallback: if we never saw a <head>, inject at the start of <body>
      // so the manifest + SDK still load. Covers malformed HTML from upstreams.
      element(el) {
        if (headSeen) return;
        if (!manifestSeen) el.prepend(MANIFEST_TAG, { html: true });
        if (!sdkSeen) el.prepend(SDK_TAG, { html: true });
      },
    });

  return rewriter.transform(res).body!;
}
