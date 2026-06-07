import { useEffect, useRef, useState } from "react";
import { tap as hapticTap, confirmBuzz, celebrate } from "../../lib/haptics";
import { drawStadium, drawBall, drawBallShadow, drawKeeper, Trail, Particles, Shake } from "../../lib/stadium";
import { Keeper, keeperConfig, saved as keeperSaved, rampedDifficulty } from "../../lib/keeper";

const SHOTS = 8;

// One dry line per outcome — the commentary box never says the same thing twice.
const QUIPS = {
  bins: ["Top bins. Get in.", "Postage stamp.", "Keeper had no chance."],
  goal: ["That's a goal.", "Tucked away.", "Scrappy, but it counts."],
  saved: ["Keeper didn't move.", "Right at him.", "Have a word."],
  miss: ["Row Z.", "Post.", "Section behind the goal got that one."],
} as const;
function quipFor(kind: keyof typeof QUIPS): string {
  const opts = QUIPS[kind];
  return opts[Math.floor(Math.random() * opts.length)];
}

/**
 * Top Bins — swipe the ball to shoot. A keeper patrols then DIVES; aim for the top
 * corners ("top bins") for 3, anywhere else for 1. Net ripples on a goal. 8 shots.
 */
export function TopBins({ onGameOver, target, difficulty = 0.35 }: { onGameOver: (score: number) => void; target?: number; difficulty?: number }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [score, setScore] = useState(0);
  const [shots, setShots] = useState(SHOTS);
  const [phase, setPhase] = useState<"ready" | "play" | "over">("ready");
  const [flash, setFlash] = useState("");
  const [quip, setQuip] = useState("");
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

    const goalY = () => H * 0.2;
    const goalL = () => W * 0.16;
    const goalR = () => W * 0.84;
    const barH = () => H * 0.16;
    const keeper = new Keeper(goalL(), goalR(), keeperConfig(difficulty));
    const spot = () => ({ x: W / 2, y: H * 0.86 });
    let ball = { ...spot(), vx: 0, vy: 0, flying: false, r: Math.min(W, H) * 0.048 };
    let spin = 0;
    let drag: { x: number; y: number } | null = null;
    let aim: { x: number; y: number } | null = null;
    let netBulge: { x: number; t: number } | null = null;
    const trail = new Trail(9);
    const particles = new Particles();
    const shake = new Shake();
    const start = performance.now();
    let raf = 0;

    function resetBall() {
      ball = { ...spot(), vx: 0, vy: 0, flying: false, r: Math.min(W, H) * 0.048 };
      spin = 0; keeper.reset(); trail.clear();
    }
    function shoot(dx: number, dy: number) {
      if (ball.flying || dy > -10) return;
      // a touch more pace off the boot, with a floor so a soft flick still travels
      const pw = 0.19;
      const mag = Math.hypot(dx, dy);
      const boost = mag < H * 0.3 ? (H * 0.3) / Math.max(1, mag) : 1;
      ball.vx = dx * pw * boost; ball.vy = dy * pw * boost; ball.flying = true;
      hapticTap();
      shotsRef.current -= 1;
      setShots(shotsRef.current);
      // Keeper commits a dive toward where the ball will cross — with error so it's beatable.
      const tToGoal = Math.max(1, (ball.y - goalY()) / Math.max(1, -ball.vy));
      const cross = ball.x + ball.vx * tToGoal;
      keeper.cfg = keeperConfig(rampedDifficulty(difficulty, scoreRef.current));
      keeper.commit(cross);
    }
    function onDown(e: PointerEvent) {
      const r = canvas.getBoundingClientRect();
      drag = { x: e.clientX - r.left, y: e.clientY - r.top }; aim = drag;
    }
    function onMove(e: PointerEvent) {
      if (!drag) return;
      const r = canvas.getBoundingClientRect();
      aim = { x: e.clientX - r.left, y: e.clientY - r.top };
    }
    function onUp() {
      if (drag && aim) shoot(aim.x - spot().x, aim.y - spot().y);
      drag = null; aim = null;
    }
    canvas.addEventListener("pointerdown", onDown);
    canvas.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);

    function judge() {
      const gl = goalL(), gr = goalR();
      const inGoal = ball.x > gl && ball.x < gr;
      const isSaved = keeperSaved(ball.x, keeper.x, keeper.reachPx(), ball.r);
      if (!inGoal || isSaved) {
        setFlash(isSaved ? "SAVED!" : "MISS");
        setQuip(quipFor(isSaved ? "saved" : "miss"));
        shake.kick(isSaved ? 6 : 2);
        confirmBuzz();
      } else {
        const corner = ball.x < gl + (gr - gl) * 0.2 || ball.x > gr - (gr - gl) * 0.2;
        const pts = corner ? 3 : 1;
        scoreRef.current += pts; setScore(scoreRef.current);
        setFlash(corner ? "TOP BINS! +3" : "GOAL +1");
        setQuip(quipFor(corner ? "bins" : "goal"));
        netBulge = { x: ball.x, t: 0 };
        particles.emit(ball.x, ball.y, "spark", corner ? 26 : 16);
        shake.kick(corner ? 12 : 7);
        celebrate();
      }
      setTimeout(() => { setFlash(""); setQuip(""); }, 1100);
      if (shotsRef.current <= 0) setTimeout(() => { setPhase("over"); onGameOver(scoreRef.current); }, 900);
      else resetBall();
    }

    function frame(now: number) {
      keeper.setBounds(goalL(), goalR());
      keeper.update(2.2);

      if (ball.flying) {
        ball.vy += 0.12; ball.x += ball.vx; ball.y += ball.vy;
        spin += ball.vx * 0.05 + 0.18;
        trail.push(ball.x, ball.y);
        if (ball.y <= goalY() + ball.r) judge();
        else if (ball.y > H + ball.r * 2 || ball.x < -50 || ball.x > W + 50) {
          setFlash("MISS"); setTimeout(() => setFlash(""), 700);
          if (shotsRef.current <= 0) setTimeout(() => { setPhase("over"); onGameOver(scoreRef.current); }, 400);
          else resetBall();
        }
      }

      const [sx, sy] = shake.offset();
      ctx.save();
      ctx.translate(sx, sy);
      drawStadium(ctx, W, H, now - start, { pitchTop: 0.5 });

      const gl = goalL(), gr = goalR(), gy = goalY(), bh = barH();
      // net (with bulge if scoring)
      ctx.strokeStyle = "rgba(255,255,255,0.16)"; ctx.lineWidth = 1;
      const bulge = netBulge ? Math.max(0, 1 - netBulge.t / 22) : 0;
      for (let x = gl; x <= gr; x += (gr - gl) / 14) {
        const push = netBulge ? bulge * 14 * Math.exp(-((x - netBulge.x) ** 2) / (2 * (W * 0.06) ** 2)) : 0;
        ctx.beginPath(); ctx.moveTo(x, gy); ctx.lineTo(x, gy + bh + push); ctx.stroke();
      }
      for (let y = gy; y <= gy + bh; y += bh / 5) {
        ctx.beginPath(); ctx.moveTo(gl, y); ctx.lineTo(gr, y); ctx.stroke();
      }
      if (netBulge) { netBulge.t++; if (netBulge.t > 22) netBulge = null; }
      // posts + bar
      ctx.strokeStyle = "#ffffff"; ctx.lineWidth = 5; ctx.lineCap = "round";
      ctx.beginPath(); ctx.moveTo(gl, gy + bh); ctx.lineTo(gl, gy); ctx.lineTo(gr, gy); ctx.lineTo(gr, gy + bh); ctx.stroke();
      // keeper — a real diving figure, gloves at the edge of the save zone
      drawKeeper(ctx, keeper.x, gy + bh * 0.62, keeper.reachPx(), keeper.lean, bh, keeper.dive);
      // aim guide (dotted trajectory) — matches the real shot power
      if (aim && !ball.flying) {
        const s = spot();
        const dx = aim.x - s.x, dy = aim.y - s.y, mag = Math.hypot(dx, dy);
        const boost = mag < H * 0.3 ? (H * 0.3) / Math.max(1, mag) : 1;
        let vx = dx * 0.19 * boost, vy = dy * 0.19 * boost, px = s.x, py = s.y;
        for (let i = 0; i < 16 && py > gy - 10; i++) {
          px += vx; py += vy; vy += 0.12;
          ctx.fillStyle = `rgba(184,255,78,${0.5 - i * 0.022})`;
          ctx.beginPath(); ctx.arc(px, py, 3 - i * 0.08, 0, Math.PI * 2); ctx.fill();
        }
      }
      // ball — shrinks into the distance (perspective) and spins on its flight
      if (ball.flying) trail.draw(ctx, ball.r);
      drawBallShadow(ctx, ball.x, H - 8, ball.r, ball.flying ? 0.6 : 0.1);
      const persp = 0.6 + 0.4 * Math.max(0, Math.min(1, (ball.y - gy) / (spot().y - gy)));
      drawBall(ctx, ball.x, ball.y, ball.r * persp, ball.flying ? spin : now / 400);
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
  }, [phase, onGameOver]);

  function startGame() {
    scoreRef.current = 0; shotsRef.current = SHOTS;
    setScore(0); setShots(SHOTS); setFlash(""); setQuip(""); setPhase("play");
  }

  return (
    <div className="game-stage topbins-stage">
      <div className="game-hud">
        <span className="game-score">{score}</span><span className="game-unit">goals</span>
        <span className="game-shots">{"●".repeat(shots)}{"○".repeat(SHOTS - shots)}</span>
      </div>
      <canvas ref={canvasRef} className="game-canvas" />
      {flash && <div className={`game-flash${flash.includes("BINS") ? " bins" : flash.includes("GOAL") ? " goal" : " miss"}`}>{flash}</div>}
      {quip && <div className="tb-quip">{quip}</div>}
      {phase === "ready" && (
        <div className="game-overlay">
          <span className="game-emoji">🥅</span>
          <h3>Top Bins</h3>
          <p>Swipe the ball to shoot. Beat the keeper — top corners are worth 3. {SHOTS} shots.</p>
          {target ? <p className="game-target">Beat {target} to win the challenge</p> : null}
          <button className="cta wide" onClick={startGame}>Kick off</button>
        </div>
      )}
      {phase === "over" && (
        <div className="game-overlay">
          <span className="game-emoji">{target && score > target ? "🏆" : "⚽️"}</span>
          <h3>{score} goals</h3>
          <p>{target ? (score > target ? `You beat ${target}!` : `${target} to beat`) : score >= 12 ? "Worldie." : "Have another go."}</p>
          <button className="cta wide" onClick={startGame}>Again</button>
        </div>
      )}
    </div>
  );
}
