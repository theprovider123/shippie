import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { Window } from 'happy-dom';
import {
  LocalAI,
  ShippieAINotInstalledError,
  SHIPPIE_AI_ORIGIN,
  _setDefaultLocalAIForTest,
  local,
  load,
} from './local.ts';

let win: Window;
const originalWindow = (globalThis as any).window;
const originalDocument = (globalThis as any).document;

beforeEach(() => {
  win = new Window({ url: 'https://demo.shippie.app/' });
  (globalThis as any).window = win;
  (globalThis as any).document = win.document;
  _setDefaultLocalAIForTest(null);
});

afterEach(() => {
  (globalThis as any).window = originalWindow;
  (globalThis as any).document = originalDocument;
  _setDefaultLocalAIForTest(null);
});

describe('shippie.local loader', () => {
  test('returns existing runtime without injecting a script', async () => {
    (win as any).shippie = { local: { version: 'test-runtime', db: { query: () => [] } } };

    await expect(load()).resolves.toMatchObject({ version: 'test-runtime' });
    expect(win.document.querySelector('script[data-shippie-local-runtime]')).toBeNull();
    expect(local.db).toEqual({ query: expect.any(Function) });
  });

  test('injects same-origin local runtime script on demand', async () => {
    const pending = load();
    const script = win.document.querySelector('script[data-shippie-local-runtime]') as unknown as HTMLScriptElement;
    expect(script?.getAttribute('src')).toBe('/__shippie/local.js');

    (win as any).shippie = { local: { version: 'loaded', capabilities: () => ({ wasm: true }) } };
    script.dispatchEvent(new win.Event('load') as never);

    await expect(pending).resolves.toMatchObject({ version: 'loaded' });
    await expect(local.capabilities()).resolves.toEqual({ wasm: true });
  });

  test('local.ai prefers runtime-attached implementation when present', () => {
    const runtimeAi = { classify: () => Promise.resolve({ label: 'x', confidence: 1 }) };
    (win as any).shippie = { local: { ai: runtimeAi } };
    expect(local.ai).toBe(runtimeAi);
  });

  test('local.ai returns the iframe-backed default when no runtime ai is attached', () => {
    expect(local.ai).toBeInstanceOf(LocalAI);
  });
});

// ---------------------------------------------------------------------------
// LocalAI iframe bridge
// ---------------------------------------------------------------------------

interface FakeIframeContent {
  postMessage(data: unknown, targetOrigin: string): void;
}

function setupFakeIframe(opts: {
  onPostFromHost: (data: any, targetOrigin: string) => void;
  // Replies the iframe should send back. The harness fires them when the
  // host posts a request.
  reply?: (data: any) => any;
  // Whether the iframe announces ready on attach.
  announceReady?: boolean;
}) {
  const docAny = win.document as any;
  const winAny = win as any;
  const realCreateElement = docAny.createElement.bind(docAny);

  let iframeEl: any = null;

  docAny.createElement = (tag: string) => {
    const el = realCreateElement(tag);
    if (tag.toLowerCase() !== 'iframe') return el;

    iframeEl = el;
    const fakeContent: FakeIframeContent = {
      postMessage(data: unknown, targetOrigin: string) {
        opts.onPostFromHost(data, targetOrigin);
        if (opts.reply) {
          const replyData = opts.reply(data);
          if (replyData) {
            // Dispatch a synthetic MessageEvent on the host window with
            // origin=ai.shippie.app so the bridge accepts it.
            queueMicrotask(() => {
              winAny.dispatchEvent(
                Object.assign(new winAny.Event('message'), {
                  data: replyData,
                  origin: SHIPPIE_AI_ORIGIN,
                  source: fakeContent,
                }),
              );
            });
          }
        }
      },
    };

    Object.defineProperty(el, 'contentWindow', {
      configurable: true,
      get: () => fakeContent,
    });

    // After the iframe is appended we'll fire the ready message. We hook
    // into appendChild via prototype patching once.
    if (opts.announceReady !== false) {
      const realAppend = docAny.body.appendChild.bind(docAny.body);
      docAny.body.appendChild = (node: any) => {
        const out = realAppend(node);
        if (node === el) {
          queueMicrotask(() => {
            winAny.dispatchEvent(
              Object.assign(new winAny.Event('message'), {
                data: { type: 'ready', tasks: ['classify', 'embed', 'sentiment', 'moderate'] },
                origin: SHIPPIE_AI_ORIGIN,
                source: fakeContent,
              }),
            );
          });
        }
        return out;
      };
    }

    return el;
  };

  return {
    get iframeEl() {
      return iframeEl;
    },
  };
}

describe('LocalAI iframe bridge', () => {
  test('classify result rides the source field back through the bridge', async () => {
    setupFakeIframe({
      onPostFromHost: () => {},
      reply: (req) => ({
        requestId: req.requestId,
        result: { label: 'transport', confidence: 0.94, source: 'webnn-npu' },
      }),
    });

    const ai = new LocalAI({
      doc: win.document as any,
      win: win as any,
      randomId: () => 'src-1',
    });

    const result = (await ai.classify('Uber to Heathrow', ['transport', 'food'])) as {
      label: string;
      confidence: number;
      source?: string;
    };
    expect(result.source).toBe('webnn-npu');
    expect(result.label).toBe('transport');
  });

  test('classify round-trips through postMessage with origin pinning', async () => {
    const sent: Array<{ data: any; targetOrigin: string }> = [];
    setupFakeIframe({
      onPostFromHost: (data, targetOrigin) => {
        sent.push({ data, targetOrigin });
      },
      reply: (req) => ({
        requestId: req.requestId,
        result: { label: 'food', confidence: 0.91 },
      }),
    });

    const ai = new LocalAI({
      doc: win.document as any,
      win: win as any,
      randomId: () => 'fixed-id-1',
    });

    const result = await ai.classify('pasta', ['food', 'travel']);
    expect(result).toEqual({ label: 'food', confidence: 0.91 });
    expect(sent).toHaveLength(1);
    expect(sent[0]!.targetOrigin).toBe(SHIPPIE_AI_ORIGIN);
    expect(sent[0]!.data).toEqual({
      requestId: 'fixed-id-1',
      task: 'classify',
      payload: { text: 'pasta', labels: ['food', 'travel'] },
    });

    // Iframe sandbox must be restrictive.
    const sandbox = (win.document.querySelector('iframe') as any)?.getAttribute('sandbox');
    expect(sandbox).toBe('allow-scripts allow-same-origin');
  });

  test('throws ShippieAINotInstalledError on iframe load error', async () => {
    setupFakeIframe({
      onPostFromHost: () => {},
      announceReady: false,
    });

    const ai = new LocalAI({
      doc: win.document as any,
      win: win as any,
      randomId: () => 'r',
    });
    const pending = ai.classify('x', ['a']);

    // Fire the iframe's error event.
    const iframe = win.document.querySelector('iframe') as any;
    queueMicrotask(() => {
      iframe.dispatchEvent(new (win as any).Event('error'));
    });

    await expect(pending).rejects.toBeInstanceOf(ShippieAINotInstalledError);
  });

  test('rejects in-flight requests when teardown is called', async () => {
    const sent: any[] = [];
    setupFakeIframe({
      onPostFromHost: (data) => sent.push(data),
      // Don't reply — keep the request pending.
      reply: () => undefined,
    });

    const ai = new LocalAI({
      doc: win.document as any,
      win: win as any,
      randomId: () => 'r',
    });

    const pending = ai.embed('hello');
    // Wait for the post.
    await new Promise((r) => setTimeout(r, 0));
    ai.teardown();
    await expect(pending).rejects.toThrow(/torn down/);
  });

  test('drops messages from non-ai.shippie.app origins', async () => {
    setupFakeIframe({
      onPostFromHost: () => {},
      reply: () => undefined,
    });

    const ai = new LocalAI({
      doc: win.document as any,
      win: win as any,
      randomId: () => 'r',
    });
    const pending = ai.embed('x');
    await new Promise((r) => setTimeout(r, 0));

    // Spoofed reply from a different origin.
    (win as any).dispatchEvent(
      Object.assign(new (win as any).Event('message'), {
        data: { requestId: 'r', result: [1, 2, 3] },
        origin: 'https://evil.com',
      }),
    );

    // Real reply from the iframe.
    (win as any).dispatchEvent(
      Object.assign(new (win as any).Event('message'), {
        data: { requestId: 'r', result: [4, 5, 6] },
        origin: SHIPPIE_AI_ORIGIN,
      }),
    );

    await expect(pending).resolves.toEqual([4, 5, 6]);
  });
});
