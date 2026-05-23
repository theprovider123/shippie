import { useEffect, useMemo, useRef, useState } from 'react';
import type { RoutePack } from '../data/parade-2026';
import type { BusMarker } from '../lib/bus';
import { clusterFanEvents, FAN_EVENT_LABELS, type FanEvent, type FanEventCluster, type FanEventType } from '../lib/fan-events';
import { lngLatToPixel, metersToPixelRadius, type PixelPoint } from '../lib/geo';
import type { GpsFix } from '../lib/gps';
import type { GroupPlan, PlanPoint } from '../lib/group-plan';

interface CorridorMapProps {
  pack: RoutePack;
  gpsFix?: GpsFix | null;
  plan?: GroupPlan | null;
  busMarkers?: BusMarker[];
  fanEvents?: FanEvent[];
  target?: PlanPoint | null;
  compact?: boolean;
}

export function CorridorMap({
  pack,
  gpsFix,
  plan,
  busMarkers = [],
  fanEvents = [],
  target,
  compact = false,
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
  const hasFanBus = fanClusters.some((cluster) => cluster.type === 'bus_seen');
  const summaryId = compact ? 'corridor-map-summary-compact' : 'corridor-map-summary';
  const mapSummary = useMemo(
    () => buildMapSummary(gpsFix, fanClusters, busMarkers.length),
    [busMarkers.length, fanClusters, gpsFix],
  );

  const points = useMemo(() => {
    const out: Array<{ id: string; label: string; kind: string; point: PixelPoint }> = [];
    for (const poi of pack.pois) {
      out.push({ id: poi.id, label: poi.name, kind: poi.kind, point: lngLatToPixel(poi) });
    }
    if (plan) {
      out.push({ id: 'plan-primary', label: plan.primary.label, kind: 'primary', point: lngLatToPixel(plan.primary) });
      out.push({ id: 'plan-fallback', label: plan.fallback.label, kind: 'fallback', point: lngLatToPixel(plan.fallback) });
    }
    if (target) out.push({ id: 'target', label: target.label, kind: 'target', point: lngLatToPixel(target) });
    return out;
  }, [pack.pois, plan, target]);

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
    if (fanClusters.length > 0) drawFanEvents(ctx, fanClusters);
    drawPois(ctx, points);
    if (busMarkers.length > 0 && !hasFanBus) drawBusMarkers(ctx, busMarkers);
    if (gpsFix) drawGps(ctx, gpsFix);
  }, [pack, points, busMarkers, fanClusters, gpsFix, hasFanBus]);

  const clampZoom = (value: number) => Math.max(1, Math.min(3.2, value));

  const zoom = (next: number) => {
    setScale((current) => {
      const clamped = clampZoom(next);
      if (clamped === 1) setOffset({ x: 0, y: 0 });
      return clamped;
    });
  };

  const onPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
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
    const fill = marker.kind === 'primary' ? '#EF0107' : marker.kind === 'fallback' ? '#14120F' : marker.kind === 'target' ? '#EF0107' : '#F5EFE4';
    const stroke = '#14120F';
    ctx.beginPath();
    ctx.arc(marker.point.x, marker.point.y, marker.kind === 'target' ? 34 : 24, 0, Math.PI * 2);
    ctx.fillStyle = fill;
    ctx.fill();
    ctx.lineWidth = 8;
    ctx.strokeStyle = stroke;
    ctx.stroke();
    if (marker.kind === 'primary' || marker.kind === 'fallback' || marker.kind === 'target') {
      drawLabel(ctx, marker.label, marker.point.x + 44, marker.point.y);
    }
  }
  ctx.restore();
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
  ctx.font = '700 52px "JetBrains Mono", ui-monospace, monospace';
  const padded = text.length * 30 + 38;
  ctx.fillStyle = 'rgba(245, 239, 228, 0.94)';
  roundRect(ctx, x - 18, y - 42, padded, 84, 0);
  ctx.fill();
  ctx.lineWidth = 3;
  ctx.strokeStyle = 'rgba(20, 18, 15, 0.82)';
  ctx.stroke();
  ctx.fillStyle = '#14120F';
  ctx.fillText(text, x, y + 4);
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
