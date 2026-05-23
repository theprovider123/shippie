import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createShippieIframeSdk } from '@shippie/iframe-sdk';
import { createObservationClient } from '@shippie/observations';
import { haptic } from '@shippie/sdk/wrapper';
import { createSoundBank, isMuted, toggleMuted } from '@shippie/juice';
import { ARCADE_SAMPLES } from '@shippie/juice/samples';
import { Confetti, useTutorial } from '@shippie/juice/react';
import {
  COLS,
  ROWS,
  CAMPAIGN_LEVELS,
  generateEndless,
  generateLevel,
  hitsObstacle,
  laneObstacles,
  logUnderFrog,
  dailySeedForDate,
} from './levels';
import { exitFullscreen, isFullscreen, requestFullscreen } from './fullscreen';

const sfx = createSoundBank({
  tap: ARCADE_SAMPLES.tap,
  splash: ARCADE_SAMPLES.splash,
  thud: ARCADE_SAMPLES.thud,
  success: ARCADE_SAMPLES.success,
  levelUp: ARCADE_SAMPLES.levelUp,
  fail: ARCADE_SAMPLES.fail,
  bing: ARCADE_SAMPLES.bing,
  warn: ARCADE_SAMPLES.warn,
  pop: ARCADE_SAMPLES.pop,
});

const sdk = createShippieIframeSdk({ appId: 'app_crossing' });
// Frog occupies the whole playfield + D-pad overlay; suppress both
// chrome pills to slim slivers so accidental edge taps don't open
// the drawer mid-hop.
sdk.safeEdges.declareInputRegion('all');
const observations = createObservationClient(sdk);

const STORAGE_KEY = 'shippie:crossing:v2';
const STARTING_LIVES = 3;
const HOP_DURATION_MS = 110;
const EDGE_NO_INPUT_PX = 16;
const EAGLE_WARN_MS = 4000;
const EAGLE_SWOOP_MS = 5500;
const EAGLE_SWOOP_DURATION_MS = 600;
const DPAD_FADE_AFTER_HOPS = 5;

type Mode = 'endless' | 'campaign' | 'daily';
type Phase = 'idle' | 'playing' | 'lose' | 'win';
type World = 'forest' | 'desert' | 'space';
type CharacterId = 'frog' | 'owl' | 'robot' | 'ghost' | 'astronaut' | 'cat' | 'fox' | 'penguin';

interface CharacterDef {
  id: CharacterId;
  name: string;
  unlockScore: number;
  body: string;
  belly: string;
  eye: string;
}

const CHARACTERS: CharacterDef[] = [
  { id: 'frog',      name: 'Frog',      unlockScore: 0,    body: '#7FB269', belly: '#4FA487', eye: '#1a1715' },
  { id: 'cat',       name: 'Cat',      unlockScore: 200,  body: '#F4B860', belly: '#E8A640', eye: '#1a1715' },
  { id: 'fox',       name: 'Fox',      unlockScore: 500,  body: '#E84A2D', belly: '#C24E1F', eye: '#fff' },
  { id: 'penguin',   name: 'Penguin',  unlockScore: 1000, body: '#1a1715', belly: '#fff',    eye: '#F4B860' },
  { id: 'owl',       name: 'Owl',     unlockScore: 2000, body: '#7E5B96', belly: '#5C3F73', eye: '#F4B860' },
  { id: 'robot',     name: 'Robot',    unlockScore: 4000, body: '#3F8AA8', belly: '#2A6580', eye: '#E84A2D' },
  { id: 'ghost',     name: 'Ghost',    unlockScore: 7500, body: '#E5DCC5', belly: '#fff',    eye: '#1a1715' },
  { id: 'astronaut', name: 'Astronaut', unlockScore: 12000, body: '#fff',   belly: '#3F8AA8', eye: '#1a1715' },
];

const WORLDS: Record<World, { road: string; safe: string; safeStripe: string; river: string; bg: string; label: string }> = {
  forest: {
    road: '#2A2A2A',
    safe: '#A8C491',
    safeStripe: '#97B582',
    river: 'linear-gradient(180deg, #3F8AA8 0%, #2E7390 50%, #3F8AA8 100%)',
    bg: '#F8F1E0',
    label: 'Forest',
  },
  desert: {
    road: '#5A4D3F',
    safe: '#E8C988',
    safeStripe: '#D8B770',
    river: 'linear-gradient(180deg, #6BB6A8 0%, #4A8F85 50%, #6BB6A8 100%)',
    bg: '#FAEFD4',
    label: 'Desert',
  },
  space: {
    road: '#15131F',
    safe: '#3A2D55',
    safeStripe: '#4A3D65',
    river: 'linear-gradient(180deg, #7E5B96 0%, #4A3070 50%, #7E5B96 100%)',
    bg: '#1A1428',
    label: 'Cosmos',
  },
};

interface PickupKindDef {
  id: 'coin' | 'shield' | 'multi';
  glyph: string;
  bonus: number;
}
const PICKUP_KINDS: Record<PickupKindDef['id'], PickupKindDef> = {
  coin: { id: 'coin', glyph: '★', bonus: 50 },
  shield: { id: 'shield', glyph: '◇', bonus: 0 },
  multi: { id: 'multi', glyph: '✺', bonus: 0 },
};

interface Pickup {
  id: number;
  col: number;
  row: number;
  kind: PickupKindDef['id'];
}

interface Frog {
  col: number;
  row: number;
  drift: number;
}

interface Stored {
  bestEndless: number;
  bestCampaignLevel: number;
  bestDaily: number;
  totalRuns: number;
  unlockedScore: number;
  selectedCharacter: CharacterId;
  dailyStreak: number;
  lastDailyDate: string;
  tutorialDone: boolean;
}

function loadStored(): Stored {
  if (typeof localStorage === 'undefined') {
    return { bestEndless: 0, bestCampaignLevel: 1, bestDaily: 0, totalRuns: 0, unlockedScore: 0, selectedCharacter: 'frog', dailyStreak: 0, lastDailyDate: '', tutorialDone: false };
  }
  try {
    const v = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}');
    return {
      bestEndless: typeof v.bestEndless === 'number' ? v.bestEndless : 0,
      bestCampaignLevel: typeof v.bestCampaignLevel === 'number' ? v.bestCampaignLevel : 1,
      bestDaily: typeof v.bestDaily === 'number' ? v.bestDaily : 0,
      totalRuns: typeof v.totalRuns === 'number' ? v.totalRuns : 0,
      unlockedScore: typeof v.unlockedScore === 'number' ? v.unlockedScore : 0,
      selectedCharacter: typeof v.selectedCharacter === 'string' ? v.selectedCharacter : 'frog',
      dailyStreak: typeof v.dailyStreak === 'number' ? v.dailyStreak : 0,
      lastDailyDate: typeof v.lastDailyDate === 'string' ? v.lastDailyDate : '',
      tutorialDone: typeof v.tutorialDone === 'boolean' ? v.tutorialDone : false,
    };
  } catch {
    return { bestEndless: 0, bestCampaignLevel: 1, bestDaily: 0, totalRuns: 0, unlockedScore: 0, selectedCharacter: 'frog', dailyStreak: 0, lastDailyDate: '', tutorialDone: false };
  }
}
function saveStored(s: Stored) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(s)); } catch {/**/}
}

function todayKey(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function worldForStage(stage: number): World {
  // Cycles forest → desert → space every 4 stages so the player gets a
  // visible reward for sustained survival.
  const phase = Math.floor(stage / 4) % 3;
  return phase === 0 ? 'forest' : phase === 1 ? 'desert' : 'space';
}

function characterFor(id: CharacterId): CharacterDef {
  return CHARACTERS.find((c) => c.id === id) ?? CHARACTERS[0]!;
}

const TUTORIAL_STEPS = [
  { title: 'Reach the top', body: 'Hop forward through traffic and rivers. Goal lane is at the top.' },
  { title: 'Tap or swipe', body: 'Tap = hop forward. Swipe in any direction to dodge sideways or back.' },
  { title: 'Don\'t stand still', body: 'An eagle is watching. Idle too long and it will swoop.' },
];

export function App() {
  const [stored, setStored] = useState<Stored>(() => loadStored());
  const [mode, setMode] = useState<Mode>('endless');
  const [stage, setStage] = useState(1); // endless stage / campaign level
  const [phase, setPhase] = useState<Phase>('idle');
  const [lives, setLives] = useState(STARTING_LIVES);
  const [score, setScore] = useState(0);
  const [multiplier, setMultiplier] = useState(1);
  const [shields, setShields] = useState(0);
  const [confettiTrigger, setConfettiTrigger] = useState(0);
  const [deathFx, setDeathFx] = useState<{ kind: 'splash' | 'splat' | 'eagle'; col: number; row: number; until: number } | null>(null);
  const [eagleState, setEagleState] = useState<{ swoopStartedAt: number; col: number } | null>(null);
  const [warnEagle, setWarnEagle] = useState(false);
  const [hopsTaken, setHopsTaken] = useState(0);
  const [muted, setMutedState] = useState(() => isMuted());
  const [fullscreen, setFullscreenState] = useState(false);
  const [showCharacterPicker, setShowCharacterPicker] = useState(false);
  const [pickups, setPickups] = useState<Pickup[]>([]);
  const [floatingPoints, setFloatingPoints] = useState<{ id: number; text: string; col: number; row: number; until: number } | null>(null);
  const [, force] = useState(0);

  const tickRef = useRef(0);
  const lastFrameRef = useRef(performance.now());
  const lastHopAtRef = useRef(performance.now());
  const holdRepeatRef = useRef<number | null>(null);
  const frogRef = useRef<Frog>({ col: Math.floor(COLS / 2), row: 0, drift: 0 });
  const hopRef = useRef<{ from: { col: number; row: number }; to: { col: number; row: number }; until: number } | null>(null);
  const bufferedHopRef = useRef<{ dx: number; dy: number } | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const swipeRef = useRef<{ x: number; y: number } | null>(null);
  const pickupIdRef = useRef(1);
  const floatingIdRef = useRef(1);
  const reducedMotion = useReducedMotion();

  const seedSalt = useMemo(() => (mode === 'daily' ? dailySeedForDate(todayKey()) : 0), [mode]);
  const world = useMemo<World>(() => mode === 'endless' ? worldForStage(stage) : 'forest', [stage, mode]);
  const level = useMemo(() => mode === 'endless' ? generateEndless(stage, seedSalt) : generateLevel(stage, seedSalt), [stage, seedSalt, mode]);

  const tutorial = useTutorial('crossing-v2', TUTORIAL_STEPS);
  const character = characterFor(stored.selectedCharacter);
  const worldDef = WORLDS[world];

  useEffect(() => { saveStored(stored); }, [stored]);

  // Apply world background to the host element so the frame around the
  // playfield matches the current world's vibe.
  useEffect(() => {
    document.body.style.background = worldDef.bg;
    return () => {
      document.body.style.background = '';
    };
  }, [worldDef.bg]);

  const reset = useCallback((toStage = 1) => {
    setStage(toStage);
    setLives(STARTING_LIVES);
    setScore(0);
    setMultiplier(1);
    setShields(0);
    setPickups([]);
    setEagleState(null);
    setWarnEagle(false);
    setPhase('idle');
    frogRef.current = { col: Math.floor(COLS / 2), row: 0, drift: 0 };
    hopRef.current = null;
    bufferedHopRef.current = null;
    tickRef.current = 0;
    lastHopAtRef.current = performance.now();
    setHopsTaken(0);
  }, []);

  const start = () => {
    setPhase('playing');
    lastFrameRef.current = performance.now();
    lastHopAtRef.current = performance.now();
    tickRef.current = 0;
  };

  const die = useCallback((kind: 'splash' | 'splat' | 'eagle') => {
    if (shields > 0 && kind !== 'eagle') {
      setShields((s) => s - 1);
      sfx.play('warn');
      haptic('warn');
      return;
    }
    haptic('error');
    sfx.play(kind === 'splash' ? 'splash' : kind === 'eagle' ? 'fail' : 'thud');
    const f = frogRef.current;
    setDeathFx({ kind, col: f.col + f.drift, row: f.row, until: performance.now() + 800 });
    setEagleState(null);
    setWarnEagle(false);
    setLives((l) => {
      const next = l - 1;
      if (next <= 0) {
        setPhase('lose');
        sfx.play('fail');
        observations.emit({
          kind: 'game.completed',
          game: 'crossing',
          result: `${mode} stage ${stage} · ${score} pts`,
          at: new Date().toISOString(),
        });
        // Update high scores + unlocks.
        setStored((s) => {
          const today = todayKey();
          const isDaily = mode === 'daily';
          const dailyStreak = isDaily
            ? (s.lastDailyDate === today ? s.dailyStreak : s.dailyStreak + 1)
            : s.dailyStreak;
          return {
            ...s,
            totalRuns: s.totalRuns + 1,
            bestEndless: mode === 'endless' ? Math.max(s.bestEndless, score) : s.bestEndless,
            bestCampaignLevel: mode === 'campaign' ? Math.max(s.bestCampaignLevel, stage) : s.bestCampaignLevel,
            bestDaily: mode === 'daily' ? Math.max(s.bestDaily, score) : s.bestDaily,
            unlockedScore: Math.max(s.unlockedScore, score),
            dailyStreak,
            lastDailyDate: isDaily ? today : s.lastDailyDate,
          };
        });
        return 0;
      }
      // Respawn at start row (campaign) or current row (endless = no penalty)
      frogRef.current = { col: Math.floor(COLS / 2), row: 0, drift: 0 };
      hopRef.current = null;
      setMultiplier(1);
      return next;
    });
  }, [shields, mode, score, stage]);

  const collectPickup = useCallback((kind: PickupKindDef['id']) => {
    const def = PICKUP_KINDS[kind];
    sfx.play('bing', { pitch: 1.2 });
    haptic('success');
    if (kind === 'coin') {
      setScore((s) => s + def.bonus);
      const f = frogRef.current;
      setFloatingPoints({ id: ++floatingIdRef.current, text: `+${def.bonus}`, col: f.col + f.drift, row: f.row, until: performance.now() + 700 });
    } else if (kind === 'shield') {
      setShields((n) => Math.min(3, n + 1));
    } else if (kind === 'multi') {
      setMultiplier((m) => Math.min(8, m * 2));
    }
  }, []);

  const winLevel = useCallback(() => {
    haptic('success');
    sfx.play('levelUp');
    setConfettiTrigger((n) => n + 1);
    const bonus = 100 + lives * 25 + multiplier * 10;
    setScore((s) => s + bonus);
    if (mode === 'campaign') {
      const next = stage + 1;
      if (next > CAMPAIGN_LEVELS) {
        setPhase('win');
        sfx.play('success');
        observations.emit({
          kind: 'game.completed',
          game: 'crossing',
          result: `campaign-clear ${score + bonus} pts`,
          at: new Date().toISOString(),
        });
        return;
      }
      setStage(next);
      setStored((s) => ({ ...s, bestCampaignLevel: Math.max(s.bestCampaignLevel, stage) }));
    } else {
      // Endless / daily: roll the next stage forever.
      setStage((n) => n + 1);
    }
    frogRef.current = { col: Math.floor(COLS / 2), row: 0, drift: 0 };
    hopRef.current = null;
    setShields((n) => n); // shields persist between stages
  }, [stage, lives, mode, score, multiplier]);

  /**
   * Begin a repeating hop in (dx, dy). Fires the first hop now, then
   * every 140ms while the pointer stays down (longer than
   * HOP_DURATION_MS so each new hop starts cleanly after the previous
   * one lands). The interval clears on `stopRepeat`.
   */
  const startRepeat = useCallback((dx: number, dy: number) => {
    if (holdRepeatRef.current !== null) {
      window.clearInterval(holdRepeatRef.current);
      holdRepeatRef.current = null;
    }
    holdRepeatRef.current = window.setInterval(() => {
      hopRepeatFire(dx, dy);
    }, 140);
  }, []);

  const stopRepeat = useCallback(() => {
    if (holdRepeatRef.current !== null) {
      window.clearInterval(holdRepeatRef.current);
      holdRepeatRef.current = null;
    }
  }, []);

  useEffect(() => () => stopRepeat(), [stopRepeat]);

  // Helper used by the repeat interval — doesn't capture `hop`
  // because that callback recreates on every phase change.
  function hopRepeatFire(dx: number, dy: number): void {
    hopFnRef.current?.(dx, dy);
  }
  const hopFnRef = useRef<((dx: number, dy: number) => void) | null>(null);

  const hop = useCallback((dx: number, dy: number) => {
    if (phase !== 'playing') return;
    if (hopRef.current) {
      // Buffer one input so rapid taps register.
      bufferedHopRef.current = { dx, dy };
      return;
    }
    const f = frogRef.current;
    const nextCol = Math.max(0, Math.min(COLS - 1, f.col + dx));
    const nextRow = Math.max(0, Math.min(ROWS - 1, f.row + dy));
    if (nextCol === f.col && nextRow === f.row) return;
    haptic('tap');
    sfx.play('tap', { volume: 0.5, pitch: 0.9 + Math.random() * 0.2 });
    hopRef.current = {
      from: { col: f.col, row: f.row },
      to: { col: nextCol, row: nextRow },
      until: performance.now() + HOP_DURATION_MS,
    };
    lastHopAtRef.current = performance.now();
    setHopsTaken((n) => n + 1);
    setWarnEagle(false);
    setEagleState(null);
    if (dy > 0) {
      // Forward hop — bump multiplier.
      setMultiplier((m) => Math.min(8, m === 1 ? 2 : m * 2));
    } else {
      setMultiplier(1);
    }
  }, [phase]);

  // Keep hopFnRef pointing at the latest hop callback so the
  // hold-repeat interval can call into it without restarting.
  useEffect(() => { hopFnRef.current = hop; }, [hop]);

  // Keyboard input.
  useEffect(() => {
    function handler(e: KeyboardEvent) {
      if (phase !== 'playing') {
        if (e.key === ' ' || e.key === 'Enter') start();
        return;
      }
      switch (e.key) {
        case 'ArrowUp': case 'w': case 'W': e.preventDefault(); hop(0, 1); break;
        case 'ArrowDown': case 's': case 'S': e.preventDefault(); hop(0, -1); break;
        case 'ArrowLeft': case 'a': case 'A': e.preventDefault(); hop(-1, 0); break;
        case 'ArrowRight': case 'd': case 'D': e.preventDefault(); hop(1, 0); break;
      }
    }
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [hop, phase]);

  // Pointer (swipe + tap).
  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    const rect = containerRef.current?.getBoundingClientRect();
    const localX = rect ? e.clientX - rect.left : e.clientX;
    if (localX < EDGE_NO_INPUT_PX) return;
    swipeRef.current = { x: e.clientX, y: e.clientY };
  };
  const onPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    const s = swipeRef.current;
    swipeRef.current = null;
    if (!s) return;
    // Safety net: if the pointer is over (or releases over) the D-pad
    // or any other button inside the playfield, the button's
    // onPointerDown already fired the hop. Don't fire again.
    if ((e.target as HTMLElement | null)?.closest('button')) return;
    const dx = e.clientX - s.x;
    const dy = e.clientY - s.y;
    if (Math.abs(dx) < 12 && Math.abs(dy) < 12) {
      if (phase !== 'playing') start();
      else hop(0, 1);
      return;
    }
    if (Math.abs(dx) > Math.abs(dy)) hop(dx > 0 ? 1 : -1, 0);
    else hop(0, dy > 0 ? -1 : 1);
  };

  // Spawn pickups occasionally on safe lanes.
  useEffect(() => {
    if (phase !== 'playing') return;
    const interval = window.setInterval(() => {
      setPickups((existing) => {
        if (existing.length >= 2) return existing;
        // Find a safe lane that isn't row 0 or the goal.
        const safeRows: number[] = [];
        for (let r = 1; r < level.lanes.length - 1; r++) {
          if (level.lanes[r]!.kind === 'safe') safeRows.push(r);
        }
        if (safeRows.length === 0) return existing;
        const row = safeRows[Math.floor(Math.random() * safeRows.length)]!;
        const col = Math.floor(Math.random() * COLS);
        const roll = Math.random();
        const kind: PickupKindDef['id'] = roll < 0.6 ? 'coin' : roll < 0.85 ? 'shield' : 'multi';
        return [...existing, { id: pickupIdRef.current++, col, row, kind }];
      });
    }, 2400);
    return () => window.clearInterval(interval);
  }, [phase, level.lanes]);

  // Game tick.
  useEffect(() => {
    if (phase !== 'playing') return;
    let raf = 0;
    const loop = (now: number) => {
      const dt = Math.min(0.05, (now - lastFrameRef.current) / 1000);
      lastFrameRef.current = now;
      tickRef.current += dt;

      // Eagle logic — punish idle.
      const idleMs = now - lastHopAtRef.current;
      if (!warnEagle && idleMs > EAGLE_WARN_MS && idleMs < EAGLE_SWOOP_MS && phase === 'playing') {
        setWarnEagle(true);
        sfx.play('warn', { pitch: 1.4 });
      }
      if (!eagleState && idleMs > EAGLE_SWOOP_MS && phase === 'playing') {
        setEagleState({ swoopStartedAt: now, col: frogRef.current.col + frogRef.current.drift });
        sfx.play('fail', { pitch: 0.6 });
      }
      if (eagleState && now - eagleState.swoopStartedAt > EAGLE_SWOOP_DURATION_MS) {
        die('eagle');
      }

      // Hop landing.
      if (hopRef.current && now >= hopRef.current.until) {
        const to = hopRef.current.to;
        const prevRow = frogRef.current.row;
        frogRef.current = { col: to.col, row: to.row, drift: 0 };
        hopRef.current = null;
        if (to.row > prevRow) setScore((s) => s + 10 * multiplier);
        // Apply buffered input on the NEXT animation frame so the
        // visual has a real frame to settle before the queued hop
        // fires. setTimeout(0) ran in the same microtask cycle and
        // produced visible double-jumps on mobile.
        if (bufferedHopRef.current) {
          const b = bufferedHopRef.current;
          bufferedHopRef.current = null;
          requestAnimationFrame(() => hop(b.dx, b.dy));
        }
        // Pickup pickup-collision check.
        setPickups((existing) => {
          const remaining: Pickup[] = [];
          for (const p of existing) {
            if (p.col === to.col && p.row === to.row) {
              collectPickup(p.kind);
            } else {
              remaining.push(p);
            }
          }
          return remaining;
        });
      }

      const lane = level.lanes[frogRef.current.row];
      if (lane?.kind === 'river') {
        const log = logUnderFrog(lane, tickRef.current, frogRef.current.col + frogRef.current.drift);
        if (log) {
          frogRef.current.drift += log.speed * dt;
          const px = frogRef.current.col + frogRef.current.drift;
          if (px < -0.5 || px > COLS - 0.5) die('splash');
        } else if (!hopRef.current) {
          die('splash');
        }
      } else {
        frogRef.current.drift = 0;
      }

      if (lane?.kind === 'road' && !hopRef.current) {
        if (hitsObstacle(lane, tickRef.current, frogRef.current.col + frogRef.current.drift)) die('splat');
      }

      if (frogRef.current.row === level.goalRow && !hopRef.current) winLevel();

      // Auto-clear floating points + death fx.
      if (floatingPoints && now > floatingPoints.until) setFloatingPoints(null);
      if (deathFx && now > deathFx.until) setDeathFx(null);

      force((n) => n + 1);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [phase, level, die, winLevel, hop, collectPickup, multiplier, eagleState, warnEagle, deathFx, floatingPoints]);

  useEffect(() => {
    const h = () => setFullscreenState(isFullscreen());
    document.addEventListener('fullscreenchange', h);
    return () => document.removeEventListener('fullscreenchange', h);
  }, []);

  const toggleFullscreen = () => {
    if (isFullscreen()) void exitFullscreen();
    else void requestFullscreen(containerRef.current);
  };

  const dpadVisible = hopsTaken < DPAD_FADE_AFTER_HOPS;

  // ---- Render ----
  const renderRows: React.ReactElement[] = [];
  for (let r = ROWS - 1; r >= 0; r--) {
    const lane = level.lanes[r]!;
    const obstacles = laneObstacles(lane, tickRef.current);
    const isFrogRow = frogRef.current.row === r;
    const animPos = hopRef.current
      ? (() => {
          const a = hopRef.current!;
          const remaining = Math.max(0, a.until - performance.now());
          const p = 1 - remaining / HOP_DURATION_MS;
          return { col: a.from.col + (a.to.col - a.from.col) * p, row: a.from.row + (a.to.row - a.from.row) * p };
        })()
      : null;
    const frogCol = isFrogRow
      ? animPos?.row === r ? animPos.col : frogRef.current.col + frogRef.current.drift
      : null;
    const isHopping = isFrogRow && hopRef.current !== null;
    const showDeath = deathFx && deathFx.row === r;
    const lanePickups = pickups.filter((p) => p.row === r);
    renderRows.push(
      <div
        key={r}
        className={`lane lane-${lane.kind} world-${world}`}
        style={
          lane.kind === 'safe'
            ? { background: worldDef.safe, backgroundImage: `repeating-linear-gradient(45deg, transparent 0 8px, ${worldDef.safeStripe} 8px 9px)` }
            : lane.kind === 'road'
              ? { background: worldDef.road, backgroundImage: `repeating-linear-gradient(90deg, var(--road-stripe) 0 24px, transparent 24px 56px)` }
              : { background: worldDef.river }
        }
      >
        {lane.kind !== 'safe' &&
          obstacles.map((x, idx) => {
            const dirRight = lane.speed > 0;
            // Edge-of-log warning: tint logs when frog drift is near the edge.
            const warn = lane.kind === 'river' && isFrogRow && Math.abs(frogRef.current.drift) > 0.6;
            return (
              <span
                key={idx}
                className={`obstacle obstacle-${lane.kind} ${dirRight ? 'dir-right' : 'dir-left'}${warn ? ' warn' : ''}`}
                style={{ left: `${(x / COLS) * 100}%`, width: `${(lane.length / COLS) * 100}%` }}
                aria-hidden
              >
                {lane.kind === 'road' ? <CarSprite right={dirRight} world={world} /> : <LogSprite world={world} />}
              </span>
            );
          })}
        {lanePickups.map((p) => (
          <span
            key={p.id}
            className={`pickup pickup-${p.kind}`}
            style={{ left: `${(p.col / COLS) * 100}%`, width: `${(1 / COLS) * 100}%` }}
            aria-hidden
          >
            {PICKUP_KINDS[p.kind].glyph}
          </span>
        ))}
        {frogCol !== null ? (
          <span
            className={`frog${isHopping ? ' hopping' : ''}${reducedMotion ? ' no-motion' : ''}`}
            style={{ left: `${(frogCol / COLS) * 100}%`, width: `${(1 / COLS) * 100}%` }}
            aria-label={character.name}
          >
            <CharacterSprite character={character} />
            {shields > 0 ? <span className="shield-ring" aria-hidden /> : null}
          </span>
        ) : null}
        {floatingPoints && floatingPoints.row === r ? (
          <span className="float-points" style={{ left: `${(floatingPoints.col / COLS) * 100}%`, width: `${(1 / COLS) * 100}%` }} aria-hidden>
            {floatingPoints.text}
          </span>
        ) : null}
        {showDeath ? (
          <span
            className={`death-fx death-fx-${deathFx.kind}${reducedMotion ? ' no-motion' : ''}`}
            style={{ left: `${(deathFx.col / COLS) * 100}%`, width: `${(1 / COLS) * 100}%` }}
            aria-hidden
          />
        ) : null}
      </div>,
    );
  }

  const showModeTabs = stored.totalRuns >= 1 || stored.unlockedScore > 100;
  const eagleSwoopProgress = eagleState ? Math.min(1, (performance.now() - eagleState.swoopStartedAt) / EAGLE_SWOOP_DURATION_MS) : 0;

  return (
    <main className="app" ref={containerRef}>
      <header className="head">
        <div>
          <h1 className="title-hero" style={{ color: world === 'space' ? '#F8F1E0' : undefined }}>Crossing</h1>
          <p className="eyebrow" style={{ color: world === 'space' ? '#bbb1a4' : undefined }}>
            <span className="game-code">{mode === 'campaign' ? <>Lvl <span className="score-numeric">{stage}</span></> : mode === 'daily' ? `Daily · ${todayKey().slice(5)}` : <>Stage <span className="score-numeric">{stage}</span></>}</span> ·{' '}
            {Array.from({ length: STARTING_LIVES }).map((_, i) => (
              <span key={i} className={i < lives ? 'life-icon' : 'life-icon dead'} aria-hidden>♥</span>
            ))}{' '}
            · <span className="score-numeric">{score}</span> pts {multiplier > 1 ? <span className="mult">×{multiplier}</span> : null}
            {shields > 0 ? <span className="badge-shield" title={`${shields} shield${shields > 1 ? 's' : ''}`}> ◇{shields}</span> : null}
          </p>
        </div>
        <div className="head-actions">
          <button type="button" className="ghost" onClick={() => setShowCharacterPicker((v) => !v)} aria-label="Character">
            <span style={{ fontSize: 18 }}>{character.id === 'frog' ? '🐸' : character.id === 'cat' ? '🐱' : character.id === 'fox' ? '🦊' : character.id === 'penguin' ? '🐧' : character.id === 'owl' ? '🦉' : character.id === 'robot' ? '🤖' : character.id === 'ghost' ? '👻' : '🧑‍🚀'}</span>
          </button>
          <button type="button" className="ghost" onClick={() => setMutedState(toggleMuted())} aria-label={muted ? 'Unmute' : 'Mute'}>
            {muted ? '🔇' : '🔊'}
          </button>
          <button type="button" className="ghost" onClick={toggleFullscreen} aria-label="Toggle fullscreen">
            <FullscreenIcon expanded={fullscreen} />
          </button>
          <button type="button" className="ghost" onClick={tutorial.reset} aria-label="Show tutorial">?</button>
        </div>
      </header>

      {showModeTabs ? (
        <section className="mode-row">
          {(['endless', 'campaign', 'daily'] as Mode[]).map((m) => (
            <button key={m} type="button" className={m === mode ? 'tab active' : 'tab'}
              onClick={() => { setMode(m); reset(1); }}>
              {m}
            </button>
          ))}
          {mode === 'daily' && stored.dailyStreak > 0 ? (
            <span className="streak-chip">🔥 {stored.dailyStreak}</span>
          ) : null}
        </section>
      ) : null}

      {warnEagle && !eagleState ? (
        <div className="eagle-warn" aria-live="polite">⚠ Eagle circling — keep moving</div>
      ) : null}

      <div className="playfield" onPointerDown={onPointerDown} onPointerUp={onPointerUp} role="application">
        {renderRows}
        {eagleState ? (
          <span
            className="eagle-swoop"
            style={{
              left: `${(eagleState.col / COLS) * 100}%`,
              top: `${eagleSwoopProgress * 92}%`,
              width: `${(1 / COLS) * 100}%`,
            }}
            aria-hidden
          >
            🦅
          </span>
        ) : null}

        {/* On-screen D-pad — fades after a few hops once the player
            groks it. Each button: tap = single hop, hold = repeat at
            140ms cadence so the frog moves continuously while held. */}
        {phase === 'playing' && dpadVisible ? (
          <div className="dpad" aria-hidden>
            <button
              type="button"
              className="dpad-up"
              onPointerDown={(e) => { e.preventDefault(); e.stopPropagation(); hop(0, 1); startRepeat(0, 1); }}
              onPointerUp={(e) => { e.preventDefault(); e.stopPropagation(); stopRepeat(); }}
              onPointerCancel={() => stopRepeat()}
              onPointerLeave={() => stopRepeat()}
            >▲</button>
            <button
              type="button"
              className="dpad-left"
              onPointerDown={(e) => { e.preventDefault(); e.stopPropagation(); hop(-1, 0); startRepeat(-1, 0); }}
              onPointerUp={(e) => { e.preventDefault(); e.stopPropagation(); stopRepeat(); }}
              onPointerCancel={() => stopRepeat()}
              onPointerLeave={() => stopRepeat()}
            >◀</button>
            <button
              type="button"
              className="dpad-right"
              onPointerDown={(e) => { e.preventDefault(); e.stopPropagation(); hop(1, 0); startRepeat(1, 0); }}
              onPointerUp={(e) => { e.preventDefault(); e.stopPropagation(); stopRepeat(); }}
              onPointerCancel={() => stopRepeat()}
              onPointerLeave={() => stopRepeat()}
            >▶</button>
            <button
              type="button"
              className="dpad-down"
              onPointerDown={(e) => { e.preventDefault(); e.stopPropagation(); hop(0, -1); startRepeat(0, -1); }}
              onPointerUp={(e) => { e.preventDefault(); e.stopPropagation(); stopRepeat(); }}
              onPointerCancel={() => stopRepeat()}
              onPointerLeave={() => stopRepeat()}
            >▼</button>
          </div>
        ) : null}
      </div>

      {phase === 'idle' ? (
        <section className="overlay" aria-live="polite">
          <p className="finish-line">{stored.totalRuns === 0 ? 'Welcome' : 'Ready?'}</p>
          <p className="muted small">Tap, swipe, or use arrow keys. Reach the top.</p>
          <button type="button" className="primary" onClick={start}>Hop</button>
        </section>
      ) : phase === 'lose' ? (
        <section className="overlay" aria-live="polite">
          <p className="finish-line">Got hopped · {score} pts</p>
          <p className="muted small">Best {mode}: {mode === 'campaign' ? `lvl ${stored.bestCampaignLevel}` : mode === 'daily' ? `${stored.bestDaily} pts` : `${stored.bestEndless} pts`}</p>
          <div className="row-actions">
            <button type="button" className="primary" onClick={() => reset(mode === 'campaign' ? Math.max(1, stage) : 1)}>
              {mode === 'campaign' ? `Resume lvl ${Math.max(1, stage)}` : 'Try again'}
            </button>
            {mode === 'campaign' ? (
              <button type="button" className="ghost" onClick={() => reset(1)}>Restart</button>
            ) : null}
          </div>
        </section>
      ) : phase === 'win' ? (
        <section className="overlay" aria-live="polite">
          <p className="finish-line">🏆 Campaign cleared! {score} pts</p>
          <button type="button" className="primary" onClick={() => reset(1)}>Play again</button>
        </section>
      ) : null}

      {tutorial.active && tutorial.step ? (
        <div className="tutorial-overlay" role="dialog">
          <div className="tutorial-card">
            <p className="tutorial-step muted small">Step {tutorial.index + 1} / {tutorial.total}</p>
            <h3 className="tutorial-title">{tutorial.step.title}</h3>
            <p>{tutorial.step.body}</p>
            <div className="row-actions">
              <button type="button" className="primary" onClick={tutorial.next}>{tutorial.index + 1 >= tutorial.total ? 'Got it' : 'Next'}</button>
              <button type="button" className="ghost" onClick={tutorial.dismiss}>Skip</button>
            </div>
          </div>
        </div>
      ) : null}

      {showCharacterPicker ? (
        <div className="char-overlay" role="dialog" onClick={() => setShowCharacterPicker(false)}>
          <div className="char-card" onClick={(e) => e.stopPropagation()}>
            <h3 className="tutorial-title">Pick a hero</h3>
            <div className="char-grid">
              {CHARACTERS.map((c) => {
                const unlocked = stored.unlockedScore >= c.unlockScore;
                return (
                  <button
                    key={c.id}
                    type="button"
                    className={`char-tile${stored.selectedCharacter === c.id ? ' selected' : ''}${!unlocked ? ' locked' : ''}`}
                    onClick={() => {
                      if (!unlocked) return;
                      setStored((s) => ({ ...s, selectedCharacter: c.id }));
                      setShowCharacterPicker(false);
                    }}
                    title={unlocked ? c.name : `Unlock at ${c.unlockScore} pts`}
                  >
                    <div className="char-preview"><CharacterSprite character={c} /></div>
                    <span className="char-name">{c.name}</span>
                    {!unlocked ? <span className="char-lock">🔒 {c.unlockScore}</span> : null}
                  </button>
                );
              })}
            </div>
            <button type="button" className="ghost" onClick={() => setShowCharacterPicker(false)}>Close</button>
          </div>
        </div>
      ) : null}

      <Confetti trigger={confettiTrigger} />
    </main>
  );
}

function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    setReduced(mq.matches);
    const handler = (e: MediaQueryListEvent) => setReduced(e.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);
  return reduced;
}

function FullscreenIcon({ expanded }: { expanded: boolean }) {
  // Clear SVG glyph in place of opaque unicode (⛶/⤡). 2026-05-23 review.
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      {expanded ? (
        <>
          <path d="M6 2v4H2" />
          <path d="M10 2v4h4" />
          <path d="M6 14v-4H2" />
          <path d="M10 14v-4h4" />
        </>
      ) : (
        <>
          <path d="M2 6V2h4" />
          <path d="M14 6V2h-4" />
          <path d="M2 10v4h4" />
          <path d="M14 10v4h-4" />
        </>
      )}
    </svg>
  );
}

function CharacterSprite({ character }: { character: CharacterDef }) {
  return (
    <svg viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg" aria-hidden>
      <ellipse cx="16" cy="22" rx="12" ry="7" fill={character.belly} stroke="#1a1715" strokeWidth="1.2" />
      <ellipse cx="16" cy="20" rx="10" ry="5" fill={character.body} stroke="#1a1715" strokeWidth="1" />
      <circle cx="10" cy="13" r="4.5" fill={character.body} stroke="#1a1715" strokeWidth="1" />
      <circle cx="22" cy="13" r="4.5" fill={character.body} stroke="#1a1715" strokeWidth="1" />
      <circle cx="10" cy="13" r="2.4" fill="#fff" />
      <circle cx="22" cy="13" r="2.4" fill="#fff" />
      <circle cx="10.4" cy="13.2" r="1.4" fill={character.eye} />
      <circle cx="21.6" cy="13.2" r="1.4" fill={character.eye} />
    </svg>
  );
}

function CarSprite({ right, world }: { right: boolean; world: World }) {
  const palette: Record<World, { body: string; roof: string }> = {
    forest: { body: '#E84A2D', roof: '#C24E1F' },
    desert: { body: '#7E5B96', roof: '#5C3F73' },
    space: { body: '#3F8AA8', roof: '#2A6580' },
  };
  const c = palette[world];
  return (
    <svg viewBox="0 0 64 32" preserveAspectRatio="none" style={{ transform: right ? 'none' : 'scaleX(-1)' }} aria-hidden>
      <rect x="2" y="10" width="60" height="14" rx="3" fill={c.body} stroke="#1a1715" strokeWidth="1.2" />
      <rect x="14" y="4" width="36" height="10" rx="2" fill={c.roof} stroke="#1a1715" strokeWidth="1" />
      <rect x="46" y="13" width="6" height="3" fill="#F4B860" />
      <circle cx="14" cy="26" r="3.5" fill="#1a1715" />
      <circle cx="50" cy="26" r="3.5" fill="#1a1715" />
    </svg>
  );
}

function LogSprite({ world }: { world: World }) {
  // For "space" world, render a floating asteroid. Otherwise keep the
  // wood log silhouette.
  if (world === 'space') {
    return (
      <svg viewBox="0 0 64 32" preserveAspectRatio="none" aria-hidden>
        <ellipse cx="32" cy="16" rx="30" ry="11" fill="#5A4D6F" stroke="#3A2D55" strokeWidth="1.5" />
        <circle cx="20" cy="13" r="2" fill="#3A2D55" opacity="0.6" />
        <circle cx="42" cy="18" r="3" fill="#3A2D55" opacity="0.6" />
        <circle cx="50" cy="11" r="1.5" fill="#3A2D55" opacity="0.6" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 64 32" preserveAspectRatio="none" aria-hidden>
      <rect x="0" y="6" width="64" height="20" rx="6" fill="#8B4513" stroke="#1a1715" strokeWidth="1" />
      <rect x="0" y="6" width="64" height="20" rx="6" fill="url(#logGrain)" opacity="0.4" />
      <ellipse cx="6" cy="16" rx="4" ry="9" fill="#6B3410" />
      <ellipse cx="58" cy="16" rx="4" ry="9" fill="#6B3410" />
      <defs>
        <linearGradient id="logGrain" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor="#fff" stopOpacity="0.15" />
          <stop offset="100%" stopColor="#000" stopOpacity="0.2" />
        </linearGradient>
      </defs>
    </svg>
  );
}
