import { describe, expect, it, mock } from 'bun:test';
import { synthesise, _resetAudioCtxForTest } from './sound-synth.ts';
import type { SoundRecipe } from './types.ts';

interface FakeOsc {
  frequency: { value: number };
  type: string;
  connect: ReturnType<typeof mock>;
  start: ReturnType<typeof mock>;
  stop: ReturnType<typeof mock>;
}
interface FakeGain {
  gain: { setValueAtTime: ReturnType<typeof mock>; linearRampToValueAtTime: ReturnType<typeof mock> };
  connect: ReturnType<typeof mock>;
}

function makeFakeAudioCtx() {
  const oscs: FakeOsc[] = [];
  const gains: FakeGain[] = [];
  return {
    currentTime: 0,
    destination: {},
    createOscillator(): FakeOsc {
      const o = {
        frequency: { value: 0 },
        type: 'sine',
        connect: mock(() => {}),
        start: mock(() => {}),
        stop: mock(() => {}),
      };
      oscs.push(o);
      return o;
    },
    createGain(): FakeGain {
      const g = {
        gain: {
          setValueAtTime: mock(() => {}),
          linearRampToValueAtTime: mock(() => {}),
        },
        connect: mock(() => {}),
      };
      gains.push(g);
      return g;
    },
    _oscs: oscs,
    _gains: gains,
  };
}

describe('synthesise', () => {
  it('creates one oscillator + one gain for a click', () => {
    _resetAudioCtxForTest();
    const ctx = makeFakeAudioCtx();
    const recipe: SoundRecipe = { kind: 'click', freq: 880, durationMs: 30, gain: 0.4 };
    synthesise(recipe, { audioCtx: ctx as never, masterVolume: 1 });
    expect(ctx._oscs.length).toBe(1);
    expect(ctx._gains.length).toBe(1);
    expect(ctx._oscs[0]!.frequency.value).toBe(880);
    expect(ctx._oscs[0]!.start).toHaveBeenCalled();
    expect(ctx._oscs[0]!.stop).toHaveBeenCalled();
  });

  it('applies master volume multiplicatively', () => {
    _resetAudioCtxForTest();
    const ctx = makeFakeAudioCtx();
    synthesise(
      { kind: 'click', freq: 440, durationMs: 30, gain: 0.8 },
      { audioCtx: ctx as never, masterVolume: 0.5 },
    );
    const setCall = ctx._gains[0]!.gain.setValueAtTime.mock.calls[0]!;
    expect(setCall[0]).toBeCloseTo(0.4, 5);
  });

  it('skips synthesis when audio context is unavailable', () => {
    _resetAudioCtxForTest();
    expect(() =>
      synthesise(
        { kind: 'click', freq: 440, durationMs: 30, gain: 0.5 },
        { audioCtx: null, masterVolume: 1 },
      ),
    ).not.toThrow();
  });

  it.each([
    ['click', 'square'],
    ['pop', 'sine'],
    ['bonk', 'triangle'],
    ['whoosh', 'sawtooth'],
    ['chime', 'sine'],
  ] as const)('%s uses oscillator type %s', (kind, type) => {
    _resetAudioCtxForTest();
    const ctx = makeFakeAudioCtx();
    synthesise(
      { kind, freq: 440, durationMs: 30, gain: 0.5 },
      { audioCtx: ctx as never, masterVolume: 1 },
    );
    expect(ctx._oscs[0]!.type).toBe(type);
  });

  it('does not throw when ctx methods raise', () => {
    _resetAudioCtxForTest();
    const ctx = {
      currentTime: 0,
      destination: {},
      createOscillator() {
        throw new Error('audio blocked');
      },
      createGain() {
        return {} as never;
      },
    };
    expect(() =>
      synthesise(
        { kind: 'click', freq: 440, durationMs: 30, gain: 0.5 },
        { audioCtx: ctx as never, masterVolume: 1 },
      ),
    ).not.toThrow();
  });
});
