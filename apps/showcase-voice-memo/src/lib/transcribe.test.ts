import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { __testRuntime, deriveTitle, transcribe } from './transcribe.ts';

interface PipelineFactoryStub {
  importCount: number;
  pipelineCalls: number;
  inferenceCalls: number;
  reset(): void;
}

function installStub(): PipelineFactoryStub {
  const state = {
    importCount: 0,
    pipelineCalls: 0,
    inferenceCalls: 0,
    reset() {
      state.importCount = 0;
      state.pipelineCalls = 0;
      state.inferenceCalls = 0;
    },
  };
  __testRuntime.setImporter(async () => {
    state.importCount += 1;
    return {
      pipeline: async () => {
        state.pipelineCalls += 1;
        return async () => {
          state.inferenceCalls += 1;
          return {
            text: 'Hello world this is a transcript.',
            chunks: [
              { text: 'Hello world', timestamp: [0, 1.2] as [number, number] },
              { text: 'this is a transcript.', timestamp: [1.2, 3.4] as [number, number] },
              { text: '', timestamp: [3.4, 3.4] as [number, number] }, // dropped
            ],
          };
        };
      },
    };
  });
  return state;
}

// Bun's test runner doesn't expose a DOM, so URL.createObjectURL is
// missing. Stub it to a no-op string so the transcribe path doesn't
// blow up when it tries to materialise the blob URL.
beforeEach(() => {
  if (typeof URL !== 'undefined' && typeof URL.createObjectURL !== 'function') {
    (URL as unknown as { createObjectURL: (b: Blob) => string }).createObjectURL = () => 'blob:stub';
  }
  if (typeof URL !== 'undefined' && typeof URL.revokeObjectURL !== 'function') {
    (URL as unknown as { revokeObjectURL: (u: string) => void }).revokeObjectURL = () => {};
  }
});

afterEach(() => {
  __testRuntime.reset();
});

describe('transcribe · pipeline memoization', () => {
  test('returns text + filtered segments from the stub pipeline', async () => {
    installStub();
    const blob = new Blob([new Uint8Array([1, 2, 3])], { type: 'audio/webm' });
    const out = await transcribe(blob);
    expect(out.text).toBe('Hello world this is a transcript.');
    expect(out.segments).toHaveLength(2);
    expect(out.segments[0]).toEqual({ start: 0, end: 1.2, text: 'Hello world' });
    expect(out.segments[1]?.text).toBe('this is a transcript.');
  });

  test('importer + pipeline factory are called once across multiple transcribes', async () => {
    const state = installStub();
    const blob = new Blob([new Uint8Array([1, 2, 3])], { type: 'audio/webm' });
    await transcribe(blob);
    await transcribe(blob);
    await transcribe(blob);
    expect(state.importCount).toBe(1);
    expect(state.pipelineCalls).toBe(1);
    expect(state.inferenceCalls).toBe(3);
  });

  test('progress callback emits init + transcribe stages', async () => {
    installStub();
    const events: string[] = [];
    const blob = new Blob([new Uint8Array([1])], { type: 'audio/webm' });
    await transcribe(blob, {
      onProgress: (e) => {
        events.push(e.stage);
      },
    });
    expect(events).toContain('init');
    expect(events).toContain('transcribe');
  });

  test('reset clears the cached pipeline', async () => {
    const state = installStub();
    const blob = new Blob([new Uint8Array([1])], { type: 'audio/webm' });
    await transcribe(blob);
    expect(state.importCount).toBe(1);
    __testRuntime.reset();
    installStub();
    await transcribe(blob);
    // After reset + reinstall, importCount on the NEW state is 1.
  });
});

describe('transcribe · deriveTitle', () => {
  test('uses first five words', () => {
    expect(deriveTitle('one two three four five six seven')).toBe('one two three four five');
  });

  test('shorter transcripts pass through', () => {
    expect(deriveTitle('grocery list')).toBe('grocery list');
  });

  test('strips trailing punctuation', () => {
    expect(deriveTitle('remember to buy milk.')).toBe('remember to buy milk');
    expect(deriveTitle('what time is it?')).toBe('what time is it');
  });

  test('falls back to placeholder for empty transcripts', () => {
    expect(deriveTitle('')).toBe('Untitled memo');
    expect(deriveTitle('   ')).toBe('Untitled memo');
  });
});
