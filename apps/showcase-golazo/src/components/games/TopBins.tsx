import { useEffect, useRef, useState } from "react";
import { tap as hapticTap, confirmBuzz, celebrate } from "../../lib/haptics";

const SHOTS = 8;

/**
 * Top Bins — swipe the ball to shoot. A keeper patrols the line; aim for the top
 * corners ("top bins") for 3, anywhere else in the goal for 1. Eight shots.
 * Pure canvas + rAF, offline. Score = weighted goals.
 */
export function TopBins({ onGameOver, target }: { onGameOver: (score: number) => void; target?: number }) {
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

    const goalY = () => H * 0.2;
    const goalL = () => W * 0.16;
    const goalR = () => W * 0.84;
    const keeper = { x: W / 2, w: () => (goalR() - goalL()) * 0.26, dir: 1, speed: 2.4 };
    const spot = () => ({ x: W / 2, y: H * 0.86 });
    let ball = { ...spot(), vx: 0, vy: 0, flying: false, r: Math.min(W, H) * 0.05 };
    let drag: { x: number; y: number } | null = null;
    let aim: { x: number; y: number } | null = null;
    let raf = 0;

    function resetBall() { ball = { ...spot(), vx: 0, vy: 0, flying: false, r: Math.min(W, H) * 0.05 }; }

    function shoot(dx: number, dy: number) {
      if (ball.flying || dy > -10) return; // must swipe upward
      ball.vx = dx * 0.16;
      ball.vy = dy * 0.16;
      ball.flying = true;
      hapticTap();
      shotsRef.current -= 1;
      setShots(shotsRef.current);
    }
    function onDown(e: PointerEvent) {
      const r = canvas.getBoundingClientRect();
      drag = { x: e.clientX - r.left, y: e.clientY - r.top };
      aim = drag;
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
      const kx = keeper.x, kw = keeper.w();
      const saved = ball.x > kx - kw / 2 && ball.x < kx + kw / 2;
      if (!inGoal || saved) {
        setFlash(saved ? "SAVED!" : "MISS");
        confirmBuzz();
      } else {
        const corner = ball.x < gl + (gr - gl) * 0.2 || ball.x > gr - (gr - gl) * 0.2;
        const pts = corner ? 3 : 1;
        scoreRef.current += pts;
        setScore(scoreRef.current);
        setFlash(corner ? "TOP BINS! +3" : "GOAL +1");
        celebrate();
      }
      setTimeout(() => setFlash(""), 900);
      if (shotsRef.current <= 0) { setTimeout(end, 900); }
      else resetBall();
    }
    function end() { setPhase("over"); onGameOver(scoreRef.current); }

    function frame() {
      // keeper patrol
      keeper.x += keeper.dir * keeper.speed;
      if (keeper.x < goalL() + keeper.w() / 2) keeper.dir = 1;
      if (keeper.x > goalR() - keeper.w() / 2) keeper.dir = -1;

      if (ball.flying) {
        ball.vy += 0.12; ball.x += ball.vx; ball.y += ball.vy;
        if (ball.y <= goalY() + ball.r) { judge(); }
        else if (ball.y > H + ball.r * 2 || ball.x < -50 || ball.x > W + 50) {
          setFlash("MISS"); setTimeout(() => setFlash(""), 700);
          if (shotsRef.current <= 0) setTimeout(end, 400); else resetBall();
        }
      }

      ctx.clearRect(0, 0, W, H);
      const gl = goalL(), gr = goalR(), gy = goalY();
      // net
      ctx.strokeStyle = "rgba(255,255,255,0.16)"; ctx.lineWidth = 1;
      for (let x = gl; x <= gr; x += (gr - gl) / 12) { ctx.beginPath(); ctx.moveTo(x, gy); ctx.lineTo(x, gy + H * 0.16); ctx.stroke(); }
      for (let y = gy; y <= gy + H * 0.16; y += H * 0.16 / 4) { ctx.beginPath(); ctx.moveTo(gl, y); ctx.lineTo(gr, y); ctx.stroke(); }
      // posts + bar
      ctx.strokeStyle = "#ffffff"; ctx.lineWidth = 5; ctx.lineCap = "round";
      ctx.beginPath(); ctx.moveTo(gl, gy + H * 0.16); ctx.lineTo(gl, gy); ctx.lineTo(gr, gy); ctx.lineTo(gr, gy + H * 0.16); ctx.stroke();
      // keeper
      ctx.fillStyle = "#16f08b";
      const kw = keeper.w();
      ctx.fillRect(keeper.x - kw / 2, gy + 4, kw, H * 0.07);
      // aim guide
      if (aim) {
        const s = spot();
        ctx.strokeStyle = "rgba(22,240,139,0.6)"; ctx.setLineDash([6, 6]); ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(s.x, s.y); ctx.lineTo(aim.x, aim.y); ctx.stroke(); ctx.setLineDash([]);
      }
      // ball
      const g = ctx.createRadialGradient(ball.x - ball.r * 0.3, ball.y - ball.r * 0.3, ball.r * 0.2, ball.x, ball.y, ball.r);
      g.addColorStop(0, "#ffffff"); g.addColorStop(1, "#c9d2dc");
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(ball.x, ball.y, ball.r, 0, Math.PI * 2); ctx.fill();

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

  function start() {
    scoreRef.current = 0; shotsRef.current = SHOTS;
    setScore(0); setShots(SHOTS); setFlash(""); setPhase("play");
  }

  return (
    <div className="game-stage topbins-stage">
      <div className="game-hud">
        <span className="game-score">{score}</span><span className="game-unit">goals</span>
        <span className="game-shots">{"●".repeat(shots)}{"○".repeat(SHOTS - shots)}</span>
      </div>
      <canvas ref={canvasRef} className="game-canvas" />
      {flash && <div className={`game-flash${flash.includes("BINS") ? " bins" : flash.includes("GOAL") ? " goal" : " miss"}`}>{flash}</div>}
      {phase === "ready" && (
        <div className="game-overlay">
          <span className="game-emoji">🥅</span>
          <h3>Top Bins</h3>
          <p>Swipe the ball to shoot. Beat the keeper — top corners are worth 3. {SHOTS} shots.</p>
          {target ? <p className="game-target">Beat {target} to win the challenge</p> : null}
          <button className="cta wide" onClick={start}>Kick off</button>
        </div>
      )}
      {phase === "over" && (
        <div className="game-overlay">
          <span className="game-emoji">{target && score > target ? "🏆" : "⚽️"}</span>
          <h3>{score} goals</h3>
          <p>{target ? (score > target ? `You beat ${target}!` : `${target} to beat`) : score >= 12 ? "Worldie." : "Have another go."}</p>
          <button className="cta wide" onClick={start}>Again</button>
        </div>
      )}
    </div>
  );
}
