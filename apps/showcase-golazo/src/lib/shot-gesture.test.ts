import { describe, expect, it } from "vitest";
import {
  curlFromSwipePath,
  penaltyPlacementFromSwipe,
  swipeMetrics,
  type SwipePoint,
} from "./shot-gesture";

const fastCurve: SwipePoint[] = [
  { x: 200, y: 520, t: 0 },
  { x: 236, y: 450, t: 28 },
  { x: 254, y: 360, t: 58 },
  { x: 248, y: 250, t: 92 },
];

/** Gentle thumb arc: ~10px of lateral deviation over a half-screen flick. */
const gentleCurve: SwipePoint[] = [
  { x: 200, y: 520, t: 0 },
  { x: 212, y: 450, t: 28 },
  { x: 216, y: 360, t: 58 },
  { x: 210, y: 250, t: 92 },
];

/** A wild zig-zag scribble — should clamp, not explode. */
const scribble: SwipePoint[] = [
  { x: 200, y: 520, t: 0 },
  { x: 320, y: 470, t: 20 },
  { x: 80, y: 430, t: 40 },
  { x: 330, y: 380, t: 60 },
  { x: 70, y: 330, t: 80 },
  { x: 310, y: 280, t: 100 },
  { x: 200, y: 240, t: 120 },
];

describe("shot gesture", () => {
  it("detects curl from a curved upward swipe", () => {
    expect(curlFromSwipePath(fastCurve, 400)).toBeGreaterThan(0);
  });

  it("gives a strongly curved swipe heavy, near-max bend", () => {
    // pins the 0.085 sensitivity: this arc used to read ~0.50, now ~0.71
    expect(curlFromSwipePath(fastCurve, 400)).toBeCloseTo(0.71, 1);
  });

  it("makes a moderately curved thumb swipe produce visible bend", () => {
    const curl = curlFromSwipePath(gentleCurve, 400);
    expect(curl).toBeGreaterThan(0.2);
    expect(curl).toBeLessThan(0.5);
  });

  it("clamps extreme scribbles instead of breaking placement", () => {
    const curl = curlFromSwipePath(scribble, 400);
    expect(Math.abs(curl)).toBeLessThanOrEqual(1);
    const placement = penaltyPlacementFromSwipe(
      scribble,
      { left: 16, right: 384, top: 72, height: 204 },
      { x: 200, y: 528 },
      { width: 400, height: 600 },
      0,
    );
    expect(placement).not.toBeNull();
    expect(Math.abs(placement!.bend)).toBeLessThanOrEqual(1);
  });

  it("lets a short quick swipe carry shot power", () => {
    const metrics = swipeMetrics(
      [
        { x: 200, y: 520, t: 0 },
        { x: 218, y: 410, t: 70 },
      ],
      400,
      600,
    );
    expect(metrics.power).toBeGreaterThan(0.55);
  });

  it("maps penalty swipes from the gesture start, not absolute tap zones", () => {
    const placement = penaltyPlacementFromSwipe(
      fastCurve,
      { left: 16, right: 384, top: 72, height: 204 },
      { x: 200, y: 528 },
      { width: 400, height: 600 },
      0,
    );
    expect(placement).not.toBeNull();
    expect(placement!.x).toBeGreaterThan(0.55);
    expect(placement!.power).toBeGreaterThan(0.6);
    expect(placement!.bend).toBeGreaterThan(0);
  });
});
