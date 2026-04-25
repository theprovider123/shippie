import { describe, expect, test } from 'bun:test';
import { createTransformersLocalAi, type TransformersModule, type TransformersPipeline } from './transformers-adapter.ts';

function makeModule(overrides: Partial<TransformersModule> = {}): TransformersModule {
  return {
    pipeline: async () => (async () => ({ data: [0, 0, 0], dims: [1, 1, 3] })) as unknown as TransformersPipeline,
    env: { remoteHost: 'https://wrong.example' },
    ...overrides,
  };
}

describe('createTransformersLocalAi', () => {
  test('embed returns last-dim slice as Float32Array', async () => {
    const module: TransformersModule = makeModule({
      pipeline: async () => (async (input: string) => {
        expect(input).toBe('hello world');
        return { data: [0.1, 0.2, 0.3, 0.4, 0.5, 0.6], dims: [1, 1, 3] };
      }) as unknown as TransformersPipeline,
    });
    const ai = createTransformersLocalAi({ transformersLoader: async () => module });
    const result = await ai.embed('hello world');
    expect(Array.from(result)).toEqual([0.1, 0.2, 0.3].map((v) => Math.fround(v)));
  });

  test('classify chooses the highest-scoring label from labels/scores', async () => {
    const ai = createTransformersLocalAi({
      transformersLoader: async () => makeModule({
        pipeline: async () => (async () => ({ labels: ['transport', 'food'], scores: [0.7, 0.2] })) as unknown as TransformersPipeline,
      }),
    });
    const result = await ai.classify('uber to airport', { labels: ['transport', 'food'] });
    expect(result.label).toBe('transport');
    expect(result.confidence).toBeCloseTo(0.7);
  });

  test('classify rejects empty labels', async () => {
    const ai = createTransformersLocalAi({ transformersLoader: async () => makeModule() });
    await expect(ai.classify('x', { labels: [] })).rejects.toThrow(/at least one label/);
  });

  test('sentiment maps POSITIVE/NEGATIVE labels to enum', async () => {
    const ai = createTransformersLocalAi({
      transformersLoader: async () => makeModule({
        pipeline: async () => (async () => [{ label: 'POSITIVE', score: 0.92 }]) as unknown as TransformersPipeline,
      }),
    });
    expect(await ai.sentiment('great')).toEqual({ sentiment: 'positive', score: 0.92 });
  });

  test('sets remoteHost on the module env', async () => {
    const captured: TransformersModule = makeModule();
    const ai = createTransformersLocalAi({
      transformersLoader: async () => captured,
      remoteHost: 'https://models.shippie.app',
    });
    await ai.embed('warm up');
    expect(captured.env?.remoteHost).toBe('https://models.shippie.app');
    expect(captured.env?.allowRemoteModels).toBe(true);
  });

  test('caches pipelines by task+model', async () => {
    let calls = 0;
    const ai = createTransformersLocalAi({
      transformersLoader: async () => makeModule({
        pipeline: async () => {
          calls++;
          return (async () => ({ data: [0], dims: [1, 1, 1] })) as unknown as TransformersPipeline;
        },
      }),
    });
    await ai.embed('a');
    await ai.embed('b');
    await ai.embed('c');
    expect(calls).toBe(1);
  });

  test('labelImage throws — vision deferred', async () => {
    const ai = createTransformersLocalAi({ transformersLoader: async () => makeModule() });
    await expect(ai.labelImage(new Blob())).rejects.toThrow(/vision/);
  });

  test('available reflects baseline + adapter capabilities', async () => {
    const ai = createTransformersLocalAi({ transformersLoader: async () => makeModule() });
    const cap = await ai.available();
    expect(cap.embeddings).toBe(true);
    expect(cap.classification).toBe(true);
    expect(cap.sentiment).toBe(true);
    expect(cap.vision).toBe(false);
  });
});

describe('createTransformersLocalAi device option', () => {
  test('passes the device option to pipeline()', async () => {
    let receivedDevice: string | undefined;
    const fakeMod: TransformersModule = {
      env: { allowRemoteModels: false, remoteHost: '' },
      pipeline: (async (
        _task: string,
        _model: string | undefined,
        opts: { device?: string } = {},
      ) => {
        receivedDevice = opts.device;
        return (async () => ({ labels: ['a', 'b'], scores: [0.9, 0.1] })) as unknown as TransformersPipeline;
      }) as unknown as TransformersModule['pipeline'],
    };
    const ai = createTransformersLocalAi({
      transformersLoader: async () => fakeMod,
      device: 'webnn',
    });
    await ai.classify('hello', { labels: ['a', 'b'] });
    expect(receivedDevice).toBe('webnn');
  });

  test('omits device when option not set (transformers.js picks default)', async () => {
    let receivedDevice: string | undefined = 'sentinel';
    const fakeMod: TransformersModule = {
      env: { allowRemoteModels: false, remoteHost: '' },
      pipeline: (async (
        _task: string,
        _model: string | undefined,
        opts: { device?: string } = {},
      ) => {
        receivedDevice = opts.device;
        return (async () => ({ labels: ['a'], scores: [1] })) as unknown as TransformersPipeline;
      }) as unknown as TransformersModule['pipeline'],
    };
    const ai = createTransformersLocalAi({ transformersLoader: async () => fakeMod });
    await ai.classify('hello', { labels: ['a'] });
    expect(receivedDevice).toBeUndefined();
  });
});
