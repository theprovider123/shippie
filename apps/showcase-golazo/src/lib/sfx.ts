// Procedural sound for the Golazo games. Zero audio assets — every sound is synthesised
// from oscillators + filtered noise, so it ships offline and adds no bytes. The AudioContext
// is created lazily on the first sound (after a user gesture, per autoplay policy), and the
// whole module degrades to silent no-ops where WebAudio is unavailable (tests, old browsers).

type Ctx = AudioContext;

let ctx: Ctx | null = null;
let muted = readMuted();

function readMuted(): boolean {
  try {
    return localStorage.getItem("golazo:muted") === "1";
  } catch {
    return false;
  }
}

export function isMuted(): boolean {
  return muted;
}

export function setMuted(next: boolean): void {
  muted = next;
  try {
    localStorage.setItem("golazo:muted", next ? "1" : "0");
  } catch {
    /* quota / unavailable — ignore */
  }
}

function audio(): Ctx | null {
  if (muted) return null;
  if (typeof window === "undefined") return null;
  const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AC) return null;
  if (!ctx) {
    try {
      ctx = new AC();
    } catch {
      return null;
    }
  }
  if (ctx.state === "suspended") void ctx.resume();
  return ctx;
}

/** Master tap node so one sound can't clip the next. */
function tone(
  c: Ctx,
  type: OscillatorType,
  from: number,
  to: number,
  dur: number,
  gain: number,
  delay = 0,
): void {
  const t0 = c.currentTime + delay;
  const osc = c.createOscillator();
  const g = c.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(from, t0);
  osc.frequency.exponentialRampToValueAtTime(Math.max(1, to), t0 + dur);
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(gain, t0 + 0.008);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  osc.connect(g).connect(c.destination);
  osc.start(t0);
  osc.stop(t0 + dur + 0.02);
}

function noise(c: Ctx, dur: number, gain: number, hp: number, lp: number, delay = 0): void {
  const t0 = c.currentTime + delay;
  const frames = Math.floor(c.sampleRate * dur);
  const buf = c.createBuffer(1, frames, c.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < frames; i++) data[i] = Math.random() * 2 - 1;
  const src = c.createBufferSource();
  src.buffer = buf;
  const hpf = c.createBiquadFilter();
  hpf.type = "highpass";
  hpf.frequency.value = hp;
  const lpf = c.createBiquadFilter();
  lpf.type = "lowpass";
  lpf.frequency.value = lp;
  const g = c.createGain();
  g.gain.setValueAtTime(gain, t0);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  src.connect(hpf).connect(lpf).connect(g).connect(c.destination);
  src.start(t0);
  src.stop(t0 + dur + 0.02);
}

/** Boot of the ball — a short low thud with a clicky transient. */
export function kick(power = 0.8): void {
  const c = audio();
  if (!c) return;
  tone(c, "sine", 220 + power * 80, 70, 0.16, 0.22 + power * 0.1);
  noise(c, 0.05, 0.12, 1200, 6000);
}

/** Ball hitting the net — a soft swish. */
export function net(): void {
  const c = audio();
  if (!c) return;
  noise(c, 0.22, 0.1, 900, 4200);
  tone(c, "triangle", 320, 180, 0.18, 0.06, 0.02);
}

/** Keeper parry — a sharp slap. */
export function save(): void {
  const c = audio();
  if (!c) return;
  noise(c, 0.07, 0.22, 1800, 7000);
  tone(c, "square", 180, 120, 0.08, 0.08);
}

/** Ball clipping the woodwork — a bright metallic ping with a short ring. */
export function post(): void {
  const c = audio();
  if (!c) return;
  tone(c, "triangle", 1320, 1180, 0.3, 0.12);
  tone(c, "sine", 2640, 2400, 0.16, 0.05, 0.005);
  noise(c, 0.03, 0.1, 2600, 9000);
}

/** Crowd swell — filtered-noise roar that rises with intensity (0..1). */
export function crowd(intensity = 0.7): void {
  const c = audio();
  if (!c) return;
  const dur = 0.5 + intensity * 0.7;
  noise(c, dur, 0.05 + intensity * 0.1, 200, 1100 + intensity * 900);
}

/** Ref whistle — two quick warbling chirps. */
export function whistle(): void {
  const c = audio();
  if (!c) return;
  tone(c, "sine", 2100, 2400, 0.12, 0.08);
  tone(c, "sine", 2100, 2500, 0.16, 0.08, 0.14);
}
