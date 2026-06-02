import { describe, it, expect } from "vitest";
import {
  goals,
  resolveShootout,
  keeperDiveFor,
  encodeShootout,
  decodeShootout,
  shootoutUrl,
  readShootoutFromHash,
  type KickOutcome,
} from "./penalty";

const K = (s: string) => [...s] as KickOutcome[];

describe("scoring", () => {
  it("counts goals", () => {
    expect(goals(K("ggsmg"))).toBe(3);
    expect(goals(K("sssss"))).toBe(0);
  });
  it("resolves head-to-head", () => {
    expect(resolveShootout(K("gggg g".replace(" ", "")), K("ggsmg")).outcome).toBe("win");
    expect(resolveShootout(K("ggsmg"), K("ggggg")).outcome).toBe("lose");
    expect(resolveShootout(K("ggsmm"), K("gmgsm")).outcome).toBe("draw");
  });
});

describe("keeper determinism", () => {
  it("is stable for a seed+index and varies across kicks", () => {
    expect(keeperDiveFor("ABC123", 0)).toBe(keeperDiveFor("ABC123", 0));
    const dives = Array.from({ length: 5 }, (_, i) => keeperDiveFor("ABC123", i));
    expect(dives.every((d) => d === dives[0])).toBe(false); // not all identical
    expect(dives.every((d) => d >= -1 && d <= 1)).toBe(true);
  });
});

describe("challenge link", () => {
  it("round-trips a shootout", () => {
    const s = { seed: "AB12CD", name: "Sam", kicks: K("ggsmg") };
    expect(decodeShootout(encodeShootout(s))).toEqual(s);
  });
  it("reads from a hash and rejects others", () => {
    const url = shootoutUrl({ seed: "ZZ99", name: "Mo", kicks: K("gg") }, "https://x/");
    const hash = url.slice(url.indexOf("#"));
    expect(readShootoutFromHash(hash)).toMatchObject({ seed: "ZZ99", name: "Mo" });
    expect(readShootoutFromHash("#play=keepy~5~Sam")).toBeNull();
    expect(decodeShootout("nonsense")).toBeNull();
  });
});
