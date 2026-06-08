import { useEffect, useRef, useState } from "react";
import { tap as hapticTap, confirmBuzz, celebrate } from "../../lib/haptics";
import { drawStadium, drawBall, drawBallShadow, drawKeeper, Trail, Particles, Shake } from "../../lib/stadium";
import { Keeper, keeperConfig, saved2d, rampedDifficulty } from "../../lib/keeper";

const SHOTS = 8;

type Pt = { x: number; y: number };
type Ball = {
  x: number;
  depthY: number;
  height: number;
  vx: number;
  vDepth: number;
  vz: number;
  curl: number;
  spin: number;
  flying: boolean;
  r: number;
};

/**
 * Free Kick — bend it round the wall. Curl comes from the *arc* you trace: a banana
 * swipe makes the ball bend in flight, so you can wrap it round the wall and past a
 * diving keeper. Keeper sharpens as you score. Top corners worth 2. 8 attempts.
 */
export function FreeKick({ onGameOver, target, difficulty = 0.35 }: { onGameOver: (score: number) => void; target?: number; difficulty?: number }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [score, setScore] = useState(0);
  const [shots, setShots] = useState(SHOTS);
  const [phase, setPhase] = useState<"ready" | "play" | "over">("ready");
  const [flash, setFlash] = useState("");
  const scoreRef = useRef(0);
  const shotsRef = useRef(SHOTS);

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

    const goalY = () => H * 0.15;
    const goalL = () => W * 0.18;
    const goalR = () => W * 0.82;
    const barH = () => H * 0.18;
    const goalBottom = () => goalY() + barH();
    const wallY = () => H * 0.55;
    const spot = () => ({ x: W / 2, y: H * 0.9 });
    const clamp = (n: number, lo: number, hi: number) => (n < lo ? lo : n > hi ? hi : n);
    const freshBall = (): Ball => ({ ...spot(), depthY: spot().y, height: 0, vx: 0, vDepth: 0, vz: 0, curl: 0, spin: 0, flying: false, r: Math.min(W, H) * 0.045 });
    const screenY = (b = ball) => b.depthY - b.height;

    let ball = freshBall();
    const keeper = new Keeper(goalL(), goalR(), keeperConfig(difficulty));
    let wallX = W / 2;
    let drag: Pt | null = null;
    let path: Pt[] = [];
    let aim: Pt | null = null;
    let resolved = false;
    let crossedWall = false;
    const trail = new Trail(16);
    const particles = new Particles();
    const shake = new Shake();
    const startT = performance.now();
    let raf = 0;

    function placeWall() { wallX = W * (0.32 + Math.random() * 0.36); }
    placeWall();

    function curlFromPath(pts: Pt[]): number {
      if (pts.length < 3) return 0;
      const a = pts[0], b = pts[pts.length - 1], m = pts[Math.floor(pts.length / 2)];
      const len = Math.hypot(b.x - a.x, b.y - a.y) || 1;
      const cross = ((b.x - a.x) * (a.y - m.y) - (b.y - a.y) * (a.x - m.x)) / len;
      return clamp(-cross / (W * 0.12), -1, 1);
    }

    function buildLaunch(pts: Pt[]) {
      const end = pts[pts.length - 1] ?? spot();
      const s = spot();
      const dx = end.x - s.x;
      const dy = end.y - s.y;
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
      };
    }

    function stepBall(b: Ball) {
      b.vz -= 0.36;
      b.vx += b.curl;
      b.curl *= 0.94;
      b.x += b.vx;
      b.depthY += b.vDepth;
      b.height += b.vz;
      b.spin += b.vx * 0.03 + b.curl * 0.5;
      if (b.height < 0) {
        b.height = 0;
        b.vz *= -0.16;
        b.vDepth *= 0.97;
        b.vx *= 0.985;
      }
    }

    function predictKeeperCross(launch: NonNullable<ReturnType<typeof buildLaunch>>) {
      const b = { ...freshBall(), ...launch, flying: true };
      for (let i = 0; i < 90 && b.depthY > goalBottom(); i++) {
        // Keepers read the early strike and body shape, not the full late swerve.
        b.vx += b.curl * 0.35;
        b.curl *= 0.9;
        b.vz -= 0.36;
        b.x += b.vx;
        b.depthY += b.vDepth;
        b.height = Math.max(0, b.height + b.vz);
      }
      return { x: b.x, y: screenY(b) };
    }

    function shoot(pts: Pt[]) {
      if (ball.flying) return;
      const launch = buildLaunch(pts);
      if (!launch) return;
      Object.assign(ball, launch, { flying: true, height: 0 });
      resolved = false;
      crossedWall = false;
      trail.clear();
      hapticTap();
      shotsRef.current -= 1; setShots(shotsRef.current);
      keeper.cfg = keeperConfig(rampedDifficulty(difficulty, scoreRef.current));
      keeper.commit(predictKeeperCross(launch).x);
    }

    function onDown(e: PointerEvent) {
      if (ball.flying) return;
      const r = canvas.getBoundingClientRect();
      drag = { x: e.clientX - r.left, y: e.clientY - r.top };
      path = [drag];
      aim = drag;
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

    function endShot(msg: string, pts: number) {
      resolved = true;
      setFlash(msg);
      if (pts > 0) {
        scoreRef.current += pts; setScore(scoreRef.current);
        particles.emit(ball.x, screenY(), "spark", pts >= 2 ? 26 : 16);
        shake.kick(pts >= 2 ? 12 : 7); celebrate();
      } else { shake.kick(msg === "SAVED!" ? 8 : 4); confirmBuzz(); }
      setTimeout(() => setFlash(""), 850);
      if (shotsRef.current <= 0) setTimeout(() => { setPhase("over"); onGameOver(scoreRef.current); }, 850);
      else setTimeout(() => { ball = freshBall(); placeWall(); keeper.reset(); trail.clear(); }, 820);
    }

    function judgeAtGoal() {
      const gl = goalL(), gr = goalR(), gy = goalY(), gb = goalBottom(), bh = barH();
      const y = screenY();
      const inX = ball.x > gl + ball.r && ball.x < gr - ball.r;
      const inY = y > gy + ball.r * 0.35 && y < gb - ball.r * 0.3;
      const keeperY = gy + bh * 0.58 - keeper.dive * bh * 0.08;
      const reachY = bh * (0.35 + difficulty * 0.16) + keeper.dive * bh * 0.08;
      const isSaved = inX && inY && saved2d(ball.x, y, keeper.x, keeperY, keeper.reachPx(), reachY, ball.r);
      if (!inX) endShot("WIDE", 0);
      else if (!inY) endShot(y <= gy ? "OVER" : "LOW", 0);
      else if (isSaved) endShot("SAVED!", 0);
      else {
        const side = ball.x < gl + (gr - gl) * 0.2 || ball.x > gr - (gr - gl) * 0.2;
        const high = y < gy + bh * 0.36;
        const pts = side && high ? 2 : 1;
        endShot(pts === 2 ? "TOP BINS! +2" : "GOAL +1", pts);
      }
    }

    function maybeWallBlock() {
      if (crossedWall || ball.depthY > wallY()) return;
      crossedWall = true;
      const y = screenY();
      const wallTop = wallY() - H * 0.105;
      const wallBottom = wallY() + H * 0.045;
      const wallWidth = W * 0.2;
      if (Math.abs(ball.x - wallX) < wallWidth * 0.5 && y > wallTop && y < wallBottom) {
        endShot("WALL!", 0);
      }
    }

    function drawGoalFrame() {
      const gl = goalL(), gr = goalR(), gy = goalY(), bh = barH();
      ctx.strokeStyle = "rgba(255,255,255,0.16)"; ctx.lineWidth = 1;
      for (let x = gl; x <= gr; x += (gr - gl) / 14) { ctx.beginPath(); ctx.moveTo(x, gy); ctx.lineTo(x, gy + bh); ctx.stroke(); }
      for (let y = gy; y <= gy + bh; y += bh / 5) { ctx.beginPath(); ctx.moveTo(gl, y); ctx.lineTo(gr, y); ctx.stroke(); }
      ctx.strokeStyle = "#ffffff"; ctx.lineWidth = 5; ctx.lineCap = "round";
      ctx.beginPath(); ctx.moveTo(gl, gy + bh); ctx.lineTo(gl, gy); ctx.lineTo(gr, gy); ctx.lineTo(gr, gy + bh); ctx.stroke();
    }

    function drawWall() {
      const players = 4, ww = W * 0.052;
      for (let i = 0; i < players; i++) {
        const x = wallX - (players - 1) * ww * 0.58 + i * ww * 1.16;
        ctx.fillStyle = "#243a4a"; ctx.beginPath(); ctx.ellipse(x, wallY(), ww * 0.45, H * 0.052, 0, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = "#1a2a36"; ctx.beginPath(); ctx.arc(x, wallY() - H * 0.055, ww * 0.3, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = "rgba(255,255,255,0.18)"; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(x - ww * 0.25, wallY() - H * 0.01); ctx.lineTo(x + ww * 0.25, wallY() - H * 0.01); ctx.stroke();
      }
    }

    function drawAimGuide() {
      if (!aim || !drag || ball.flying) return;
      const launch = buildLaunch(path.length > 1 ? path : [drag, aim]);
      if (!launch) return;
      const b = { ...freshBall(), ...launch, flying: true };
      ctx.fillStyle = "rgba(184,255,78,0.58)";
      for (let i = 0; i < 34 && b.depthY > goalY() - 20; i++) {
        stepBall(b);
        const fade = 0.58 - i * 0.014;
        ctx.fillStyle = `rgba(184,255,78,${Math.max(0.1, fade)})`;
        ctx.beginPath(); ctx.arc(b.x, screenY(b), 2.8 - i * 0.035, 0, Math.PI * 2); ctx.fill();
      }
    }

    function frame(now: number) {
      keeper.setBounds(goalL(), goalR());
      keeper.update(2);

      if (ball.flying && !resolved) {
        stepBall(ball);
        trail.push(ball.x, screenY());
        maybeWallBlock();
        if (!resolved && ball.depthY <= goalBottom()) judgeAtGoal();
        else if (!resolved && (ball.x < -80 || ball.x > W + 80 || ball.depthY < goalY() - H * 0.08)) endShot("WIDE", 0);
      }

      const [sx, sy] = shake.offset();
      ctx.save();
      ctx.translate(sx, sy);
      drawStadium(ctx, W, H, now - startT, { pitchTop: 0.42 });
      drawGoalFrame();
      const gy = goalY(), bh = barH();
      drawKeeper(ctx, keeper.x, gy + bh * 0.6, keeper.reachPx(), keeper.lean, bh, keeper.dive);
      drawWall();
      drawAimGuide();
      if (ball.flying) trail.draw(ctx, ball.r);
      const y = screenY();
      const heightFrac = clamp(ball.height / (H * 0.28), 0, 1);
      const perspective = 0.58 + 0.42 * clamp((ball.depthY - goalY()) / (spot().y - goalY()), 0, 1);
      drawBallShadow(ctx, ball.x, ball.depthY + H * 0.018, ball.r, heightFrac);
      drawBall(ctx, ball.x, y, ball.r * perspective, ball.flying ? ball.spin : now / 100);
      particles.update(); particles.draw(ctx);
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
  }, [phase, onGameOver, difficulty]);

  function startGame() { scoreRef.current = 0; shotsRef.current = SHOTS; setScore(0); setShots(SHOTS); setFlash(""); setPhase("play"); }

  return (
    <div className="game-stage freekick-stage">
      <div className="game-hud">
        <span className="game-score">{score}</span><span className="game-unit">goals</span>
        <span className="game-shots">{"●".repeat(shots)}{"○".repeat(SHOTS - shots)}</span>
      </div>
      <canvas ref={canvasRef} className="game-canvas" />
      {flash && <div className={`game-flash${flash.includes("BINS") ? " bins" : flash.includes("GOAL") ? " goal" : " miss"}`}>{flash}</div>}
      {phase === "ready" && (
        <div className="game-overlay">
          <span className="game-emoji">🧱</span>
          <h3>Free Kick</h3>
          <p>Swipe in a <strong>curve</strong> to bend it round the wall and past the keeper. Lift and pace now matter. Top corners worth 2. {SHOTS} kicks.</p>
          {target ? <p className="game-target">Beat {target} to win the challenge</p> : null}
          <button className="cta wide" onClick={startGame}>Kick off</button>
        </div>
      )}
      {phase === "over" && (
        <div className="game-overlay">
          <span className="game-emoji">{target && score > target ? "🏆" : "⚽️"}</span>
          <h3>{score} goals</h3>
          <p>{target ? (score > target ? `You beat ${target}!` : `${target} to beat`) : score >= 10 ? "Roberto Carlos." : "Bend it more."}</p>
          <button className="cta wide" onClick={startGame}>Again</button>
        </div>
      )}
    </div>
  );
}
