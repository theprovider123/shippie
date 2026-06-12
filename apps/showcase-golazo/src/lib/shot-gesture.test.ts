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

describe("shot gesture", () => {
  it("detects curl from a curved upward swipe", () => {
    expect(curlFromSwipePath(fastCurve, 400)).toBeGreaterThan(0);
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
