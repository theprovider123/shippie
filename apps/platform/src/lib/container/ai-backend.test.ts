import { describe, expect, test } from 'vitest';
import {
  isLocalTask,
  listLocalTasks,
  selectAiBackend,
} from './ai-backend';

describe('selectAiBackend — B1 backend selection', () => {
  test('picks webnn when navigator.ml is present', () => {
    const result = selectAiBackend({ navigator: { ml: {} }, WebAssembly: {} });
    expect(result.backend).toBe('webnn');
    expect(result.reasons).toContain('navigator.ml present');
  });

  test('falls back to webgpu when only navigator.gpu is present', () => {
    const result = selectAiBackend({ navigator: { gpu: {} }, WebAssembly: {} });
    expect(result.backend).toBe('webgpu');
    expect(result.reasons).toEqual(['navigator.ml missing', 'navigator.gpu present']);
  });

  test('falls back to wasm when neither WebNN nor WebGPU is present', () => {
    const result = selectAiBackend({ navigator: {}, WebAssembly: {} });
    expect(result.backend).toBe('wasm');
  });

  test('returns unavailable when WebAssembly is also missing', () => {
    const result = selectAiBackend({ navigator: {} });
    expect(result.backend).toBe('unavailable');
    expect(result.reasons).toContain('WebAssembly missing — edge fallback only');
  });

  test('handles a totally absent navigator (e.g. node)', () => {
    const result = selectAiBackend({ WebAssembly: {} });
    expect(result.backend).toBe('wasm');
  });

  test('webnn beats webgpu when both are present (NPU first)', () => {
    const result = selectAiBackend({ navigator: { ml: {}, gpu: {} }, WebAssembly: {} });
    expect(result.backend).toBe('webnn');
  });
});

describe('isLocalTask — B1 task routing', () => {
  test('returns true for the 5 micro-model tasks', () => {
    for (const task of ['classify', 'embed', 'sentiment', 'moderate', 'vision']) {
      expect(isLocalTask(task)).toBe(true);
    }
  });

  test('returns false for tasks that need edge fallback', () => {
    for (const task of ['summarise', 'generate', 'translate', 'something-else']) {
      expect(isLocalTask(task)).toBe(false);
    }
  });

  test('listLocalTasks returns exactly the 5 supported tasks', () => {
    expect(listLocalTasks()).toHaveLength(5);
  });
});
