import { useEffect, useRef, useState } from "react";
import {
  PENS,
  resolveDuel,
  duelUrl,
  type Zone,
  type Duel,
  type DuelSide,
} from "../../lib/duel";
import { drawStadium, drawBall, drawKeeper, Particles, Shake } from "../../lib/stadium";
import { tap as hapticTap, confirmBuzz, celebrate } from "../../lib/haptics";

type Phase = "intro" | "shoot" | "keep" | "result";
const ZONES: { z: Zone; label: string }[] = [
  { z: -1, label: "Left" },
  { z: 0, label: "Middle" },
  { z: 1, label: "Right" },
];

/**
 * Penalty Duel — you're keeper AND striker. Place 5 pens, choose 5 dives; a goal is
 * a shot the opponent didn't dive toward. Two link legs settle it. No backend.
 */
export function PenaltyDuel({ duel: incoming, playerName }: { duel?: Duel | null; playerName: string }) {
  const responding = Boolean(incoming?.a && !incoming?.b); // I face the challenger
  const viewingResult = Boolean(incoming?.a && incoming?.b); // result came back
  const oppDives = responding ? incoming!.a.dives : null; // keeper I shoot against

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [phase, setPhase] = useState<Phase>(viewingResult ? "result" : "intro");
  const [shots, setShots] = useState<Zone[]>([]);
  const [dives, setDives] = useState<Zone[]>([]);
  const [anim, setAnim] = useState<{ shot: Zone; dive: Zone; t: number; goal: boolean } | null>(null);
  const [copied, setCopied] = useState(false);
  const animRef = useRef(anim);
  animRef.current = anim;

  // Canvas scene: goal, keeper, ball — animates the current shot.
  useEffect(() => {
    if (phase !== "shoot" && phase !== "keep") return;
    const canvas = canvasRef.current!;
    const ctx = canvas.getContext("2d")!;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    let W = 0, H = 0, raf = 0;
    const particles = new Particles();
    const shake = new Shake();
    const startT = performance.now();
    function size() {
      const r = canvas.getBoundingClientRect();
      W = r.width; H = r.height;
      canvas.width = W * dpr; canvas.height = H * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
    size();
    window.addEventListener("resize", size);

    function zoneX(z: Zone) { const gl = W * 0.22, gr = W * 0.78; return z === -1 ? gl + (gr - gl) * 0.18 : z === 1 ? gr - (gr - gl) * 0.18 : W / 2; }
    function frame(now: number) {
      const gy = H * 0.22, gl = W * 0.22, gr = W * 0.78, bh = H * 0.18;
      const a = animRef.current;
      const spotX = W / 2, spotY = H * 0.82;
      let ballX = spotX, ballY = spotY, keeperX = W / 2;
      if (a) {
        const k = Math.min(1, a.t / 28);
        ballX = spotX + (zoneX(a.shot) - spotX) * k;
        ballY = spotY + (gy + bh * 0.5 - spotY) * k;
        keeperX = W / 2 + (zoneX(a.dive) - W / 2) * Math.min(1, a.t / 18);
        if (a.t === 16 && a.goal) { particles.emit(zoneX(a.shot), gy + bh * 0.4, "spark", 22); shake.kick(10); }
        if (a.t === 16 && !a.goal) shake.kick(6);
      }
      const [sx, sy] = shake.offset();
      ctx.save();
      ctx.translate(sx, sy);
      drawStadium(ctx, W, H, now - startT, { pitchTop: 0.55, markings: "penalty" });
      // net + frame
      ctx.strokeStyle = "rgba(255,255,255,0.16)"; ctx.lineWidth = 1;
      for (let x = gl; x <= gr; x += (gr - gl) / 12) { ctx.beginPath(); ctx.moveTo(x, gy); ctx.lineTo(x, gy + bh); ctx.stroke(); }
      for (let y = gy; y <= gy + bh; y += bh / 4) { ctx.beginPath(); ctx.moveTo(gl, y); ctx.lineTo(gr, y); ctx.stroke(); }
      ctx.strokeStyle = "#fff"; ctx.lineWidth = 5; ctx.lineCap = "round";
      ctx.beginPath(); ctx.moveTo(gl, gy + bh); ctx.lineTo(gl, gy); ctx.lineTo(gr, gy); ctx.lineTo(gr, gy + bh); ctx.stroke();
      // zone hints (shoot phase only, when idle)
      if (phase === "shoot" && !a) {
        for (const { z } of ZONES) {
          ctx.fillStyle = "rgba(22,240,139,0.1)";
          const cx = zoneX(z), w = (gr - gl) / 3.4;
          ctx.fillRect(cx - w / 2, gy, w, bh);
        }
      }
      // keeper — a real diving figure that launches off the line
      const lean = a ? (zoneX(a.dive) - W / 2) / (W * 0.3) : 0;
      const dive = a ? Math.min(1, a.t / 16) : 0;
      drawKeeper(ctx, keeperX, gy + bh * 0.62, (gr - gl) * 0.16, lean, bh, dive);
      // ball
      drawBall(ctx, ballX, ballY, Math.min(W, H) * 0.045, now / 120);
      particles.update(); particles.draw(ctx);
      ctx.restore();

      if (a) setAnim((p) => (p ? { ...p, t: p.t + 1 } : p));
      raf = requestAnimationFrame(frame);
    }
    raf = requestAnimationFrame(frame);
    return () => { cancelAnimationFrame(raf); window.removeEventListener("resize", size); };
  }, [phase]);

  // Resolve a shot animation → record + advance.
  useEffect(() => {
    if (!anim || anim.t < 34) return;
    const z = anim.shot;
    setAnim(null);
    setShots((s) => {
      const next = [...s, z];
      if (next.length >= PENS) setTimeout(() => setPhase("keep"), 250);
      return next;
    });
  }, [anim]);

  function shoot(z: Zone) {
    if (anim || shots.length >= PENS) return;
    hapticTap();
    const dive: Zone = oppDives ? oppDives[shots.length] ?? 0 : ([-1, 0, 1][Math.floor(Math.random() * 3)] as Zone);
    const goal = z !== dive;
    if (goal) celebrate(); else confirmBuzz();
    setAnim({ shot: z, dive, t: 0, goal });
  }
  function pickDive(z: Zone) {
    if (dives.length >= PENS) return;
    hapticTap();
    setDives((d) => {
      const next = [...d, z];
      if (next.length >= PENS) setTimeout(() => setPhase("result"), 200);
      return next;
    });
  }

  const me: DuelSide = { name: playerName, shots, dives };

  async function send(d: Duel, scoredLine: string) {
    hapticTap();
    const url = duelUrl(d);
    const text = `🥅 ${scoredLine} — Penalty Duel on Golazo. Your turn → ${url}`;
    try { if (navigator.share) { await navigator.share({ title: "Penalty Duel", text, url }); return; } } catch { /* */ }
    try { await navigator.clipboard?.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch { /* */ }
  }

  // ── Result ──
  if (phase === "result") {
    if (viewingResult) {
      const r = resolveDuel(incoming!.a, incoming!.b!);
      const youAreA = incoming!.a.name === playerName; // best-effort; A opened their own return
      const mine = youAreA ? r.aGoals : r.bGoals, theirs = youAreA ? r.bGoals : r.aGoals;
      const won = mine > theirs;
      return <DuelResult cap={won ? "You win 🏆" : mine === theirs ? "Level!" : `${(youAreA ? incoming!.b! : incoming!.a).name} wins`} mine={mine} theirs={theirs} opp={(youAreA ? incoming!.b! : incoming!.a).name} />;
    }
    // responder finished: compute full result, send back
    const duel: Duel = { a: incoming!.a, b: me };
    const r = resolveDuel(duel.a, duel.b!);
    const won = r.bGoals > r.aGoals;
    return (
      <div className="game-stage pen-result">
        <DuelResult cap={won ? "You win 🏆" : r.aGoals === r.bGoals ? "Level!" : `${incoming!.a.name} wins`} mine={r.bGoals} theirs={r.aGoals} opp={incoming!.a.name} />
        <button className="cta wide" onClick={() => send(duel, `I ${won ? "beat" : "played"} you ${r.bGoals}-${r.aGoals}`)}>
          {copied ? "Copied ✓" : "Send result to " + incoming!.a.name}
        </button>
      </div>
    );
  }

  // ── Shoot / Keep ──
  return (
    <div className="game-stage penalty-stage">
      <div className="game-hud">
        <span className="game-score">{phase === "shoot" ? shots.length : dives.length}</span>
        <span className="game-unit">/ {PENS} {phase === "shoot" ? "pens" : "dives"}</span>
        {oppDives && phase === "shoot" && <span className="game-shots">{shots.map((s, i) => <span key={i} className={`pen-dot ${s !== oppDives[i] ? "g" : "s"}`}>{s !== oppDives[i] ? "●" : "○"}</span>)}</span>}
      </div>
      <canvas ref={canvasRef} className="game-canvas" />

      {phase === "intro" && (
        <div className="game-overlay">
          <span className="game-emoji">🥅</span>
          <h3>Penalty Duel</h3>
          {responding
            ? <p><strong>{incoming!.a.name}</strong> challenged you. Beat their keeper, then set yours.</p>
            : <p>Place 5 pens, then choose 5 dives. You're keeper <em>and</em> striker.</p>}
          <button className="cta wide" onClick={() => { hapticTap(); setPhase("shoot"); }}>Take your 5</button>
        </div>
      )}

      {(phase === "shoot" || phase === "keep") && (
        <div className="zone-bar">
          <span className="zone-cap">{phase === "shoot" ? "Shoot…" : "Dive…"}</span>
          {ZONES.map(({ z, label }) => (
            <button key={z} className="zone-btn" disabled={Boolean(anim)} onClick={() => (phase === "shoot" ? shoot(z) : pickDive(z))}>
              {label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function DuelResult({ cap, mine, theirs, opp }: { cap: string; mine: number; theirs: number; opp: string }) {
  return (
    <div className="pen-final" onAnimationStart={() => celebrate()}>
      <span className="pen-final-cap">{cap}</span>
      <span className="pen-final-score">{mine} – {theirs}</span>
      <span className="pen-final-sub">You vs {opp}</span>
    </div>
  );
}
