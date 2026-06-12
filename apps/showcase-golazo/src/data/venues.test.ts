import { describe, expect, it } from "vitest";
import { VENUES, venueFor } from "./venues";
import { channelFor, regionForZone } from "./broadcasters";

describe("venueFor", () => {
  it("has the 16 host venues", () => {
    expect(VENUES).toHaveLength(16);
  });
  it("is stable for a given fixture id", () => {
    expect(venueFor("G-A-1")).toEqual(venueFor("G-A-1"));
  });
  it("uses official venue data for World Cup fixture ids", () => {
    expect(venueFor("m01")).toMatchObject({
      stadium: "Mexico City Stadium",
      city: "Mexico City",
      country: "MEX",
      tz: "America/Mexico_City",
    });
    expect(venueFor("400021449")).toMatchObject({
      stadium: "Toronto Stadium",
      city: "Toronto",
    });
  });
  it("spreads fixtures across multiple venues", () => {
    const used = new Set(["a", "b", "c", "d", "e", "f", "g", "h", "i", "j"].map((s) => venueFor(`G-${s}-1`).stadium));
    expect(used.size).toBeGreaterThan(1);
  });
});

describe("regionForZone", () => {
  it("maps known zones to regions", () => {
    expect(regionForZone("Europe/London")).toBe("UK");
    expect(regionForZone("America/New_York")).toBe("US");
    expect(regionForZone("America/Toronto")).toBe("CA");
    expect(regionForZone("America/Mexico_City")).toBe("MX");
    expect(regionForZone("Asia/Tokyo")).toBe("INTL");
  });
});

describe("channelFor", () => {
  it("returns a UK broadcaster for a London viewer, stable per fixture", () => {
    const c = channelFor("G-A-1", "Europe/London");
    expect(["BBC One", "ITV1"]).toContain(c.name);
    expect(channelFor("G-A-1", "Europe/London").name).toBe(c.name);
    expect(c.region).toBe("UK");
  });
  it("falls back to FIFA+ worldwide", () => {
    expect(channelFor("G-A-1", "Asia/Tokyo")).toMatchObject({ name: "FIFA+", region: "INTL" });
  });
});
