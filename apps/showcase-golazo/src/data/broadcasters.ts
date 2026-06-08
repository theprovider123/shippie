// "Where's it on?" — a light, region-aware broadcaster hint per fixture. Not a live TV feed;
// just enough real-world texture so a viewer sees a plausible channel for their region. The
// region is inferred from the viewer's chosen watch timezone; the exact channel is pinned to
// the fixture id so it's stable. Defaults to FIFA+ (the genuine worldwide free stream).

export type Region = "UK" | "US" | "CA" | "MX" | "INTL";

const CHANNELS: Record<Region, string[]> = {
  UK: ["BBC One", "ITV1"],
  US: ["FOX", "Telemundo", "FS1"],
  CA: ["TSN", "CTV"],
  MX: ["Canal 5", "TUDN"],
  INTL: ["FIFA+"],
};

const REGION_LABEL: Record<Region, string> = {
  UK: "UK", US: "US", CA: "Canada", MX: "Mexico", INTL: "Worldwide",
};

/** Map a watch timezone (IANA, or "auto"/undefined) to a broadcast region. */
export function regionForZone(zone?: string): Region {
  if (!zone || zone === "auto") {
    try {
      zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    } catch {
      return "INTL";
    }
  }
  if (zone === "Europe/London") return "UK";
  if (zone.startsWith("America/")) {
    if (["America/Mexico_City", "America/Monterrey", "America/Merida", "America/Tijuana"].includes(zone)) return "MX";
    if (["America/Toronto", "America/Vancouver", "America/Edmonton", "America/Winnipeg", "America/Halifax"].includes(zone)) return "CA";
    return "US";
  }
  return "INTL";
}

function hashIndex(id: string, mod: number): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0) % mod;
}

export interface ChannelHint {
  name: string;
  region: Region;
  regionLabel: string;
}

/** A stable, region-appropriate broadcaster for a fixture. */
export function channelFor(fixtureId: string, watchZone?: string): ChannelHint {
  const region = regionForZone(watchZone);
  const list = CHANNELS[region];
  return { name: list[hashIndex(fixtureId, list.length)], region, regionLabel: REGION_LABEL[region] };
}
