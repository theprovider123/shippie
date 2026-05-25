import { useEffect, useMemo, useRef, useState } from 'react';
import type { MapExtent, RoutePack, RoutePoi, RoutePoiKind } from '../data/parade-2026';
import type { BusMarker } from '../lib/bus';
import {
  clusterFanEvents,
  FAN_EVENT_BADGES,
  FAN_EVENT_LABELS,
  isActive,
  reportConfidenceText,
  type FanEvent,
  type FanEventCluster,
  type FanEventType,
} from '../lib/fan-events';
import { lngLatToPixel, metersToPixelRadius, type PixelPoint } from '../lib/geo';
import type { GpsFix } from '../lib/gps';
import type { GroupPlan, PlanPoint } from '../lib/group-plan';
import { chipForGroupName, type SideTing } from '../lib/side-tings';
import type { MapLayerId } from './LayerToggleRow';

/**
 * Place categories (toilet/water/atm) are filtered by their
 * corresponding LayerToggleRow toggle. Core categories (landmark, station,
 * tube-exit, medical, exit, stewards, meeting) always render. Family pockets
 * and view suggestions stay out of the base canvas until quick-find asks for
 * them; otherwise first load becomes a field of unlabeled dots.
 */
function placeLayerForKind(kind: RoutePoiKind): MapLayerId | null {
  if (kind === 'toilet') return 'toilets';
  if (kind === 'water') return 'water';
  if (kind === 'atm') return 'atm';
  return null;
}

interface CorridorMapProps {
  pack: RoutePack;
  gpsFix?: GpsFix | null;
  plan?: GroupPlan | null;
  busMarkers?: BusMarker[];
  fanEvents?: FanEvent[];
  sideTings?: SideTing[];
  layers?: Partial<Record<MapLayerId, boolean>>;
  target?: PlanPoint | null;
  compact?: boolean;
  /**
   * Optional: extra POIs to render this frame regardless of layer state
   * (used by the quick-find chips to surface tube-exits / family / view that
   * are normally hidden, without flipping every place layer on).
   */
  extraPois?: RoutePoi[];
  /**
   * Optional: callback when a baked POI is tapped on the canvas. MapScreen
   * uses this to open the POI bottom sheet.
   */
  onPoiTap?: (poi: RoutePoi) => void;
}

export function CorridorMap({
  pack,
  gpsFix,
  plan,
  busMarkers = [],
  fanEvents = [],
  sideTings = [],
  layers = {},
  target,
  compact = false,
  extraPois,
  onPoiTap,
}: CorridorMapProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const frameRef = useRef<HTMLDivElement | null>(null);
  const pointers = useRef(new Map<number, PixelPoint>());
  const lastDrag = useRef<PixelPoint | null>(null);
  const lastPinchDistance = useRef<number | null>(null);
  const [scale, setScale] = useState(1);
  const [offset, setOffset] = useState<PixelPoint>({ x: 0, y: 0 });
  // Every spatial calculation in this component projects via the *pack's*
  // map extent — round 10's multi-pack support depends on this not falling
  // back to the global Islington default.
  const extent = pack.mapExtent;
  const basemapSrc = `${import.meta.env.BASE_URL}basemap/corridor.webp`;
  const fanClusters = useMemo(() => clusterFanEvents(fanEvents), [fanEvents]);
  const visibleFanClusters = useMemo(
    () => fanClusters.filter((cluster) => layerAllowsCluster(cluster.type, layers)),
    [fanClusters, layers],
  );
  const localPresencePulse = useMemo(() => {
    if (layers['my-taps'] === false) return null;
    const event = fanEvents
      .filter((item) => item.type === 'presence' && item.source === 'local' && isActive(item))
      .sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at))[0];
    if (!event) return null;
    const p = lngLatToPixel({ lng: event.lng, lat: event.lat }, extent);
    return {
      left: `${(p.x / extent.pxWidth) * 100}%`,
      top: `${(p.y / extent.pxHeight) * 100}%`,
    };
  }, [fanEvents, layers, extent]);
  const hasFanBus = visibleFanClusters.some((cluster) => cluster.type === 'bus_seen');
  const summaryId = compact ? 'corridor-map-summary-compact' : 'corridor-map-summary';
  const mapSummary = useMemo(
    () => buildMapSummary(gpsFix, visibleFanClusters, layers.bus === false ? 0 : busMarkers.length),
    [busMarkers.length, gpsFix, layers.bus, visibleFanClusters],
  );

  /**
   * Visible baked POIs (interactive — get hit zones + sheet on tap).
   * Includes anything passed as `extraPois` (the quick-find surface).
   */
  const visiblePois = useMemo<RoutePoi[]>(() => {
    const seen = new Set<string>();
    const out: RoutePoi[] = [];
    for (const poi of pack.pois) {
      if (poi.kind === 'food' || poi.kind === 'pub') continue;
      if (poi.kind === 'family' || poi.kind === 'view') continue;
      const layer = placeLayerForKind(poi.kind);
      if (layer && layers[layer] === false) continue;
      if (seen.has(poi.id)) continue;
      seen.add(poi.id);
      out.push(poi);
    }
    if (extraPois) {
      for (const poi of extraPois) {
        if (seen.has(poi.id)) continue;
        seen.add(poi.id);
        out.push(poi);
      }
    }
    return out;
  }, [pack.pois, layers, extraPois]);

  const points = useMemo(() => {
    const out: Array<{ id: string; label: string; kind: string; point: PixelPoint }> = [];
    for (const poi of visiblePois) {
      out.push({ id: poi.id, label: poi.name, kind: poi.kind, point: lngLatToPixel(poi, extent) });
    }
    if (plan) {
      out.push({ id: 'plan-primary', label: plan.primary.label, kind: 'primary', point: lngLatToPixel(plan.primary, extent) });
      out.push({ id: 'plan-fallback', label: plan.fallback.label, kind: 'fallback', point: lngLatToPixel(plan.fallback, extent) });
    }
    if (target) out.push({ id: 'target', label: target.label, kind: 'target', point: lngLatToPixel(target, extent) });
    return out;
  }, [visiblePois, plan, target, extent]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    canvas.width = extent.pxWidth;
    canvas.height = extent.pxHeight;
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    drawRoute(ctx, pack.route.coordinates, extent);
    if (visibleFanClusters.length > 0) drawFanEvents(ctx, visibleFanClusters, extent);
    if (layers['side-tings'] !== false && sideTings.length > 0) drawSideTings(ctx, sideTings, extent);
    if (gpsFix && target) drawWalkLine(ctx, gpsFix, target, extent);
    drawPois(ctx, points, scale);
    drawScheduleMarkers(ctx, pack.scheduleEstimate, extent);
    if (layers.bus !== false && busMarkers.length > 0 && !hasFanBus) drawBusMarkers(ctx, busMarkers, extent);
    if (gpsFix) drawGps(ctx, gpsFix, extent);
  }, [pack, points, busMarkers, visibleFanClusters, gpsFix, hasFanBus, layers, sideTings, target, scale, extent]);

  const clampZoom = (value: number) => Math.max(1, Math.min(3.2, value));

  const zoom = (next: number) => {
    setScale((current) => {
      const clamped = clampZoom(next);
      if (clamped === 1) setOffset({ x: 0, y: 0 });
      return clamped;
    });
  };

  const onPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    // POI hit zones live inside the frame; their click handler opens the
    // sheet. Don't capture the pointer in that case — capture would steal
    // subsequent events from the button.
    if ((event.target as HTMLElement | null)?.closest('[data-poi-hit]')) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    lastDrag.current = { x: event.clientX, y: event.clientY };
  };

  const onPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!pointers.current.has(event.pointerId)) return;
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    const active = [...pointers.current.values()];
    if (active.length >= 2) {
      const distance = Math.hypot(active[0]!.x - active[1]!.x, active[0]!.y - active[1]!.y);
      if (lastPinchDistance.current) zoom(scale * (distance / lastPinchDistance.current));
      lastPinchDistance.current = distance;
      return;
    }
    if (scale <= 1 || !lastDrag.current) return;
    const dx = event.clientX - lastDrag.current.x;
    const dy = event.clientY - lastDrag.current.y;
    lastDrag.current = { x: event.clientX, y: event.clientY };
    setOffset((current) => clampOffset({ x: current.x + dx, y: current.y + dy }, scale, frameRef.current));
  };

  const onPointerUp = (event: React.PointerEvent<HTMLDivElement>) => {
    pointers.current.delete(event.pointerId);
    lastDrag.current = null;
    lastPinchDistance.current = null;
  };

  return (
    <div className={`corridor-map ${compact ? 'compact' : ''}`}>
      <div
        ref={frameRef}
        className="corridor-map__frame"
        role="img"
        aria-describedby={summaryId}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      >
        <div
          className="corridor-map__world"
          style={{ transform: `translate(${offset.x}px, ${offset.y}px) scale(${scale})` }}
        >
          <img src={basemapSrc} alt="Offline map of the central Islington parade corridor" draggable={false} />
          <canvas ref={canvasRef} aria-hidden />
          {localPresencePulse ? (
            <div className="my-presence-pulse" style={localPresencePulse} aria-hidden="true">
              <span />
              <strong>Here</strong>
            </div>
          ) : null}
          {onPoiTap ? (
            <div className="poi-hit-layer" aria-hidden>
              {visiblePois.map((poi) => {
                const p = lngLatToPixel(poi, extent);
                const leftPct = (p.x / extent.pxWidth) * 100;
                const topPct = (p.y / extent.pxHeight) * 100;
                return (
                  <button
                    key={poi.id}
                    type="button"
                    data-poi-hit
                    className="poi-hit"
                    style={{ left: `${leftPct}%`, top: `${topPct}%` }}
                    aria-label={`${poi.name} — open detail`}
                    onClick={(event) => {
                      event.stopPropagation();
                      onPoiTap(poi);
                    }}
                  />
                );
              })}
            </div>
          ) : null}
        </div>
      </div>
      <p id={summaryId} className="sr-only">
        {mapSummary}
      </p>
      <div className="corridor-map__controls" aria-label="Map controls">
        <button type="button" className="icon-button" onClick={() => zoom(scale + 0.35)} aria-label="Zoom in">
          +
        </button>
        <button type="button" className="icon-button" onClick={() => zoom(scale - 0.35)} aria-label="Zoom out">
          -
        </button>
        {scale > 1 || offset.x !== 0 || offset.y !== 0 ? (
          <button
            type="button"
            className="icon-button"
            onClick={() => {
              setScale(1);
              setOffset({ x: 0, y: 0 });
            }}
            aria-label="Re-center map"
          >
            ⊙
          </button>
        ) : null}
      </div>
      <p className="map-credit">Offline schematic. Verify official route before travel.</p>
    </div>
  );
}

function drawRoute(ctx: CanvasRenderingContext2D, route: readonly [number, number][], extent: MapExtent) {
  if (route.length < 2) return;
  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.lineWidth = 48;
  ctx.strokeStyle = 'rgba(245, 239, 228, 0.7)';
  drawPolyline(ctx, route, extent);
  ctx.stroke();
  ctx.lineWidth = 34;
  ctx.strokeStyle = 'rgba(239, 1, 7, 0.22)';
  drawPolyline(ctx, route, extent);
  ctx.stroke();
  ctx.lineWidth = 16;
  ctx.strokeStyle = '#EF0107';
  drawPolyline(ctx, route, extent);
  ctx.stroke();
  ctx.restore();
}

function drawPolyline(ctx: CanvasRenderingContext2D, route: readonly [number, number][], extent: MapExtent) {
  route.forEach(([lng, lat], index) => {
    const p = lngLatToPixel({ lng, lat }, extent);
    if (index === 0) ctx.moveTo(p.x, p.y);
    else ctx.lineTo(p.x, p.y);
  });
}

function drawPois(
  ctx: CanvasRenderingContext2D,
  points: Array<{ id: string; label: string; kind: string; point: PixelPoint }>,
  scale: number,
) {
  ctx.save();
  ctx.font = '700 28px system-ui, sans-serif';
  ctx.textBaseline = 'middle';
  for (const marker of points) {
    const style = poiStyleForKind(marker.kind);
    ctx.beginPath();
    ctx.arc(marker.point.x, marker.point.y, style.radius, 0, Math.PI * 2);
    ctx.fillStyle = style.fill;
    ctx.fill();
    ctx.lineWidth = style.lineWidth;
    ctx.strokeStyle = style.stroke;
    ctx.stroke();
    if (style.glyph) {
      ctx.fillStyle = style.glyphColor;
      ctx.font = `700 ${style.glyphSize}px "JetBrains Mono", ui-monospace, monospace`;
      ctx.textAlign = 'center';
      ctx.fillText(style.glyph, marker.point.x, marker.point.y + style.glyphSize * 0.35);
      ctx.textAlign = 'start';
    }
    if (!shouldShowMarkerLabel(marker, style)) continue;
    // Hide small POI labels (water/atm/toilet) at the default zoom — their
    // glyph + dot is enough until the user zooms in. Keeps the schematic
    // readable instead of a wall of overlapping text at zoom 1.
    if (isSmallPoiKind(marker.kind) && scale < 1.5) continue;
    const label = mapLabelText(marker);
    if (style.smallLabel) drawMiniLabel(ctx, label, marker.point.x + style.radius + 14, marker.point.y, style.labelTone);
    else drawLabel(ctx, label, marker.point.x + style.radius + 18, marker.point.y);
  }
  ctx.restore();
}

function isSmallPoiKind(kind: string): boolean {
  return kind === 'toilet' || kind === 'water' || kind === 'atm' || kind === 'family' || kind === 'view';
}

/**
 * Visual style per POI kind. Place categories (toilet/water/atm)
 * draw smaller than the core landmarks and carry a single mono-glyph (T, W,
 * $) so the map stays scannable without leaning on icon files.
 */
function poiStyleForKind(kind: string): {
  radius: number;
  fill: string;
  stroke: string;
  lineWidth: number;
  glyph?: string;
  glyphSize: number;
  glyphColor: string;
  showLabel: boolean;
  smallLabel?: boolean;
  labelTone?: 'default' | 'transit' | 'landmark';
} {
  const base = {
    glyphSize: 22,
    glyphColor: '#14120F',
    showLabel: false,
  };
  if (kind === 'primary' || kind === 'target') {
    return { ...base, radius: 34, fill: '#EF0107', stroke: '#14120F', lineWidth: 8, showLabel: true };
  }
  if (kind === 'fallback') {
    return { ...base, radius: 24, fill: '#14120F', stroke: '#14120F', lineWidth: 8, showLabel: true };
  }
  if (kind === 'medical') return { ...base, radius: 22, fill: '#C40006', stroke: '#14120F', lineWidth: 6, glyph: '+', glyphSize: 26, glyphColor: '#F5EFE4', showLabel: true, smallLabel: true, labelTone: 'landmark' };
  if (kind === 'stewards') return { ...base, radius: 22, fill: '#EDBB4A', stroke: '#14120F', lineWidth: 6, glyph: 'S', glyphSize: 22 };
  if (kind === 'station' || kind === 'tube-exit') return { ...base, radius: 24, fill: '#F5EFE4', stroke: '#14120F', lineWidth: 6, glyph: '◉', glyphSize: 22, showLabel: kind === 'station', smallLabel: true, labelTone: 'transit' };
  if (kind === 'exit') return { ...base, radius: 22, fill: '#F5EFE4', stroke: '#14120F', lineWidth: 6, glyph: '↗', glyphSize: 26, showLabel: true, smallLabel: true, labelTone: 'landmark' };
  if (kind === 'toilet') return { ...base, radius: 16, fill: '#F5EFE4', stroke: '#5E7B5C', lineWidth: 4, glyph: 'T', glyphSize: 14, glyphColor: '#5E7B5C' };
  if (kind === 'water') return { ...base, radius: 16, fill: '#F5EFE4', stroke: '#5E7B5C', lineWidth: 4, glyph: '~', glyphSize: 14, glyphColor: '#5E7B5C' };
  if (kind === 'atm') return { ...base, radius: 16, fill: '#F5EFE4', stroke: '#14120F', lineWidth: 4, glyph: '$', glyphSize: 14 };
  if (kind === 'family') return { ...base, radius: 16, fill: '#EDE6D5', stroke: '#5E7B5C', lineWidth: 3 };
  if (kind === 'view') return { ...base, radius: 16, fill: '#EDE6D5', stroke: '#EDBB4A', lineWidth: 4, glyph: '◇', glyphSize: 18 };
  if (kind === 'landmark' || kind === 'meeting') {
    return { ...base, radius: 22, fill: '#F5EFE4', stroke: '#14120F', lineWidth: 6, showLabel: true, smallLabel: true, labelTone: 'landmark' };
  }
  // any unknown — neutral cream dot
  return { ...base, radius: 22, fill: '#F5EFE4', stroke: '#14120F', lineWidth: 6 };
}

function shouldShowMarkerLabel(
  marker: { id: string; label: string; kind: string },
  style: { showLabel: boolean },
): boolean {
  if (style.showLabel) return true;
  // Keep minor station exits as dots, but name actual Underground stations
  // that are in the route pack as tube-exit POIs.
  return marker.kind === 'tube-exit' && marker.label.toLowerCase().includes('station');
}

function mapLabelText(marker: { label: string; kind: string }): string {
  if (marker.kind === 'tube-exit') return marker.label.replace(/\s*·\s*station$/i, '');
  if (marker.kind === 'medical') return 'First aid';
  return marker.label;
}

function drawFanEvents(ctx: CanvasRenderingContext2D, clusters: FanEventCluster[], extent: MapExtent) {
  const presence = clusters.filter((cluster) => cluster.type === 'presence').slice(0, 10);
  const reports = clusters.filter((cluster) => cluster.type !== 'presence').slice(0, 12);

  ctx.save();
  for (const cluster of presence) {
    const p = offsetClusterPoint(lngLatToPixel(cluster.point, extent), cluster.type);
    const radius = Math.min(44, 22 + cluster.count * 5);
    ctx.beginPath();
    ctx.arc(p.x, p.y, radius, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(237, 187, 74, 0.62)';
    ctx.fill();
    ctx.lineWidth = 3;
    ctx.strokeStyle = 'rgba(20, 18, 15, 0.62)';
    ctx.stroke();
    if (cluster.count > 1) drawLabel(ctx, `${cluster.count} here`, p.x + radius + 10, p.y);
  }

  for (const cluster of reports) {
    const p = offsetClusterPoint(lngLatToPixel(cluster.point, extent), cluster.type);
    const color = eventColor(cluster.type);
    const radius = clusterRadius(cluster);
    ctx.beginPath();
    ctx.arc(p.x, p.y, radius, 0, Math.PI * 2);
    ctx.fillStyle = color.soft;
    ctx.fill();
    ctx.lineWidth = 3;
    ctx.strokeStyle = color.strong;
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(p.x, p.y, 18, 0, Math.PI * 2);
    ctx.fillStyle = color.strong;
    ctx.fill();
    drawEventBadge(ctx, cluster.type, p.x, p.y);
    drawLabel(ctx, clusterLabel(cluster), p.x + radius + 8, p.y);
  }
  ctx.restore();
}

function drawScheduleMarkers(ctx: CanvasRenderingContext2D, schedule: RoutePack['scheduleEstimate'], extent: MapExtent) {
  ctx.save();
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  let index = 0;
  for (const row of schedule) {
    if (typeof row.lng !== 'number' || typeof row.lat !== 'number') continue;
    index += 1;
    const p = lngLatToPixel({ lng: row.lng, lat: row.lat }, extent);
    // Slight up-shift so the marker sits above the route polyline.
    const y = p.y - 64;
    ctx.beginPath();
    ctx.arc(p.x, y, 26, 0, Math.PI * 2);
    ctx.fillStyle = '#F5EFE4';
    ctx.fill();
    ctx.lineWidth = 5;
    ctx.strokeStyle = '#EF0107';
    ctx.stroke();
    ctx.fillStyle = '#EF0107';
    ctx.font = '700 28px "JetBrains Mono", ui-monospace, monospace';
    ctx.fillText(String(index), p.x, y + 2);
  }
  ctx.textAlign = 'start';
  ctx.textBaseline = 'alphabetic';
  ctx.restore();
}

function drawWalkLine(ctx: CanvasRenderingContext2D, from: GpsFix, to: PlanPoint, extent: MapExtent) {
  const a = lngLatToPixel(from, extent);
  const b = lngLatToPixel(to, extent);
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(a.x, a.y);
  ctx.lineTo(b.x, b.y);
  ctx.lineWidth = 8;
  ctx.lineCap = 'round';
  ctx.setLineDash([2, 18]);
  ctx.strokeStyle = '#5E7B5C';
  ctx.stroke();
  ctx.restore();
}

function drawGps(ctx: CanvasRenderingContext2D, gps: GpsFix, extent: MapExtent) {
  const p = lngLatToPixel(gps, extent);
  const radius = metersToPixelRadius(gps, gps.accuracyM, extent);
  ctx.save();
  ctx.beginPath();
  ctx.arc(p.x, p.y, Math.max(10, Math.min(220, radius)), 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(239, 1, 7, 0.14)';
  ctx.fill();
  ctx.strokeStyle = 'rgba(239, 1, 7, 0.5)';
  ctx.lineWidth = 7;
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(p.x, p.y, 34, 0, Math.PI * 2);
  ctx.fillStyle = '#EF0107';
  ctx.fill();
  ctx.lineWidth = 12;
  ctx.strokeStyle = '#F5EFE4';
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(p.x, p.y, 44, 0, Math.PI * 2);
  ctx.lineWidth = 3;
  ctx.strokeStyle = 'rgba(20, 18, 15, 0.7)';
  ctx.stroke();
  drawLabel(ctx, 'You are here', p.x + 54, p.y);
  ctx.restore();
}

function drawBusMarkers(ctx: CanvasRenderingContext2D, markers: BusMarker[], extent: MapExtent) {
  ctx.save();
  for (const marker of markers) {
    const alpha = busMarkerAlpha(marker);
    const point =
      typeof marker.snapped_lng === 'number' && typeof marker.snapped_lat === 'number'
        ? { lng: marker.snapped_lng, lat: marker.snapped_lat }
        : { lng: marker.lng, lat: marker.lat };
    const p = lngLatToPixel(point, extent);
    ctx.globalAlpha = alpha;
    ctx.beginPath();
    ctx.arc(p.x, p.y, 54, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(239, 1, 7, 0.2)';
    ctx.fill();
    ctx.beginPath();
    ctx.arc(p.x, p.y, 24, 0, Math.PI * 2);
    ctx.fillStyle = '#EF0107';
    ctx.fill();
    ctx.lineWidth = 9;
    ctx.strokeStyle = '#F5EFE4';
    ctx.stroke();
    drawLabel(ctx, alpha < 0.5 ? 'Old bus tap' : 'Bus tap', p.x + 58, p.y);
  }
  ctx.globalAlpha = 1;
  ctx.restore();
}

function busMarkerAlpha(marker: Pick<BusMarker, 'created_at'>): number {
  const ageMin = (Date.now() - Date.parse(marker.created_at)) / 60_000;
  if (!Number.isFinite(ageMin) || ageMin < 0) return 0.75;
  if (ageMin > 60) return 0.32;
  if (ageMin > 20) return 0.5;
  if (ageMin > 8) return 0.72;
  return 1;
}

function drawSideTings(ctx: CanvasRenderingContext2D, rows: SideTing[], extent: MapExtent) {
  ctx.save();
  for (const row of rows.slice(0, 5)) {
    if (!row.primary) continue;
    const p = lngLatToPixel(row.primary, extent);
    const ageSource = row.lastSeenAt ?? row.addedAt;
    const ageMin = (Date.now() - Date.parse(ageSource)) / 60_000;
    const stale = !Number.isFinite(ageMin) || ageMin > 10 || !row.lastSeenAt;
    ctx.beginPath();
    ctx.arc(p.x, p.y, 34, 0, Math.PI * 2);
    ctx.fillStyle = stale ? 'rgba(237, 187, 74, 0.18)' : '#EDBB4A';
    ctx.fill();
    ctx.lineWidth = stale ? 7 : 9;
    ctx.strokeStyle = stale ? 'rgba(20, 18, 15, 0.7)' : '#14120F';
    ctx.stroke();
    if (stale) {
      ctx.beginPath();
      ctx.arc(p.x, p.y, 20, 0, Math.PI * 2);
      ctx.strokeStyle = '#EDBB4A';
      ctx.lineWidth = 5;
      ctx.stroke();
    }
    drawLabel(ctx, chipForGroupName(row.name), p.x + 50, p.y);
  }
  ctx.restore();
}

function layerAllowsCluster(type: FanEventType, layers: Partial<Record<MapLayerId, boolean>>): boolean {
  if (type === 'bus_seen') return layers.bus !== false;
  if (type === 'presence') return layers['my-taps'] !== false;
  return layers.reports !== false;
}

function eventColor(type: FanEventType): { strong: string; soft: string } {
  if (type === 'crowd_dense') return { strong: '#EDBB4A', soft: 'rgba(237, 187, 74, 0.24)' };
  if (type === 'road_blocked') return { strong: '#14120F', soft: 'rgba(20, 18, 15, 0.18)' };
  if (type === 'need_help') return { strong: '#C40006', soft: 'rgba(196, 0, 6, 0.2)' };
  if (type === 'food_open') return { strong: '#A37918', soft: 'rgba(237, 187, 74, 0.22)' };
  if (type === 'toilet_queue') return { strong: '#5E7B5C', soft: 'rgba(94, 123, 92, 0.2)' };
  return { strong: '#EF0107', soft: 'rgba(239, 1, 7, 0.2)' };
}

function clusterRadius(cluster: FanEventCluster): number {
  const base = cluster.type === 'bus_seen' ? 54 : 44;
  return Math.min(78, base + Math.max(0, cluster.count - 1) * 7);
}

function clusterLabel(cluster: FanEventCluster): string {
  const confidence = reportConfidenceText(cluster.confidence, cluster.count);
  if (cluster.type === 'bus_seen') return cluster.count > 1 ? `Bus here · ${confidence}` : 'Bus here';
  const label = FAN_EVENT_LABELS[cluster.type];
  return cluster.count > 1 ? `${label} · ${confidence}` : label;
}

function drawEventBadge(ctx: CanvasRenderingContext2D, type: FanEventType, x: number, y: number) {
  const badge = FAN_EVENT_BADGES[type];
  ctx.save();
  ctx.fillStyle = type === 'crowd_dense' ? '#14120F' : '#F5EFE4';
  ctx.font = `${badge.length > 2 ? '800 14px' : '800 17px'} "JetBrains Mono", ui-monospace, monospace`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(badge, x, y + 1);
  ctx.restore();
}

function buildMapSummary(gpsFix: GpsFix | null | undefined, clusters: FanEventCluster[], busMarkerCount: number): string {
  const gps = gpsFix
    ? `Your GPS dot is shown with accuracy about ${Math.round(gpsFix.accuracyM)} metres.`
    : 'No GPS fix is shown yet.';
  const signals = clusters.length
    ? clusters
        .slice(0, 5)
        .map((cluster) => `${FAN_EVENT_LABELS[cluster.type]} ${cluster.count > 1 ? `from ${cluster.count} phones` : 'from 1 phone'}`)
        .join('; ')
    : busMarkerCount > 0
      ? `${busMarkerCount} saved bus marker${busMarkerCount === 1 ? '' : 's'}`
      : 'No fan pulse markers are on the map yet.';
  return `Offline parade corridor map with the bus route, stations, exits, landmarks, and safety points. ${gps} Current carried signals: ${signals}.`;
}

function offsetClusterPoint(point: PixelPoint, type: FanEventType): PixelPoint {
  if (type === 'presence') return { x: point.x - 190, y: point.y - 46 };
  if (type === 'bus_seen') return { x: point.x + 34, y: point.y - 4 };
  if (type === 'crowd_dense') return { x: point.x - 38, y: point.y + 46 };
  if (type === 'road_blocked') return { x: point.x + 42, y: point.y + 46 };
  if (type === 'food_open') return { x: point.x + 70, y: point.y - 76 };
  if (type === 'toilet_queue') return { x: point.x - 76, y: point.y + 78 };
  return { x: point.x + 52, y: point.y - 52 };
}

function drawLabel(ctx: CanvasRenderingContext2D, text: string, x: number, y: number) {
  const displayText = text.length > 30 ? `${text.slice(0, 27)}...` : text;
  ctx.font = '700 52px "JetBrains Mono", ui-monospace, monospace';
  const padded = displayText.length * 30 + 38;
  let labelX = x;
  if (labelX + padded > 1782) labelX = x - padded - 60;
  labelX = Math.max(18, Math.min(1782 - padded, labelX));
  const labelY = Math.max(42, Math.min(1758, y));
  ctx.fillStyle = 'rgba(245, 239, 228, 0.94)';
  roundRect(ctx, labelX - 18, labelY - 42, padded, 84, 0);
  ctx.fill();
  ctx.lineWidth = 3;
  ctx.strokeStyle = 'rgba(20, 18, 15, 0.82)';
  ctx.stroke();
  ctx.fillStyle = '#14120F';
  ctx.fillText(displayText, labelX, labelY + 4);
}

function drawMiniLabel(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  tone: 'default' | 'transit' | 'landmark' = 'default',
) {
  const displayText = text.length > 22 ? `${text.slice(0, 19)}...` : text;
  ctx.font = '800 54px "JetBrains Mono", ui-monospace, monospace';
  const padded = displayText.length * 31 + 36;
  let labelX = x;
  if (labelX + padded > 1782) labelX = x - padded - 58;
  labelX = Math.max(18, Math.min(1782 - padded, labelX));
  const labelY = Math.max(42, Math.min(1758, y));
  ctx.fillStyle = tone === 'transit' ? 'rgba(245, 239, 228, 0.96)' : 'rgba(237, 230, 213, 0.94)';
  roundRect(ctx, labelX - 18, labelY - 41, padded, 82, 0);
  ctx.fill();
  ctx.lineWidth = tone === 'transit' ? 4 : 2;
  ctx.strokeStyle = tone === 'transit' ? '#14120F' : 'rgba(20, 18, 15, 0.72)';
  ctx.stroke();
  ctx.fillStyle = tone === 'transit' ? '#14120F' : '#4C473F';
  ctx.fillText(displayText, labelX, labelY + 5);
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, width: number, height: number, radius: number) {
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + width, y, x + width, y + height, radius);
  ctx.arcTo(x + width, y + height, x, y + height, radius);
  ctx.arcTo(x, y + height, x, y, radius);
  ctx.arcTo(x, y, x + width, y, radius);
  ctx.closePath();
}

function clampOffset(next: PixelPoint, scale: number, frame: HTMLDivElement | null): PixelPoint {
  if (!frame || scale <= 1) return { x: 0, y: 0 };
  const size = frame.getBoundingClientRect();
  const minX = -size.width * (scale - 1);
  const minY = -size.height * (scale - 1);
  return {
    x: Math.min(0, Math.max(minX, next.x)),
    y: Math.min(0, Math.max(minY, next.y)),
  };
}
