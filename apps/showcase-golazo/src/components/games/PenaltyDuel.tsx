import { useEffect, useRef, useState } from "react";
import {
  PENS,
  resolveDuel,
  duelUrl,
  defaultShotPlacement,
  normaliseShotPlacement,
  penaltyShotSaved,
  zoneFromX,
  readShooter,
  aiStrike,
  type Zone,
  type Duel,
  type DuelSide,
  type ShotPlacement,
} from "../../lib/duel";
import { drawStadium, drawBall, drawKeeper, Trail, Particles, Shake } from "../../lib/stadium";
import { Hitstop, drawNetRipple } from "../../lib/juice";
import { tap as hapticTap, confirmBuzz, celebrate } from "../../lib/haptics";
import * as sfx from "../../lib/sfx";

type Phase = "intro" | "shoot" | "keep" | "result";
const ZONES: { z: Zone; label: string }[] = [
  { z: -1, label: "Left" },
  { z: 0, label: "Middle" },
  { z: 1, label: "Right" },
];

type Anim = { placement: ShotPlacement; dive: Zone; t: number; goal: boolean; who: "me" | "ai" };

/**
 * Penalty Duel. Solo it's a full shootout vs a keeper that reads your tendencies and a striker
 * that shows a readable tell (sometimes a feint) — five each, then sudden death. By link it's
 * an async head-to-head: you beat the challenger's keeper, then set yours, and the duel travels
 * back in a URL. No backend either way.
 */
export function PenaltyDuel({ duel: incoming, playerName }: { duel?: Duel | null; playerName: string }) {
  const responding = Boolean(incoming?.a && !incoming?.b); // link: I face the challenger
  const viewingResult = Boolean(incoming?.a && incoming?.b); // link: result came back
  const solo = !incoming?.a; // no link → shootout vs AI
  const oppDives = responding ? incoming!.a.dives : null; // keeper I shoot against (link)

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [phase, setPhase] = useState<Phase>(viewingResult ? "result" : "intro");
  const [shots, setShots] = useState<Zone[]>([]);
  const [shotDetails, setShotDetails] = useState<ShotPlacement[]>([]);
  const [dives, setDives] = useState<Zone[]>([]);
  const [anim, setAnim] = useState<Anim | null>(null);
  const [copied, setCopied] = useState(false);
  const [muted, setMutedState] = useState(sfx.isMuted());

  // Solo shootout score (human vs AI), with sudden death once five each are level.
  const [myGoals, setMyGoals] = useState(0);
  const [aiGoals, setAiGoals] = useState(0);
  const [tell, setTell] = useState<Zone | null>(null);
  const [over, setOver] = useState<null | { won: boolean | null }>(null);
  const myGoalsRef = useRef(0); const aiGoalsRef = useRef(0);
  const myShotsRef = useRef<Zone[]>([]); const myDivesRef = useRef<Zone[]>([]);
  const aiStrikeRef = useRef<ReturnType<typeof aiStrike> | null>(null);

  const animRef = useRef(anim); animRef.current = anim;
  const shotsRef = useRef(shots); shotsRef.current = shots;
  const shootRef = useRef<(p: ShotPlacement) => void>(() => {});
  const animDoneRef = useRef(false); // one resolution per shot (guards a double-fire)

  // ── Canvas: one shot flight, keeper diving. Reused for my shots and the AI's. ──
  useEffect(() => {
    if (phase !== "shoot" && phase !== "keep") return;
    const canvas = canvasRef.current!;
    const ctx = canvas.getContext("2d")!;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    let W = 0, H = 0, raf = 0;
    const particles = new Particles();
    const shake = new Shake();
    const trail = new Trail(12);
    const hitstop = new Hitstop();
    const startT = performance.now();
    const easeOut = (t: number) => 1 - Math.pow(1 - t, 3);
    let drag: { x: number; y: number } | null = null;
    let aim: { x: number; y: number } | null = null;
    let path: { x: number; y: number }[] = [];
    let ripple: { x: number; y: number; age: number } | null = null;
    let rippleFired = false;
    const clamp = (n: number, lo: number, hi: number) => (n < lo ? lo : n > hi ? hi : n);
    function size() {
      const r = canvas.getBoundingClientRect();
      W = r.width; H = r.height;
      canvas.width = W * dpr; canvas.height = H * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
    size();
    window.addEventListener("resize", size);

    function zoneX(z: Zone) { const gl = W * 0.04, gr = W * 0.96; return z === -1 ? gl + (gr - gl) * 0.16 : z === 1 ? gr - (gr - gl) * 0.16 : W / 2; }
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
      const gl = W * 0.04, gr = W * 0.96, gy = H * 0.12, bh = H * 0.34;
      const spotX = W / 2, spotY = H * 0.88;
      const dx = end.x - spotX, dy = end.y - spotY;
      if (dy > -18) return null;
      const x = clamp((end.x - gl) / (gr - gl), 0.04, 0.96);
      const y = clamp((gy + bh - end.y) / bh, 0.08, 0.96);
      return normaliseShotPlacement({
        zone: zoneFromX(x), x, y,
        power: clamp(Math.hypot(dx, dy) / (H * 0.58), 0.42, 1),
        bend: curlFromPath(pts),
      }, zoneFromX(x), shotsRef.current.length);
    }
    function onDown(e: PointerEvent) {
      if (phase !== "shoot" || animRef.current || shotsRef.current.length >= PENS + 6) return;
      const r = canvas.getBoundingClientRect();
      drag = { x: e.clientX - r.left, y: e.clientY - r.top };
      aim = drag; path = [drag];
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
        if (placement) shootRef.current(placement);
      }
      drag = null; aim = null; path = [];
    }
    canvas.addEventListener("pointerdown", onDown);
    canvas.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);

    function frame(now: number) {
      const ts = hitstop.scale();
      const gy = H * 0.12, gl = W * 0.04, gr = W * 0.96, bh = H * 0.34;
      const a = animRef.current;
      const spotX = W / 2, spotY = H * 0.88;
      const baseR = Math.min(W, H) * 0.038;
      let ballX = spotX, ballY = spotY, keeperX = W / 2, keeperTarget = W / 2, ballR = baseR;
      if (a) {
        const targetX = gl + a.placement.x * (gr - gl);
        const targetY = gy + bh - a.placement.y * bh;
        const duration = 20 - a.placement.power * 5;
        const raw = Math.min(1, a.t / duration);
        const k = easeOut(raw);
        ballX = spotX + (targetX - spotX) * k + Math.sin(raw * Math.PI) * a.placement.bend * (gr - gl) * 0.13;
        ballY = spotY + (targetY - spotY) * k - Math.sin(raw * Math.PI) * H * (0.06 + a.placement.power * 0.08);
        ballR = baseR * (1 - 0.42 * k);
        keeperTarget = a.dive === a.placement.zone ? targetX + (targetX > W / 2 ? -1 : 1) * (gr - gl) * 0.05 : zoneX(a.dive);
        keeperX = W / 2 + (keeperTarget - W / 2) * easeOut(Math.min(1, a.t / 17));
        if (raw < 1) trail.push(ballX, ballY);
        if (raw >= 1 && !rippleFired) {
          rippleFired = true;
          if (a.goal) { particles.emit(targetX, targetY, "spark", 26); shake.kick(13); hitstop.kick(0.8, 4); ripple = { x: targetX, y: targetY, age: 0 }; sfx.net(); sfx.crowd(0.8); }
          else { shake.kick(9); particles.emit(keeperX, gy + bh * 0.55, "dust", 12); hitstop.kick(0.5, 2); sfx.save(); }
        }
      } else { trail.clear(); rippleFired = false; ripple = null; }
      const [sx, sy] = shake.offset();
      ctx.save();
      ctx.translate(sx, sy);
      drawStadium(ctx, W, H, now - startT, { pitchTop: 0.55, markings: "penalty" });
      ctx.strokeStyle = "rgba(255,255,255,0.16)"; ctx.lineWidth = 1;
      for (let x = gl; x <= gr; x += (gr - gl) / 12) { ctx.beginPath(); ctx.moveTo(x, gy); ctx.lineTo(x, gy + bh); ctx.stroke(); }
      for (let y = gy; y <= gy + bh; y += bh / 4) { ctx.beginPath(); ctx.moveTo(gl, y); ctx.lineTo(gr, y); ctx.stroke(); }
      ctx.strokeStyle = "#fff"; ctx.lineWidth = 5; ctx.lineCap = "round";
      ctx.beginPath(); ctx.moveTo(gl, gy + bh); ctx.lineTo(gl, gy); ctx.lineTo(gr, gy); ctx.lineTo(gr, gy + bh); ctx.stroke();
      if (ripple) { drawNetRipple(ctx, ripple.x, ripple.y, ripple.age, "rgba(120,240,170,"); ripple.age += ts; }
      // Aim hints when idle in shoot phase
      if (phase === "shoot" && !a) {
        for (const { z } of ZONES) {
          ctx.fillStyle = "rgba(22,240,139,0.1)";
          const cx = zoneX(z), w = (gr - gl) / 3.4;
          ctx.fillRect(cx - w / 2, gy, w, bh);
        }
        const placement = aim && drag ? placementFromPath(path.length > 1 ? path : [drag, aim]) : null;
        if (placement) {
          const targetX = gl + placement.x * (gr - gl), targetY = gy + bh - placement.y * bh;
          for (let i = 1; i <= 18; i++) {
            const raw = i / 18, k = easeOut(raw);
            const px = spotX + (targetX - spotX) * k + Math.sin(raw * Math.PI) * placement.bend * (gr - gl) * 0.13;
            const py = spotY + (targetY - spotY) * k - Math.sin(raw * Math.PI) * H * (0.06 + placement.power * 0.08);
            ctx.fillStyle = `rgba(184,255,78,${0.58 - i * 0.02})`;
            ctx.beginPath(); ctx.arc(px, py, 2.7 - i * 0.04, 0, Math.PI * 2); ctx.fill();
          }
        }
      }
      const lean = a ? (keeperTarget - W / 2) / (W * 0.3) : 0;
      const dive = a ? Math.min(1, a.t / 16) : 0;
      drawKeeper(ctx, keeperX, gy + bh * 0.62, (gr - gl) * 0.14, lean, bh * 0.44, dive);
      if (a) trail.draw(ctx, ballR);
      drawBall(ctx, ballX, ballY, ballR, now / 90);
      if (ts > 0.5) particles.update();
      particles.draw(ctx);
      ctx.restore();

      if (a && ts > 0.5) setAnim((p) => (p ? { ...p, t: p.t + 1 } : p));
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

  // Resolve a shot animation → record + advance the right flow. animDoneRef makes this fire
  // exactly once per shot even if a couple of frames render at t≥36 before setAnim(null) lands.
  useEffect(() => {
    if (!anim || anim.t < 36 || animDoneRef.current) return;
    animDoneRef.current = true;
    const finished = anim;
    setAnim(null);
    if (finished.who === "me") {
      const placement = finished.placement;
      setShotDetails((d) => [...d, placement]);
      if (solo) {
        if (finished.goal) { myGoalsRef.current += 1; setMyGoals(myGoalsRef.current); }
        myShotsRef.current = [...myShotsRef.current, placement.zone];
        setShots(myShotsRef.current);
        advanceSolo("afterMyShot");
      } else {
        const next = [...shotsRef.current, placement.zone];
        setShots(next);
        if (next.length >= PENS) setTimeout(() => setPhase("keep"), 250);
      }
    } else {
      // AI shot resolved (solo keep phase)
      if (finished.goal) { aiGoalsRef.current += 1; setAiGoals(aiGoalsRef.current); }
      advanceSolo("afterAiShot");
    }
  }, [anim]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Solo shootout flow control ──
  function settleSolo(): boolean {
    const me = myGoalsRef.current, ai = aiGoalsRef.current;
    const shotsTaken = myShotsRef.current.length, divesTaken = myDivesRef.current.length;
    // After equal completed rounds, a lead decides it (regulation 5 or sudden death).
    if (shotsTaken === divesTaken && shotsTaken >= PENS && me !== ai) {
      setOver({ won: me > ai });
      setTimeout(() => setPhase("result"), 600);
      return true;
    }
    return false;
  }
  function advanceSolo(when: "afterMyShot" | "afterAiShot") {
    if (when === "afterMyShot") {
      // hand over to keep for the matching AI penalty
      setTimeout(() => { if (!settleSolo()) startKeep(); }, 360);
    } else {
      setTimeout(() => { if (!settleSolo()) backToShoot(); }, 360);
    }
  }
  function startKeep() {
    setPhase("keep");
    const strike = aiStrike(myDivesRef.current);
    aiStrikeRef.current = strike;
    setTell(strike.tell);
  }
  function backToShoot() { setPhase("shoot"); setTell(null); }

  // ── Shooting (human) ──
  function shootPlacement(input: ShotPlacement) {
    if (anim || phase !== "shoot" || over) return;
    hapticTap();
    const placement = normaliseShotPlacement(input, input.zone, shotsRef.current.length);
    let dive: Zone;
    if (solo) dive = readShooter(myShotsRef.current).dive;
    else dive = oppDives ? oppDives[shotsRef.current.length] ?? 0 : 0;
    const goal = !penaltyShotSaved(placement, dive);
    if (goal) celebrate(); else confirmBuzz();
    sfx.kick(placement.power);
    animDoneRef.current = false;
    setAnim({ placement, dive, t: 0, goal, who: "me" });
  }
  shootRef.current = shootPlacement;

  function shoot(z: Zone) {
    const base = defaultShotPlacement(z, shotsRef.current.length);
    shootPlacement({ ...base, power: 0.62 + Math.random() * 0.2, y: Math.max(0.12, Math.min(0.88, base.y + (Math.random() - 0.5) * 0.18)), bend: (Math.random() - 0.5) * 0.22 });
  }

  // ── Diving (human) ──
  function pickDive(z: Zone) {
    if (anim || over) return;
    hapticTap();
    if (solo) {
      myDivesRef.current = [...myDivesRef.current, z];
      setDives(myDivesRef.current);
      const strike = aiStrikeRef.current ?? aiStrike(myDivesRef.current.slice(0, -1));
      const placement = normaliseShotPlacement({ ...defaultShotPlacement(strike.zone, myDivesRef.current.length - 1), power: 0.66 + Math.random() * 0.22, bend: (Math.random() - 0.5) * 0.3 }, strike.zone, 0);
      const goal = !penaltyShotSaved(placement, z);
      if (goal) confirmBuzz(); else celebrate();
      sfx.kick(placement.power);
      setTell(null);
      animDoneRef.current = false;
      setAnim({ placement, dive: z, t: 0, goal, who: "ai" });
    } else {
      if (dives.length >= PENS) return;
      setDives((d) => {
        const next = [...d, z];
        if (next.length >= PENS) setTimeout(() => setPhase("result"), 200);
        return next;
      });
    }
  }

  function toggleMute() { const next = !muted; sfx.setMuted(next); setMutedState(next); hapticTap(); }

  const shotMade = (z: Zone, dive: Zone, i: number) => (shotDetails[i] ? !penaltyShotSaved(shotDetails[i], dive) : z !== dive);
  const me: DuelSide = { name: playerName, shots, dives, shotDetails };
  const inSuddenDeath = myShotsRef.current.length >= PENS && myDivesRef.current.length >= PENS;

  async function send(d: Duel, scoredLine: string) {
    hapticTap();
    const url = duelUrl(d);
    const text = `🥅 ${scoredLine} — Penalty Duel on Golazo. Your turn → ${url}`;
    try { if (navigator.share) { await navigator.share({ title: "Penalty Duel", text, url }); return; } } catch { /* */ }
    try { await navigator.clipboard?.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch { /* */ }
  }

  // ── Result ──
  if (phase === "result") {
    if (solo) {
      const won = over?.won;
      return (
        <div className="game-stage pen-result">
          <DuelResult cap={won === null ? "Level!" : won ? "You win 🏆" : "Keeper wins"} mine={myGoals} theirs={aiGoals} opp="the keeper" />
          <button className="cta wide" onClick={resetSolo}>Again</button>
        </div>
      );
    }
    if (viewingResult) {
      const r = resolveDuel(incoming!.a, incoming!.b!);
      const youAreA = incoming!.a.name === playerName;
      const mine = youAreA ? r.aGoals : r.bGoals, theirs = youAreA ? r.bGoals : r.aGoals;
      const won = mine > theirs;
      return <DuelResult cap={won ? "You win 🏆" : mine === theirs ? "Level!" : `${(youAreA ? incoming!.b! : incoming!.a).name} wins`} mine={mine} theirs={theirs} opp={(youAreA ? incoming!.b! : incoming!.a).name} />;
    }
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

  function resetSolo() {
    myGoalsRef.current = 0; aiGoalsRef.current = 0; myShotsRef.current = []; myDivesRef.current = [];
    aiStrikeRef.current = null;
    setMyGoals(0); setAiGoals(0); setShots([]); setShotDetails([]); setDives([]); setTell(null); setOver(null);
    setPhase("shoot");
  }

  const takingDives = phase === "keep";
  const hudCount = solo
    ? `${myGoals}–${aiGoals}`
    : `${takingDives ? dives.length : shots.length} / ${PENS} ${takingDives ? "dives" : "pens"}`;

  return (
    <div className="game-stage penalty-stage">
      <div className="game-hud">
        {solo
          ? <><span className="game-score">{hudCount}</span><span className="game-unit">{inSuddenDeath ? "sudden death" : "you v keeper"}</span></>
          : <><span className="game-score">{takingDives ? dives.length : shots.length}</span><span className="game-unit">/ {PENS} {takingDives ? "dives" : "pens"}</span></>}
        {oppDives && phase === "shoot" && <span className="game-shots">{shots.map((s, i) => {
          const made = shotMade(s, oppDives[i] ?? 0, i);
          return <span key={i} className={`pen-dot ${made ? "g" : "s"}`}>{made ? "●" : "○"}</span>;
        })}</span>}
        <button className="game-mute" aria-label={muted ? "Unmute" : "Mute"} onClick={toggleMute}>{muted ? "🔇" : "🔊"}</button>
      </div>
      <canvas ref={canvasRef} className="game-canvas" />

      {phase === "intro" && (
        <div className="game-overlay">
          <span className="game-emoji">🥅</span>
          <h3>Penalty Duel</h3>
          {responding
            ? <p><strong>{incoming!.a.name}</strong> challenged you. Beat their keeper, then set yours.</p>
            : <p>Full shootout: take your five, then keep against a striker who shows a <strong>tell</strong> — read it, or get done by a feint. Level after five? <strong>Sudden death.</strong></p>}
          <button className="cta wide" onClick={() => { hapticTap(); setPhase("shoot"); }}>{responding ? "Take your 5" : "Start shootout"}</button>
        </div>
      )}

      {phase === "keep" && solo && tell !== null && !anim && (
        <div className="pen-tell">Keeper's read: striker is eyeing <strong>{tell === -1 ? "their left" : tell === 1 ? "their right" : "the middle"}</strong>…</div>
      )}

      {(phase === "shoot" || phase === "keep") && (
        <div className="zone-bar">
          <span className="zone-cap">{phase === "shoot" ? "Swipe to place, or tap…" : "Dive…"}</span>
          {ZONES.map(({ z, label }) => (
            <button key={z} className="zone-btn" disabled={Boolean(anim) || over !== null || (phase === "keep" && solo && tell === null)} onClick={() => (phase === "shoot" ? shoot(z) : pickDive(z))}>
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
