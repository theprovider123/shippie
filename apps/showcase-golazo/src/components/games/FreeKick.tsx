import { useEffect, useRef, useState } from "react";
import { tap as hapticTap, confirmBuzz, celebrate } from "../../lib/haptics";
import { drawStadium, drawBall, drawBallShadow, drawKeeper, Trail, Particles, Shake } from "../../lib/stadium";
import { Keeper, keeperConfig, saved, rampedDifficulty } from "../../lib/keeper";

const SHOTS = 8;

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

    const goalY = () => H * 0.16;
    const goalL = () => W * 0.2;
    const goalR = () => W * 0.8;
    const barH = () => H * 0.14;
    const wallY = () => H * 0.5;
    const spot = () => ({ x: W / 2, y: H * 0.88 });
    let ball = { ...spot(), vx: 0, vy: 0, curl: 0, flying: false, r: Math.min(W, H) * 0.045 };
    const keeper = new Keeper(goalL(), goalR(), keeperConfig(difficulty));
    let wallX = W / 2;
    let drag: { x: number; y: number } | null = null;
    let path: { x: number; y: number }[] = [];
    let aim: { x: number; y: number } | null = null;
    let resolved = false;
    const trail = new Trail(14);
    const particles = new Particles();
    const shake = new Shake();
    const startT = performance.now();
    let raf = 0;

    function placeWall() { wallX = W * (0.34 + Math.random() * 0.32); }
    placeWall();

    // Curl from the bend of the swipe: perpendicular offset of the path midpoint
    // from the straight start→end line. A banana swipe → strong curl.
    function curlFromPath(pts: { x: number; y: number }[]): number {
      if (pts.length < 3) return 0;
      const a = pts[0], b = pts[pts.length - 1], m = pts[Math.floor(pts.length / 2)];
      const len = Math.hypot(b.x - a.x, b.y - a.y) || 1;
      // signed perpendicular distance of m from line a→b — even a gentle arc bends it
      const cross = ((b.x - a.x) * (a.y - m.y) - (b.y - a.y) * (a.x - m.x)) / len;
      return clamp(-cross * 0.05, -1.4, 1.4);
    }
    function clamp(n: number, lo: number, hi: number) { return n < lo ? lo : n > hi ? hi : n; }

    function shoot(dx: number, dy: number, curl: number) {
      if (ball.flying || dy > -10) return;
      ball.vx = dx * 0.14; ball.vy = dy * 0.16; ball.curl = curl; ball.flying = true;
      resolved = false; trail.clear();
      hapticTap();
      shotsRef.current -= 1; setShots(shotsRef.current);
      keeper.cfg = keeperConfig(rampedDifficulty(difficulty, scoreRef.current));
      // The keeper reads the ball's LAUNCH line, not the curve — so a banana bends
      // away from their dive. They guess where a straight shot would cross.
      let px = spot().x, vx = ball.vx, vy = ball.vy, py = spot().y;
      for (let i = 0; i < 60 && py > goalY(); i++) { vy += 0.11; px += vx; py += vy; }
      keeper.commit(px);
    }
    function onDown(e: PointerEvent) { const r = canvas.getBoundingClientRect(); drag = { x: e.clientX - r.left, y: e.clientY - r.top }; path = [drag]; aim = drag; }
    function onMove(e: PointerEvent) { if (!drag) return; const r = canvas.getBoundingClientRect(); aim = { x: e.clientX - r.left, y: e.clientY - r.top }; path.push(aim); }
    function onUp() {
      if (drag && aim) { const s = spot(); shoot(aim.x - s.x, aim.y - s.y, curlFromPath(path)); }
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
        particles.emit(ball.x, ball.y, "spark", pts >= 2 ? 24 : 16);
        shake.kick(pts >= 2 ? 12 : 7); celebrate();
      } else { shake.kick(4); confirmBuzz(); }
      setTimeout(() => setFlash(""), 850);
      if (shotsRef.current <= 0) setTimeout(() => { setPhase("over"); onGameOver(scoreRef.current); }, 850);
      else setTimeout(() => { ball = { ...spot(), vx: 0, vy: 0, curl: 0, flying: false, r: ball.r }; placeWall(); keeper.reset(); trail.clear(); }, 800);
    }

    function frame(now: number) {
      keeper.setBounds(goalL(), goalR());
      keeper.update(2);

      if (ball.flying && !resolved) {
        // Banana: strong lateral kick that eases as the ball loses spin.
        ball.vy += 0.11; ball.vx += ball.curl; ball.curl *= 0.95; ball.x += ball.vx; ball.y += ball.vy;
        trail.push(ball.x, ball.y);
        if (Math.abs(ball.y - wallY()) < 6 && Math.abs(ball.x - wallX) < W * 0.12) endShot("WALL!", 0);
        else if (ball.y <= goalY() + ball.r) {
          const gl = goalL(), gr = goalR();
          const onTarget = ball.x > gl + ball.r && ball.x < gr - ball.r;
          const isSaved = saved(ball.x, keeper.x, keeper.reachPx(), ball.r);
          if (!onTarget) endShot("OVER", 0);
          else if (isSaved) endShot("SAVED!", 0);
          else { const corner = ball.x < gl + (gr - gl) * 0.18 || ball.x > gr - (gr - gl) * 0.18; endShot(corner ? "TOP BINS! +2" : "GOAL +1", corner ? 2 : 1); }
        } else if (ball.y < -40 || ball.x < -60 || ball.x > W + 60) endShot("OVER", 0);
      }

      const [sx, sy] = shake.offset();
      ctx.save();
      ctx.translate(sx, sy);
      drawStadium(ctx, W, H, now - startT, { pitchTop: 0.42 });
      const gl = goalL(), gr = goalR(), gy = goalY(), bh = barH();
      ctx.strokeStyle = "rgba(255,255,255,0.16)"; ctx.lineWidth = 1;
      for (let x = gl; x <= gr; x += (gr - gl) / 14) { ctx.beginPath(); ctx.moveTo(x, gy); ctx.lineTo(x, gy + bh); ctx.stroke(); }
      for (let y = gy; y <= gy + bh; y += bh / 4) { ctx.beginPath(); ctx.moveTo(gl, y); ctx.lineTo(gr, y); ctx.stroke(); }
      ctx.strokeStyle = "#ffffff"; ctx.lineWidth = 5; ctx.lineCap = "round";
      ctx.beginPath(); ctx.moveTo(gl, gy + bh); ctx.lineTo(gl, gy); ctx.lineTo(gr, gy); ctx.lineTo(gr, gy + bh); ctx.stroke();
      // keeper — a real diving figure, gloves at the edge of the save zone
      drawKeeper(ctx, keeper.x, gy + bh * 0.6, keeper.reachPx(), keeper.lean, bh, keeper.dive);
      // wall
      const players = 4, ww = W * 0.05;
      for (let i = 0; i < players; i++) {
        const x = wallX - (players - 1) * ww * 0.6 + i * ww * 1.2;
        ctx.fillStyle = "#243a4a"; ctx.beginPath(); ctx.ellipse(x, wallY(), ww * 0.45, H * 0.05, 0, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = "#1a2a36"; ctx.beginPath(); ctx.arc(x, wallY() - H * 0.05, ww * 0.3, 0, Math.PI * 2); ctx.fill();
      }
      // aim guide with curl
      if (aim && drag) {
        const s = spot(); let cc = curlFromPath(path);
        let vx = (aim.x - s.x) * 0.14, vy = (aim.y - s.y) * 0.16, px = s.x, py = s.y;
        ctx.fillStyle = "rgba(184,255,78,0.55)";
        for (let i = 0; i < 26 && py > goalY() - 20; i++) { vy += 0.11; vx += cc; cc *= 0.95; px += vx; py += vy; ctx.beginPath(); ctx.arc(px, py, 2.4, 0, Math.PI * 2); ctx.fill(); }
      }
      if (ball.flying) trail.draw(ctx, ball.r);
      drawBallShadow(ctx, ball.x, H - 8, ball.r, ball.flying ? 0.6 : 0.1);
      drawBall(ctx, ball.x, ball.y, ball.r, now / 100);
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
          <p>Swipe in a <strong>curve</strong> to bend it round the wall and past the keeper. Top corners worth 2. {SHOTS} kicks.</p>
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
