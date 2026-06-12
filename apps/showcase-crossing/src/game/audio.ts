// apps/showcase-crossing/src/game/audio.ts
// All sounds synthesised via WebAudio — zero external requests.

let _ctx: AudioContext | null = null;
let _muted = false;
let _hurryInterval: ReturnType<typeof setInterval> | null = null;

function ctx(): AudioContext {
  if (!_ctx) _ctx = new AudioContext();
  return _ctx;
}

function tone(
  freq: number,
  type: OscillatorType,
  durationSec: number,
  gainPeak = 0.4,
  startOffset = 0,
): void {
  if (_muted) return;
  const ac = ctx();
  if (ac.state === 'suspended') void ac.resume();
  const osc = ac.createOscillator();
  const gain = ac.createGain();
  osc.connect(gain);
  gain.connect(ac.destination);
  osc.type = type;
  osc.frequency.setValueAtTime(freq, ac.currentTime + startOffset);
  gain.gain.setValueAtTime(0, ac.currentTime + startOffset);
  gain.gain.linearRampToValueAtTime(gainPeak, ac.currentTime + startOffset + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + startOffset + durationSec);
  osc.start(ac.currentTime + startOffset);
  osc.stop(ac.currentTime + startOffset + durationSec + 0.05);
}

export const audio = {
  hop(): void {
    tone(440, 'triangle', 0.06, 0.3);
  },

  home(): void {
    tone(880, 'triangle', 0.15, 0.35);
    tone(1100, 'triangle', 0.15, 0.25, 0.02);
  },

  death(): void {
    if (_muted) return;
    const ac = ctx();
    if (ac.state === 'suspended') void ac.resume();
    const osc = ac.createOscillator();
    const gain = ac.createGain();
    osc.connect(gain);
    gain.connect(ac.destination);
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(440, ac.currentTime);
    osc.frequency.exponentialRampToValueAtTime(110, ac.currentTime + 0.7);
    gain.gain.setValueAtTime(0.4, ac.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + 0.7);
    osc.start(ac.currentTime);
    osc.stop(ac.currentTime + 0.75);
  },

  levelClear(): void {
    [440, 550, 660, 880].forEach((f, i) => tone(f, 'square', 0.12, 0.3, i * 0.1));
  },

  startHurry(): void {
    if (_hurryInterval !== null) return;
    _hurryInterval = setInterval(() => tone(660, 'square', 0.08, 0.25), 500);
  },

  stopHurry(): void {
    if (_hurryInterval !== null) {
      clearInterval(_hurryInterval);
      _hurryInterval = null;
    }
  },

  isMuted(): boolean { return _muted; },

  toggleMute(): boolean {
    _muted = !_muted;
    if (_muted) audio.stopHurry();
    return _muted;
  },

  loadMuted(v: boolean): void { _muted = v; },
};
