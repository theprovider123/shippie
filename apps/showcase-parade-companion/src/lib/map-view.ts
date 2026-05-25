import type { PixelPoint } from './geo';

export interface ViewportSize {
  width: number;
  height: number;
}

export interface MapView {
  scale: number;
  offset: PixelPoint;
}

export interface WorldBounds {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
}

export const MIN_MAP_SCALE = 1;
export const MAX_MAP_SCALE = 4.25;

export function clampMapZoom(value: number): number {
  if (!Number.isFinite(value)) return MIN_MAP_SCALE;
  return Math.max(MIN_MAP_SCALE, Math.min(MAX_MAP_SCALE, value));
}

export function clampMapOffset(next: PixelPoint, scale: number, size: ViewportSize | null): PixelPoint {
  if (!size || scale <= MIN_MAP_SCALE) return { x: 0, y: 0 };
  const minX = -size.width * (scale - 1);
  const minY = -size.height * (scale - 1);
  return {
    x: Math.min(0, Math.max(minX, next.x)),
    y: Math.min(0, Math.max(minY, next.y)),
  };
}

/**
 * Zoom while keeping the chosen screen point anchored under the finger/cursor.
 * This is the bit that makes mobile pinch and the +/- buttons feel like a real
 * map instead of a static image growing from the top-left corner.
 */
export function zoomMapAt(view: MapView, nextScaleRaw: number, focal: PixelPoint, size: ViewportSize | null): MapView {
  const scale = clampMapZoom(nextScaleRaw);
  if (!size || scale <= MIN_MAP_SCALE) return { scale: MIN_MAP_SCALE, offset: { x: 0, y: 0 } };

  const worldX = (focal.x - view.offset.x) / view.scale;
  const worldY = (focal.y - view.offset.y) / view.scale;
  const offset = clampMapOffset(
    {
      x: focal.x - worldX * scale,
      y: focal.y - worldY * scale,
    },
    scale,
    size,
  );
  return { scale, offset };
}

export function centerMapOnWorldPoint(worldPoint: PixelPoint, scaleRaw: number, size: ViewportSize | null): MapView {
  const scale = clampMapZoom(scaleRaw);
  if (!size || scale <= MIN_MAP_SCALE) return { scale: MIN_MAP_SCALE, offset: { x: 0, y: 0 } };
  const offset = clampMapOffset(
    {
      x: size.width / 2 - worldPoint.x * scale,
      y: size.height / 2 - worldPoint.y * scale,
    },
    scale,
    size,
  );
  return { scale, offset };
}

export function fitMapBounds(bounds: WorldBounds | null, size: ViewportSize | null, padding = 42): MapView {
  if (!bounds || !size) return { scale: MIN_MAP_SCALE, offset: { x: 0, y: 0 } };
  const width = Math.max(1, bounds.maxX - bounds.minX);
  const height = Math.max(1, bounds.maxY - bounds.minY);
  const innerWidth = Math.max(1, size.width - padding * 2);
  const innerHeight = Math.max(1, size.height - padding * 2);
  const scale = clampMapZoom(Math.min(innerWidth / width, innerHeight / height));
  const centre = {
    x: bounds.minX + width / 2,
    y: bounds.minY + height / 2,
  };
  return centerMapOnWorldPoint(centre, scale, size);
}

