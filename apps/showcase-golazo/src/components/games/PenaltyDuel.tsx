import { useEffect, useMemo, useRef, useState } from "react";
import {
  PENS,
  resolveDuel,
  duelUrl,
  penaltyShotSaved,
  penaltyShotSavedWithReach,
  readShooter,
  type Zone,
  type Duel,
  type DuelSide,
  type ShotPlacement,
} from "../../lib/duel";
import { team, type Team } from "../../data/teams";
import { drawBall, drawBallShadow, drawKeeper, Trail, Particles, Shake, type KeeperPose } from "../../lib/stadium";
import { Hitstop, drawNetRipple } from "../../lib/juice";
import { tap as hapticTap, confirmBuzz, celebrate } from "../../lib/haptics";
import { penaltyPlacementFromSwipe, type SwipePoint } from "../../lib/shot-gesture";
import { useStore } from "../../state";
import * as sfx from "../../lib/sfx";

type Phase = "shoot" | "level" | "result";
type Anim = { placement: ShotPlacement; dive: Zone; t: number; goal: boolean };

interface LadderLevel {
  rank: number;
  team: Team;
  required: number;
  readChance: number;
  reach: number;
}

const LADDER_IDS = ["FRA", "ESP", "ARG", "ENG", "POR", "BRA", "NED", "MAR", "BEL", "GER"] as const;
const LADDER_SHOTS = 7;
const PENALTY_LADDER: LadderLevel[] = LADDER_IDS.map((id, i) => ({
  rank: i + 1,
  team: team(id),
  required: i < 2 ? 4 : i < 6 ? 5 : i < 9 ? 6 : 7,
  readChance: 0.24 + i * 0.065,
  reach: 1 + i * 0.038,
}));

function randomZone(): Zone {
  return ([-1, 0, 1] as Zone[])[Math.floor(Math.random() * 3)] ?? 0;
}

const HINT_KEY = "golazo:penhint";

function hintAlreadySeen(): boolean {
  try {
    return localStorage.getItem(HINT_KEY) === "1";
  } catch {
    return true; // storage unavailable — don't nag every visit
  }
}

function markHintSeen(): void {
  try {
    localStorage.setItem(HINT_KEY, "1");
  } catch {
    /* ignore */
  }
}

/** Pre-shot keeper theater: an invitation stance + a gesture beat, scaled with difficulty. */
interface TheaterPlan {
  /** -1..1 how far off-centre the keeper stands. Sign = side he covers, inviting the other. */
  stand: number;
  /** The dive the theater secretly implies: bait the open side, or double-bluff and stay. */
  bias: Zone;
  gesture: "none" | "starfish" | "point" | "clap";
  pointDir: -1 | 1;
  /** ms of restless shuffling before he settles — unsettles the shooter's timing. */
  settleDelay: number;
}

function makeTheater(difficulty: number, rng: () => number = Math.random): TheaterPlan {
  const theatrics = 0.35 + difficulty * 0.55;
  const stand = rng() < theatrics * 0.75 ? (rng() < 0.5 ? -1 : 1) * (0.5 + rng() * 0.5) : 0;
  const standZone: Zone = stand > 0 ? 1 : stand < 0 ? -1 : 0;
  const openZone = -standZone as Zone;
  const doubleBluff = standZone !== 0 && rng() < 0.3 + difficulty * 0.2;
  const gestures: TheaterPlan["gesture"][] = ["starfish", "point", "clap"];
  return {
    stand,
    bias: standZone === 0 ? 0 : doubleBluff ? standZone : openZone,
    gesture: rng() < theatrics ? gestures[Math.floor(rng() * gestures.length)] ?? "none" : "none",
    pointDir: rng() < 0.5 ? -1 : 1,
    settleDelay: rng() < theatrics * 0.6 ? 350 + rng() * 650 : 0,
  };
}

function playerTeamAgainst(opponentId: string, favTeam?: string): string {
  if (favTeam && favTeam !== opponentId) return favTeam;
  if (opponentId !== "ENG") return "ENG";
  return "USA";
}

function ladderKeeperDive(shot: ShotPlacement, history: readonly Zone[], level: LadderLevel): Zone {
  const read = readShooter([...history]).dive;
  const centralShot = Math.abs(shot.x - 0.5) < 0.14;
  const tameShot = shot.power < 0.7 || shot.y < 0.38;
  const postageStamp = Math.abs(shot.x - 0.5) > 0.36 && shot.y > 0.8 && shot.power > 0.82;
  const readChance = Math.max(
    0.08,
    Math.min(
      0.9,
      level.readChance + (centralShot ? 0.18 : 0) + (tameShot ? 0.12 : 0) - (postageStamp ? 0.12 : 0) - Math.abs(shot.bend) * 0.08,
    ),
  );
  if (Math.random() < readChance) return shot.zone;
  if (centralShot && Math.random() < 0.48 + level.rank * 0.025) return 0;
  if (Math.random() < 0.72) return read;
  return randomZone();
}

function ladderShotSaved(shot: ShotPlacement, keeperDive: Zone, level: LadderLevel): boolean {
  return penaltyShotSavedWithReach(shot, keeperDive, level.reach);
}

function shotSaved(shot: ShotPlacement, keeperDive: Zone, level?: LadderLevel | null): boolean {
  return level ? ladderShotSaved(shot, keeperDive, level) : penaltyShotSaved(shot, keeperDive);
}

function autoKeeperDives(shots: readonly Zone[]): Zone[] {
  const history: Zone[] = [];
  return shots.slice(0, PENS).map(() => {
    const dive = readShooter(history).dive;
    history.push(shots[history.length] ?? 0);
    return dive;
  });
}

function outcomeDots(
  shotDetails: readonly ShotPlacement[],
  keeperDives: readonly Zone[],
  level?: LadderLevel | null,
  count = PENS,
): ("goal" | "save" | "empty")[] {
  return Array.from({ length: count }, (_, i) => {
    const shot = shotDetails[i];
    if (!shot) return "empty";
    return shotSaved(shot, keeperDives[i] ?? 0, level) ? "save" : "goal";
  });
}

function goalsForRound(
  shotDetails: readonly ShotPlacement[],
  keeperDives: readonly Zone[],
  level?: LadderLevel | null,
): number {
  return shotDetails.filter((shot, i) => !shotSaved(shot, keeperDives[i] ?? 0, level)).length;
}

/**
 * Penalty Duel: first-person penalty arcade. The player swipes through the
 * foreground ball; gesture direction places the shot, speed adds pace, and
 * gesture arc adds curl. Links still carry the completed five-shot duel;
 * the solo country ladder uses longer seven-shot rounds.
 */
export function PenaltyDuel({
  duel: incoming,
  playerName,
  onGameOver,
}: {
  duel?: Duel | null;
  playerName: string;
  onGameOver?: (score: number) => void;
}) {
  const store = useStore();
  const responding = Boolean(incoming?.a && !incoming?.b);
  const viewingResult = Boolean(incoming?.a && incoming?.b);
  const duelMode = responding || viewingResult;
  const opponentDives = responding ? incoming!.a.dives : null;
  const challengeDives = useMemo(() => incoming?.a ? autoKeeperDives(incoming.a.shots) : [], [incoming]);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [phase, setPhase] = useState<Phase>(viewingResult ? "result" : "shoot");
  const [levelIndex, setLevelIndex] = useState(0);
  const [totalGoals, setTotalGoals] = useState(0);
  const [finalRun, setFinalRun] = useState<{ score: number; cleared: number; complete: boolean } | null>(null);
  const [shots, setShots] = useState<Zone[]>([]);
  const [shotDetails, setShotDetails] = useState<ShotPlacement[]>([]);
  const [keeperDives, setKeeperDives] = useState<Zone[]>([]);
  const [anim, setAnim] = useState<Anim | null>(null);
  const [copied, setCopied] = useState(false);
  const [muted, setMutedState] = useState(sfx.isMuted());
  const [hintSeen, setHintSeen] = useState(hintAlreadySeen);

  const animRef = useRef(anim);
  const phaseRef = useRef(phase);
  const levelRef = useRef<LadderLevel | null>(null);
  const levelIndexRef = useRef(levelIndex);
  const totalGoalsRef = useRef(totalGoals);
  const reportedScoreRef = useRef<number | null>(null);
  const shotsRef = useRef(shots);
  const shotDetailsRef = useRef(shotDetails);
  const keeperDivesRef = useRef(keeperDives);
  const shootRef = useRef<(p: ShotPlacement, aimHoldMs?: number) => void>(() => {});
  const animDoneRef = useRef(false);
  const promptDismissedRef = useRef(false);
  const hintSeenRef = useRef(hintSeen);
  const theaterRef = useRef<TheaterPlan | null>(null);
  const theaterBornRef = useRef(0);

  hintSeenRef.current = hintSeen;
  animRef.current = anim;
  phaseRef.current = phase;
  levelIndexRef.current = levelIndex;
  totalGoalsRef.current = totalGoals;
  shotsRef.current = shots;
  shotDetailsRef.current = shotDetails;
  keeperDivesRef.current = keeperDives;

  const ladderLevel = duelMode ? null : PENALTY_LADDER[levelIndex] ?? PENALTY_LADDER[PENALTY_LADDER.length - 1]!;
  const activeLevel = ladderLevel ?? PENALTY_LADDER[0]!;
  const roundShots = ladderLevel ? LADDER_SHOTS : PENS;
  levelRef.current = ladderLevel;
  const duelLeftTeam = store.profile?.favTeam ?? "ENG";
  const rightTeam = duelMode ? (duelLeftTeam === "KSA" ? "ENG" : "KSA") : activeLevel.team.id;
  const leftTeam = duelMode ? duelLeftTeam : playerTeamAgainst(rightTeam, store.profile?.favTeam);
  const left = team(leftTeam);
  const right = team(rightTeam);
  const goals = goalsForRound(shotDetails, keeperDives, ladderLevel);
  const saves = shotDetails.length - goals;
  const dots = outcomeDots(shotDetails, keeperDives, ladderLevel, roundShots);
  const nextLevel = ladderLevel ? PENALTY_LADDER[levelIndex + 1] : null;

  /** 0..1 keeper difficulty: ladder rank in solo mode, mid-strength elsewhere. */
  function currentDifficulty(): number {
    const level = levelRef.current;
    return level ? (level.rank - 1) / (PENALTY_LADDER.length - 1) : 0.5;
  }

  /** Roll a fresh pre-shot theater plan for the next penalty. */
  function rollTheater(): void {
    theaterRef.current = makeTheater(currentDifficulty());
    theaterBornRef.current = typeof performance !== "undefined" ? performance.now() : 0;
  }

  useEffect(() => {
    if (phase !== "shoot") return;
    const canvasEl = canvasRef.current;
    const ctxMaybe = canvasEl?.getContext("2d");
    if (!canvasEl || !ctxMaybe) return;
    const canvas: HTMLCanvasElement = canvasEl;
    const ctx: CanvasRenderingContext2D = ctxMaybe;

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    let W = 0;
    let H = 0;
    let raf = 0;
    const particles = new Particles();
    const shake = new Shake();
    const trail = new Trail(16);
    const hitstop = new Hitstop();
    let drag: SwipePoint | null = null;
    let aim: SwipePoint | null = null;
    let path: SwipePoint[] = [];
    let aimStartT = 0;
    let keeperIdleX = 0;
    let ripple: { x: number; y: number; age: number } | null = null;
    let rippleFired = false;
    if (!theaterRef.current) {
      theaterRef.current = makeTheater(levelRef.current ? (levelRef.current.rank - 1) / (PENALTY_LADDER.length - 1) : 0.5);
      theaterBornRef.current = performance.now();
    }

    const easeOut = (t: number) => 1 - Math.pow(1 - t, 3);

    function size() {
      const r = canvas.getBoundingClientRect();
      W = r.width;
      H = r.height;
      canvas.width = W * dpr;
      canvas.height = H * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    function geometry() {
      const isPhone = W < 520;
      // Big goal mouth: near edge-to-edge on phones so corners feel like real
      // targets and placement matters. Keeper reach is normalized, so the
      // difficulty curve survives the resize (see keeper.ts / duel.ts).
      const goalLeft = W * (isPhone ? 0.03 : 0.08);
      const goalRight = W * (isPhone ? 0.97 : 0.92);
      const goalTop = H * 0.1;
      const goalHeight = H * (isPhone ? 0.44 : 0.4);
      const spot = { x: W / 2, y: H * 0.78 };
      return {
        goalLeft,
        goalRight,
        goalTop,
        goalHeight,
        goalWidth: goalRight - goalLeft,
        goalBottom: goalTop + goalHeight,
        spot,
        ballR: Math.min(W, H) * 0.105,
      };
    }

    function placementFromPath(points: SwipePoint[]): ShotPlacement | null {
      const g = geometry();
      return penaltyPlacementFromSwipe(
        points,
        { left: g.goalLeft, right: g.goalRight, top: g.goalTop, height: g.goalHeight },
        g.spot,
        { width: W, height: H },
        shotsRef.current.length,
      );
    }

    function onDown(e: PointerEvent) {
      const g = geometry();
      const limit = levelRef.current ? LADDER_SHOTS : PENS;
      if (phaseRef.current !== "shoot" || animRef.current || shotsRef.current.length >= limit) return;
      const r = canvas.getBoundingClientRect();
      const p = { x: e.clientX - r.left, y: e.clientY - r.top, t: e.timeStamp };
      const nearBall = Math.hypot(p.x - g.spot.x, p.y - g.spot.y) <= g.ballR * 2.3;
      if (!nearBall && p.y < H * 0.54) return;
      e.preventDefault();
      drag = p;
      aim = p;
      path = [p];
      aimStartT = e.timeStamp;
      canvas.setPointerCapture?.(e.pointerId);
    }

    function onMove(e: PointerEvent) {
      if (!drag) return;
      e.preventDefault();
      const r = canvas.getBoundingClientRect();
      aim = { x: e.clientX - r.left, y: e.clientY - r.top, t: e.timeStamp };
      path.push(aim);
    }

    function onUp(e: PointerEvent) {
      if (drag && aim) {
        const placement = placementFromPath(path.length > 1 ? path : [drag, aim]);
        if (placement) shootRef.current(placement, e.timeStamp - aimStartT);
      }
      drag = null;
      aim = null;
      path = [];
    }

    function onCancel() {
      drag = null;
      aim = null;
      path = [];
    }

    function drawScene(now: number) {
      const g = geometry();
      const a = animRef.current;
      const ts = hitstop.scale();
      const [sx, sy] = shake.offset();
      let ballX = g.spot.x;
      let ballY = g.spot.y;
      let ballR = g.ballR;
      let keeperX = W / 2;
      let keeperLean = 0;
      let keeperDive = 0;
      let targetX = W / 2;
      let targetY = g.goalTop + g.goalHeight * 0.55;
      const liveAim = !a && drag && aim ? placementFromPath(path.length > 1 ? path : [drag, aim]) : null;
      let pose: KeeperPose;

      if (a) {
        targetX = g.goalLeft + a.placement.x * g.goalWidth;
        targetY = g.goalBottom - a.placement.y * g.goalHeight;
        const tHit = 24 - a.placement.power * 5;
        const raw = Math.min(1, a.t / tHit);
        const k = easeOut(raw);
        const curl = Math.sin(raw * Math.PI) * a.placement.bend * g.goalWidth * 0.26;
        ballX = g.spot.x + (targetX - g.spot.x) * k + curl;
        ballY = g.spot.y + (targetY - g.spot.y) * k - Math.sin(raw * Math.PI) * H * (0.05 + a.placement.power * 0.06);
        ballR = g.ballR * (1 - 0.68 * k);
        const diveX = a.dive === -1 ? g.goalLeft + g.goalWidth * 0.22 : a.dive === 1 ? g.goalRight - g.goalWidth * 0.22 : W / 2;
        keeperX = W / 2 + (diveX - W / 2) * easeOut(Math.min(1, a.t / 16));
        keeperLean = (diveX - W / 2) / (W * 0.28);
        keeperDive = a.dive === 0 ? Math.min(0.35, a.t / 40) : Math.min(1, a.t / 17);
        pose = {
          t: now,
          headTrack: Math.max(-1, Math.min(1, (ballX - keeperX) / (g.goalWidth / 2))),
          react: rippleFired ? (a.goal ? "concede" : "save") : null,
          reactT: Math.max(0, Math.min(1, (a.t - tHit) / 11)),
        };
        if (raw < 1) trail.push(ballX, ballY);
        if (raw >= 1 && !rippleFired) {
          rippleFired = true;
          if (a.goal) {
            celebrate();
            particles.emit(targetX, targetY, "spark", 30);
            ripple = { x: targetX, y: targetY, age: 0 };
            shake.kick(12);
            hitstop.kick(0.8, 4);
            sfx.net();
            sfx.crowd(0.8);
            // Off-the-woodwork near miss that still went in: post ping + camera nudge.
            const nearPostL = a.placement.x <= 0.075;
            const nearPostR = a.placement.x >= 0.925;
            const nearBar = a.placement.y >= 0.9;
            if (nearPostL || nearPostR || nearBar) {
              sfx.post();
              shake.kick(16);
              const px = nearPostL ? g.goalLeft : nearPostR ? g.goalRight : targetX;
              const py = nearBar ? g.goalTop : targetY;
              particles.emit(px, py, "spark", 12);
            }
          } else {
            confirmBuzz();
            particles.emit(keeperX, g.goalTop + g.goalHeight * 0.62, "dust", 18);
            shake.kick(8);
            hitstop.kick(0.5, 3);
            sfx.save();
          }
        }
      } else {
        trail.clear();
        rippleFired = false;
        ripple = null;
        // Pre-shot theater: shuffle, settle (maybe off-centre, inviting a side),
        // then a gesture beat — all while the player lines up the shot.
        const plan = theaterRef.current;
        const age = plan ? now - theaterBornRef.current : 0;
        const settled = !plan || age > plan.settleDelay;
        const standTarget = plan && settled
          ? plan.stand * g.goalWidth * 0.13
          : Math.sin(now / 150) * g.goalWidth * 0.02;
        keeperIdleX += (standTarget - keeperIdleX) * 0.07;
        keeperX = W / 2 + keeperIdleX;
        keeperLean = keeperIdleX / (W * 0.4);
        pose = {
          t: now,
          headTrack: liveAim
            ? Math.max(-1, Math.min(1, (g.goalLeft + liveAim.x * g.goalWidth - keeperX) / (g.goalWidth / 2)))
            : Math.sin(now / 900) * 0.35,
          gesture: plan && settled && age < plan.settleDelay + 1100 ? plan.gesture : "none",
          pointDir: plan?.pointDir ?? 1,
        };
      }

      ctx.save();
      ctx.translate(sx, sy);
      drawArcadeBackdrop(ctx, W, H, left, right);
      drawGoal(ctx, g.goalLeft, g.goalTop, g.goalWidth, g.goalHeight, right.colors);
      if (ripple) {
        drawNetRipple(ctx, ripple.x, ripple.y, ripple.age, "rgba(184,255,78,");
        ripple.age += ts;
      }
      const keeperH = g.goalHeight * (W < 520 ? 0.52 : 0.6);
      drawKeeper(ctx, keeperX, g.goalTop + g.goalHeight * 0.76, g.goalWidth * (W < 520 ? 0.085 : 0.105), keeperLean, keeperH, keeperDive, right.colors[0], pose);

      if (!a && phaseRef.current === "shoot" && shotsRef.current.length < (levelRef.current ? LADDER_SHOTS : PENS)) {
        if (liveAim && aim) {
          drawAimPreview(ctx, g, liveAim, aim, H);
        }
        if (!promptDismissedRef.current && hintSeenRef.current && !drag) {
          drawSwipePrompt(ctx, W, H, g.spot.y - g.ballR * 1.15);
        }
      }

      if (a) trail.draw(ctx, ballR);
      drawBallShadow(ctx, ballX, g.spot.y + g.ballR * 0.75, ballR, a ? 0.75 : 0);
      drawBall(ctx, ballX, ballY, ballR, now / 90, a ? 1 : 0.92);
      if (ts > 0.5) particles.update();
      particles.draw(ctx);
      ctx.restore();

      if (a && ts > 0.5) setAnim((p) => (p ? { ...p, t: p.t + 1 } : p));
      raf = requestAnimationFrame(drawScene);
    }

    size();
    window.addEventListener("resize", size);
    canvas.addEventListener("pointerdown", onDown);
    canvas.addEventListener("pointermove", onMove);
    // Pointer capture routes the whole gesture (including release) to the
    // canvas, so pointerup lives on the captured element; the window listener
    // is only a fallback for browsers where capture fails (onUp is idempotent).
    canvas.addEventListener("pointerup", onUp);
    canvas.addEventListener("pointercancel", onCancel);
    window.addEventListener("pointerup", onUp);
    raf = requestAnimationFrame(drawScene);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", size);
      canvas.removeEventListener("pointerdown", onDown);
      canvas.removeEventListener("pointermove", onMove);
      canvas.removeEventListener("pointerup", onUp);
      canvas.removeEventListener("pointercancel", onCancel);
      window.removeEventListener("pointerup", onUp);
    };
  }, [phase, levelIndex, left.id, right.id]);

  useEffect(() => {
    if (!anim || anim.t < 35 || animDoneRef.current) return;
    animDoneRef.current = true;
    const finished = anim;
    setAnim(null);
    rollTheater();
    const nextShots = [...shotsRef.current, finished.placement.zone];
    const nextDetails = [...shotDetailsRef.current, finished.placement];
    const nextDives = [...keeperDivesRef.current, finished.dive];
    setShots(nextShots);
    setShotDetails(nextDetails);
    setKeeperDives(nextDives);
    const roundLimit = levelRef.current ? LADDER_SHOTS : PENS;
    if (nextShots.length >= roundLimit) {
      if (!duelMode) {
        const level = levelRef.current;
        const roundGoals = goalsForRound(nextDetails, nextDives, level);
        const nextTotal = totalGoalsRef.current + roundGoals;
        setTotalGoals(nextTotal);
        if (!level) {
          setTimeout(() => setPhase("result"), 420);
          return;
        }
        const cleared = roundGoals >= level.required;
        const completedLadder = cleared && levelIndexRef.current >= PENALTY_LADDER.length - 1;
        if (cleared && !completedLadder) {
          setTimeout(() => setPhase("level"), 420);
          return;
        }
        const final = { score: nextTotal, cleared: cleared ? level.rank : level.rank - 1, complete: completedLadder };
        setFinalRun(final);
        if (reportedScoreRef.current !== nextTotal) {
          reportedScoreRef.current = nextTotal;
          onGameOver?.(nextTotal);
        }
        setTimeout(() => setPhase("result"), 420);
        return;
      }
      setTimeout(() => setPhase("result"), 420);
    }
  }, [anim, duelMode, onGameOver]);

  function shootPlacement(placement: ShotPlacement, aimHoldMs = 0) {
    const limit = levelRef.current ? LADDER_SHOTS : PENS;
    if (anim || phase !== "shoot" || shotsRef.current.length >= limit) return;
    hapticTap();
    promptDismissedRef.current = true;
    if (!hintSeenRef.current) {
      hintSeenRef.current = true;
      setHintSeen(true);
      markHintSeen();
    }
    const idx = shotsRef.current.length;
    const level = levelRef.current;
    const difficulty = currentDifficulty();
    let dive = opponentDives
      ? opponentDives[idx] ?? 0
      : level
        ? ladderKeeperDive(placement, shotsRef.current, level)
        : readShooter(shotsRef.current).dive;
    if (!opponentDives) {
      // Mind games cut both ways. The theater stance implies a dive (bait the
      // invited side, or double-bluff)...
      const plan = theaterRef.current;
      if (plan && plan.stand !== 0 && Math.random() < 0.42 + difficulty * 0.25) {
        dive = plan.bias;
      }
      // ...and a long telegraphed aim lets sharper keepers read the reticle —
      // quick, decisive flicks stay unreadable.
      if (aimHoldMs > 700) {
        const readBonus = Math.min(0.5, ((aimHoldMs - 700) / 1400) * (0.3 + difficulty * 0.55));
        if (Math.random() < readBonus) dive = placement.zone;
      }
    }
    const goal = !shotSaved(placement, dive, level);
    sfx.kick(placement.power);
    animDoneRef.current = false;
    setAnim({ placement, dive, t: 0, goal });
  }
  shootRef.current = shootPlacement;

  function reset() {
    setLevelIndex(0);
    setTotalGoals(0);
    setFinalRun(null);
    setShots([]);
    setShotDetails([]);
    setKeeperDives([]);
    setAnim(null);
    reportedScoreRef.current = null;
    rollTheater();
    setPhase("shoot");
  }

  function nextCountry() {
    setLevelIndex((i) => Math.min(PENALTY_LADDER.length - 1, i + 1));
    setShots([]);
    setShotDetails([]);
    setKeeperDives([]);
    setAnim(null);
    rollTheater();
    setPhase("shoot");
    hapticTap();
  }

  function toggleMute() {
    const next = !muted;
    sfx.setMuted(next);
    setMutedState(next);
    hapticTap();
  }

  const me: DuelSide = { name: playerName, shots, dives: challengeDives, shotDetails };

  async function send(d: Duel, scoredLine: string) {
    hapticTap();
    const url = duelUrl(d);
    const text = `Penalty Duel on Golazo: ${scoredLine}. Your turn: ${url}`;
    try {
      if (navigator.share) {
        await navigator.share({ title: "Penalty Duel", text, url });
        return;
      }
    } catch {
      /* fall through */
    }
    try {
      await navigator.clipboard?.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* ignore */
    }
  }

  if (phase === "level" && ladderLevel && nextLevel) {
    return (
      <PenaltyResult
        cap={`${ladderLevel.team.flag} ${ladderLevel.team.name} beaten`}
        mine={goals}
        theirs={LADDER_SHOTS}
        opp={ladderLevel.team.name}
        scoreLine={`${goals}/${LADDER_SHOTS}`}
        sub={`Run ${totalGoals} goals · Next: ${nextLevel.team.flag} ${nextLevel.team.name}`}
        onAgain={nextCountry}
        againLabel={`Face ${nextLevel.team.short}`}
      />
    );
  }

  if (phase === "result") {
    if (viewingResult) {
      const r = resolveDuel(incoming!.a, incoming!.b!);
      const youAreA = incoming!.a.name === playerName;
      const mine = youAreA ? r.aGoals : r.bGoals;
      const theirs = youAreA ? r.bGoals : r.aGoals;
      const opp = youAreA ? incoming!.b!.name : incoming!.a.name;
      return (
        <PenaltyResult
          cap={mine > theirs ? "You win" : mine === theirs ? "Level" : `${opp} wins`}
          mine={mine}
          theirs={theirs}
          opp={opp}
          onAgain={undefined}
        />
      );
    }

    if (responding) {
      const duel: Duel = { a: incoming!.a, b: me };
      const r = resolveDuel(duel.a, duel.b!);
      const won = r.bGoals > r.aGoals;
      return (
        <PenaltyResult
          cap={won ? "You win" : r.aGoals === r.bGoals ? "Level" : `${incoming!.a.name} wins`}
          mine={r.bGoals}
          theirs={r.aGoals}
          opp={incoming!.a.name}
          onAgain={() => send(duel, `${r.bGoals}-${r.aGoals}`)}
          againLabel={copied ? "Copied" : `Send result to ${incoming!.a.name}`}
        />
      );
    }

    if (!duelMode) {
      const final = finalRun ?? { score: totalGoals, cleared: 0, complete: false };
      return (
        <PenaltyResult
          cap={final.complete ? "World class" : "Run over"}
          mine={final.score}
          theirs={LADDER_SHOTS * PENALTY_LADDER.length}
          opp="the top ten"
          scoreLine={`${final.score} goals`}
          sub={`${final.cleared}/${PENALTY_LADDER.length} countries cleared`}
          onAgain={reset}
          againLabel="Run it back"
        />
      );
    }

    return (
      <PenaltyResult
        cap={goals >= 4 ? "Ice cold" : goals >= 3 ? "You win" : "Keeper wins"}
        mine={goals}
        theirs={saves}
        opp="the keeper"
        onAgain={reset}
        againLabel="Again"
      />
    );
  }

  return (
    <div className="game-stage penalty-stage">
      <div className="pen-match-hud">
        <div className="pen-compact-row">
          <span>{ladderLevel ? `L${ladderLevel.rank}/${PENALTY_LADDER.length}` : left.flag}</span>
          <span>{right.flag} {right.short}</span>
          <strong>{goals}<i>-</i>{saves}</strong>
          <span>{ladderLevel ? `Need ${ladderLevel.required}` : right.flag}</span>
          <button className="pen-icon-btn" aria-label={muted ? "Unmute" : "Mute"} onClick={toggleMute}>{muted ? "🔇" : "🔊"}</button>
        </div>
        <div className="pen-dot-row" aria-label={`${goals} goals, ${saves} saves`}>
          {dots.map((dot, i) => <span key={i} className={`pen-round-dot is-${dot}`} />)}
        </div>
      </div>

      <canvas ref={canvasRef} className="game-canvas penalty-canvas" aria-label="Swipe up from the ball to shoot — curve your swipe to bend it" />

      {!hintSeen && (
        <div className="pen-hint" aria-hidden="true">
          <svg className="pen-hint-glyph" viewBox="0 0 48 64" width="34" height="46">
            <path d="M38 58 C18 50 14 34 22 8" fill="none" stroke="currentColor" strokeWidth="4" strokeLinecap="round" />
            <path d="M12 18 L22 5 L31 16" fill="none" stroke="currentColor" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <strong>Swipe up to shoot</strong>
          <span>curve your swipe to bend it</span>
        </div>
      )}
    </div>
  );
}

function PenaltyResult({
  cap,
  mine,
  theirs,
  opp,
  scoreLine,
  sub,
  onAgain,
  againLabel,
}: {
  cap: string;
  mine: number;
  theirs: number;
  opp: string;
  scoreLine?: string;
  sub?: string;
  onAgain?: () => void;
  againLabel?: string;
}) {
  return (
    <div className="game-stage pen-result">
      <div className="pen-final" onAnimationStart={() => celebrate()}>
        <span className="pen-final-cap">{cap}</span>
        <span className="pen-final-score">{scoreLine ?? `${mine} - ${theirs}`}</span>
        <span className="pen-final-sub">{sub ?? `You vs ${opp}`}</span>
      </div>
      {onAgain && <button className="cta wide" onClick={onAgain}>{againLabel ?? "Again"}</button>}
    </div>
  );
}

function drawArcadeBackdrop(
  ctx: CanvasRenderingContext2D,
  W: number,
  H: number,
  left: Team,
  right: Team,
): void {
  const pitchTop = H * 0.38;
  const sky = ctx.createLinearGradient(0, 0, 0, pitchTop);
  sky.addColorStop(0, "#071323");
  sky.addColorStop(1, "#163852");
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, W, pitchTop);

  ctx.fillStyle = "#142135";
  ctx.fillRect(0, H * 0.05, W, H * 0.2);
  const cols = ["#f4f6ff", left.colors[0], right.colors[0], "#25384d", right.colors[1]];
  const step = Math.max(5, W / 120);
  for (let y = H * 0.06; y < H * 0.24; y += step) {
    for (let x = 0; x < W; x += step) {
      const n = Math.sin(x * 13.4 + y * 7.7) * 10000;
      if (n - Math.floor(n) > 0.43) {
        ctx.globalAlpha = 0.35;
        ctx.fillStyle = cols[Math.abs(Math.floor(n)) % cols.length] ?? "#fff";
        ctx.fillRect(x, y, step * 0.72, step * 0.72);
      }
    }
  }
  ctx.globalAlpha = 1;

  const adsY = H * 0.31;
  const ads = ["#b8fff6", right.colors[0], right.colors[1], "#ffd21a"];
  for (let i = 0; i < ads.length; i++) {
    ctx.fillStyle = ads[i] ?? "#fff";
    ctx.fillRect((W / ads.length) * i, adsY, W / ads.length, H * 0.08);
  }
  const grass = ctx.createLinearGradient(0, pitchTop, 0, H);
  grass.addColorStop(0, "#34a43a");
  grass.addColorStop(0.55, "#1f812a");
  grass.addColorStop(1, "#0e4d1c");
  ctx.fillStyle = grass;
  ctx.fillRect(0, pitchTop, W, H - pitchTop);
  for (let i = 0; i < 15; i++) {
    ctx.fillStyle = i % 2 ? "rgba(255,255,255,0.025)" : "rgba(0,0,0,0.025)";
    const y = pitchTop + ((H - pitchTop) * i) / 15;
    ctx.fillRect(0, y, W, (H - pitchTop) / 15);
  }
  // Box line sits below the (taller) goal mouth, which now ends ≈0.54H.
  ctx.strokeStyle = "rgba(255,255,255,0.45)";
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(0, H * 0.59);
  ctx.lineTo(W, H * 0.57);
  ctx.stroke();
  const vignette = ctx.createRadialGradient(W / 2, H * 0.48, W * 0.2, W / 2, H * 0.48, W * 0.78);
  vignette.addColorStop(0, "rgba(0,0,0,0)");
  vignette.addColorStop(1, "rgba(0,0,0,0.24)");
  ctx.fillStyle = vignette;
  ctx.fillRect(0, 0, W, H);
}

function drawGoal(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, colors: [string, string]): void {
  ctx.save();
  ctx.fillStyle = "rgba(255,255,255,0.06)";
  ctx.fillRect(x, y, w, h);
  ctx.strokeStyle = "rgba(255,255,255,0.4)";
  ctx.lineWidth = 1.2;
  for (let gx = x; gx <= x + w; gx += w / 12) {
    ctx.beginPath();
    ctx.moveTo(gx, y);
    ctx.lineTo(gx + (gx - (x + w / 2)) * 0.05, y + h);
    ctx.stroke();
  }
  for (let gy = y; gy <= y + h; gy += h / 5) {
    ctx.beginPath();
    ctx.moveTo(x, gy);
    ctx.lineTo(x + w, gy);
    ctx.stroke();
  }
  ctx.strokeStyle = "#f7fbff";
  ctx.lineWidth = 6;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(x, y + h);
  ctx.lineTo(x, y);
  ctx.lineTo(x + w, y);
  ctx.lineTo(x + w, y + h);
  ctx.stroke();
  ctx.strokeStyle = colors[1];
  ctx.lineWidth = 2;
  ctx.globalAlpha = 0.75;
  ctx.beginPath();
  ctx.moveTo(x + 4, y + 4);
  ctx.lineTo(x + w - 4, y + 4);
  ctx.stroke();
  ctx.restore();
}

interface PenGeometry {
  goalLeft: number;
  goalRight: number;
  goalTop: number;
  goalHeight: number;
  goalWidth: number;
  goalBottom: number;
  spot: { x: number; y: number };
  ballR: number;
}

/**
 * Live aim affordance while the thumb is down: the drag vector from the ball,
 * the projected flight path (same math as the real shot, including curl), a
 * target reticle inside the goal, and a power gauge arc around the reticle.
 */
function drawAimPreview(
  ctx: CanvasRenderingContext2D,
  g: PenGeometry,
  placement: ShotPlacement,
  pointer: SwipePoint,
  H: number,
): void {
  const sx = g.spot.x;
  const sy = g.spot.y;
  const tx = g.goalLeft + placement.x * g.goalWidth;
  const ty = g.goalBottom - placement.y * g.goalHeight;
  const pNorm = Math.max(0, Math.min(1, (placement.power - 0.42) / 0.76));

  ctx.save();
  // Drag vector: ball → finger
  ctx.strokeStyle = "rgba(255,255,255,0.22)";
  ctx.lineWidth = 2;
  ctx.setLineDash([6, 7]);
  ctx.beginPath();
  ctx.moveTo(sx, sy);
  ctx.lineTo(pointer.x, pointer.y);
  ctx.stroke();
  ctx.setLineDash([]);

  // Projected trajectory — mirrors the real flight (easing, curl, loft), so
  // what you see is exactly what you get. Brighter + chunkier with power.
  const steps = 16;
  for (let i = 1; i <= steps; i++) {
    const raw = i / steps;
    const k = 1 - Math.pow(1 - raw, 3);
    const x = sx + (tx - sx) * k + Math.sin(raw * Math.PI) * placement.bend * g.goalWidth * 0.26;
    const y = sy + (ty - sy) * k - Math.sin(raw * Math.PI) * H * (0.05 + placement.power * 0.06);
    ctx.fillStyle = `rgba(255,255,255,${(0.38 + pNorm * 0.32) * (1 - raw * 0.45)})`;
    ctx.beginPath();
    ctx.arc(x, y, 3 + pNorm * 1.6 - raw * 1.2, 0, Math.PI * 2);
    ctx.fill();
  }

  // Target reticle inside the goal
  const r = Math.max(10, g.goalWidth * 0.045);
  ctx.strokeStyle = "rgba(184,255,78,0.92)";
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.arc(tx, ty, r, 0, Math.PI * 2);
  ctx.stroke();
  ctx.strokeStyle = "rgba(184,255,78,0.55)";
  ctx.lineWidth = 1.5;
  for (const [ox, oy] of [[-1, 0], [1, 0], [0, -1], [0, 1]] as const) {
    ctx.beginPath();
    ctx.moveTo(tx + ox * r * 0.55, ty + oy * r * 0.55);
    ctx.lineTo(tx + ox * r * 1.35, ty + oy * r * 1.35);
    ctx.stroke();
  }
  // Power gauge: arc that fills clockwise with shot power
  ctx.strokeStyle = "rgba(255,210,26,0.9)";
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(tx, ty, r + 5, -Math.PI / 2, -Math.PI / 2 + pNorm * Math.PI * 2);
  ctx.stroke();
  ctx.restore();
}

function drawSwipePrompt(ctx: CanvasRenderingContext2D, W: number, H: number, y: number): void {
  ctx.save();
  ctx.font = `900 ${Math.max(22, Math.min(40, W * 0.067))}px system-ui, sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.lineWidth = 5;
  ctx.strokeStyle = "rgba(0,38,80,0.7)";
  ctx.fillStyle = "rgba(245,250,255,0.95)";
  ctx.shadowColor = "rgba(0,0,0,0.45)";
  ctx.shadowBlur = 12;
  const text = "SWIPE UP TO SHOOT";
  ctx.strokeText(text, W / 2, Math.max(H * 0.58, y));
  ctx.fillText(text, W / 2, Math.max(H * 0.58, y));
  ctx.restore();
}
