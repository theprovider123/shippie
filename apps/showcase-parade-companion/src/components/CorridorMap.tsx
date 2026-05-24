import { useEffect, useMemo, useRef, useState } from 'react';
import type { RoutePack, RoutePoi, RoutePoiKind } from '../data/parade-2026';
import type { BusMarker } from '../lib/bus';
import { clusterFanEvents, FAN_EVENT_LABELS, type FanEvent, type FanEventCluster, type FanEventType } from '../lib/fan-events';
import { lngLatToPixel, metersToPixelRadius, type PixelPoint } from '../lib/geo';
import type { GpsFix } from '../lib/gps';
import type { GroupPlan, PlanPoint } from '../lib/group-plan';
import { chipForGroupName, type SideTing } from '../lib/side-tings';
import type { MapLayerId } from './LayerToggleRow';

/**
 * Place categories (toilet/water/food/pub/atm) are filtered by their
 * corresponding LayerToggleRow toggle. Core categories (landmark, station,
 * medical, exit, stewards, meeting) always render. Tube exits, family
 * pockets, and view suggestions stay out of the base canvas until a dedicated
 * find/search surface ships; otherwise first load becomes a field of unlabeled
 * dots.
 */
function placeLayerForKind(kind: RoutePoiKind): MapLayerId | null {
  if (kind === 'toilet') return 'toilets';
  if (kind === 'water') return 'water';
  if (kind === 'food') return 'food';
  if (kind === 'pub') return 'pubs';
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
  const basemapSrc = `${import.meta.env.BASE_URL}basemap/corridor.webp`;
  const fanClusters = useMemo(() => clusterFanEvents(fanEvents), [fanEvents]);
  const visibleFanClusters = useMemo(
    () => fanClusters.filter((cluster) => layerAllowsCluster(cluster.type, layers)),
    [fanClusters, layers],
  );
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
      if (poi.kind === 'tube-exit' || poi.kind === 'family' || poi.kind === 'view') continue;
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
      out.push({ id: poi.id, label: poi.name, kind: poi.kind, point: lngLatToPixel(poi) });
    }
    if (plan) {
      out.push({ id: 'plan-primary', label: plan.primary.label, kind: 'primary', point: lngLatToPixel(plan.primary) });
      out.push({ id: 'plan-fallback', label: plan.fallback.label, kind: 'fallback', point: lngLatToPixel(plan.fallback) });
    }
    if (target) out.push({ id: 'target', label: target.label, kind: 'target', point: lngLatToPixel(target) });
    return out;
  }, [visiblePois, plan, target]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const { pxWidth, pxHeight } = { pxWidth: 1800, pxHeight: 1800 };
    canvas.width = pxWidth;
    canvas.height = pxHeight;
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    drawRoute(ctx, pack.route.coordinates);
    if (visibleFanClusters.length > 0) drawFanEvents(ctx, visibleFanClusters);
    if (layers['side-tings'] !== false && sideTings.length > 0) drawSideTings(ctx, sideTings);
    if (gpsFix && target) drawWalkLine(ctx, gpsFix, target);
    drawPois(ctx, points);
    drawScheduleMarkers(ctx, pack.scheduleEstimate);
    if (layers.bus !== false && busMarkers.length > 0 && !hasFanBus) drawBusMarkers(ctx, busMarkers);
    if (gpsFix) drawGps(ctx, gpsFix);
  }, [pack, points, busMarkers, visibleFanClusters, gpsFix, hasFanBus, layers, sideTings, target]);

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
          {onPoiTap ? (
            <div className="poi-hit-layer" aria-hidden>
              {visiblePois.map((poi) => {
                const p = lngLatToPixel(poi);
                const leftPct = (p.x / 1800) * 100;
                const topPct = (p.y / 1800) * 100;
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
      </div>
      <p className="map-credit">Offline schematic. Verify official route before travel.</p>
    </div>
  );
}

function drawRoute(ctx: CanvasRenderingContext2D, route: readonly [number, number][]) {
  if (route.length < 2) return;
  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.lineWidth = 48;
  ctx.strokeStyle = 'rgba(245, 239, 228, 0.7)';
  drawPolyline(ctx, route);
  ctx.stroke();
  ctx.lineWidth = 34;
  ctx.strokeStyle = 'rgba(239, 1, 7, 0.22)';
  drawPolyline(ctx, route);
  ctx.stroke();
  ctx.lineWidth = 16;
  ctx.strokeStyle = '#EF0107';
  drawPolyline(ctx, route);
  ctx.stroke();
  ctx.restore();
}

function drawPolyline(ctx: CanvasRenderingContext2D, route: readonly [number, number][]) {
  route.forEach(([lng, lat], index) => {
    const p = lngLatToPixel({ lng, lat });
    if (index === 0) ctx.moveTo(p.x, p.y);
    else ctx.lineTo(p.x, p.y);
  });
}

function drawPois(ctx: CanvasRenderingContext2D, points: Array<{ id: string; label: string; kind: string; point: PixelPoint }>) {
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
    if (style.showLabel) {
      drawLabel(ctx, marker.label, marker.point.x + style.radius + 18, marker.point.y);
    }
  }
  ctx.restore();
}

/**
 * Visual style per POI kind. Place categories (toilet/water/food/pub/atm)
 * draw smaller than the core landmarks and carry a single mono-glyph (T, W,
 * F, P, $) so the map stays scannable without leaning on icon files.
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
  if (kind === 'medical') return { ...base, radius: 22, fill: '#C40006', stroke: '#14120F', lineWidth: 6, glyph: '+', glyphSize: 26, glyphColor: '#F5EFE4' };
  if (kind === 'stewards') return { ...base, radius: 22, fill: '#EDBB4A', stroke: '#14120F', lineWidth: 6, glyph: 'S', glyphSize: 22 };
  if (kind === 'station' || kind === 'tube-exit') return { ...base, radius: 22, fill: '#F5EFE4', stroke: '#14120F', lineWidth: 6, glyph: '◉', glyphSize: 22 };
  if (kind === 'exit') return { ...base, radius: 22, fill: '#F5EFE4', stroke: '#14120F', lineWidth: 6, glyph: '↗', glyphSize: 26 };
  if (kind === 'toilet') return { ...base, radius: 16, fill: '#F5EFE4', stroke: '#5E7B5C', lineWidth: 4, glyph: 'T', glyphSize: 14, glyphColor: '#5E7B5C' };
  if (kind === 'water') return { ...base, radius: 16, fill: '#F5EFE4', stroke: '#5E7B5C', lineWidth: 4, glyph: '~', glyphSize: 14, glyphColor: '#5E7B5C' };
  if (kind === 'food') return { ...base, radius: 16, fill: '#F5EFE4', stroke: '#A37918', lineWidth: 4, glyph: 'F', glyphSize: 14, glyphColor: '#A37918' };
  if (kind === 'pub') return { ...base, radius: 16, fill: '#F5EFE4', stroke: '#A37918', lineWidth: 4, glyph: 'P', glyphSize: 14, glyphColor: '#A37918' };
  if (kind === 'atm') return { ...base, radius: 16, fill: '#F5EFE4', stroke: '#14120F', lineWidth: 4, glyph: '$', glyphSize: 14 };
  if (kind === 'family') return { ...base, radius: 16, fill: '#EDE6D5', stroke: '#5E7B5C', lineWidth: 3 };
  if (kind === 'view') return { ...base, radius: 16, fill: '#EDE6D5', stroke: '#EDBB4A', lineWidth: 4, glyph: '◇', glyphSize: 18 };
  // landmark + meeting + any unknown — neutral cream dot
  return { ...base, radius: 22, fill: '#F5EFE4', stroke: '#14120F', lineWidth: 6 };
}

function drawFanEvents(ctx: CanvasRenderingContext2D, clusters: FanEventCluster[]) {
  const presence = clusters.filter((cluster) => cluster.type === 'presence').slice(0, 10);
  const reports = clusters.filter((cluster) => cluster.type !== 'presence').slice(0, 12);

  ctx.save();
  for (const cluster of presence) {
    const p = offsetClusterPoint(lngLatToPixel(cluster.point), cluster.type);
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
    const p = offsetClusterPoint(lngLatToPixel(cluster.point), cluster.type);
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
    drawLabel(ctx, clusterLabel(cluster), p.x + radius + 8, p.y);
  }
  ctx.restore();
}

function drawScheduleMarkers(ctx: CanvasRenderingContext2D, schedule: RoutePack['scheduleEstimate']) {
  ctx.save();
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  let index = 0;
  for (const row of schedule) {
    if (typeof row.lng !== 'number' || typeof row.lat !== 'number') continue;
    index += 1;
    const p = lngLatToPixel({ lng: row.lng, lat: row.lat });
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

function drawWalkLine(ctx: CanvasRenderingContext2D, from: GpsFix, to: PlanPoint) {
  const a = lngLatToPixel(from);
  const b = lngLatToPixel(to);
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

function drawGps(ctx: CanvasRenderingContext2D, gps: GpsFix) {
  const p = lngLatToPixel(gps);
  const radius = metersToPixelRadius(gps, gps.accuracyM);
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
  drawLabel(ctx, 'You', p.x + 54, p.y);
  ctx.restore();
}

function drawBusMarkers(ctx: CanvasRenderingContext2D, markers: BusMarker[]) {
  ctx.save();
  for (const marker of markers) {
    const point =
      typeof marker.snapped_lng === 'number' && typeof marker.snapped_lat === 'number'
        ? { lng: marker.snapped_lng, lat: marker.snapped_lat }
        : { lng: marker.lng, lat: marker.lat };
    const p = lngLatToPixel(point);
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
    drawLabel(ctx, 'Bus tap', p.x + 58, p.y);
  }
  ctx.restore();
}

function drawSideTings(ctx: CanvasRenderingContext2D, rows: SideTing[]) {
  ctx.save();
  for (const row of rows.slice(0, 5)) {
    if (!row.primary) continue;
    const p = lngLatToPixel(row.primary);
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
  return { strong: '#EF0107', soft: 'rgba(239, 1, 7, 0.2)' };
}

function clusterRadius(cluster: FanEventCluster): number {
  const base = cluster.type === 'bus_seen' ? 54 : 44;
  return Math.min(78, base + Math.max(0, cluster.count - 1) * 7);
}

function clusterLabel(cluster: FanEventCluster): string {
  const label = FAN_EVENT_LABELS[cluster.type];
  return cluster.count > 1 ? `${label} x${cluster.count}` : label;
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
  return `Offline parade corridor map. ${gps} Current carried signals: ${signals}.`;
}

function offsetClusterPoint(point: PixelPoint, type: FanEventType): PixelPoint {
  if (type === 'presence') return { x: point.x - 190, y: point.y - 46 };
  if (type === 'bus_seen') return { x: point.x + 34, y: point.y - 4 };
  if (type === 'crowd_dense') return { x: point.x - 38, y: point.y + 46 };
  if (type === 'road_blocked') return { x: point.x + 42, y: point.y + 46 };
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
