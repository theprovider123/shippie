import { useEffect, useRef, useState } from "react";
import { tap as hapticTap, confirmBuzz } from "../../lib/haptics";
import { drawStadium, drawBall, drawBallShadow, Trail, Particles, Shake } from "../../lib/stadium";

/**
 * Keepy Uppy — tap the ball to keep it in the air. Gravity pulls it down and it
 * drifts + speeds up the longer you last; miss a tap and it hits the deck.
 * Stadium backdrop, contact shadow, motion trail, dust on contact. Score = touches.
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

    const ball = { x: W / 2, y: H * 0.4, vx: (Math.random() - 0.5) * 2, vy: 0, r: Math.min(W, H) * 0.072 };
    const floorY = () => H - 10;
    let gravity = 0.3;
    let alive = true;
    let raf = 0;
    let spin = 0;
    let squash = 1;
    const trail = new Trail(7);
    const particles = new Particles();
    const shake = new Shake();
    const start = performance.now();

    function kick(px: number, py: number) {
      if (Math.hypot(px - ball.x, py - ball.y) > ball.r * 2.1) return;
      ball.vy = -Math.min(12, 8.6 + gravity * 4);
      ball.vx += (ball.x - px) * 0.06 + (Math.random() - 0.5) * 1.2;
      ball.vx = Math.max(-7.5, Math.min(7.5, ball.vx));
      gravity = Math.min(0.62, gravity + 0.012);
      squash = 0.7;
      particles.emit(px, py, "dust", 8);
      shake.kick(4);
      scoreRef.current += 1;
      setScore(scoreRef.current);
      hapticTap();
    }
    function onDown(e: PointerEvent) {
      const r = canvas.getBoundingClientRect();
      kick(e.clientX - r.left, e.clientY - r.top);
    }
    canvas.addEventListener("pointerdown", onDown);

    function frame(now: number) {
      ball.vy += gravity;
      ball.x += ball.vx; ball.y += ball.vy;
      spin += ball.vx * 0.05;
      squash += (1 - squash) * 0.2;
      if (ball.x < ball.r) { ball.x = ball.r; ball.vx = Math.abs(ball.vx) * 0.86; }
      if (ball.x > W - ball.r) { ball.x = W - ball.r; ball.vx = -Math.abs(ball.vx) * 0.86; }
      if (ball.y - ball.r > H) alive = false;

      const [sx, sy] = shake.offset();
      ctx.save();
      ctx.translate(sx, sy);
      drawStadium(ctx, W, H, now - start, { pitchTop: 0.62 });
      const heightFrac = Math.max(0, Math.min(1, (floorY() - ball.y) / (H * 0.6)));
      drawBallShadow(ctx, ball.x, floorY(), ball.r, heightFrac);
      trail.push(ball.x, ball.y);
      trail.draw(ctx, ball.r);
      drawBall(ctx, ball.x, ball.y, ball.r, spin, squash);
      particles.update();
      particles.draw(ctx);
      ctx.restore();

      if (alive) raf = requestAnimationFrame(frame);
      else { confirmBuzz(); setPhase("over"); onGameOver(scoreRef.current); }
    }
    raf = requestAnimationFrame(frame);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", size);
      canvas.removeEventListener("pointerdown", onDown);
    };
  }, [phase, onGameOver]);

  function startGame() {
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
          <button className="cta wide" onClick={startGame}>Kick off</button>
        </div>
      )}
      {phase === "over" && (
        <div className="game-overlay">
          <span className="game-emoji">{target && score > target ? "🏆" : "🧤"}</span>
          <h3>{score} kick-ups</h3>
          <p>{target ? (score > target ? `You beat ${target}!` : `${target} to beat — so close`) : score >= 20 ? "Tidy." : "Keep at it."}</p>
          <button className="cta wide" onClick={startGame}>Again</button>
        </div>
      )}
    </div>
  );
}
