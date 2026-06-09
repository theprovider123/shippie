# Showcase Overhaul — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Two independent showcase improvements — Golazo: full-screen first-person goal view with small keeper + precision placement; Coffee (lot.): performance fixes + liquid-splash background.

**Architecture:** Both showcases are self-contained Vite+React packages. No platform changes needed.

**Tech Stack:** React 18 hooks, Canvas 2D API, CSS custom properties.

---

## PART A: Golazo overhaul

### Task A1: Expand goal geometry in PenaltyDuel.tsx

**Objective:** Goal fills 92% of screen width (W*0.04→0.96), height increased to H*0.34. Keeper appears small (44% of goal height).

**Files:**
- Modify: `apps/showcase-golazo/src/components/games/PenaltyDuel.tsx`

The geometry variables appear in the render loop `frame()` function and in `placementFromPath()`.

- [ ] **Step 1: Update all goal constants**

In the `frame()` function and `placementFromPath()`, find and replace these constants:

```
// Old geometry:
const gy = H * 0.2, gl = W * 0.14, gr = W * 0.86, bh = H * 0.23;
const spotX = W / 2, spotY = H * 0.84;

// New geometry:
const gy = H * 0.12, gl = W * 0.04, gr = W * 0.96, bh = H * 0.34;
const spotX = W / 2, spotY = H * 0.88;
```

Both places that define these constants need the same update (in `frame()` and `placementFromPath()`).

- [ ] **Step 2: Update keeper size call**

Find: `drawKeeper(ctx, keeperX, gy + bh * 0.62, (gr - gl) * 0.12, lean, bh * 0.92, dive);`

Replace with: `drawKeeper(ctx, keeperX, gy + bh * 0.62, (gr - gl) * 0.14, lean, bh * 0.44, dive);`

The third arg `reachPx` is the save zone half-width (scales keeper arm span). The fifth arg `scale` is now 44% of goal height — makes keeper look small relative to the massive goal.

- [ ] **Step 3: Update zoneX function**

```ts
// Old: function zoneX(z: Zone) { const gl = W * 0.14, gr = W * 0.86; ...
// New: references the frame's gl/gr — but zoneX is a closure so update gl/gr there too:
function zoneX(z: Zone) { const gl = W * 0.04, gr = W * 0.96; return z === -1 ? gl + (gr - gl) * 0.16 : z === 1 ? gr - (gr - gl) * 0.16 : W / 2; }
```

- [ ] **Step 4: Update ball radius** to look proportionate against the larger goal:

```ts
// Old: const baseR = Math.min(W, H) * 0.052;
// New:
const baseR = Math.min(W, H) * 0.038;
```

- [ ] **Step 5: Update net grid lines** to match new goal bounds.

Find the net grid drawing code:
```ts
for (let x = gl; x <= gr; x += (gr - gl) / 12) { ... }
for (let y = gy; y <= gy + bh; y += bh / 4) { ... }
```

These use the local `gl, gr, gy, bh` so they update automatically once Step 1 is done. Verify visually.

- [ ] **Step 6: Update zone highlight rectangles**

Find: `const cx = zoneX(z), w = (gr - gl) / 3.4;`

Update zone count from 3 zones to 5 (left-post, left, centre, right, right-post):
```ts
// Replace the ZONES array at top of file:
const ZONES: { z: Zone; label: string }[] = [
  { z: -1, label: "Left" },
  { z: 0, label: "Centre" },
  { z: 1, label: "Right" },
];
// (keep as 3 zones — just ensure the highlight rects use updated gl/gr from frame scope)
```

- [ ] **Step 7: Commit**

```bash
git add apps/showcase-golazo/src/components/games/PenaltyDuel.tsx
git commit -m "feat(golazo): expand goal to 92% width, increase height to H*0.34, keeper at 44% scale"
```

---

### Task A2: Same geometry update in FreeKick.tsx

**Files:**
- Modify: `apps/showcase-golazo/src/components/games/FreeKick.tsx`

- [ ] **Step 1: Read FreeKick.tsx** and locate all `W * 0.14`, `W * 0.86`, `H * 0.23`, `H * 0.2` references. Apply the same changes as Task A1:

```
W * 0.14 → W * 0.04
W * 0.86 → W * 0.96
H * 0.23 → H * 0.34
H * 0.20 → H * 0.12   (goal top)
spotY = H * 0.84 → spotY = H * 0.88  (penalty spot further back)
```

- [ ] **Step 2: Update keeper call in FreeKick.tsx** to match PenaltyDuel's new scale:

Find the `drawKeeper(...)` call and update: `scale: bh * 0.92 → bh * 0.44`, `reachPx: (gr-gl) * 0.12 → (gr-gl) * 0.14`.

- [ ] **Step 3: Commit**

```bash
git add apps/showcase-golazo/src/components/games/FreeKick.tsx
git commit -m "feat(golazo): FreeKick — same 92% goal geometry as PenaltyDuel"
```

---

### Task A3: Enhanced keeper drawing — detailed anatomy

**Objective:** Replace the current `drawKeeper` in `stadium.ts` with a more detailed version: eyes, hair, cap, jersey number, gloves with wristband, boots with shin pads. Keep exact same function signature.

**Files:**
- Modify: `apps/showcase-golazo/src/lib/stadium.ts`

- [ ] **Step 1: Replace the `drawKeeper` function** (lines 248–301):

```ts
export function drawKeeper(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  reachPx: number,
  lean: number,
  scale: number,
  dive = 0,
  kit = "#f5a623",
): void {
  const dark = "#1a1208";
  const gloveCol = "#fff7e6";
  const skin = "#e8c9a0";
  const shirtNum = "#1a1208";
  const bootCol = "#111";
  const shinCol = "#ddd";

  // unit = consistent sizing denominator
  const u = scale * 0.18;
  const bodyW = u * 1.4;
  const bodyH = u * 2.1;
  const headR = u * 0.82;
  const shoulderY = -bodyH * 0.36;
  const hipY = bodyH * 0.24;
  const dir = lean === 0 ? 0 : lean > 0 ? 1 : -1;

  ctx.save();
  // Dive: arc off the line toward dive direction
  ctx.translate(
    cx + dir * dive * scale * 0.28,
    cy - Math.sin(dive * Math.PI) * scale * 0.38,
  );
  ctx.rotate(lean * 0.22 + dir * dive * (Math.PI * 0.38));

  // — LEGS + BOOTS —
  // Left leg
  ctx.fillStyle = dark;
  ctx.beginPath();
  ctx.roundRect(-bodyW * 0.42, hipY, bodyW * 0.33, u * 1.4, u * 0.18);
  ctx.fill();
  // Right leg
  ctx.beginPath();
  ctx.roundRect(bodyW * 0.09, hipY, bodyW * 0.33, u * 1.4, u * 0.18);
  ctx.fill();
  // Shin pads (white stripe on each leg)
  ctx.fillStyle = shinCol;
  ctx.fillRect(-bodyW * 0.36, hipY + u * 0.3, bodyW * 0.2, u * 0.55);
  ctx.fillRect(bodyW * 0.16, hipY + u * 0.3, bodyW * 0.2, u * 0.55);
  // Boots
  ctx.fillStyle = bootCol;
  ctx.beginPath(); ctx.ellipse(-bodyW * 0.26, hipY + u * 1.42, u * 0.38, u * 0.2, 0, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.ellipse(bodyW * 0.26, hipY + u * 1.42, u * 0.38, u * 0.2, 0, 0, Math.PI * 2); ctx.fill();

  // — TORSO (jersey) —
  ctx.fillStyle = kit;
  ctx.beginPath();
  ctx.roundRect(-bodyW / 2, shoulderY - u * 0.1, bodyW, bodyH * 0.56, u * 0.32);
  ctx.fill();
  // Jersey number "1"
  ctx.fillStyle = shirtNum;
  ctx.font = `bold ${u * 0.72}px system-ui, sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("1", 0, shoulderY + bodyH * 0.18);

  // — ARMS —
  const armLen = u * 0.22 * (scale / (u / 0.18)); // proportional to unit
  const actualArmLen = Math.max(reachPx * 0.72, bodyW * 0.9);
  const armRaiseY = shoulderY - u * 0.28;
  ctx.strokeStyle = kit;
  ctx.lineWidth = Math.max(5, u * 0.62);
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(-bodyW * 0.42, shoulderY);
  ctx.quadraticCurveTo(-actualArmLen * 0.55, armRaiseY - u * 0.2, -actualArmLen, armRaiseY);
  ctx.moveTo(bodyW * 0.42, shoulderY);
  ctx.quadraticCurveTo(actualArmLen * 0.55, armRaiseY - u * 0.2, actualArmLen, armRaiseY);
  ctx.stroke();
  // Gloves with wristband
  const gloveR = Math.max(u * 0.44, scale * 0.072);
  ctx.fillStyle = "#e8b84b"; // wristband
  ctx.beginPath(); ctx.arc(-actualArmLen, armRaiseY, gloveR * 1.08, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(actualArmLen, armRaiseY, gloveR * 1.08, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = gloveCol;
  ctx.beginPath(); ctx.arc(-actualArmLen, armRaiseY, gloveR, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(actualArmLen, armRaiseY, gloveR, 0, Math.PI * 2); ctx.fill();
  // Glove fingers (3 lines)
  ctx.strokeStyle = "rgba(0,0,0,0.25)";
  ctx.lineWidth = Math.max(1, u * 0.1);
  for (let i = -1; i <= 1; i++) {
    const gx1 = -actualArmLen + i * gloveR * 0.38, gy1 = armRaiseY - gloveR * 0.5;
    ctx.beginPath(); ctx.moveTo(gx1, gy1); ctx.lineTo(gx1, gy1 + gloveR * 0.8); ctx.stroke();
    const gx2 = actualArmLen + i * gloveR * 0.38;
    ctx.beginPath(); ctx.moveTo(gx2, gy1); ctx.lineTo(gx2, gy1 + gloveR * 0.8); ctx.stroke();
  }

  // — HEAD —
  ctx.fillStyle = skin;
  ctx.beginPath();
  ctx.arc(0, shoulderY - headR * 0.8, headR, 0, Math.PI * 2);
  ctx.fill();
  // Hair (dark cap on top half)
  ctx.fillStyle = dark;
  ctx.beginPath();
  ctx.arc(0, shoulderY - headR * 0.8, headR, Math.PI, Math.PI * 2);
  ctx.fill();
  // Cap peak
  ctx.fillStyle = "#c47a1a";
  ctx.beginPath();
  ctx.moveTo(-headR * 0.7, shoulderY - headR * 0.8);
  ctx.lineTo(headR * 0.7, shoulderY - headR * 0.8);
  ctx.lineTo(headR * 1.1, shoulderY - headR * 0.65);
  ctx.lineTo(-headR * 0.7, shoulderY - headR * 0.65);
  ctx.closePath();
  ctx.fill();
  // Eyes
  ctx.fillStyle = dark;
  ctx.beginPath(); ctx.arc(-headR * 0.3, shoulderY - headR * 0.72, headR * 0.12, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(headR * 0.3, shoulderY - headR * 0.72, headR * 0.12, 0, Math.PI * 2); ctx.fill();

  ctx.restore();
}
```

Note: `ctx.roundRect` is available in all modern browsers. If the build target is older, fall back to the existing `rr()` helper already in stadium.ts.

- [ ] **Step 2: Check for roundRect support** — if the canvas in the test env doesn't have it, use the existing `rr()` helper:

```bash
grep -n "roundRect" apps/showcase-golazo/src/lib/stadium.ts | head -5
```

If it's already used elsewhere it's fine. Otherwise swap the `ctx.beginPath(); ctx.roundRect(...)` calls to `rr(ctx, ...)`.

- [ ] **Step 3: Commit**

```bash
git add apps/showcase-golazo/src/lib/stadium.ts
git commit -m "feat(golazo): detailed keeper — cap, eyes, jersey number, wristband gloves, boots + shins"
```

---

### Task A4: Keeper pre-shot drift and mind games

**Objective:** Before each shot, keeper drifts slightly toward their preferred side and occasionally fakes.

**Files:**
- Modify: `apps/showcase-golazo/src/components/games/PenaltyDuel.tsx`
- Modify: `apps/showcase-golazo/src/lib/keeper.ts`

- [ ] **Step 1: Add `preDriftDir` and `fakePhase` to Keeper class**

In `keeper.ts`, add to the `Keeper` class:
```ts
preDriftDir = 0;     // -1 | 0 | 1 — the keeper's "lean" before the shot
preDriftFake = false; // will they snap back (feint) when diving?

/** Call before each round. Sets the keeper's pre-shot preference. */
prepareRound(rng: () => number = Math.random): void {
  this.preDriftDir = rng() < 0.4 ? 0 : rng() < 0.5 ? -1 : 1;
  this.preDriftFake = this.preDriftDir !== 0 && rng() < 0.3;
}
```

- [ ] **Step 2: Apply pre-drift in PenaltyDuel render loop**

In the `frame()` function, when `!a` (no shot in flight) and the phase is 'shoot', read `keeper.preDriftDir` and apply a small position offset to create the visual drift:

Add a `keeperPreDrift` ref and pulse it in the idle render:
```ts
// At top of component (outside useEffect):
const keeperRef = useRef<Keeper | null>(null);

// After keeper construction inside useEffect:
// keeperRef.current = keeper;  (if you add a keeper instance there)

// In frame() idle branch:
if (!a && phase === "shoot") {
  const driftX = (keeperPreDrift.dir ?? 0) * (gr - gl) * 0.04;
  // Add driftX to keeperX display
}
```

Since the Keeper class already has `preDriftDir`, just use it when rendering the idle keeper position — multiply by a small offset before drawing.

In the render, when `!a`:
```ts
const idleDrift = (keeper.preDriftDir ?? 0) * (gr - gl) * 0.035;
const displayKeeperX = keeper.x + idleDrift;
drawKeeper(ctx, displayKeeperX, gy + bh * 0.62, (gr - gl) * 0.14, lean + keeper.preDriftDir * 0.2, bh * 0.44, 0);
```

You'll need to make the `keeper` instance accessible in the render scope. The existing code creates the Keeper inside the `useEffect` — extract it to a `useRef` so the shot handler can call `keeper.prepareRound()`.

- [ ] **Step 3: Call `prepareRound()` at the start of each new shot**

After the `shoot` phase begins (or when `shots` increments after a result), call `keeperRef.current?.prepareRound()`.

- [ ] **Step 4: Commit**

```bash
git add apps/showcase-golazo/src/components/games/PenaltyDuel.tsx apps/showcase-golazo/src/lib/keeper.ts
git commit -m "feat(golazo): keeper pre-shot drift + 30% feint probability"
```

---

### Task A5: Keeper tests still pass

- [ ] **Run golazo tests**:

```bash
cd /Users/devante/Documents/Shippie/apps/showcase-golazo && bun test 2>&1 | grep -E "pass|fail|FAIL" | tail -10
```

Keeper.ts changes must not break `keeper.test.ts`. The `prepareRound` method is additive and doesn't change `commit`/`saved` behavior.

---

## PART B: Coffee app polish

### Task B1: Performance — viewport height + compositor fixes

**Objective:** Fix iOS jitter by switching `100vh` → `100dvh` everywhere, removing `transition: opacity` on `button:active` from the critical path, and adding `will-change: transform` to animated screens.

**Files:**
- Modify: `apps/showcase-coffee/src/styles.css`
- Scan all screen/component files for `100vh` usage

- [ ] **Step 1: Fix `button:active` transition in styles.css**

Current:
```css
button:active {
  opacity: 0.7;
  transition: opacity 0.08s;
}
```

Replace with:
```css
button:active {
  opacity: 0.7;
}
```

Remove the `transition` — it causes a layout recalculation on every tap on low-power devices.

- [ ] **Step 2: Add `will-change: transform` to animations**

In `.screen-enter` and `.slide-up`:
```css
.screen-enter {
  animation: fadeSlideIn 0.3s cubic-bezier(0.22, 0.68, 0, 1.2) both;
  will-change: transform;
}
.slide-up {
  animation: slideUpFadeIn 0.32s cubic-bezier(0.22, 0.68, 0, 1.2) both;
  will-change: transform;
}
```

- [ ] **Step 3: Find and replace `100vh` with `100dvh`**

```bash
grep -rn "100vh" apps/showcase-coffee/src/ | head -20
```

For every match, replace `100vh` with `100dvh`. This fixes the iOS Safari address-bar resize jitter.

- [ ] **Step 4: Add reduced-motion guard for grain**

```css
@media (prefers-reduced-motion: reduce) {
  body::before { display: none; }
  .screen-enter, .slide-up { animation: none; }
}
```

- [ ] **Step 5: Commit**

```bash
git add apps/showcase-coffee/src/styles.css
git commit -m "fix(coffee): 100dvh everywhere, remove button:active transition, will-change on animations"
```

---

### Task B2: CoffeeSplash background component

**Objective:** Two SVG liquid splash illustrations at very low opacity (espresso `#6b3a14` at 10–13%), animated on mount.

**Files:**
- Create: `apps/showcase-coffee/src/components/CoffeeSplash.tsx`
- Modify: `apps/showcase-coffee/src/App.tsx`
- Modify: `apps/showcase-coffee/src/styles.css`

- [ ] **Step 1: Create CoffeeSplash.tsx**

```tsx
export function CoffeeSplash() {
  return (
    <>
      {/* Large splash — bottom-right anchor */}
      <svg
        className="coffee-splash coffee-splash-large"
        viewBox="0 0 240 240"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden="true"
      >
        <g fill="#6b3a14">
          {/* Main blob */}
          <path d="M120,20 C200,10 260,80 230,155 C200,230 120,250 60,200 C0,150 -20,60 60,20 C80,12 100,22 120,20Z" opacity="0.9" />
          {/* Droplets scattered around */}
          <circle cx="218" cy="80" r="14" opacity="0.85" />
          <circle cx="232" cy="130" r="10" opacity="0.8" />
          <circle cx="190" cy="205" r="12" opacity="0.75" />
          <circle cx="75" cy="215" r="9" opacity="0.7" />
          <circle cx="45" cy="170" r="7" opacity="0.8" />
          <circle cx="155" cy="18" r="8" opacity="0.7" />
          {/* Highlight */}
          <ellipse cx="95" cy="75" rx="38" ry="22" fill="rgba(255,210,160,0.18)" transform="rotate(-22,95,75)" />
        </g>
      </svg>

      {/* Small splash — top-left anchor */}
      <svg
        className="coffee-splash coffee-splash-small"
        viewBox="0 0 120 120"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden="true"
      >
        <g fill="#6b3a14">
          <path d="M60,8 C100,5 125,40 110,75 C95,110 55,120 25,100 C-5,80 -5,30 25,12 C38,5 50,10 60,8Z" opacity="0.9" />
          <circle cx="112" cy="38" r="8" opacity="0.8" />
          <circle cx="105" cy="68" r="6" opacity="0.75" />
          <circle cx="30" cy="108" r="5" opacity="0.7" />
          <ellipse cx="42" cy="38" rx="18" ry="10" fill="rgba(255,210,160,0.18)" transform="rotate(-18,42,38)" />
        </g>
      </svg>
    </>
  );
}
```

- [ ] **Step 2: Add CSS for the splashes in styles.css**

```css
.coffee-splash {
  position: fixed;
  pointer-events: none;
  z-index: 0;
  opacity: 0;
  animation: splashEnter 1.2s ease forwards;
}

@keyframes splashEnter {
  from { opacity: 0; transform: scale(0.97); }
  to   { opacity: 0.12; transform: scale(1); }
}

.coffee-splash-large {
  bottom: -8vw;
  right: -8vw;
  width: 48vw;
  max-width: 260px;
}

.coffee-splash-small {
  top: -4vw;
  left: -4vw;
  width: 24vw;
  max-width: 130px;
  animation-delay: 0.3s;
}

@media (prefers-reduced-motion: reduce) {
  .coffee-splash { animation: none; opacity: 0.10; }
}
```

- [ ] **Step 3: Add CoffeeSplash to App.tsx**

In `App.tsx`, import and render the splash behind the main app content:

```tsx
import { CoffeeSplash } from './components/CoffeeSplash.tsx';

// Inside return() — place before the main content wrapper:
return (
  <>
    <CoffeeSplash />
    {/* existing content */}
  </>
);
```

Make sure the splash sits at `z-index: 0` and all content is at `z-index: 1` or above. Check that the main app wrapper has `position: relative; z-index: 1`.

- [ ] **Step 4: Commit**

```bash
git add apps/showcase-coffee/src/components/CoffeeSplash.tsx apps/showcase-coffee/src/App.tsx apps/showcase-coffee/src/styles.css
git commit -m "feat(coffee): CoffeeSplash SVG background — espresso liquid splash at 0.12 opacity, 1.2s mount animation"
```

---

### Task B3: useMemo for derived store values

**Objective:** Prevent full re-renders on every store update by memoising the expensive derived values from `store`.

**Files:**
- Modify: `apps/showcase-coffee/src/App.tsx`

- [ ] **Step 1: Read current derived usage** in App.tsx

Look for calls to `bagsByStatus(store.bags)`, `brewsForBag(store.brews, ...)`, `scoresForBag(store.scores, ...)` and how many times each fires per render.

- [ ] **Step 2: Add useMemo wrappers**

After the `useState<Store>` line, add:
```tsx
const derivedBags = useMemo(() => bagsByStatus(store.bags), [store.bags]);
const activeBag = useMemo(
  () => store.bags.find((b) => b.id === activeBagId) ?? null,
  [store.bags, activeBagId],
);
const activeBagBrews = useMemo(
  () => activeBagId ? brewsForBag(store.brews, activeBagId) : [],
  [store.brews, activeBagId],
);
const activeBagScores = useMemo(
  () => activeBagId ? scoresForBag(store.scores, activeBagId) : [],
  [store.scores, activeBagId],
);
```

Then replace inline calls like `bagsByStatus(store.bags)` with `derivedBags`, etc. throughout the JSX.

- [ ] **Step 3: Commit**

```bash
git add apps/showcase-coffee/src/App.tsx
git commit -m "perf(coffee): useMemo for derived store values to reduce re-renders"
```

---

### Task B4: Health check — build both showcases

- [ ] **Run platform typecheck + tests**:

```bash
cd /Users/devante/Documents/Shippie && bun run typecheck 2>&1 | tail -10 && bun run test 2>&1 | grep -E "pass|fail|FAIL" | tail -10
```

- [ ] **Build golazo**:

```bash
cd /Users/devante/Documents/Shippie/apps/showcase-golazo && bun run build 2>&1 | tail -15
```

- [ ] **Build coffee**:

```bash
cd /Users/devante/Documents/Shippie/apps/showcase-coffee && bun run build 2>&1 | tail -15
```

Fix any build errors (likely `roundRect` type issues in golazo if the tsconfig targets older browsers).
