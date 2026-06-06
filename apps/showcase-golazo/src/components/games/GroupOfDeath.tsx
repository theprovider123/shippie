import { useEffect, useRef, useState } from "react";
import { tap as hapticTap, confirmBuzz, celebrate } from "../../lib/haptics";
import { drawStadium, drawBall, Trail, Particles, Shake } from "../../lib/stadium";
import { shuffleGates, type Gate } from "../../data/gates";
import { godCardBlob } from "../../lib/sharecard";

interface Moment { q: string; a: string; }

/**
 * GROUP OF DEATH — the centrepiece. Flappy-feel: tap to keep the ball up and
 * thread the gaps in the defensive walls (skill). Every few walls is a QUESTION
 * GATE with two openings — fly through the one with the right answer (knowledge).
 * One mistake and you're out. Endless; high score chases the world.
 */
type WallKind = "plain" | "gate";
interface Wall {
  x: number;
  kind: WallKind;
  gapY: number; // plain: gap centre
  gapH: number;
  // gate openings (centres) + which is correct + labels
  topY?: number;
  botY?: number;
  openH?: number;
  correctTop?: boolean;
  q?: string;
  topLabel?: string;
  botLabel?: string;
  chose?: "correct" | "wrong"; // which opening the ball went through
  scored: boolean;
}

export function GroupOfDeath({ onGameOver, target, playerName = "Me" }: { onGameOver: (score: number) => void; target?: number; playerName?: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [score, setScore] = useState(0);
  const [phase, setPhase] = useState<"ready" | "play" | "over">("ready");
  const [flash, setFlash] = useState("");
  const [recap, setRecap] = useState<Moment[]>([]);
  const [shared, setShared] = useState(false);
  const scoreRef = useRef(0);
  const correctRef = useRef<Moment[]>([]);

  async function share() {
    hapticTap();
    const blob = await godCardBlob({ playerName, score: scoreRef.current, moments: recap });
    if (!blob) return;
    const file = new File([blob], "group-of-death.png", { type: "image/png" });
    const text = `🐍 ${scoreRef.current} caps in Group of Death on Golazo. Knowledge + nerve. Beat me.`;
    try { if (navigator.canShare?.({ files: [file] })) { await navigator.share({ files: [file], text }); return; } } catch { /* */ }
    try { if (navigator.share) { await navigator.share({ text }); return; } } catch { /* */ }
    const url = URL.createObjectURL(blob); const a = document.createElement("a"); a.href = url; a.download = "group-of-death.png"; a.click(); URL.revokeObjectURL(url);
    setShared(true); setTimeout(() => setShared(false), 1600);
  }

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

    const r = Math.min(W, H) * 0.032;
    const ballX = W * 0.28;
    let ballY = H * 0.5;
    let vy = 0;
    const gravity = H * 0.00072;     // gentler fall — more control
    const flap = -H * 0.0118;        // a softer header
    const thick = Math.max(40, W * 0.12);
    let speed = W * 0.0052;          // starts calm; ramps slowly
    const spacing = W * 0.74;        // more room to line up the next gap
    const maxStep = H * 0.26;        // next gap is always reachable from the last
    const walls: Wall[] = [];
    const deck = shuffleGates();
    let gi = 0;
    let wallCount = 0;
    let lastGapY = H * 0.5;
    let dead = false;
    let started = false; // forgiving: don't fall until first tap
    const trail = new Trail(10);
    const particles = new Particles();
    const shake = new Shake();
    const start = performance.now();
    let raf = 0;

    function nextGate(): Gate { const g = deck[gi % deck.length]; gi++; return g; }

    function spawnWall() {
      wallCount++;
      // Place each new wall a fixed gap beyond the current rightmost one, so walls
      // keep streaming in forever at a steady cadence (not a fixed world slot).
      const x = walls.length ? walls[walls.length - 1].x + spacing : W + 60;
      const gateNow = wallCount % 4 === 0; // every fourth wall tests knowledge
      const margin = H * 0.1;
      if (gateNow) {
        const g = nextGate();
        const openH = Math.max(H * 0.2, H * 0.24 - scoreRef.current * H * 0.0004);
        // openings spread around the centre — both reachable from the last gap
        const topY = H * 0.31;
        const botY = H * 0.69;
        // put the correct answer on whichever side is easier to reach from here
        const correctTop = Math.abs(topY - lastGapY) <= Math.abs(botY - lastGapY)
          ? Math.random() < 0.62
          : Math.random() < 0.38;
        walls.push({
          x, kind: "gate", gapY: 0, gapH: 0, openH, topY, botY,
          correctTop, q: g.q,
          topLabel: correctTop ? g.correct : g.wrong,
          botLabel: correctTop ? g.wrong : g.correct,
          scored: false,
        });
        lastGapY = correctTop ? topY : botY;
      } else {
        const gapH = Math.max(H * 0.28, H * 0.4 - scoreRef.current * H * 0.0009);
        const lo = margin + gapH / 2;
        const hi = H - margin - gapH / 2;
        // next gap stays within a reachable hop of the last one
        const gapY = Math.max(lo, Math.min(hi, lastGapY + (Math.random() - 0.5) * 2 * maxStep));
        walls.push({ x, kind: "plain", gapY, gapH, scored: false });
        lastGapY = gapY;
      }
    }
    // prime the first few walls
    for (let i = 0; i < 5; i++) spawnWall();

    function die(msg: string) {
      if (dead) return;
      dead = true;
      setFlash(msg);
      shake.kick(14);
      confirmBuzz();
      particles.emit(ballX, ballY, "spark", 20);
      setRecap(correctRef.current.slice());
      setTimeout(() => { setPhase("over"); onGameOver(scoreRef.current); }, 800);
    }

    function flashFor(msg: string) {
      setFlash(msg);
      window.setTimeout(() => setFlash((f) => (f === msg ? "" : f)), 750);
    }

    function flapNow() {
      if (dead) return;
      started = true;
      vy = flap;
      hapticTap();
    }
    function onDown() { flapNow(); }
    canvas.addEventListener("pointerdown", onDown);

    function inOpening(y: number, centre: number, h: number): boolean {
      return y > centre - h / 2 + r && y < centre + h / 2 - r;
    }

    function frame(now: number) {
      if (started && !dead) {
        vy += gravity;
        ballY += vy;
        // ramps slowly and caps, so a good player can keep going a long, long time
        speed = Math.min(W * 0.0095, W * 0.0052 + scoreRef.current * W * 0.00005);
      }
      // move walls + collisions + scoring
      for (const wl of walls) {
        if (started && !dead) wl.x -= speed;
        const overlapX = ballX + r > wl.x && ballX - r < wl.x + thick;
        if (overlapX && !dead) {
          if (wl.kind === "plain") {
            if (!inOpening(ballY, wl.gapY, wl.gapH)) die("WALL!");
          } else {
            // Either opening gets you through (skill). The right answer is a bonus,
            // the wrong one just misses out — you only die hitting the wall itself.
            const inTop = inOpening(ballY, wl.topY!, wl.openH!);
            const inBot = inOpening(ballY, wl.botY!, wl.openH!);
            if (inTop || inBot) {
              if (wl.chose === undefined) wl.chose = (wl.correctTop ? inTop : inBot) ? "correct" : "wrong";
            } else die("WALL!");
          }
        }
        if (!wl.scored && wl.x + thick < ballX && !dead) {
          wl.scored = true;
          if (wl.kind === "gate") {
            if (wl.chose === "correct") {
              scoreRef.current += 3; celebrate(); particles.emit(ballX, ballY, "spark", 14);
              correctRef.current.push({ q: wl.q!, a: wl.correctTop ? wl.topLabel! : wl.botLabel! });
              flashFor("CALLED IT ✓");
            } else {
              scoreRef.current += 1; flashFor("WRONG — NO BONUS");
            }
          } else {
            scoreRef.current += 1;
          }
          setScore(scoreRef.current);
        }
      }
      // recycle offscreen walls + always keep a buffer queued to the right
      while (walls.length && walls[0].x + thick < -20) walls.shift();
      while (walls.length < 6) spawnWall();

      // bounds
      if (started && !dead) {
        if (ballY + r > H) { ballY = H - r; die("GROUNDED!"); }
        if (ballY - r < 0) { ballY = r; vy = 0; }
      }

      // ── render ──
      const [sx, sy] = shake.offset();
      ctx.save();
      ctx.translate(sx, sy);
      drawStadium(ctx, W, H, now - start, { pitchTop: 0.16 });

      for (const wl of walls) {
        drawWall(ctx, wl, W, H, thick);
      }

      trail.push(ballX, ballY);
      if (started) trail.draw(ctx, r);
      drawBall(ctx, ballX, ballY, r, (now - start) / 90);
      particles.update(); particles.draw(ctx);
      ctx.restore();

      if (!dead) raf = requestAnimationFrame(frame);
    }
    raf = requestAnimationFrame(frame);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", size);
      canvas.removeEventListener("pointerdown", onDown);
    };
  }, [phase, onGameOver]);

  function startGame() {
    scoreRef.current = 0; setScore(0); setFlash(""); correctRef.current = []; setRecap([]); setPhase("play");
  }

  return (
    <div className="game-stage god-stage">
      <div className="game-hud">
        <span className="game-score">{score}</span><span className="game-unit">caps</span>
      </div>
      <canvas ref={canvasRef} className="game-canvas" />
      {flash && <div className={`game-flash ${flash.includes("✓") ? "bins" : "miss"}`}>{flash}</div>}
      {phase === "ready" && (
        <div className="game-overlay">
          <span className="game-emoji">💀</span>
          <h3>Group of Death</h3>
          <p>Tap to keep the ball up and find the gap. At a <strong>question wall</strong>, either opening gets you through — the right answer is a big bonus. Only the walls end your run.</p>
          {target ? <p className="game-target">Beat {target} to win the challenge</p> : null}
          <button className="cta wide" onClick={startGame}>Kick off</button>
        </div>
      )}
      {phase === "over" && (
        <div className="game-overlay god-over">
          <span className="game-emoji">{target && score > target ? "🏆" : "💀"}</span>
          <h3>{score} caps</h3>
          <p>{target ? (score > target ? `You beat ${target}!` : `${target} to beat`) : score >= 30 ? "Brain AND boots. Tidy." : score >= 12 ? "Not bad. Go again." : "Survived the group? Barely."}</p>
          {recap.length > 0 && (
            <div className="god-recap">
              <span className="field-label">Moments you nailed</span>
              <ul className="god-recap-list">
                {recap.map((m, i) => (
                  <li key={i} className="god-recap-row">
                    <span className="god-recap-tick">✓</span>
                    <span className="god-recap-a">{m.a}</span>
                    <span className="god-recap-q">{m.q}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          <button className="cta wide" onClick={startGame}>Again</button>
          <button className="ghost-btn wide" onClick={share}>{shared ? "Saved ✓" : "🧾 Share your run"}</button>
        </div>
      )}
    </div>
  );
}

function drawWall(ctx: CanvasRenderingContext2D, wl: Wall, W: number, H: number, thick: number) {
  const x = wl.x;
  const seg = (y0: number, y1: number) => {
    if (y1 <= y0) return;
    ctx.fillStyle = "#0c2415";
    ctx.fillRect(x, y0, thick, y1 - y0);
    ctx.fillStyle = "rgba(245,240,232,0.16)"; // chalk leading edge
    ctx.fillRect(x, y0, 3, y1 - y0);
    ctx.fillStyle = "rgba(184,255,78,0.55)"; // lime gap-edge highlight
    if (y0 > 0) ctx.fillRect(x, y0, thick, 3);
    if (y1 < H) ctx.fillRect(x, y1 - 3, thick, 3);
  };
  ctx.font = `700 ${Math.max(13, thick * 0.3)}px "Barlow Condensed", sans-serif`;
  ctx.textAlign = "center";
  if (wl.kind === "plain") {
    seg(0, wl.gapY - wl.gapH / 2);
    seg(wl.gapY + wl.gapH / 2, H);
  } else {
    const openH = wl.openH!;
    const top = wl.topY!, bot = wl.botY!;
    // three solid segments: above top opening, divider, below bottom opening
    seg(0, top - openH / 2);
    seg(top + openH / 2, bot - openH / 2);
    seg(bot + openH / 2, H);
    // answer labels in each opening
    ctx.save();
    ctx.fillStyle = "#f5f0e8";
    label(ctx, wl.topLabel!, x + thick / 2, top, thick);
    label(ctx, wl.botLabel!, x + thick / 2, bot, thick);
    ctx.restore();
    // question banner just ahead of the gate as it approaches
    if (x < W * 0.92 && x > -thick) {
      ctx.fillStyle = "rgba(13,31,15,0.78)";
      ctx.fillRect(0, 0, W, H * 0.12);
      ctx.fillStyle = "#b8ff4e";
      ctx.font = `800 ${Math.max(15, W * 0.045)}px "Barlow Condensed", sans-serif`;
      ctx.textAlign = "center";
      ctx.fillText((wl.q ?? "").toUpperCase(), W / 2, H * 0.08);
    }
  }
}

// Draw an answer vertically-centred in an opening, rotated to read along the wall.
function label(ctx: CanvasRenderingContext2D, text: string, cx: number, cy: number, thick: number) {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.fillStyle = "#0d1f0f";
  ctx.font = `800 ${Math.max(12, thick * 0.26)}px "Barlow Condensed", sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  // chalk chip behind the text for legibility
  const w = ctx.measureText(text.toUpperCase()).width + 14;
  const h = Math.max(18, thick * 0.36);
  ctx.fillStyle = "#b8ff4e";
  ctx.fillRect(-w / 2, -h / 2, w, h);
  ctx.fillStyle = "#0d1f0f";
  ctx.fillText(text.toUpperCase(), 0, 1);
  ctx.restore();
}
