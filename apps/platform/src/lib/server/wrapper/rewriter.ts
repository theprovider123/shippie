/**
 * PWA-tag injection into an upstream HTML stream. Ported from
 * services/worker/src/rewriter.ts.
 *
 * Uses the Workers-native HTMLRewriter. For HTML responses, inserts:
 *   - <link rel="manifest" href="/__shippie/manifest">
 *   - <script src="/__shippie/sdk.js" async></script>
 * before </head>. Falls back to <body> prepend if HTML is malformed.
 *
 * Non-HTML bodies are passed through unchanged. Duplicate-injection is
 * prevented by checking the existing DOM for an SDK / manifest tag.
 */

declare const HTMLRewriter: {
  new (): {
    on(
      selector: string,
      handler: {
        element?: (el: HTMLRewriterElement) => void;
      }
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
    }
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
  opts: InjectOpts
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
      }
    })
    .on('script[src="/__shippie/sdk.js"]', {
      element() {
        sdkSeen = true;
      }
    })
    .on('head', {
      element(el) {
        headSeen = true;
        el.onEndTag((endTag) => {
          if (!manifestSeen) endTag.before(MANIFEST_TAG, { html: true });
          if (!sdkSeen) endTag.before(SDK_TAG, { html: true });
        });
      }
    })
    .on('body', {
      element(el) {
        if (headSeen) return;
        if (!manifestSeen) el.prepend(MANIFEST_TAG, { html: true });
        if (!sdkSeen) el.prepend(SDK_TAG, { html: true });
      }
    });

  return rewriter.transform(res).body!;
}
