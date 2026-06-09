import { useEffect, useRef, useState } from "react";
import { tap as hapticTap, confirmBuzz, celebrate } from "../../lib/haptics";
import { drawStadium, drawBall, drawBallShadow, drawKeeper, Trail, Particles, Shake } from "../../lib/stadium";
import { Keeper, keeperConfig, saved2d, rampedDifficulty } from "../../lib/keeper";
import { gradeShot, scoreFor, type Grade } from "../../lib/combo";
import { Hitstop, drawNetRipple } from "../../lib/juice";
import { dailyKey, dailySeed, seededRng } from "../../lib/daily";
import * as sfx from "../../lib/sfx";

const LIVES = 3;
const BEST_KEY = "golazo:freekick:best";
const GRADE_LABEL: Record<Grade, string> = { tidy: "TIDY", sweet: "SWEET!", worldie: "WORLDIE!" };

type Pt = { x: number; y: number };
type Mode = "endless" | "daily";
type Ball = {
  x: number; depthY: number; height: number;
  vx: number; vDepth: number; vz: number;
  curl: number; spin: number; flying: boolean; r: number;
};

function readBest(): number {
  try { return Number(localStorage.getItem(BEST_KEY)) || 0; } catch { return 0; }
}
function writeBest(n: number): void {
  try { localStorage.setItem(BEST_KEY, String(n)); } catch { /* ignore */ }
}

/**
 * Free Kick — bend it round the wall, beat the keeper, keep going. The run is endless and
 * escalates every round (wall creeps in, keeper sharpens, a second man joins, wind swings);
 * three misses end it. Consecutive goals build a combo multiplier and clean strikes grade up
 * to a Worldie. Daily mode seeds the same sequence for everyone so scores are comparable.
 */
export function FreeKick({ onGameOver, target, difficulty = 0.35 }: { onGameOver: (score: number) => void; target?: number; difficulty?: number }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [score, setScore] = useState(0);
  const [lives, setLives] = useState(LIVES);
  const [round, setRound] = useState(1);
  const [streak, setStreak] = useState(0);
  const [phase, setPhase] = useState<"ready" | "play" | "over">("ready");
  const [flash, setFlash] = useState<{ msg: string; kind: string }>({ msg: "", kind: "" });
  const [mode, setMode] = useState<Mode>("endless");
  const [best, setBest] = useState(readBest());
  const [muted, setMutedState] = useState(sfx.isMuted());

  const scoreRef = useRef(0);
  const livesRef = useRef(LIVES);
  const streakRef = useRef(0);
  const attemptsRef = useRef(0);

  useEffect(() => {
    if (phase !== "play") return;
    const canvas = canvasRef.current!;
    const ctx = canvas.getContext("2d")!;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    let W = 0, H = 0;
    function size() {
      const r = canvas.getBoundingClientRect();
      W = r.width; H = r.height;
      canvas.width = W * dpr; canvas.height = H * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
    size();
    window.addEventListener("resize", size);

    // Daily mode draws every random from a seeded stream so the run is identical for all.
    const rng = mode === "daily" ? seededRng(dailySeed()) : Math.random;

    const goalY = () => H * 0.12;
    const goalL = () => W * 0.04;
    const goalR = () => W * 0.96;
    const barH = () => H * 0.34;
    const goalBottom = () => goalY() + barH();
    const clamp = (n: number, lo: number, hi: number) => (n < lo ? lo : n > hi ? hi : n);
    // Wall edges in toward the spot and rises as the rounds climb.
    const roundOf = () => Math.floor(attemptsRef.current / 3) + 1;
    const wallDepth = () => H * (0.58 - Math.min(0.14, (roundOf() - 1) * 0.025));
    const wallTall = () => H * (0.10 + Math.min(0.06, (roundOf() - 1) * 0.012));
    const spot = () => ({ x: W / 2, y: H * 0.88 });
    const freshBall = (): Ball => ({ ...spot(), depthY: spot().y, height: 0, vx: 0, vDepth: 0, vz: 0, curl: 0, spin: 0, flying: false, r: Math.min(W, H) * 0.045 });
    const screenY = (b = ball) => b.depthY - b.height;

    let ball = freshBall();
    const baseDiff = () => clamp(difficulty + (roundOf() - 1) * 0.04, 0, 0.9);
    const keeper = new Keeper(goalL(), goalR(), keeperConfig(baseDiff()));
    let wallX = W / 2;
    let wind = 0;            // lateral push, -1..1
    let secondWallX: number | null = null; // a second free-kick man at higher rounds
    let drag: Pt | null = null;
    let path: Pt[] = [];
    let aim: Pt | null = null;
    let resolved = false;
    let crossedWall = false;
    let ripple: { x: number; y: number; age: number } | null = null;
    const trail = new Trail(16);
    const particles = new Particles();
    const shake = new Shake();
    const hitstop = new Hitstop();
    const startT = performance.now();
    let raf = 0;

    function setupShot() {
      wallX = W * (0.30 + rng() * 0.40);
      wind = (rng() * 2 - 1) * Math.min(0.9, 0.2 + (roundOf() - 1) * 0.12);
      secondWallX = roundOf() >= 3 ? W * (0.30 + rng() * 0.40) : null;
      keeper.cfg = keeperConfig(rampedDifficulty(baseDiff(), scoreRef.current));
    }
    setupShot();

    function curlFromPath(pts: Pt[]): number {
      if (pts.length < 3) return 0;
      const a = pts[0], b = pts[pts.length - 1], m = pts[Math.floor(pts.length / 2)];
      const len = Math.hypot(b.x - a.x, b.y - a.y) || 1;
      const cross = ((b.x - a.x) * (a.y - m.y) - (b.y - a.y) * (a.x - m.x)) / len;
      return clamp(-cross / (W * 0.12), -1, 1);
    }

    // How smooth the swipe arc was (low jitter = a clean strike) → feeds the grade.
    function smoothness(pts: Pt[]): number {
      if (pts.length < 4) return 0.5;
      let turn = 0, segs = 0;
      for (let i = 2; i < pts.length; i++) {
        const a = { x: pts[i - 1].x - pts[i - 2].x, y: pts[i - 1].y - pts[i - 2].y };
        const b = { x: pts[i].x - pts[i - 1].x, y: pts[i].y - pts[i - 1].y };
        const la = Math.hypot(a.x, a.y), lb = Math.hypot(b.x, b.y);
        if (la < 1 || lb < 1) continue;
        const cos = (a.x * b.x + a.y * b.y) / (la * lb);
        turn += Math.acos(clamp(cos, -1, 1));
        segs++;
      }
      if (!segs) return 0.5;
      return clamp(1 - (turn / segs) / 0.9, 0, 1);
    }

    function buildLaunch(pts: Pt[]) {
      const end = pts[pts.length - 1] ?? spot();
      const s = spot();
      const dx = end.x - s.x, dy = end.y - s.y;
      if (dy > -16) return null;
      const dist = Math.hypot(dx, dy);
      const power = clamp(dist / (H * 0.42), 0.48, 1.18);
      const lift = clamp((s.y - end.y) / (H * 0.62), 0.16, 1.08);
      const curl = curlFromPath(pts);
      return {
        vx: dx * 0.028 * power,
        vDepth: -(10.5 + power * 6.6),
        vz: 4.2 + lift * 6.2 + power * 0.8,
        curl: curl * (0.16 + power * 0.08),
        spin: dx * 0.018 + curl * 0.8,
        power,
      };
    }

    function stepBall(b: Ball, ts = 1) {
      b.vz -= 0.36 * ts;
      b.vx += (b.curl + wind * 0.05) * ts;
      b.curl *= Math.pow(0.94, ts);
      b.x += b.vx * ts;
      b.depthY += b.vDepth * ts;
      b.height += b.vz * ts;
      b.spin += (b.vx * 0.03 + b.curl * 0.5) * ts;
      if (b.height < 0) {
        b.height = 0; b.vz *= -0.16; b.vDepth *= 0.97; b.vx *= 0.985;
      }
    }

    function predictKeeperCross(launch: NonNullable<ReturnType<typeof buildLaunch>>) {
      const b = { ...freshBall(), ...launch, flying: true };
      for (let i = 0; i < 90 && b.depthY > goalBottom(); i++) {
        b.vx += b.curl * 0.35 + wind * 0.02;
        b.curl *= 0.9;
        b.vz -= 0.36;
        b.x += b.vx;
        b.depthY += b.vDepth;
        b.height = Math.max(0, b.height + b.vz);
      }
      return { x: b.x, y: screenY(b) };
    }

    let lastPower = 0.7;
    function shoot(pts: Pt[]) {
      if (ball.flying) return;
      const launch = buildLaunch(pts);
      if (!launch) return;
      lastPower = launch.power;
      lastSmooth = smoothness(pts);
      Object.assign(ball, launch, { flying: true, height: 0 });
      resolved = false; crossedWall = false; ripple = null;
      trail.clear();
      hapticTap(); sfx.kick(launch.power);
      attemptsRef.current += 1;
      keeper.commit(predictKeeperCross(launch).x, rng);
    }
    let lastSmooth = 0.5;

    function onDown(e: PointerEvent) {
      if (ball.flying) return;
      const r = canvas.getBoundingClientRect();
      drag = { x: e.clientX - r.left, y: e.clientY - r.top };
      path = [drag]; aim = drag;
      canvas.setPointerCapture?.(e.pointerId);
    }
    function onMove(e: PointerEvent) {
      if (!drag) return;
      const r = canvas.getBoundingClientRect();
      aim = { x: e.clientX - r.left, y: e.clientY - r.top };
      path.push(aim);
    }
    function onUp() {
      if (drag && aim) shoot(path.length > 1 ? path : [drag, aim]);
      drag = null; aim = null; path = [];
    }
    canvas.addEventListener("pointerdown", onDown);
    canvas.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);

    function nextRoundState() {
      setScore(scoreRef.current);
      setLives(livesRef.current);
      setStreak(streakRef.current);
      setRound(roundOf());
    }

    function endShot(msg: string, kind: string, pts: number) {
      resolved = true;
      setFlash({ msg, kind });
      if (pts > 0) {
        scoreRef.current += pts; streakRef.current += 1;
        const big = kind === "worldie";
        particles.emit(ball.x, screenY(), "spark", big ? 34 : kind === "sweet" ? 24 : 16);
        shake.kick(big ? 15 : kind === "sweet" ? 11 : 7);
        hitstop.kick(big ? 1 : kind === "sweet" ? 0.7 : 0.4, big ? 5 : 2);
        ripple = { x: ball.x, y: screenY(), age: 0 };
        celebrate(); sfx.net(); sfx.crowd(big ? 1 : 0.6);
      } else {
        livesRef.current -= 1;
        streakRef.current = 0;
        shake.kick(kind === "save" ? 9 : 4);
        hitstop.kick(kind === "save" ? 0.5 : 0, kind === "save" ? 2 : 0);
        confirmBuzz();
        if (kind === "save") sfx.save();
      }
      nextRoundState();
      const done = livesRef.current <= 0;
      setTimeout(() => {
        setFlash({ msg: "", kind: "" });
        if (done) {
          setPhase("over");
          if (scoreRef.current > readBest()) { writeBest(scoreRef.current); setBest(scoreRef.current); }
          onGameOver(scoreRef.current);
        } else {
          ball = freshBall(); keeper.reset(); trail.clear(); ripple = null; setupShot();
          nextRoundState();
        }
      }, 880);
    }

    function judgeAtGoal() {
      const gl = goalL(), gr = goalR(), gy = goalY(), gb = goalBottom(), bh = barH();
      const y = screenY();
      const inX = ball.x > gl + ball.r && ball.x < gr - ball.r;
      const inY = y > gy + ball.r * 0.35 && y < gb - ball.r * 0.3;
      const keeperY = gy + bh * 0.58 - keeper.dive * bh * 0.08;
      const reachY = bh * (0.35 + baseDiff() * 0.16) + keeper.dive * bh * 0.08;
      const isSaved = inX && inY && saved2d(ball.x, y, keeper.x, keeperY, keeper.reachPx(), reachY, ball.r);
      if (!inX) return endShot("WIDE", "miss", 0);
      if (!inY) return endShot(y <= gy ? "OVER" : "LOW", "miss", 0);
      if (isSaved) return endShot("SAVED!", "save", 0);
      // Goal — grade it from placement (corner), pace and how cleanly it was struck.
      const cornerX = Math.min(ball.x - gl, gr - ball.x) / ((gr - gl) / 2); // 0 centre → 1 post
      const high = clamp((gy + bh - y) / bh, 0, 1);
      const placement = clamp(0.45 * (1 - cornerX) + 0.55 * high, 0, 1);
      const grade = gradeShot({ cleanliness: lastSmooth, placement, pace: clamp(lastPower / 1.18, 0, 1) });
      const side = ball.x < gl + (gr - gl) * 0.2 || ball.x > gr - (gr - gl) * 0.2;
      const base = side && y < gy + bh * 0.36 ? 2 : 1;
      const pts = scoreFor(base, grade, streakRef.current + 1);
      const msg = grade === "tidy" ? `GOAL +${pts}` : `${GRADE_LABEL[grade]} +${pts}`;
      endShot(msg, grade, pts);
    }

    function maybeWallBlock() {
      if (crossedWall || ball.depthY > wallDepth()) return;
      crossedWall = true;
      const y = screenY();
      const wallTop = wallDepth() - wallTall(), wallBottom = wallDepth() + H * 0.045, wallWidth = W * 0.2;
      const hit = (cx: number) => Math.abs(ball.x - cx) < wallWidth * 0.5 && y > wallTop && y < wallBottom;
      if (hit(wallX) || (secondWallX != null && hit(secondWallX))) endShot("WALL!", "miss", 0);
    }

    function drawGoalFrame() {
      const gl = goalL(), gr = goalR(), gy = goalY(), bh = barH();
      ctx.strokeStyle = "rgba(255,255,255,0.16)"; ctx.lineWidth = 1;
      for (let x = gl; x <= gr; x += (gr - gl) / 14) { ctx.beginPath(); ctx.moveTo(x, gy); ctx.lineTo(x, gy + bh); ctx.stroke(); }
      for (let yy = gy; yy <= gy + bh; yy += bh / 5) { ctx.beginPath(); ctx.moveTo(gl, yy); ctx.lineTo(gr, yy); ctx.stroke(); }
      ctx.strokeStyle = "#ffffff"; ctx.lineWidth = 5; ctx.lineCap = "round";
      ctx.beginPath(); ctx.moveTo(gl, gy + bh); ctx.lineTo(gl, gy); ctx.lineTo(gr, gy); ctx.lineTo(gr, gy + bh); ctx.stroke();
    }

    function drawWallAt(cx: number) {
      const players = 4, ww = W * 0.052, wy = wallDepth();
      for (let i = 0; i < players; i++) {
        const x = cx - (players - 1) * ww * 0.58 + i * ww * 1.16;
        ctx.fillStyle = "#243a4a"; ctx.beginPath(); ctx.ellipse(x, wy, ww * 0.45, H * 0.052, 0, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = "#1a2a36"; ctx.beginPath(); ctx.arc(x, wy - H * 0.055, ww * 0.3, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = "rgba(255,255,255,0.18)"; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(x - ww * 0.25, wy - H * 0.01); ctx.lineTo(x + ww * 0.25, wy - H * 0.01); ctx.stroke();
      }
    }

    function drawWind() {
      if (Math.abs(wind) < 0.05) return;
      const dir = Math.sign(wind), mag = Math.abs(wind);
      const bx = W * 0.5, by = goalY() - H * 0.02;
      ctx.save(); ctx.globalAlpha = 0.5 + mag * 0.4; ctx.strokeStyle = "#bfe9ff"; ctx.lineWidth = 2; ctx.lineCap = "round";
      for (let i = 0; i < 3; i++) {
        const len = (12 + mag * 26) * (1 - i * 0.18), y = by + i * 6 - 6;
        ctx.beginPath(); ctx.moveTo(bx - dir * len * 0.5, y); ctx.lineTo(bx + dir * len * 0.5, y);
        ctx.moveTo(bx + dir * len * 0.5, y); ctx.lineTo(bx + dir * (len * 0.5 - 5), y - 4);
        ctx.moveTo(bx + dir * len * 0.5, y); ctx.lineTo(bx + dir * (len * 0.5 - 5), y + 4);
        ctx.stroke();
      }
      ctx.restore();
    }

    function drawAimGuide() {
      if (!aim || !drag || ball.flying) return;
      const launch = buildLaunch(path.length > 1 ? path : [drag, aim]);
      if (!launch) return;
      const b = { ...freshBall(), ...launch, flying: true };
      for (let i = 0; i < 34 && b.depthY > goalY() - 20; i++) {
        stepBall(b);
        const fade = 0.58 - i * 0.014;
        ctx.fillStyle = `rgba(184,255,78,${Math.max(0.1, fade)})`;
        ctx.beginPath(); ctx.arc(b.x, screenY(b), 2.8 - i * 0.035, 0, Math.PI * 2); ctx.fill();
      }
    }

    function frame(now: number) {
      const ts = hitstop.scale();
      keeper.setBounds(goalL(), goalR());
      keeper.update(2 * ts);

      if (ball.flying && !resolved) {
        stepBall(ball, ts);
        trail.push(ball.x, screenY());
        maybeWallBlock();
        if (!resolved && ball.depthY <= goalBottom()) judgeAtGoal();
        else if (!resolved && (ball.x < -80 || ball.x > W + 80 || ball.depthY < goalY() - H * 0.08)) endShot("WIDE", "miss", 0);
      }

      const [sx, sy] = shake.offset();
      ctx.save();
      ctx.translate(sx, sy);
      drawStadium(ctx, W, H, now - startT, { pitchTop: 0.42 });
      drawGoalFrame();
      const gy = goalY(), bh = barH();
      drawKeeper(ctx, keeper.x, gy + bh * 0.6, keeper.reachPx() * 1.17, keeper.lean, bh * 0.44, keeper.dive);
      if (ripple) { drawNetRipple(ctx, ripple.x, ripple.y, ripple.age, "rgba(120,240,170,"); ripple.age += ts; }
      drawWind();
      drawWallAt(wallX);
      if (secondWallX != null) drawWallAt(secondWallX);
      drawAimGuide();
      if (ball.flying) trail.draw(ctx, ball.r);
      const y = screenY();
      const heightFrac = clamp(ball.height / (H * 0.28), 0, 1);
      const perspective = 0.58 + 0.42 * clamp((ball.depthY - goalY()) / (spot().y - goalY()), 0, 1);
      drawBallShadow(ctx, ball.x, ball.depthY + H * 0.018, ball.r, heightFrac);
      drawBall(ctx, ball.x, y, ball.r * perspective, ball.flying ? ball.spin : now / 100);
      if (ts > 0.5) particles.update();
      particles.draw(ctx);
      ctx.restore();
      raf = requestAnimationFrame(frame);
    }
    raf = requestAnimationFrame(frame);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", size);
      canvas.removeEventListener("pointerdown", onDown);
      canvas.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
  }, [phase, onGameOver, difficulty, mode]);

  function startGame() {
    scoreRef.current = 0; livesRef.current = LIVES; streakRef.current = 0; attemptsRef.current = 0;
    setScore(0); setLives(LIVES); setStreak(0); setRound(1); setFlash({ msg: "", kind: "" });
    setPhase("play");
  }
  function toggleMute() { const next = !muted; sfx.setMuted(next); setMutedState(next); hapticTap(); }

  const rating = (s: number) =>
    s >= 40 ? "Set-piece specialist 🪄" : s >= 28 ? "Dead-ball merchant" : s >= 16 ? "Free-kick taker" : s >= 6 ? "Getting an eye in" : "Keep bending them";

  return (
    <div className="game-stage freekick-stage">
      <div className="game-hud">
        <span className="game-score">{score}</span><span className="game-unit">pts</span>
        {phase === "play" && <span className="fk-round">R{round}{streak >= 2 ? ` · 🔥${streak}` : ""}</span>}
        <span className="game-shots">{"❤".repeat(Math.max(0, lives))}{"·".repeat(LIVES - Math.max(0, lives))}</span>
        <button className="game-mute" aria-label={muted ? "Unmute" : "Mute"} onClick={toggleMute}>{muted ? "🔇" : "🔊"}</button>
      </div>
      <canvas ref={canvasRef} className="game-canvas" />
      {flash.msg && <div className={`game-flash ${flash.kind === "worldie" ? "bins" : flash.kind === "sweet" || flash.kind === "tidy" ? "goal" : "miss"}`}>{flash.msg}</div>}
      {phase === "ready" && (
        <div className="game-overlay">
          <span className="game-emoji">🧱</span>
          <h3>Free Kick</h3>
          <p>Swipe in a <strong>curve</strong> to bend it round the wall and past the keeper. Clean strikes into the corner grade up to a <strong>Worldie</strong>; goals in a row stack a combo. Each round gets harder — three misses and you're done.</p>
          <div className="fk-mode">
            <button className={`fk-mode-btn${mode === "endless" ? " on" : ""}`} onClick={() => setMode("endless")}>Endless</button>
            <button className={`fk-mode-btn${mode === "daily" ? " on" : ""}`} onClick={() => setMode("daily")}>Daily challenge</button>
          </div>
          {mode === "daily" && <p className="game-target">Everyone gets the same run today · {dailyKey()}</p>}
          {best > 0 && <p className="game-target">Your best: {best} pts</p>}
          {target ? <p className="game-target">Beat {target} to win the challenge</p> : null}
          <button className="cta wide" onClick={startGame}>Kick off</button>
        </div>
      )}
      {phase === "over" && (
        <div className="game-overlay">
          <span className="game-emoji">{target && score > target ? "🏆" : score >= readBest() && score > 0 ? "🥇" : "⚽️"}</span>
          <h3>{score} pts</h3>
          <p>{target ? (score > target ? `You beat ${target}!` : `${target} to beat`) : rating(score)}</p>
          {best > 0 && <p className="game-target">Best {best}{mode === "daily" ? " · daily" : ""}</p>}
          <button className="cta wide" onClick={startGame}>Again</button>
        </div>
      )}
    </div>
  );
}
