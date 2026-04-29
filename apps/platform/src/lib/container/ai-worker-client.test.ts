import { describe, expect, test, vi } from 'vitest';
import {
  createAiWorkerClient,
  createMemoryAiTransport,
  type AiRunResult,
} from './ai-worker-client';

describe('createAiWorkerClient — B1 marshalling layer', () => {
  test('routes a local task to the worker and returns the result', async () => {
    const transport = createMemoryAiTransport((req) => ({
      kind: 'shippie.ai.response',
      id: req.id,
      ok: true,
      result: {
        task: req.request.task,
        output: { label: 'food', confidence: 0.9 },
        source: 'local',
        backend: 'wasm',
      },
    }));
    const client = createAiWorkerClient({ transport });
    const result = await client.run({ task: 'classify', input: 'a recipe' });
    expect(result).toEqual({
      task: 'classify',
      output: { label: 'food', confidence: 0.9 },
      source: 'local',
      backend: 'wasm',
    });
    client.dispose();
  });

  test('routes non-local tasks to the edge fallback without touching the worker', async () => {
    let workerCalls = 0;
    const transport = createMemoryAiTransport((req) => {
      workerCalls += 1;
      return { kind: 'shippie.ai.response', id: req.id, ok: true };
    });
    const edge = vi.fn(
      async (): Promise<AiRunResult> => ({ task: 'summarise', output: 'short', source: 'edge' }),
    );
    const client = createAiWorkerClient({ transport, edgeFallback: edge });
    const result = await client.run({ task: 'summarise', input: 'long text' });
    expect(result.source).toBe('edge');
    expect(workerCalls).toBe(0);
    expect(edge).toHaveBeenCalledTimes(1);
    client.dispose();
  });

  test('falls back to edge when the worker reports source: unavailable', async () => {
    const transport = createMemoryAiTransport((req) => ({
      kind: 'shippie.ai.response',
      id: req.id,
      ok: true,
      result: { task: req.request.task, output: null, source: 'unavailable' },
    }));
    const edge = vi.fn(
      async (): Promise<AiRunResult> => ({ task: 'classify', output: 'edge-class', source: 'edge' }),
    );
    const client = createAiWorkerClient({ transport, edgeFallback: edge });
    const result = await client.run({ task: 'classify', input: 'x' });
    expect(result.source).toBe('edge');
    expect(edge).toHaveBeenCalledTimes(1);
    client.dispose();
  });

  test('throws for non-local tasks when no edge fallback is configured', async () => {
    const transport = createMemoryAiTransport(() => {
      throw new Error('worker should not be called');
    });
    const client = createAiWorkerClient({ transport });
    await expect(client.run({ task: 'translate', input: 'hola' })).rejects.toThrow(
      /Task translate requires edge fallback/,
    );
    client.dispose();
  });

  test('rejects pending requests when disposed', async () => {
    const transport = createMemoryAiTransport(
      () => new Promise(() => {}), // never resolves
    );
    const client = createAiWorkerClient({ transport });
    const promise = client.run({ task: 'classify', input: 'x' });
    client.dispose();
    await expect(promise).rejects.toThrow(/disposed/);
  });

  test('times out when the worker never responds', async () => {
    vi.useFakeTimers();
    const transport = createMemoryAiTransport(
      () => new Promise(() => {}), // never resolves
    );
    const client = createAiWorkerClient({ transport, timeoutMs: 100 });
    const promise = client.run({ task: 'classify', input: 'x' });
    vi.advanceTimersByTime(150);
    await expect(promise).rejects.toThrow(/timed out/);
    client.dispose();
    vi.useRealTimers();
  });

  test('error response from the worker rejects the call', async () => {
    const transport = createMemoryAiTransport((req) => ({
      kind: 'shippie.ai.response',
      id: req.id,
      ok: false,
      error: { code: 'load_failed', message: 'Model bytes did not match integrity hash' },
    }));
    const client = createAiWorkerClient({ transport });
    await expect(client.run({ task: 'classify', input: 'x' })).rejects.toThrow(/integrity hash/);
    client.dispose();
  });
});
