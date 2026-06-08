import { useEffect, useRef, useState } from "react";
import {
  PENS,
  resolveDuel,
  duelUrl,
  defaultShotPlacement,
  normaliseShotPlacement,
  penaltyShotSaved,
  zoneFromX,
  type Zone,
  type Duel,
  type DuelSide,
  type ShotPlacement,
} from "../../lib/duel";
import { drawStadium, drawBall, drawKeeper, Trail, Particles, Shake } from "../../lib/stadium";
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
  const [shotDetails, setShotDetails] = useState<ShotPlacement[]>([]);
  const [dives, setDives] = useState<Zone[]>([]);
  const [anim, setAnim] = useState<{ shot: Zone; dive: Zone; t: number; goal: boolean; placement: ShotPlacement } | null>(null);
  const [copied, setCopied] = useState(false);
  const animRef = useRef(anim);
  animRef.current = anim;
  const shotsRef = useRef(shots);
  shotsRef.current = shots;
  const shootPlacementRef = useRef<(placement: ShotPlacement) => void>(() => {});

  // Canvas scene: goal, keeper, ball — animates the current shot.
  useEffect(() => {
    if (phase !== "shoot" && phase !== "keep") return;
    const canvas = canvasRef.current!;
    const ctx = canvas.getContext("2d")!;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    let W = 0, H = 0, raf = 0;
    const particles = new Particles();
    const shake = new Shake();
    const trail = new Trail(12);
    const startT = performance.now();
    const easeOut = (t: number) => 1 - Math.pow(1 - t, 3);
    let drag: { x: number; y: number } | null = null;
    let aim: { x: number; y: number } | null = null;
    let path: { x: number; y: number }[] = [];
    const clamp = (n: number, lo: number, hi: number) => (n < lo ? lo : n > hi ? hi : n);
    function size() {
      const r = canvas.getBoundingClientRect();
      W = r.width; H = r.height;
      canvas.width = W * dpr; canvas.height = H * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
    size();
    window.addEventListener("resize", size);

    function zoneX(z: Zone) { const gl = W * 0.14, gr = W * 0.86; return z === -1 ? gl + (gr - gl) * 0.16 : z === 1 ? gr - (gr - gl) * 0.16 : W / 2; }
    function curlFromPath(pts: { x: number; y: number }[]): number {
      if (pts.length < 3) return 0;
      const a = pts[0], b = pts[pts.length - 1], m = pts[Math.floor(pts.length / 2)];
      const len = Math.hypot(b.x - a.x, b.y - a.y) || 1;
      const cross = ((b.x - a.x) * (a.y - m.y) - (b.y - a.y) * (a.x - m.x)) / len;
      return clamp(-cross / (W * 0.16), -1, 1);
    }
    function placementFromPath(pts: { x: number; y: number }[]): ShotPlacement | null {
      const end = pts[pts.length - 1];
      if (!end) return null;
      const gl = W * 0.14, gr = W * 0.86, gy = H * 0.2, bh = H * 0.23;
      const spotX = W / 2, spotY = H * 0.84;
      const dx = end.x - spotX, dy = end.y - spotY;
      if (dy > -18) return null;
      const x = clamp((end.x - gl) / (gr - gl), 0.04, 0.96);
      const y = clamp((gy + bh - end.y) / bh, 0.08, 0.96);
      return normaliseShotPlacement({
        zone: zoneFromX(x),
        x,
        y,
        power: clamp(Math.hypot(dx, dy) / (H * 0.58), 0.42, 1),
        bend: curlFromPath(pts),
      }, zoneFromX(x), shotsRef.current.length);
    }
    function onDown(e: PointerEvent) {
      if (phase !== "shoot" || animRef.current || shotsRef.current.length >= PENS) return;
      const r = canvas.getBoundingClientRect();
      drag = { x: e.clientX - r.left, y: e.clientY - r.top };
      aim = drag;
      path = [drag];
      canvas.setPointerCapture?.(e.pointerId);
    }
    function onMove(e: PointerEvent) {
      if (!drag) return;
      const r = canvas.getBoundingClientRect();
      aim = { x: e.clientX - r.left, y: e.clientY - r.top };
      path.push(aim);
    }
    function onUp() {
      if (drag && aim) {
        const placement = placementFromPath(path.length > 1 ? path : [drag, aim]);
        if (placement) shootPlacementRef.current(placement);
      }
      drag = null; aim = null; path = [];
    }
    canvas.addEventListener("pointerdown", onDown);
    canvas.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);

    function frame(now: number) {
      const gy = H * 0.2, gl = W * 0.14, gr = W * 0.86, bh = H * 0.23;
      const a = animRef.current;
      const spotX = W / 2, spotY = H * 0.84;
      const baseR = Math.min(W, H) * 0.052;
      let ballX = spotX, ballY = spotY, keeperX = W / 2, keeperTarget = W / 2, ballR = baseR;
      if (a) {
        const targetX = gl + a.placement.x * (gr - gl);
        const targetY = gy + bh - a.placement.y * bh;
        const duration = 20 - a.placement.power * 5;
        const raw = Math.min(1, a.t / duration);
        const k = easeOut(raw);
        ballX = spotX + (targetX - spotX) * k + Math.sin(raw * Math.PI) * a.placement.bend * (gr - gl) * 0.13;
        // power gives the strike a flatter first half, then height/dip takes over.
        ballY = spotY + (targetY - spotY) * k - Math.sin(raw * Math.PI) * H * (0.06 + a.placement.power * 0.08);
        ballR = baseR * (1 - 0.42 * k); // shrinks into the distance (perspective)
        keeperTarget = a.dive === a.shot ? targetX + (targetX > W / 2 ? -1 : 1) * (gr - gl) * 0.05 : zoneX(a.dive);
        keeperX = W / 2 + (keeperTarget - W / 2) * easeOut(Math.min(1, a.t / 17));
        if (raw < 1) trail.push(ballX, ballY);
        if (a.t === 16 && a.goal) { particles.emit(targetX, targetY, "spark", 26); shake.kick(12); }
        if (a.t === 14 && !a.goal) { shake.kick(8); particles.emit(keeperX, gy + bh * 0.55, "dust", 12); }
      } else { trail.clear(); }
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
        const placement = aim && drag ? placementFromPath(path.length > 1 ? path : [drag, aim]) : null;
        if (placement) {
          let px = spotX, py = spotY;
          const targetX = gl + placement.x * (gr - gl);
          const targetY = gy + bh - placement.y * bh;
          for (let i = 1; i <= 18; i++) {
            const raw = i / 18;
            const k = easeOut(raw);
            px = spotX + (targetX - spotX) * k + Math.sin(raw * Math.PI) * placement.bend * (gr - gl) * 0.13;
            py = spotY + (targetY - spotY) * k - Math.sin(raw * Math.PI) * H * (0.06 + placement.power * 0.08);
            ctx.fillStyle = `rgba(184,255,78,${0.58 - i * 0.02})`;
            ctx.beginPath(); ctx.arc(px, py, 2.7 - i * 0.04, 0, Math.PI * 2); ctx.fill();
          }
        }
      }
      // keeper — a real diving figure that launches off the line
      const lean = a ? (keeperTarget - W / 2) / (W * 0.3) : 0;
      const dive = a ? Math.min(1, a.t / 16) : 0;
      drawKeeper(ctx, keeperX, gy + bh * 0.62, (gr - gl) * 0.12, lean, bh * 0.92, dive);
      // ball — arcs in with a trail, shrinking into the distance
      if (a) trail.draw(ctx, ballR);
      drawBall(ctx, ballX, ballY, ballR, now / 90);
      particles.update(); particles.draw(ctx);
      ctx.restore();

      if (a) setAnim((p) => (p ? { ...p, t: p.t + 1 } : p));
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

  // Resolve a shot animation → record + advance.
  useEffect(() => {
    if (!anim || anim.t < 34) return;
    const z = anim.shot;
    const placement = anim.placement;
    setAnim(null);
    setShotDetails((d) => [...d, placement]);
    setShots((s) => {
      const next = [...s, z];
      if (next.length >= PENS) setTimeout(() => setPhase("keep"), 250);
      return next;
    });
  }, [anim]);

  function shootPlacement(input: ShotPlacement) {
    if (anim || shots.length >= PENS) return;
    hapticTap();
    const placement = normaliseShotPlacement(input, input.zone, shots.length);
    const dive: Zone = oppDives ? oppDives[shots.length] ?? 0 : ([-1, 0, 1][Math.floor(Math.random() * 3)] as Zone);
    const goal = !penaltyShotSaved(placement, dive);
    if (goal) celebrate(); else confirmBuzz();
    setAnim({ shot: placement.zone, dive, t: 0, goal, placement });
  }
  shootPlacementRef.current = shootPlacement;

  function shoot(z: Zone) {
    const base = defaultShotPlacement(z, shots.length);
    shootPlacement({
      ...base,
      power: 0.62 + Math.random() * 0.2,
      y: Math.max(0.12, Math.min(0.88, base.y + (Math.random() - 0.5) * 0.18)),
      bend: (Math.random() - 0.5) * 0.22,
    });
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

  const me: DuelSide = { name: playerName, shots, dives, shotDetails };
  const shotMade = (z: Zone, dive: Zone, i: number) => (shotDetails[i] ? !penaltyShotSaved(shotDetails[i], dive) : z !== dive);
  const takingDives = phase === "keep";

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
        <span className="game-score">{takingDives ? dives.length : shots.length}</span>
        <span className="game-unit">/ {PENS} {takingDives ? "dives" : "pens"}</span>
        {oppDives && phase === "shoot" && <span className="game-shots">{shots.map((s, i) => {
          const made = shotMade(s, oppDives[i] ?? 0, i);
          return <span key={i} className={`pen-dot ${made ? "g" : "s"}`}>{made ? "●" : "○"}</span>;
        })}</span>}
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
          <span className="zone-cap">{phase === "shoot" ? "Swipe to place, or tap…" : "Dive…"}</span>
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
