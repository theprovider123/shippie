import { describe, expect, it } from 'bun:test';
import { backendToDevice } from './device-map.ts';
import type { Backend } from '../backend.ts';
import type { LocalAiDevice } from '@shippie/local-ai';

const cases: ReadonlyArray<readonly [Backend, LocalAiDevice]> = [
  ['webnn-npu', 'webnn'],
  ['webnn-gpu', 'webnn'],
  ['webgpu', 'webgpu'],
  ['wasm-cpu', 'cpu'],
];

describe('backendToDevice', () => {
  for (const [backend, expected] of cases) {
    it(`${backend} -> ${expected}`, () => {
      expect(backendToDevice(backend)).toBe(expected);
    });
  }
});
