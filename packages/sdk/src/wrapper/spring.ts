export interface SpringOptions {
  from?: number;
  to?: number;
  stiffness?: number;
  damping?: number;
  mass?: number;
  velocity?: number;
  precision?: number;
  maxSteps?: number;
  frameMs?: number;
}

export interface SpringFrame {
  value: number;
  velocity: number;
  done: boolean;
}

export type SpringUpdate = (frame: SpringFrame) => void;

export function springFrames(opts: SpringOptions = {}): SpringFrame[] {
  const to = opts.to ?? 1;
  const stiffness = opts.stiffness ?? 200;
  const damping = opts.damping ?? 20;
  const mass = opts.mass ?? 1;
  const precision = opts.precision ?? 0.001;
  const dt = (opts.frameMs ?? 16.667) / 1000;
  const maxSteps = opts.maxSteps ?? 120;
  let value = opts.from ?? 0;
  let velocity = opts.velocity ?? 0;
  const frames: SpringFrame[] = [];

  for (let i = 0; i < maxSteps; i++) {
    const displacement = value - to;
    const springForce = -stiffness * displacement;
    const dampingForce = -damping * velocity;
    const acceleration = (springForce + dampingForce) / mass;
    velocity += acceleration * dt;
    value += velocity * dt;
    const done = Math.abs(velocity) < precision && Math.abs(to - value) < precision;
    frames.push({ value: done ? to : value, velocity: done ? 0 : velocity, done });
    if (done) break;
  }

  const last = frames[frames.length - 1];
  if (!last || !last.done) frames.push({ value: to, velocity: 0, done: true });
  return frames;
}

export function animateSpring(update: SpringUpdate, opts: SpringOptions = {}): () => void {
  if (typeof requestAnimationFrame !== 'function') {
    for (const frame of springFrames(opts)) update(frame);
    return () => {};
  }
  const frames = springFrames(opts);
  let index = 0;
  let raf = 0;
  let cancelled = false;

  const tick = () => {
    if (cancelled) return;
    const frame = frames[index++] ?? frames[frames.length - 1]!;
    update(frame);
    if (!frame.done) raf = requestAnimationFrame(tick);
  };

  raf = requestAnimationFrame(tick);
  return () => {
    cancelled = true;
    cancelAnimationFrame(raf);
  };
}
