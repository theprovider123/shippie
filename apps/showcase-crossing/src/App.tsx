// apps/showcase-crossing/src/App.tsx
import { useCallback, useEffect, useRef, useState } from 'react';
import { createShippieIframeSdk } from '@shippie/iframe-sdk';
import { createObservationClient } from '@shippie/observations';
import { haptic } from '@shippie/sdk/wrapper';
import { createState, type FroggerState, tickFlyTimer } from './game/state.ts';
import { startHop, resolveHop, tickRiver, tickRoad, tickDeathFlash, tickLevelClear } from './game/physics.ts';
import { tickTimer } from './game/timer.ts';
import { audio } from './game/audio.ts';
import { drawFrame, resizeCanvas } from './renderer/canvas.ts';
import { isFullscreen, requestFullscreen, exitFullscreen } from './fullscreen.ts';

const sdk = createShippieIframeSdk({ appId: 'app_crossing' });
sdk.safeEdges.declareInputRegion('all');
const observations = createObservationClient(sdk);

const STORAGE_KEY = 'shippie:crossing:v2';

function loadBest(): number {
  try {
    const v = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}') as Record<string, unknown>;
    return typeof v['best'] === 'number' ? v['best'] : 0;
  } catch { return 0; }
}

function saveBest(n: number): void {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify({ best: n })); } catch {/**/}
}

function loadMuted(): boolean {
  try {
    const v = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}') as Record<string, unknown>;
    return typeof v['muted'] === 'boolean' ? v['muted'] : false;
  } catch { return false; }
}

function saveMuted(v: boolean): void {
  try {
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}') as Record<string, unknown>;
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...stored, muted: v }));
  } catch {/**/}
}

export function App() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const stateRef = useRef<FroggerState>(createState(1, loadBest()));
  const [muted, setMuted] = useState(() => { const m = loadMuted(); audio.loadMuted(m); return m; });
  const [fullscreen, setFullscreen] = useState(false);
  const [hintFaded, setHintFaded] = useState(false);
  const fontLoadedRef = useRef(false);
  const rafRef = useRef(0);
  const lastMsRef = useRef(0);
  const pointerDownRef = useRef<{ x: number; y: number } | null>(null);
  const hurryRef = useRef(false);
  const resultEmittedRef = useRef(false);
  const [, forceRender] = useState(0);

  // Load Press Start 2P — mark fontLoaded when ready
  useEffect(() => {
    document.fonts.load('400 12px "Press Start 2P"').then(() => {
      fontLoadedRef.current = true;
    }).catch(() => {/**/});
  }, []);

  // Resize canvas when container changes
  const resizeObsRef = useRef<ResizeObserver | null>(null);
  useEffect(() => {
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    if (!canvas || !wrap) return;
    const doResize = () => {
      const { width, height } = wrap.getBoundingClientRect();
      resizeCanvas(canvas, width, height);
    };
    doResize();
    resizeObsRef.current = new ResizeObserver(doResize);
    resizeObsRef.current.observe(wrap);
    return () => resizeObsRef.current?.disconnect();
  }, []);

  // ── Input helpers ─────────────────────────────────────────────────

  const hop = useCallback((dc: number, dr: number) => {
    const s = stateRef.current;
    if (s.phase === 'attract' || s.phase === 'game-over') {
      // Any input starts / restarts
      if (s.phase === 'game-over') {
        saveBest(Math.max(s.score, s.bestScore));
        stateRef.current = createState(1, Math.max(s.score, s.bestScore));
      }
      stateRef.current.phase = 'playing';
      lastMsRef.current = performance.now();
      resultEmittedRef.current = false;
      forceRender(n => n + 1);
      return;
    }
    startHop(s, dc, dr, performance.now());
    haptic('tap');
    audio.hop();
    if (!hintFaded) setHintFaded(true);
  }, [hintFaded]);

  // Keyboard
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      const s = stateRef.current;
      if (s.phase === 'attract' || s.phase === 'game-over') {
        if (e.key === ' ' || e.key === 'Enter') { hop(0, 0); return; }
      }
      switch (e.key) {
        case 'ArrowUp':  case 'w': case 'W': e.preventDefault(); hop(0, 1); break;
        case 'ArrowDown': case 's': case 'S': e.preventDefault(); hop(0, -1); break;
        case 'ArrowLeft': case 'a': case 'A': e.preventDefault(); hop(-1, 0); break;
        case 'ArrowRight': case 'd': case 'D': e.preventDefault(); hop(1, 0); break;
      }
    };
    window.addEventListener('keydown', down);
    return () => window.removeEventListener('keydown', down);
  }, [hop]);

  // Touch: swipe + tap zones
  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    pointerDownRef.current = { x: e.clientX, y: e.clientY };
  };
  const onPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    const pd = pointerDownRef.current;
    pointerDownRef.current = null;
    if (!pd) return;
    if ((e.target as HTMLElement).closest('button')) return;
    const dx = e.clientX - pd.x;
    const dy = e.clientY - pd.y;
    const adx = Math.abs(dx);
    const ady = Math.abs(dy);
    if (adx < 12 && ady < 12) {
      // Tap: use zone (top half = forward, bottom = back, left = left, right = right)
      const wrap = wrapRef.current;
      if (!wrap) { hop(0, 1); return; }
      const rect = wrap.getBoundingClientRect();
      const rx = (e.clientX - rect.left) / rect.width;
      const ry = (e.clientY - rect.top) / rect.height;
      if (ry < 0.35) hop(0, 1);
      else if (ry > 0.65) hop(0, -1);
      else if (rx < 0.4) hop(-1, 0);
      else hop(1, 0);
    } else if (adx > ady) {
      hop(dx > 0 ? 1 : -1, 0);
    } else {
      hop(0, dy > 0 ? -1 : 1);
    }
  };

  // Pause on visibility change
  useEffect(() => {
    const handler = () => {
      if (document.hidden) audio.stopHurry();
    };
    document.addEventListener('visibilitychange', handler);
    return () => document.removeEventListener('visibilitychange', handler);
  }, []);

  // Fullscreen
  useEffect(() => {
    const h = () => setFullscreen(isFullscreen());
    document.addEventListener('fullscreenchange', h);
    return () => document.removeEventListener('fullscreenchange', h);
  }, []);

  const toggleFullscreen = () => {
    if (isFullscreen()) void exitFullscreen();
    else void requestFullscreen(wrapRef.current);
  };

  const toggleMute = () => {
    const next = audio.toggleMute();
    setMuted(next);
    saveMuted(next);
  };

  // ── Game loop ─────────────────────────────────────────────────────

  useEffect(() => {
    const loop = (nowMs: number) => {
      const dtMs = Math.min(50, nowMs - (lastMsRef.current || nowMs));
      lastMsRef.current = nowMs;
      const s = stateRef.current;
      const canvas = canvasRef.current;

      if (s.phase === 'playing') {
        s.simTimeSec += dtMs / 1000;
        s.shakeMag = Math.max(0, s.shakeMag - dtMs * 0.02);

        // Resolve completed hops
        if (s.hopTween && nowMs >= s.hopTween.startMs + s.hopTween.durationMs) {
          resolveHop(s);
          const phaseAfterHop = (s as FroggerState).phase;
          if (phaseAfterHop === 'dead-flash') {
            audio.death();
            haptic('error');
          } else if (phaseAfterHop === 'level-clear') {
            audio.levelClear();
            haptic('success');
          } else if (s.frog.row === 12) {
            audio.home();
            haptic('success');
          }
        }

        // River riding (only when not hopping)
        if (s.phase === 'playing') {
          const survived = tickRiver(s, dtMs / 1000);
          if (!survived) {
            audio.death();
            haptic('error');
          }
        }
        // Road standing collision
        if (s.phase === 'playing') {
          const survived = tickRoad(s);
          if (!survived) {
            audio.death();
            haptic('error');
          }
        }

        // Timer
        if (s.phase === 'playing') {
          const timerResult = tickTimer(s, dtMs);
          if (timerResult === 'hurry' && !hurryRef.current) {
            hurryRef.current = true;
            s.hurryActive = true;
            audio.startHurry();
          }
          if (timerResult === 'expired') {
            // Treat timer expiry as death
            s.phase = 'dead-flash';
            s.deathFlashMs = 700;
            s.shakeMag = 8;
            s.lives -= 1;
            s.hopTween = null;
            audio.death();
            haptic('error');
            audio.stopHurry();
            hurryRef.current = false;
          }
          // Stop hurry if timer reset (new frog)
          if (s.timerMs > 10_000 && hurryRef.current) {
            hurryRef.current = false;
            s.hurryActive = false;
            audio.stopHurry();
          }
        }

        // Fly
        tickFlyTimer(s, dtMs);

        // Emit game.completed once on game-over
        if ((s as FroggerState).phase === 'game-over' && !resultEmittedRef.current) {
          resultEmittedRef.current = true;
          saveBest(Math.max(s.score, s.bestScore));
          s.bestScore = Math.max(s.score, s.bestScore);
          audio.stopHurry();
          hurryRef.current = false;
          observations.emit({
            kind: 'game.completed',
            game: 'crossing',
            result: `lvl ${s.levelNumber} · ${s.score} pts`,
            at: new Date().toISOString(),
          });
        }
      } else if (s.phase === 'dead-flash') {
        tickDeathFlash(s, dtMs);
        if ((s as FroggerState).phase === 'playing') {
          // Respawned
          audio.stopHurry();
          hurryRef.current = false;
        }
      } else if (s.phase === 'level-clear') {
        tickLevelClear(s, dtMs);
      }

      if (canvas) {
        drawFrame(canvas, s, nowMs, fontLoadedRef.current);
      }

      rafRef.current = requestAnimationFrame(loop);
    };

    rafRef.current = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(rafRef.current);
  }, []);

  return (
    <div className="app">
      <header className="bar">
        <span className="bar-title">CROSSING</span>
        <div className="bar-actions">
          <button type="button" className="bar-btn" onClick={toggleMute} aria-label={muted ? 'Unmute' : 'Mute'}>
            {muted ? '🔇' : '🔊'}
          </button>
          <button type="button" className="bar-btn" onClick={toggleFullscreen} aria-label="Toggle fullscreen">
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              {fullscreen ? (
                <><path d="M6 2v4H2"/><path d="M10 2v4h4"/><path d="M6 14v-4H2"/><path d="M10 14v-4h4"/></>
              ) : (
                <><path d="M2 6V2h4"/><path d="M14 6V2h-4"/><path d="M2 10v4h4"/><path d="M14 10v4h-4"/></>
              )}
            </svg>
          </button>
        </div>
      </header>

      <div
        className="canvas-wrap"
        ref={wrapRef}
        onPointerDown={onPointerDown}
        onPointerUp={onPointerUp}
      >
        <canvas ref={canvasRef} />
        <div className={`hint${hintFaded ? ' faded' : ''}`}>
          arrows / swipe to hop
        </div>
      </div>
    </div>
  );
}
