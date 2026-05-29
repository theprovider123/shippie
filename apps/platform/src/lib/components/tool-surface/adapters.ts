import type { ContainerApp } from '$lib/container/state';
import {
  displayCategory,
  normaliseBlurb,
  titleCap,
} from '$lib/marketplace/display-text';
import { connectionBadgesFromKind } from '$lib/marketplace/connection-badges';
import type { ToolTier, ToolTileApp, ToolTileDisplay } from './types';

interface LauncherShape {
  slug: string;
  name: string;
  tagline?: string | null;
  description?: string | null;
  category?: string | null;
  iconUrl?: string | null;
  themeColor: string;
  kind?: import('$lib/types/app-kind').AppKind | null;
  firstPartySigned?: boolean;
  badges?: import('$server/marketplace/capability-badges').PublicCapabilityBadge[];
}

function buildDisplay(
  rawName: string,
  blurb: string | null,
  category: string | null,
  kind: import('$lib/types/app-kind').AppKind | null,
): ToolTileDisplay {
  const safeName = titleCap(rawName);
  return {
    safeName,
    categoryLabel: displayCategory(category),
    blurb: normaliseBlurb(blurb ?? `${safeName} on Shippie`),
    connectionBadges: connectionBadgesFromKind(kind),
  };
}

/**
 * Marketplace catalogue row → ToolTileApp. Used by the homepage,
 * search, and category surfaces. Display fields are precomputed so the
 * 60+ tiles on the launcher don't each re-run the same string work on
 * every reactive tick.
 */
export function launcherAppToToolTile(app: LauncherShape): ToolTileApp {
  const blurb = app.tagline ?? app.description ?? null;
  const category = app.category ?? null;
  const kind = app.kind ?? null;
  return {
    slug: app.slug,
    name: app.name,
    blurb,
    category,
    iconUrl: app.iconUrl ?? null,
    themeColor: app.themeColor,
    kind,
    firstPartySigned: app.firstPartySigned ?? false,
    badges: app.badges ?? [],
    display: buildDisplay(app.name, blurb, category, kind),
  };
}

/**
 * Curated container row → ToolTileApp. Container apps carry an emoji
 * glyph + accent colour rather than a raster icon, so we surface the
 * glyph and use `accent` as the theme colour so IconOrMonogram still
 * has a sensible square fallback.
 */
export function containerAppToToolTile(app: ContainerApp): ToolTileApp {
  const tier = (app.visibility ?? 'public') as ToolTier;
  const blurb = app.description ?? null;
  const category = app.category ?? null;
  return {
    slug: app.slug,
    name: app.name,
    blurb,
    category,
    iconUrl: null,
    themeColor: app.accent,
    glyph: app.icon ?? null,
    tier,
    firstPartySigned: false,
    display: buildDisplay(app.name, blurb, category, null),
  };
}
