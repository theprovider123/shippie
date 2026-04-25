import { describe, expect, it } from 'bun:test';
import { selectBackend, _resetBackendCacheForTest } from './backend.ts';

const fakeMl = (devices: Record<string, boolean>) => ({
  async createContext(opts: { deviceType: string }) {
    if (devices[opts.deviceType]) return { __ctx: opts.deviceType };
    throw new Error(`no ${opts.deviceType}`);
  },
});

const fakeGpu = (ok: boolean) => ({
  async requestAdapter() {
    return ok ? { __adapter: true } : null;
  },
});

describe('selectBackend', () => {
  it('prefers webnn-npu when available', async () => {
    _resetBackendCacheForTest();
    const result = await selectBackend({
      navigator: { ml: fakeMl({ npu: true, gpu: true }), gpu: fakeGpu(true) },
    });
    expect(result).toBe('webnn-npu');
  });

  it('falls back to webnn-gpu when npu unavailable', async () => {
    _resetBackendCacheForTest();
    const result = await selectBackend({
      navigator: { ml: fakeMl({ gpu: true }), gpu: fakeGpu(true) },
    });
    expect(result).toBe('webnn-gpu');
  });

  it('falls back to webgpu when webnn absent', async () => {
    _resetBackendCacheForTest();
    const result = await selectBackend({ navigator: { gpu: fakeGpu(true) } });
    expect(result).toBe('webgpu');
  });

  it('falls back to wasm-cpu when nothing else available', async () => {
    _resetBackendCacheForTest();
    const result = await selectBackend({ navigator: {} });
    expect(result).toBe('wasm-cpu');
  });

  it('caches the result on second call', async () => {
    _resetBackendCacheForTest();
    let calls = 0;
    const ml = {
      async createContext(opts: { deviceType: string }) {
        calls++;
        if (opts.deviceType === 'npu') return { __ctx: 'npu' };
        throw new Error('nope');
      },
    };
    await selectBackend({ navigator: { ml } });
    await selectBackend({ navigator: { ml } });
    expect(calls).toBe(1);
  });

  it('returns wasm-cpu when all probes throw', async () => {
    _resetBackendCacheForTest();
    const result = await selectBackend({
      navigator: {
        ml: {
          async createContext() {
            throw new Error('blocked');
          },
        },
        gpu: {
          async requestAdapter() {
            throw new Error('blocked');
          },
        },
      },
    });
    expect(result).toBe('wasm-cpu');
  });
});
