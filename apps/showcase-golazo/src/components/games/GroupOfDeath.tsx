import { useEffect, useRef, useState } from "react";
import { tap as hapticTap, confirmBuzz, celebrate } from "../../lib/haptics";
import { drawStadium, drawBall, Trail, Particles, Shake } from "../../lib/stadium";
import { shuffleGates, type Gate } from "../../data/gates";

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
  scored: boolean;
}

export function GroupOfDeath({ onGameOver, target }: { onGameOver: (score: number) => void; target?: number }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [score, setScore] = useState(0);
  const [phase, setPhase] = useState<"ready" | "play" | "over">("ready");
  const [flash, setFlash] = useState("");
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

    const r = Math.min(W, H) * 0.034;
    const ballX = W * 0.28;
    let ballY = H * 0.5;
    let vy = 0;
    const gravity = H * 0.0009;
    const flap = -H * 0.013;
    const thick = Math.max(40, W * 0.12);
    let speed = W * 0.006;
    let spawnX = W + 40;
    const spacing = W * 0.66;
    const walls: Wall[] = [];
    const deck = shuffleGates();
    let gi = 0;
    let wallCount = 0;
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
      const gateNow = wallCount % 3 === 0; // every third wall tests knowledge
      const margin = H * 0.12;
      if (gateNow) {
        const g = nextGate();
        const openH = Math.max(H * 0.17, H * 0.22 - scoreRef.current * H * 0.0008);
        const topY = margin + openH / 2 + H * 0.04;
        const botY = H - margin - openH / 2 - H * 0.04;
        const correctTop = Math.random() < 0.5;
        walls.push({
          x: spawnX, kind: "gate", gapY: 0, gapH: 0, openH, topY, botY,
          correctTop, q: g.q,
          topLabel: correctTop ? g.correct : g.wrong,
          botLabel: correctTop ? g.wrong : g.correct,
          scored: false,
        });
      } else {
        const gapH = Math.max(H * 0.22, H * 0.34 - scoreRef.current * H * 0.0016);
        const gapY = margin + gapH / 2 + Math.random() * (H - margin * 2 - gapH);
        walls.push({ x: spawnX, kind: "plain", gapY, gapH, scored: false });
      }
      spawnX += spacing;
    }
    // prime a few walls
    for (let i = 0; i < 4; i++) spawnWall();

    function die(msg: string) {
      if (dead) return;
      dead = true;
      setFlash(msg);
      shake.kick(14);
      confirmBuzz();
      particles.emit(ballX, ballY, "spark", 20);
      setTimeout(() => { setPhase("over"); onGameOver(scoreRef.current); }, 800);
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
        speed = W * 0.006 + scoreRef.current * W * 0.00012; // ramps up
      }
      // move walls + collisions + scoring
      for (const wl of walls) {
        if (started && !dead) wl.x -= speed;
        const overlapX = ballX + r > wl.x && ballX - r < wl.x + thick;
        if (overlapX && !dead) {
          if (wl.kind === "plain") {
            if (!inOpening(ballY, wl.gapY, wl.gapH)) die("WALL!");
          } else {
            const safe = wl.correctTop
              ? inOpening(ballY, wl.topY!, wl.openH!)
              : inOpening(ballY, wl.botY!, wl.openH!);
            const wrong = wl.correctTop
              ? inOpening(ballY, wl.botY!, wl.openH!)
              : inOpening(ballY, wl.topY!, wl.openH!);
            if (wrong) die("WRONG ONE!");
            else if (!safe) die("WALL!");
          }
        }
        if (!wl.scored && wl.x + thick < ballX && !dead) {
          wl.scored = true;
          scoreRef.current += wl.kind === "gate" ? 2 : 1;
          setScore(scoreRef.current);
          if (wl.kind === "gate") { celebrate(); particles.emit(ballX, ballY, "spark", 10); }
        }
      }
      // recycle + spawn
      while (walls.length && walls[0].x + thick < -20) walls.shift();
      if (walls.length && walls[walls.length - 1].x < W - spacing) spawnWall();

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
    scoreRef.current = 0; setScore(0); setFlash(""); setPhase("play");
  }

  return (
    <div className="game-stage god-stage">
      <div className="game-hud">
        <span className="game-score">{score}</span><span className="game-unit">caps</span>
      </div>
      <canvas ref={canvasRef} className="game-canvas" />
      {flash && <div className="game-flash miss">{flash}</div>}
      {phase === "ready" && (
        <div className="game-overlay">
          <span className="game-emoji">💀</span>
          <h3>Group of Death</h3>
          <p>Tap to keep the ball up and find the gap. Every third wall is a <strong>question</strong> — fly through the right answer. One slip and you're out.</p>
          {target ? <p className="game-target">Beat {target} to win the challenge</p> : null}
          <button className="cta wide" onClick={startGame}>Kick off</button>
        </div>
      )}
      {phase === "over" && (
        <div className="game-overlay">
          <span className="game-emoji">{target && score > target ? "🏆" : "💀"}</span>
          <h3>{score} caps</h3>
          <p>{target ? (score > target ? `You beat ${target}!` : `${target} to beat`) : score >= 30 ? "Brain AND boots. Tidy." : score >= 12 ? "Not bad. Go again." : "Survived the group? Barely."}</p>
          <button className="cta wide" onClick={startGame}>Again</button>
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
