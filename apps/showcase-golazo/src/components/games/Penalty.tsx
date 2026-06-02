import { useEffect, useRef, useState } from "react";
import {
  PENS,
  goals,
  resolveShootout,
  keeperDiveFor,
  makeSeed,
  shootoutUrl,
  type KickOutcome,
  type Shootout,
} from "../../lib/penalty";
import { drawStadium, drawBall, drawBallShadow, Trail, Particles, Shake } from "../../lib/stadium";
import { tap as hapticTap, confirmBuzz, celebrate } from "../../lib/haptics";

/**
 * Penalty Shootout — async head-to-head. You take 5 spot-kicks against a keeper
 * whose dives are fixed by a shared seed (so both players face the same keeper).
 * Then challenge a mate by link; when they reply the link shows who won.
 */
export function Penalty({ challenge, playerName }: { challenge?: Shootout | null; playerName: string }) {
  const seed = useRef(challenge?.seed ?? makeSeed());
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [phase, setPhase] = useState<"ready" | "play" | "done">("ready");
  const [kicks, setKicks] = useState<KickOutcome[]>([]);
  const [copied, setCopied] = useState(false);
  const kicksRef = useRef<KickOutcome[]>([]);

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

    const goalY = () => H * 0.22;
    const goalL = () => W * 0.2;
    const goalR = () => W * 0.8;
    const barH = () => H * 0.16;
    const spot = () => ({ x: W / 2, y: H * 0.85 });
    let ball = { ...spot(), vx: 0, vy: 0, flying: false, r: Math.min(W, H) * 0.05 };
    let keeper = { x: W / 2, target: W / 2, lean: 0 };
    let drag: { x: number; y: number } | null = null;
    let aim: { x: number; y: number } | null = null;
    let pending: KickOutcome | null = null;
    let flash = "";
    const trail = new Trail(9);
    const particles = new Particles();
    const shake = new Shake();
    const start = performance.now();
    let raf = 0;

    function keeperZoneX(dir: -1 | 0 | 1) {
      const gl = goalL(), gr = goalR();
      return dir === -1 ? gl + (gr - gl) * 0.2 : dir === 1 ? gr - (gr - gl) * 0.2 : (gl + gr) / 2;
    }
    function shoot(dx: number, dy: number) {
      if (ball.flying || pending || dy > -10) return;
      const i = kicksRef.current.length;
      ball.vx = dx * 0.16; ball.vy = dy * 0.16; ball.flying = true;
      trail.clear();
      hapticTap();
      // Project crossing point at the goal line.
      const tToGoal = Math.max(1, (ball.y - goalY()) / Math.max(1, -ball.vy));
      const cross = ball.x + ball.vx * tToGoal;
      const gl = goalL(), gr = goalR();
      const dir = keeperDiveFor(seed.current, i);
      keeper.target = keeperZoneX(dir);
      // Outcome
      const onTarget = cross > gl + ball.r && cross < gr - ball.r;
      let zone: -1 | 0 | 1 = 0;
      if (cross < gl + (gr - gl) / 3) zone = -1;
      else if (cross > gr - (gr - gl) / 3) zone = 1;
      pending = !onTarget ? "m" : zone === dir ? "s" : "g";
    }
    function onDown(e: PointerEvent) { const r = canvas.getBoundingClientRect(); drag = { x: e.clientX - r.left, y: e.clientY - r.top }; aim = drag; }
    function onMove(e: PointerEvent) { if (!drag) return; const r = canvas.getBoundingClientRect(); aim = { x: e.clientX - r.left, y: e.clientY - r.top }; }
    function onUp() { if (drag && aim) shoot(aim.x - spot().x, aim.y - spot().y); drag = null; aim = null; }
    canvas.addEventListener("pointerdown", onDown);
    canvas.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);

    function register(outcome: KickOutcome) {
      kicksRef.current = [...kicksRef.current, outcome];
      setKicks(kicksRef.current);
      flash = outcome === "g" ? "GOAL!" : outcome === "s" ? "SAVED!" : "MISS";
      if (outcome === "g") { particles.emit(ball.x, ball.y, "spark", 22); shake.kick(10); celebrate(); }
      else { shake.kick(5); confirmBuzz(); }
      setTimeout(() => { flash = ""; }, 800);
      if (kicksRef.current.length >= PENS) {
        setTimeout(() => setPhase("done"), 1000);
      } else {
        setTimeout(() => {
          ball = { ...spot(), vx: 0, vy: 0, flying: false, r: Math.min(W, H) * 0.05 };
          keeper = { x: W / 2, target: W / 2, lean: 0 };
          pending = null; trail.clear();
        }, 900);
      }
    }

    function frame(now: number) {
      keeper.x += (keeper.target - keeper.x) * 0.16;
      keeper.lean += (((keeper.target - W / 2) / (W * 0.3)) - keeper.lean) * 0.18;

      if (ball.flying) {
        ball.vy += 0.1; ball.x += ball.vx; ball.y += ball.vy;
        trail.push(ball.x, ball.y);
        if (ball.y <= goalY() + ball.r && pending) { const o = pending; pending = null; ball.flying = false; register(o); }
        else if (ball.y < -40 || ball.x < -40 || ball.x > W + 40) { ball.flying = false; if (pending) { const o = pending; pending = null; register(o); } }
      }

      const [sx, sy] = shake.offset();
      ctx.save();
      ctx.translate(sx, sy);
      drawStadium(ctx, W, H, now - start, { pitchTop: 0.55, markings: "penalty" });
      const gl = goalL(), gr = goalR(), gy = goalY(), bh = barH();
      // net
      ctx.strokeStyle = "rgba(255,255,255,0.16)"; ctx.lineWidth = 1;
      for (let x = gl; x <= gr; x += (gr - gl) / 14) { ctx.beginPath(); ctx.moveTo(x, gy); ctx.lineTo(x, gy + bh); ctx.stroke(); }
      for (let y = gy; y <= gy + bh; y += bh / 5) { ctx.beginPath(); ctx.moveTo(gl, y); ctx.lineTo(gr, y); ctx.stroke(); }
      ctx.strokeStyle = "#ffffff"; ctx.lineWidth = 5; ctx.lineCap = "round";
      ctx.beginPath(); ctx.moveTo(gl, gy + bh); ctx.lineTo(gl, gy); ctx.lineTo(gr, gy); ctx.lineTo(gr, gy + bh); ctx.stroke();
      // keeper
      ctx.save();
      ctx.translate(keeper.x, gy + bh * 0.45);
      ctx.rotate(keeper.lean * 0.5);
      ctx.fillStyle = "#16f08b";
      const kw = (gr - gl) * 0.16;
      ctx.beginPath(); ctx.ellipse(0, 0, kw / 2, bh * 0.32, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = "#0a1f16";
      ctx.beginPath(); ctx.arc(0, -bh * 0.34, kw * 0.26, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
      // aim
      if (aim) {
        const s = spot();
        let vx = (aim.x - s.x) * 0.16, vy = (aim.y - s.y) * 0.16, px = s.x, py = s.y;
        ctx.fillStyle = "rgba(22,240,139,0.55)";
        for (let i = 0; i < 12; i++) { px += vx; py += vy; vy += 0.1; ctx.beginPath(); ctx.arc(px, py, 2.4, 0, Math.PI * 2); ctx.fill(); }
      }
      if (ball.flying) trail.draw(ctx, ball.r);
      drawBallShadow(ctx, ball.x, H - 8, ball.r, ball.flying ? 0.6 : 0.1);
      drawBall(ctx, ball.x, ball.y, ball.r, now / 120);
      particles.update(); particles.draw(ctx);
      if (flash) {
        ctx.fillStyle = flash === "GOAL!" ? "#16f08b" : flash === "SAVED!" ? "#ff5d6c" : "rgba(246,248,252,0.7)";
        ctx.font = `900 ${Math.min(W, H) * 0.13}px -apple-system, sans-serif`;
        ctx.textAlign = "center";
        ctx.fillText(flash, W / 2, H * 0.42);
      }
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
  }, [phase]);

  function startGame() {
    kicksRef.current = [];
    setKicks([]);
    if (!challenge) seed.current = makeSeed();
    setPhase("play");
  }

  async function challengeMate() {
    hapticTap();
    const s: Shootout = { seed: seed.current, name: playerName, kicks: kicksRef.current };
    const url = shootoutUrl(s);
    const text = `🥅 I scored ${goals(s.kicks)}/${PENS} in a Golazo penalty shootout. Beat me → ${url}`;
    try { if (navigator.share) { await navigator.share({ title: "Penalty shootout", text, url }); return; } } catch { /* */ }
    try { await navigator.clipboard?.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch { /* */ }
  }

  const myGoals = goals(kicks);

  if (phase === "done" && challenge) {
    const res = resolveShootout(kicks, challenge.kicks);
    return (
      <div className="game-stage pen-result">
        <div className="pen-final">
          <span className="pen-final-cap">{res.outcome === "win" ? "You win 🏆" : res.outcome === "lose" ? `${challenge.name} wins` : "Level!"}</span>
          <span className="pen-final-score">{res.me} – {res.them}</span>
          <span className="pen-final-sub">You vs {challenge.name}</span>
        </div>
        <PenRow label="You" kicks={kicks} />
        <PenRow label={challenge.name} kicks={challenge.kicks} />
        {res.outcome === "draw"
          ? <button className="cta wide" onClick={challengeMate}>{copied ? "Copied ✓" : "Rematch — send link"}</button>
          : <button className="cta wide" onClick={startGame}>Play again</button>}
      </div>
    );
  }

  return (
    <div className="game-stage penalty-stage">
      <div className="game-hud">
        <span className="game-score">{myGoals}</span><span className="game-unit">/ {PENS}</span>
        <span className="game-shots">{[...kicks].map((k, i) => <span key={i} className={`pen-dot ${k}`}>{k === "g" ? "●" : "○"}</span>)}</span>
      </div>
      <canvas ref={canvasRef} className="game-canvas" />
      {phase === "ready" && (
        <div className="game-overlay">
          <span className="game-emoji">🥅</span>
          <h3>Penalty Shootout</h3>
          {challenge
            ? <p><strong>{challenge.name}</strong> scored {goals(challenge.kicks)}/{PENS}. Same keeper — take your {PENS} to beat them.</p>
            : <p>Swipe to place each penalty past the keeper. {PENS} kicks, then challenge a mate.</p>}
          <button className="cta wide" onClick={startGame}>{challenge ? "Take your kicks" : "Start shootout"}</button>
        </div>
      )}
      {phase === "done" && !challenge && (
        <div className="game-overlay">
          <span className="game-emoji">{myGoals >= 4 ? "🏆" : "🧤"}</span>
          <h3>{myGoals}/{PENS} scored</h3>
          <p>Send it to a mate — they face the same keeper.</p>
          <button className="cta wide" onClick={challengeMate}>{copied ? "Copied ✓" : "Challenge a mate"}</button>
          <button className="ghost-btn sm" onClick={startGame}>Again</button>
        </div>
      )}
    </div>
  );
}

function PenRow({ label, kicks }: { label: string; kicks: KickOutcome[] }) {
  return (
    <div className="pen-row">
      <span className="pen-row-name">{label}</span>
      <span className="pen-row-dots">
        {kicks.map((k, i) => <span key={i} className={`pen-dot ${k}`}>{k === "g" ? "●" : "○"}</span>)}
      </span>
      <span className="pen-row-score">{goals(kicks)}</span>
    </div>
  );
}
