import type { ContainerApp } from '$lib/container/state';
import type { ToolTier, ToolTileApp } from './types';

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

/**
 * Marketplace catalogue row → ToolTileApp. Used by the homepage,
 * search, and category surfaces.
 */
export function launcherAppToToolTile(app: LauncherShape): ToolTileApp {
  return {
    slug: app.slug,
    name: app.name,
    blurb: app.tagline ?? app.description ?? null,
    category: app.category ?? null,
    iconUrl: app.iconUrl ?? null,
    themeColor: app.themeColor,
    kind: app.kind ?? null,
    firstPartySigned: app.firstPartySigned ?? false,
    badges: app.badges ?? [],
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
  return {
    slug: app.slug,
    name: app.name,
    blurb: app.description ?? null,
    category: app.category ?? null,
    iconUrl: null,
    themeColor: app.accent,
    glyph: app.icon ?? null,
    tier,
    firstPartySigned: false,
  };
}
