import { useEffect, useRef, useState } from "react";
import { tap as hapticTap, confirmBuzz } from "../../lib/haptics";

/**
 * Keepy Uppy — tap the ball to keep it in the air. Gravity pulls it down and it
 * drifts + speeds up the longer you last; miss a tap and it hits the deck.
 * Pure canvas + rAF, offline. Score = clean touches.
 */
export function KeepyUppy({ onGameOver, target }: { onGameOver: (score: number) => void; target?: number }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [score, setScore] = useState(0);
  const [phase, setPhase] = useState<"ready" | "play" | "over">("ready");
  const scoreRef = useRef(0);

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

    const ball = { x: W / 2, y: H * 0.45, vx: (Math.random() - 0.5) * 2, vy: 0, r: Math.min(W, H) * 0.075 };
    let gravity = 0.32;
    let alive = true;
    let raf = 0;
    let spin = 0;

    function kick(px: number, py: number) {
      const dx = px - ball.x, dy = py - ball.y;
      if (Math.hypot(dx, dy) > ball.r * 2.1) return; // must hit the ball
      ball.vy = -Math.min(11, 8.4 + gravity * 4);
      ball.vx += (ball.x - px) * 0.06 + (Math.random() - 0.5) * 1.2;
      ball.vx = Math.max(-7, Math.min(7, ball.vx));
      gravity = Math.min(0.62, gravity + 0.012); // ramps up
      scoreRef.current += 1;
      setScore(scoreRef.current);
      hapticTap();
    }
    function onDown(e: PointerEvent) {
      const r = canvas.getBoundingClientRect();
      kick(e.clientX - r.left, e.clientY - r.top);
    }
    canvas.addEventListener("pointerdown", onDown);

    function frame() {
      ball.vy += gravity;
      ball.x += ball.vx; ball.y += ball.vy;
      spin += ball.vx * 0.04;
      if (ball.x < ball.r) { ball.x = ball.r; ball.vx = Math.abs(ball.vx) * 0.86; }
      if (ball.x > W - ball.r) { ball.x = W - ball.r; ball.vx = -Math.abs(ball.vx) * 0.86; }
      if (ball.y - ball.r > H) { alive = false; }

      ctx.clearRect(0, 0, W, H);
      // pitch shadow on the floor
      const shadowY = H - 8;
      const prox = Math.max(0, 1 - (shadowY - ball.y) / H);
      ctx.fillStyle = `rgba(0,0,0,${0.16 + prox * 0.2})`;
      ctx.beginPath();
      ctx.ellipse(ball.x, shadowY, ball.r * (1.1 - prox * 0.4), ball.r * 0.28, 0, 0, Math.PI * 2);
      ctx.fill();
      // ball
      ctx.save();
      ctx.translate(ball.x, ball.y);
      ctx.rotate(spin);
      const g = ctx.createRadialGradient(-ball.r * 0.3, -ball.r * 0.3, ball.r * 0.2, 0, 0, ball.r);
      g.addColorStop(0, "#ffffff"); g.addColorStop(1, "#c9d2dc");
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(0, 0, ball.r, 0, Math.PI * 2); ctx.fill();
      // pentagon hint
      ctx.fillStyle = "#0a0e1a";
      ctx.beginPath(); ctx.arc(0, 0, ball.r * 0.34, 0, Math.PI * 2); ctx.fill();
      ctx.restore();

      if (alive) raf = requestAnimationFrame(frame);
      else end();
    }
    function end() {
      confirmBuzz();
      setPhase("over");
      onGameOver(scoreRef.current);
    }
    raf = requestAnimationFrame(frame);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", size);
      canvas.removeEventListener("pointerdown", onDown);
    };
  }, [phase, onGameOver]);

  function start() {
    scoreRef.current = 0;
    setScore(0);
    setPhase("play");
  }

  return (
    <div className="game-stage keepy-stage">
      <div className="game-hud"><span className="game-score">{score}</span><span className="game-unit">kick-ups</span></div>
      <canvas ref={canvasRef} className="game-canvas" />
      {phase === "ready" && (
        <div className="game-overlay">
          <span className="game-emoji">⚽️</span>
          <h3>Keepy Uppy</h3>
          <p>Tap the ball to keep it in the air. It speeds up — don't let it drop.</p>
          {target ? <p className="game-target">Beat {target} to win the challenge</p> : null}
          <button className="cta wide" onClick={start}>Kick off</button>
        </div>
      )}
      {phase === "over" && (
        <div className="game-overlay">
          <span className="game-emoji">{target && score > target ? "🏆" : "🧤"}</span>
          <h3>{score} kick-ups</h3>
          <p>{target ? (score > target ? `You beat ${target}!` : `${target} to beat — so close`) : score >= 20 ? "Tidy." : "Keep at it."}</p>
          <button className="cta wide" onClick={start}>Again</button>
        </div>
      )}
    </div>
  );
}
