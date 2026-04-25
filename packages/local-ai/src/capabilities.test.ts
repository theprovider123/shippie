import { describe, expect, test } from 'bun:test';
import { detectLocalAiAvailability } from './capabilities.ts';

describe('@shippie/local-ai capability detection', () => {
  test('uses wasm baseline and gpu as vision accelerator', () => {
    expect(detectLocalAiAvailability({ nav: { gpu: {} }, webAssembly: WebAssembly })).toMatchObject({
      embeddings: true,
      classification: true,
      sentiment: true,
      vision: true,
      gpu: true,
      wasm: true,
    });
    expect(detectLocalAiAvailability({ nav: {}, webAssembly: false })).toMatchObject({
      embeddings: false,
      vision: false,
      gpu: false,
      wasm: false,
    });
  });
});
