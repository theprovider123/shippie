import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import {
  offlineMapDetailsFor,
  type OfflineMapAreaKind,
  type OfflineMapDetails,
  type OfflineMapLabelKind,
  type OfflineMapLineKind,
} from '../data/offline-map-details';
import { CORRIDOR_EXTENT, type MapExtent, type RoutePack, type RoutePoi, type RoutePoiKind } from '../data/parade-2026';
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
import { haversineMeters, lngLatToPixel, metersToPixelRadius, pixelToLngLat, type PixelPoint } from '../lib/geo';
import { isFreshGpsFix, type GpsFix } from '../lib/gps';
import type { GroupPlan, PlanPoint } from '../lib/group-plan';
import type { GroupLiveMember } from '../lib/group-live';
import {
  centerMapOnWorldPoint,
  clampMapOffset,
  fitMapBounds,
  zoomMapAt,
  type MapView,
  type ViewportSize,
  type WorldBounds,
} from '../lib/map-view';
import { chipForGroupName, type SideTing } from '../lib/side-tings';
import type { MapLayerId } from './LayerToggleRow';

interface LabelRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface DetailLabel {
  id: string;
  kind: OfflineMapLabelKind;
  label: string;
  lng: number;
  lat: number;
  minScale: number;
}

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
  groupMembers?: GroupLiveMember[];
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
  /** Optional: tap the red route line to set a walking goal. */
  onRouteTap?: (point: PlanPoint) => void;
}

export function CorridorMap({
  pack,
  gpsFix,
  plan,
  busMarkers = [],
  fanEvents = [],
  groupMembers = [],
  sideTings = [],
  layers = {},
  target,
  compact = false,
  extraPois,
  onPoiTap,
  onRouteTap,
}: CorridorMapProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const frameRef = useRef<HTMLDivElement | null>(null);
  const pointers = useRef(new Map<number, PixelPoint>());
  const lastDrag = useRef<PixelPoint | null>(null);
  const tapStart = useRef<PixelPoint | null>(null);
  const tapMoved = useRef(false);
  const lastPinchDistance = useRef<number | null>(null);
  const viewRef = useRef<MapView>({ scale: 1, offset: { x: 0, y: 0 } });
  const [view, setView] = useState<MapView>(viewRef.current);
  const scale = view.scale;
  const offset = view.offset;
  // Every spatial calculation in this component projects via the *pack's*
  // map extent — round 10's multi-pack support depends on this not falling
  // back to the global Islington default.
  const extent = pack.mapExtent;
  const basemapSrc = `${import.meta.env.BASE_URL}basemap/corridor.webp`;
  const useRasterBasemap = shouldUseRasterBasemap(pack);
  const offlineDetails = useMemo(() => offlineMapDetailsFor(pack), [pack]);
  const renderDpr = useMemo(() => {
    if (typeof window === 'undefined') return 1;
    const device = Math.max(1, window.devicePixelRatio || 1);
    // Deep zoom needs more backing pixels or the canvas feels like a blown-up
    // poster. Keep the cap modest so old phones do not pay MapLibre-sized
    // memory costs for an offline parade corridor.
    const cap = scale >= 2.2 ? 3 : 2;
    const desired = scale >= 2.2 ? Math.max(device, 2) : device;
    return Math.min(cap, desired);
  }, [scale]);
  const detailLabels = useMemo(() => buildDetailLabels(offlineDetails, extent, scale), [offlineDetails, extent, scale]);
  const fanClusters = useMemo(() => clusterFanEvents(fanEvents), [fanEvents]);
  const visibleFanClusters = useMemo(
    () => fanClusters.filter((cluster) => layerAllowsCluster(cluster.type, layers)),
    [fanClusters, layers],
  );
  const crowdHeatClusters = useMemo(
    () => fanClusters
      .filter((cluster) => cluster.type === 'presence' && cluster.count >= 2)
      .slice(0, 14),
    [fanClusters],
  );
  const localPresencePulse = useMemo(() => {
    if (layers['my-taps'] === false) return null;
    const event = fanEvents
      .filter((item) => item.type === 'presence' && item.source === 'local' && isActive(item))
      .sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at))[0];
    if (!event) return null;
    // Round 11 de-dup: when the live GPS pulse is fresh AND the user's last
    // "I am here" tap is within 30 m of it, hide HERE — the YOU pulse already
    // marks "you are here." Show HERE only when GPS is stale, missing, or
    // they've walked away from the original tap.
    if (gpsFix && isFreshGpsFix(gpsFix)) {
      const drift = haversineMeters(
        { lng: event.lng, lat: event.lat },
        { lng: gpsFix.lng, lat: gpsFix.lat },
      );
      if (drift <= 30) return null;
    }
    const p = lngLatToPixel({ lng: event.lng, lat: event.lat }, extent);
    return {
      left: `${(p.x / extent.pxWidth) * 100}%`,
      top: `${(p.y / extent.pxHeight) * 100}%`,
    };
  }, [fanEvents, layers, extent, gpsFix]);
  const liveGpsPulse = useMemo(() => {
    if (!gpsFix) return null;
    const p = lngLatToPixel(gpsFix, extent);
    const accuracyPx = metersToPixelRadius(gpsFix, gpsFix.accuracyM, extent);
    return {
      left: `${(p.x / extent.pxWidth) * 100}%`,
      top: `${(p.y / extent.pxHeight) * 100}%`,
      fresh: isFreshGpsFix(gpsFix),
      wide: gpsFix.accuracyM > 80,
      style: {
        '--accuracy-size': `${Math.max(42, Math.min(220, accuracyPx * 2))}px`,
        transform: `translate(-50%, -50%) scale(${1 / Math.max(1, scale)})`,
      } as CSSProperties,
    };
  }, [gpsFix, extent, scale]);
  const targetPulse = useMemo(() => {
    if (!target) return null;
    const p = lngLatToPixel(target, extent);
    return {
      left: `${(p.x / extent.pxWidth) * 100}%`,
      top: `${(p.y / extent.pxHeight) * 100}%`,
    };
  }, [target, extent]);
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
    canvas.width = Math.round(extent.pxWidth * renderDpr);
    canvas.height = Math.round(extent.pxHeight * renderDpr);
    canvas.style.width = '100%';
    canvas.style.height = '100%';
    ctx.setTransform(renderDpr, 0, 0, renderDpr, 0, 0);
    ctx.clearRect(0, 0, extent.pxWidth, extent.pxHeight);

    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';

    const labels: LabelRect[] = [];
    drawPinpointGrid(ctx, extent, scale);
    drawOfflineMapGeometry(ctx, offlineDetails, extent, scale);
    drawRoute(ctx, pack.route.coordinates, extent, scale);
    if (layers.crowd === true && crowdHeatClusters.length > 0) drawCrowdHeat(ctx, crowdHeatClusters, extent, scale);
    if (visibleFanClusters.length > 0) drawFanEvents(ctx, visibleFanClusters, extent, scale, labels);
    if (layers.friends !== false && groupMembers.length > 0) drawGroupMembers(ctx, groupMembers, extent, scale, labels);
    if (layers['side-tings'] !== false && sideTings.length > 0) drawSideTings(ctx, sideTings, extent, scale, labels);
    if (gpsFix && target) drawWalkLine(ctx, gpsFix, target, extent, scale);
    drawPois(ctx, points, scale, labels);
    drawScheduleMarkers(ctx, pack.scheduleEstimate, extent, scale);
    if (layers.bus !== false && busMarkers.length > 0 && !hasFanBus) drawBusMarkers(ctx, busMarkers, extent, scale, labels);
    if (gpsFix) drawGps(ctx, gpsFix, extent, scale, false, labels);
  }, [pack, points, busMarkers, visibleFanClusters, crowdHeatClusters, gpsFix, hasFanBus, layers, groupMembers, sideTings, target, scale, extent, localPresencePulse, offlineDetails, renderDpr]);

  const commitView = (next: MapView) => {
    viewRef.current = next;
    setView(next);
  };

  const frameSize = (): ViewportSize | null => {
    const frame = frameRef.current;
    if (!frame) return null;
    const rect = frame.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0 ? { width: rect.width, height: rect.height } : null;
  };

  const framePoint = (clientX: number, clientY: number): PixelPoint => {
    const rect = frameRef.current?.getBoundingClientRect();
    return rect ? { x: clientX - rect.left, y: clientY - rect.top } : { x: clientX, y: clientY };
  };

  const worldPointForLngLat = (point: { lng: number; lat: number }): PixelPoint | null => {
    const size = frameSize();
    if (!size) return null;
    const p = lngLatToPixel(point, extent);
    return {
      x: (p.x / extent.pxWidth) * size.width,
      y: (p.y / extent.pxHeight) * size.height,
    };
  };

  const routeBounds = (): WorldBounds | null => {
    const size = frameSize();
    if (!size || pack.route.coordinates.length === 0) return null;
    const points = pack.route.coordinates.map(([lng, lat]) => {
      const p = lngLatToPixel({ lng, lat }, extent);
      return {
        x: (p.x / extent.pxWidth) * size.width,
        y: (p.y / extent.pxHeight) * size.height,
      };
    });
    return {
      minX: Math.min(...points.map((point) => point.x)),
      maxX: Math.max(...points.map((point) => point.x)),
      minY: Math.min(...points.map((point) => point.y)),
      maxY: Math.max(...points.map((point) => point.y)),
    };
  };

  const boundsForLngLat = (items: Array<{ lng: number; lat: number }>): WorldBounds | null => {
    const size = frameSize();
    if (!size || items.length === 0) return null;
    const points = items.map((item) => {
      const p = lngLatToPixel(item, extent);
      return {
        x: (p.x / extent.pxWidth) * size.width,
        y: (p.y / extent.pxHeight) * size.height,
      };
    });
    return {
      minX: Math.min(...points.map((point) => point.x)),
      maxX: Math.max(...points.map((point) => point.x)),
      minY: Math.min(...points.map((point) => point.y)),
      maxY: Math.max(...points.map((point) => point.y)),
    };
  };

  const fitRoute = () => {
    commitView(fitMapBounds(routeBounds(), frameSize(), 48));
  };

  const focusLngLat = (point: { lng: number; lat: number }, zoom = 2.45) => {
    const worldPoint = worldPointForLngLat(point);
    if (!worldPoint) return;
    commitView(centerMapOnWorldPoint(worldPoint, zoom, frameSize()));
  };

  const lastFramedTarget = useRef('');
  useEffect(() => {
    if (!target) {
      lastFramedTarget.current = '';
      return;
    }
    const targetKey = `${target.lng.toFixed(6)},${target.lat.toFixed(6)}`;
    if (lastFramedTarget.current === targetKey) return;
    lastFramedTarget.current = targetKey;

    const id = window.requestAnimationFrame(() => {
      const bounds = gpsFix ? boundsForLngLat([gpsFix, target]) : null;
      if (bounds) commitView(fitMapBounds(bounds, frameSize(), 64));
      else focusLngLat(target, 2.8);
    });
    return () => window.cancelAnimationFrame(id);
    // The map should frame the destination only when the destination changes.
    // GPS can continue to update without wrestling the user's pan/zoom.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target?.lng, target?.lat]);

  const zoom = (next: number, focal?: PixelPoint) => {
    const size = frameSize();
    const centre = size ? { x: size.width / 2, y: size.height / 2 } : { x: 0, y: 0 };
    commitView(zoomMapAt(viewRef.current, next, focal ?? centre, size));
  };

  useEffect(() => {
    const id = window.requestAnimationFrame(fitRoute);
    return () => window.cancelAnimationFrame(id);
    // Fit the currently selected route once its frame exists. This is what
    // makes the widened Watford test pack open on the useful route instead
    // of a tiny squiggle in a huge blank extent.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pack.event.title, pack.packVersion]);

  const onPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    // POI hit zones live inside the frame; their click handler opens the
    // sheet. Don't capture the pointer in that case — capture would steal
    // subsequent events from the button.
    if ((event.target as HTMLElement | null)?.closest('[data-poi-hit]')) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    lastDrag.current = { x: event.clientX, y: event.clientY };
    tapStart.current = framePoint(event.clientX, event.clientY);
    tapMoved.current = false;
  };

  const onPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!pointers.current.has(event.pointerId)) return;
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    const start = tapStart.current;
    if (start) {
      const current = framePoint(event.clientX, event.clientY);
      if (Math.hypot(current.x - start.x, current.y - start.y) > 10) tapMoved.current = true;
    }
    const active = [...pointers.current.values()];
    if (active.length >= 2) {
      const distance = Math.hypot(active[0]!.x - active[1]!.x, active[0]!.y - active[1]!.y);
      if (lastPinchDistance.current) {
        const centre = framePoint((active[0]!.x + active[1]!.x) / 2, (active[0]!.y + active[1]!.y) / 2);
        zoom(viewRef.current.scale * (distance / lastPinchDistance.current), centre);
      }
      lastPinchDistance.current = distance;
      lastDrag.current = null;
      return;
    }
    if (viewRef.current.scale <= 1 || !lastDrag.current) return;
    const dx = event.clientX - lastDrag.current.x;
    const dy = event.clientY - lastDrag.current.y;
    lastDrag.current = { x: event.clientX, y: event.clientY };
    const size = frameSize();
    commitView({
      scale: viewRef.current.scale,
      offset: clampMapOffset(
        { x: viewRef.current.offset.x + dx, y: viewRef.current.offset.y + dy },
        viewRef.current.scale,
        size,
      ),
    });
  };

  const onPointerUp = (event: React.PointerEvent<HTMLDivElement>) => {
    const wasTap = !tapMoved.current && pointers.current.has(event.pointerId);
    const point = framePoint(event.clientX, event.clientY);
    pointers.current.delete(event.pointerId);
    lastDrag.current = null;
    lastPinchDistance.current = null;
    tapStart.current = null;
    tapMoved.current = false;
    if (wasTap && onRouteTap && !(event.target as HTMLElement | null)?.closest('[data-poi-hit]')) {
      const routePoint = nearestRouteTapPoint(point, viewRef.current, frameSize(), pack.route.coordinates, extent);
      if (routePoint) onRouteTap(routePoint);
    }
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
        onWheel={(event) => {
          event.preventDefault();
          const delta = event.deltaY < 0 ? 1.18 : 0.84;
          zoom(viewRef.current.scale * delta, framePoint(event.clientX, event.clientY));
        }}
        onDoubleClick={(event) => zoom(viewRef.current.scale < 2 ? 2.3 : 1, framePoint(event.clientX, event.clientY))}
      >
        <div
          className={`corridor-map__world ${scale > 1.2 ? 'is-zoomed' : ''} ${scale > 1.9 ? 'is-detail' : ''}`}
          style={{ transform: `translate(${offset.x}px, ${offset.y}px) scale(${scale})` }}
        >
          {useRasterBasemap ? (
            <img src={basemapSrc} alt="Offline map of the central Islington parade corridor" draggable={false} />
          ) : (
            <div className="corridor-map__schematic-base" aria-hidden="true">
              <span className="corridor-map__schematic-kicker">Test pack</span>
              <strong>{pack.event.title.replace(/^Test Walk\s+—\s+/i, '')}</strong>
              <span>{pack.route.label}</span>
            </div>
          )}
          <canvas ref={canvasRef} aria-hidden />
          <div className="map-label-layer" aria-hidden="true">
            {detailLabels.map((item) => {
              const p = lngLatToPixel(item, extent);
              return (
                <span
                  key={item.id}
                  className={`map-detail-label map-detail-label--${item.kind}`}
                  style={{
                    left: `${(p.x / extent.pxWidth) * 100}%`,
                    top: `${(p.y / extent.pxHeight) * 100}%`,
                    transform: `translate(-50%, -50%) scale(${1 / Math.max(1, scale)})`,
                  }}
                >
                  {item.label}
                </span>
              );
            })}
          </div>
          {liveGpsPulse ? (
            <div
              className={`live-gps-pulse ${liveGpsPulse.fresh ? 'is-live' : 'is-stale'} ${liveGpsPulse.wide ? 'is-wide' : ''}`}
              style={{ left: liveGpsPulse.left, top: liveGpsPulse.top, ...liveGpsPulse.style }}
              aria-hidden="true"
            >
              <span className="live-gps-pulse__accuracy" />
              <span className="live-gps-pulse__ring" />
              <span className="live-gps-pulse__dot" />
              <strong>{liveGpsPulse.fresh ? 'You' : 'Old'}</strong>
            </div>
          ) : null}
          {localPresencePulse ? (
            <div
              className="my-presence-pulse"
              style={{ ...localPresencePulse, transform: `translate(-50%, -50%) scale(${1 / Math.max(1, scale)})` }}
              aria-hidden="true"
            >
              <span />
              <strong>Here</strong>
            </div>
          ) : null}
          {targetPulse ? (
            <div
              className="map-goal-pulse"
              style={{ ...targetPulse, transform: `translate(-50%, -50%) scale(${1 / Math.max(1, scale)})` }}
              aria-hidden="true"
            >
              <span />
              <strong>Goal</strong>
            </div>
          ) : null}
          {onPoiTap ? (
            <div className="poi-hit-layer" role="group" aria-label="Map places">
              {visiblePois.map((poi) => {
                const p = lngLatToPixel(poi, extent);
                const leftPct = (p.x / extent.pxWidth) * 100;
                const topPct = (p.y / extent.pxHeight) * 100;
                const hitSize = `${Math.max(10, 44 / Math.max(1, scale))}px`;
                return (
                  <button
                    key={poi.id}
                    type="button"
                    data-poi-hit
                    className="poi-hit"
                    style={{
                      left: `${leftPct}%`,
                      top: `${topPct}%`,
                      width: hitSize,
                      height: hitSize,
                      minWidth: hitSize,
                      minHeight: hitSize,
                    }}
                    aria-label={`${poi.name} — open detail`}
                    onClick={(event) => {
                      event.stopPropagation();
                      focusLngLat(poi, Math.max(scale, 2.25));
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
        <button type="button" className="icon-button" onClick={() => zoom(scale + 0.45)} aria-label="Zoom in">
          +
        </button>
        <button type="button" className="icon-button" onClick={() => zoom(scale - 0.45)} aria-label="Zoom out">
          -
        </button>
        <button type="button" className="icon-button icon-button--label" onClick={fitRoute} aria-label="Fit the route on the map">
          Fit
        </button>
        {gpsFix ? (
          <button type="button" className="icon-button icon-button--label" onClick={() => focusLngLat(gpsFix, 2.8)} aria-label="Centre the map on you">
            Me
          </button>
        ) : null}
        {target ? (
          <button type="button" className="icon-button icon-button--label" onClick={() => focusLngLat(target, 2.8)} aria-label="Centre the map on your goal">
            Goal
          </button>
        ) : null}
      </div>
      {scale > 1.05 ? <div className="map-zoom-pill" aria-hidden="true">{scale.toFixed(1)}×</div> : null}
      <p className="map-credit">
        {scale > 1.2
          ? 'Offline detail'
          : useRasterBasemap
            ? 'Offline detail map. Verify official route before travel.'
            : `${pack.event.title} · offline test detail map`}
      </p>
    </div>
  );
}

function shouldUseRasterBasemap(pack: RoutePack): boolean {
  const epsilon = 0.000_001;
  const extent = pack.mapExtent;
  return (
    pack.event.title.toLowerCase().includes('islington') &&
    Math.abs(extent.west - CORRIDOR_EXTENT.west) < epsilon &&
    Math.abs(extent.east - CORRIDOR_EXTENT.east) < epsilon &&
    Math.abs(extent.south - CORRIDOR_EXTENT.south) < epsilon &&
    Math.abs(extent.north - CORRIDOR_EXTENT.north) < epsilon
  );
}

function nearestRouteTapPoint(
  screenPoint: PixelPoint,
  view: MapView,
  size: ViewportSize | null,
  route: readonly [number, number][],
  extent: MapExtent,
): PlanPoint | null {
  if (!size || route.length < 2) return null;
  const world = {
    x: (screenPoint.x - view.offset.x) / view.scale,
    y: (screenPoint.y - view.offset.y) / view.scale,
  };
  const routeFramePoints = route.map(([lng, lat]) => {
    const p = lngLatToPixel({ lng, lat }, extent);
    return {
      x: (p.x / extent.pxWidth) * size.width,
      y: (p.y / extent.pxHeight) * size.height,
    };
  });

  let best: { point: PixelPoint; distance: number; index: number } | null = null;
  for (let i = 0; i < routeFramePoints.length - 1; i += 1) {
    const a = routeFramePoints[i];
    const b = routeFramePoints[i + 1];
    if (!a || !b) continue;
    const projected = projectScreenPointToSegment(world, a, b);
    const distance = Math.hypot(world.x - projected.x, world.y - projected.y);
    if (!best || distance < best.distance) best = { point: projected, distance, index: i };
  }
  const threshold = 34 / Math.max(1, Math.min(view.scale, 3));
  if (!best || best.distance > threshold) return null;
  const pixel = {
    x: (best.point.x / size.width) * extent.pxWidth,
    y: (best.point.y / size.height) * extent.pxHeight,
  };
  const lngLat = pixelToLngLat(pixel, extent);
  return {
    ...lngLat,
    label: `Route stretch ${best.index + 1}`,
  };
}

function projectScreenPointToSegment(point: PixelPoint, a: PixelPoint, b: PixelPoint): PixelPoint {
  const vx = b.x - a.x;
  const vy = b.y - a.y;
  const lenSq = vx * vx + vy * vy;
  const rawT = lenSq === 0 ? 0 : ((point.x - a.x) * vx + (point.y - a.y) * vy) / lenSq;
  const t = Math.max(0, Math.min(1, rawT));
  return {
    x: a.x + vx * t,
    y: a.y + vy * t,
  };
}

function drawPinpointGrid(ctx: CanvasRenderingContext2D, extent: MapExtent, scale: number) {
  if (scale < 2.25) return;
  const fixed = fixedSize(scale);
  const step = scale >= 4.5 ? 30 : scale >= 3.35 ? 36 : 54;
  ctx.save();
  ctx.lineWidth = fixed(1.2);
  ctx.strokeStyle = 'rgba(94, 123, 92, 0.14)';
  for (let x = 0; x <= extent.pxWidth; x += step) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, extent.pxHeight);
    ctx.stroke();
  }
  for (let y = 0; y <= extent.pxHeight; y += step) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(extent.pxWidth, y);
    ctx.stroke();
  }
  ctx.restore();
}

function drawOfflineMapGeometry(ctx: CanvasRenderingContext2D, details: OfflineMapDetails, extent: MapExtent, scale: number) {
  ctx.save();
  for (const area of details.areas) {
    if (!shouldShowAtScale(area.minScale, scale)) continue;
    const points = area.coordinates.map(([lng, lat]) => lngLatToPixel({ lng, lat }, extent));
    if (points.length < 3) continue;
    ctx.beginPath();
    points.forEach((point, index) => {
      if (index === 0) ctx.moveTo(point.x, point.y);
      else ctx.lineTo(point.x, point.y);
    });
    ctx.closePath();
    const style = areaStyle(area.kind);
    ctx.fillStyle = style.fill;
    ctx.fill();
    ctx.lineWidth = fixedSize(scale)(style.lineWidth);
    ctx.strokeStyle = style.stroke;
    ctx.stroke();
  }

  for (const lineFeature of details.lines) {
    if (!shouldShowAtScale(lineFeature.minScale, scale)) continue;
    const fixed = fixedSize(scale);
    ctx.beginPath();
    lineFeature.coordinates.forEach(([lng, lat], index) => {
      const point = lngLatToPixel({ lng, lat }, extent);
      if (index === 0) ctx.moveTo(point.x, point.y);
      else ctx.lineTo(point.x, point.y);
    });
    const style = lineStyle(lineFeature.kind);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.lineWidth = fixed(style.width + (scale >= 2.4 ? style.zoomBoost : 0));
    ctx.strokeStyle = style.stroke;
    if (style.dash) ctx.setLineDash(style.dash.map(fixed));
    else ctx.setLineDash([]);
    ctx.stroke();
  }
  ctx.setLineDash([]);
  ctx.restore();
}

function buildDetailLabels(details: OfflineMapDetails, extent: MapExtent, scale: number): DetailLabel[] {
  const candidates = [
    ...details.areas
      .filter((area) => area.label && shouldShowAtScale(Math.max(1.35, area.minScale ?? 1), scale))
      .map((area) => {
        const centre = averageCoords(area.coordinates);
        return centre ? { id: `area-${area.id}`, kind: 'place' as OfflineMapLabelKind, label: area.label!, ...centre, minScale: Math.max(1.35, area.minScale ?? 1) } : null;
      })
      .filter((item): item is { id: string; kind: OfflineMapLabelKind; label: string; lng: number; lat: number; minScale: number } => Boolean(item)),
    ...details.lines
      .filter((lineFeature) => lineFeature.label && shouldShowAtScale(minScaleForLineLabel(lineFeature), scale))
      .map((lineFeature) => {
        const centre = lineMidpoint(lineFeature.coordinates);
        return centre ? { id: `line-${lineFeature.id}`, kind: 'road' as OfflineMapLabelKind, label: lineFeature.label!, ...centre, minScale: minScaleForLineLabel(lineFeature) } : null;
      })
      .filter((item): item is { id: string; kind: OfflineMapLabelKind; label: string; lng: number; lat: number; minScale: number } => Boolean(item)),
    ...details.labels.map((item) => ({ ...item, minScale: item.minScale ?? 1 })),
  ]
    .filter((item) => shouldShowAtScale(item.minScale, scale))
    .sort((a, b) => labelPriority(b.kind) - labelPriority(a.kind));

  const labels: LabelRect[] = [];
  const out: DetailLabel[] = [];
  const seenText = new Set<string>();
  const limit = labelLimitForScale(scale);
  const padding = labelPaddingForScale(scale);
  for (const item of candidates) {
    const textKey = item.label.trim().toLowerCase();
    if (seenText.has(textKey)) continue;
    const point = lngLatToPixel(item, extent);
    const width = estimatedDomLabelWidth(item) / Math.max(1, scale);
    const height = estimatedDomLabelHeight(item.kind) / Math.max(1, scale);
    const rect = {
      x: point.x - width / 2,
      y: point.y - height / 2,
      width,
      height,
    };
    if (!reserveLabel(labels, rect, padding)) continue;
    out.push(item);
    seenText.add(textKey);
    if (out.length >= limit) break;
  }
  return out;
}

function labelLimitForScale(scale: number): number {
  if (scale >= 5) return 46;
  if (scale >= 4.1) return 38;
  if (scale >= 3.2) return 30;
  if (scale >= 2.35) return 22;
  if (scale >= 1.65) return 15;
  return 9;
}

function labelPaddingForScale(scale: number): number {
  if (scale >= 4.2) return 6 / scale;
  if (scale >= 3) return 10 / scale;
  return 18 / Math.max(1, scale);
}

function shouldShowAtScale(minScale = 1, scale: number): boolean {
  return scale + 0.001 >= minScale;
}

function areaStyle(kind: OfflineMapAreaKind): { fill: string; stroke: string; lineWidth: number } {
  if (kind === 'park') return { fill: 'rgba(94, 123, 92, 0.11)', stroke: 'rgba(94, 123, 92, 0.35)', lineWidth: 3 };
  if (kind === 'water') return { fill: 'rgba(94, 123, 92, 0.08)', stroke: 'rgba(94, 123, 92, 0.26)', lineWidth: 2 };
  if (kind === 'stadium') return { fill: 'rgba(239, 1, 7, 0.07)', stroke: 'rgba(20, 18, 15, 0.28)', lineWidth: 3 };
  if (kind === 'station-zone') return { fill: 'rgba(237, 187, 74, 0.10)', stroke: 'rgba(20, 18, 15, 0.24)', lineWidth: 2 };
  return { fill: 'rgba(20, 18, 15, 0.045)', stroke: 'rgba(20, 18, 15, 0.18)', lineWidth: 2 };
}

function lineStyle(kind: OfflineMapLineKind): { stroke: string; width: number; zoomBoost: number; dash?: number[] } {
  if (kind === 'route-road') return { stroke: 'rgba(20, 18, 15, 0.28)', width: 9, zoomBoost: 2 };
  if (kind === 'major-road') return { stroke: 'rgba(20, 18, 15, 0.23)', width: 7, zoomBoost: 2 };
  if (kind === 'street') return { stroke: 'rgba(20, 18, 15, 0.16)', width: 5, zoomBoost: 1 };
  if (kind === 'path') return { stroke: 'rgba(94, 123, 92, 0.36)', width: 4, zoomBoost: 1, dash: [10, 10] };
  if (kind === 'rail') return { stroke: 'rgba(20, 18, 15, 0.32)', width: 4, zoomBoost: 0, dash: [18, 10] };
  return { stroke: 'rgba(94, 123, 92, 0.22)', width: 7, zoomBoost: 1 };
}

function labelPriority(kind: OfflineMapLabelKind): number {
  if (kind === 'station') return 5;
  if (kind === 'pinpoint') return 4;
  if (kind === 'place') return 3;
  if (kind === 'district') return 2;
  return 1;
}

function minScaleForLineLabel(lineFeature: { kind: OfflineMapLineKind; minScale?: number }): number {
  const base = lineFeature.minScale ?? 1;
  if (lineFeature.kind === 'route-road') return Math.max(1.65, base);
  if (lineFeature.kind === 'major-road') return Math.max(1.75, base);
  if (lineFeature.kind === 'waterway') return Math.max(2, base);
  if (lineFeature.kind === 'street') return Math.max(2.55, base);
  if (lineFeature.kind === 'path') return Math.max(3.25, base);
  return Math.max(3.4, base);
}

function estimatedDomLabelWidth(item: { kind: OfflineMapLabelKind; label: string }): number {
  const max = item.kind === 'station' || item.kind === 'pinpoint' ? 190 : 170;
  const min = item.kind === 'road' ? 62 : 82;
  return Math.max(min, Math.min(max, item.label.length * (item.kind === 'road' ? 7.3 : 8.8) + 34));
}

function estimatedDomLabelHeight(kind: OfflineMapLabelKind): number {
  if (kind === 'station') return 32;
  if (kind === 'road') return 26;
  return 30;
}

function averageCoords(coords: [number, number][]): { lng: number; lat: number } | null {
  if (coords.length === 0) return null;
  return {
    lng: coords.reduce((sum, coord) => sum + coord[0], 0) / coords.length,
    lat: coords.reduce((sum, coord) => sum + coord[1], 0) / coords.length,
  };
}

function lineMidpoint(coords: [number, number][]): { lng: number; lat: number } | null {
  if (coords.length === 0) return null;
  return coords[Math.floor(coords.length / 2)]
    ? { lng: coords[Math.floor(coords.length / 2)]![0], lat: coords[Math.floor(coords.length / 2)]![1] }
    : null;
}

function drawRoute(ctx: CanvasRenderingContext2D, route: readonly [number, number][], extent: MapExtent, scale: number) {
  if (route.length < 2) return;
  const fixed = fixedSize(scale);
  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.lineWidth = fixed(38);
  ctx.strokeStyle = 'rgba(245, 239, 228, 0.7)';
  drawPolyline(ctx, route, extent);
  ctx.stroke();
  ctx.lineWidth = fixed(26);
  ctx.strokeStyle = 'rgba(239, 1, 7, 0.22)';
  drawPolyline(ctx, route, extent);
  ctx.stroke();
  ctx.lineWidth = fixed(11);
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
  labels: LabelRect[],
) {
  ctx.save();
  const fixed = fixedSize(scale);
  ctx.font = `700 ${fixed(28)}px system-ui, sans-serif`;
  ctx.textBaseline = 'middle';
  for (const marker of points) {
    const style = poiStyleForKind(marker.kind);
    const radius = fixed(style.radius);
    ctx.beginPath();
    ctx.arc(marker.point.x, marker.point.y, radius, 0, Math.PI * 2);
    ctx.fillStyle = style.fill;
    ctx.fill();
    ctx.lineWidth = fixed(style.lineWidth);
    ctx.strokeStyle = style.stroke;
    ctx.stroke();
    if (style.glyph) {
      ctx.fillStyle = style.glyphColor;
      ctx.font = `700 ${fixed(style.glyphSize)}px "JetBrains Mono", ui-monospace, monospace`;
      ctx.textAlign = 'center';
      ctx.fillText(style.glyph, marker.point.x, marker.point.y + fixed(style.glyphSize * 0.35));
      ctx.textAlign = 'start';
    }
    if (!shouldShowMarkerLabel(marker, style)) continue;
    if (scale >= 1.7 && isNamedBaseMapPoi(marker.kind)) continue;
    // Hide small POI labels (water/atm/toilet) at the default zoom — their
    // glyph + dot is enough until the user zooms in. Keeps the schematic
    // readable instead of a wall of overlapping text at zoom 1.
    if (isSmallPoiKind(marker.kind) && scale < 1.5) continue;
    const label = mapLabelText(marker);
    if (style.smallLabel) drawMiniLabel(ctx, label, marker.point.x + radius + fixed(14), marker.point.y, style.labelTone, scale, labels);
    else drawLabel(ctx, label, marker.point.x + radius + fixed(18), marker.point.y, scale, labels);
  }
  ctx.restore();
}

function isSmallPoiKind(kind: string): boolean {
  return kind === 'toilet' || kind === 'water' || kind === 'atm' || kind === 'family' || kind === 'view';
}

function isNamedBaseMapPoi(kind: string): boolean {
  return kind === 'station' || kind === 'tube-exit' || kind === 'landmark' || kind === 'meeting' || kind === 'exit';
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

function drawCrowdHeat(ctx: CanvasRenderingContext2D, clusters: FanEventCluster[], extent: MapExtent, scale: number) {
  const fixed = fixedSize(scale);
  ctx.save();
  for (const cluster of clusters) {
    const p = lngLatToPixel(cluster.point, extent);
    const radius = fixed(Math.min(118, 38 + cluster.count * 12));
    const alpha = Math.min(0.32, 0.08 + cluster.count * 0.035);

    const gradient = ctx.createRadialGradient(p.x, p.y, fixed(12), p.x, p.y, radius);
    gradient.addColorStop(0, `rgba(239, 1, 7, ${alpha})`);
    gradient.addColorStop(0.48, `rgba(237, 187, 74, ${alpha * 0.62})`);
    gradient.addColorStop(1, 'rgba(237, 187, 74, 0)');

    ctx.beginPath();
    ctx.arc(p.x, p.y, radius, 0, Math.PI * 2);
    ctx.fillStyle = gradient;
    ctx.fill();

    ctx.beginPath();
    ctx.arc(p.x, p.y, fixed(Math.min(24, 10 + cluster.count * 2)), 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(239, 1, 7, 0.72)';
    ctx.fill();
    ctx.lineWidth = fixed(2);
    ctx.strokeStyle = '#F5EFE4';
    ctx.stroke();
  }
  ctx.restore();
}

function drawFanEvents(ctx: CanvasRenderingContext2D, clusters: FanEventCluster[], extent: MapExtent, scale: number, labels: LabelRect[]) {
  const presence = clusters.filter((cluster) => cluster.type === 'presence').slice(0, 10);
  const reports = clusters.filter((cluster) => cluster.type !== 'presence').slice(0, 12);
  const fixed = fixedSize(scale);

  ctx.save();
  for (const cluster of presence) {
    const p = offsetClusterPoint(lngLatToPixel(cluster.point, extent), cluster.type);
    const radius = fixed(Math.min(44, 22 + cluster.count * 5));
    ctx.beginPath();
    ctx.arc(p.x, p.y, radius, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(237, 187, 74, 0.62)';
    ctx.fill();
    ctx.lineWidth = fixed(3);
    ctx.strokeStyle = 'rgba(20, 18, 15, 0.62)';
    ctx.stroke();
    if (cluster.count > 1) drawLabel(ctx, `${cluster.count} here`, p.x + radius + fixed(10), p.y, scale, labels);
  }

  for (const cluster of reports) {
    const p = offsetClusterPoint(lngLatToPixel(cluster.point, extent), cluster.type);
    const color = eventColor(cluster.type);
    const radius = fixed(clusterRadius(cluster));
    ctx.beginPath();
    ctx.arc(p.x, p.y, radius, 0, Math.PI * 2);
    ctx.fillStyle = color.soft;
    ctx.fill();
    ctx.lineWidth = fixed(3);
    ctx.strokeStyle = color.strong;
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(p.x, p.y, fixed(18), 0, Math.PI * 2);
    ctx.fillStyle = color.strong;
    ctx.fill();
    drawEventBadge(ctx, cluster.type, p.x, p.y, scale);
    drawLabel(ctx, clusterLabel(cluster), p.x + radius + fixed(8), p.y, scale, labels);
  }
  ctx.restore();
}

function drawScheduleMarkers(ctx: CanvasRenderingContext2D, schedule: RoutePack['scheduleEstimate'], extent: MapExtent, scale: number) {
  ctx.save();
  const fixed = fixedSize(scale);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  let index = 0;
  for (const row of schedule) {
    if (typeof row.lng !== 'number' || typeof row.lat !== 'number') continue;
    index += 1;
    const p = lngLatToPixel({ lng: row.lng, lat: row.lat }, extent);
    // Slight up-shift so the marker sits above the route polyline.
    const y = p.y - fixed(64);
    ctx.beginPath();
    ctx.arc(p.x, y, fixed(26), 0, Math.PI * 2);
    ctx.fillStyle = '#F5EFE4';
    ctx.fill();
    ctx.lineWidth = fixed(5);
    ctx.strokeStyle = '#EF0107';
    ctx.stroke();
    ctx.fillStyle = '#EF0107';
    ctx.font = `700 ${fixed(28)}px "JetBrains Mono", ui-monospace, monospace`;
    ctx.fillText(String(index), p.x, y + fixed(2));
  }
  ctx.textAlign = 'start';
  ctx.textBaseline = 'alphabetic';
  ctx.restore();
}

function drawWalkLine(ctx: CanvasRenderingContext2D, from: GpsFix, to: PlanPoint, extent: MapExtent, scale: number) {
  const a = lngLatToPixel(from, extent);
  const b = lngLatToPixel(to, extent);
  const fixed = fixedSize(scale);
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(a.x, a.y);
  ctx.lineTo(b.x, b.y);
  ctx.lineWidth = fixed(8);
  ctx.lineCap = 'round';
  ctx.setLineDash([fixed(2), fixed(18)]);
  ctx.strokeStyle = '#5E7B5C';
  ctx.stroke();
  ctx.restore();
}

function drawGps(
  ctx: CanvasRenderingContext2D,
  gps: GpsFix,
  extent: MapExtent,
  scale: number,
  showLabel: boolean,
  labels: LabelRect[],
) {
  const p = lngLatToPixel(gps, extent);
  const radius = metersToPixelRadius(gps, gps.accuracyM, extent);
  const fixed = fixedSize(scale);
  ctx.save();
  ctx.beginPath();
  ctx.arc(p.x, p.y, Math.max(10, Math.min(220, radius)), 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(239, 1, 7, 0.14)';
  ctx.fill();
  ctx.strokeStyle = 'rgba(239, 1, 7, 0.5)';
  ctx.lineWidth = fixed(7);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(p.x, p.y, fixed(34), 0, Math.PI * 2);
  ctx.fillStyle = '#EF0107';
  ctx.fill();
  ctx.lineWidth = fixed(12);
  ctx.strokeStyle = '#F5EFE4';
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(p.x, p.y, fixed(44), 0, Math.PI * 2);
  ctx.lineWidth = fixed(3);
  ctx.strokeStyle = 'rgba(20, 18, 15, 0.7)';
  ctx.stroke();
  if (showLabel) drawLabel(ctx, 'You are here', p.x + fixed(54), p.y, scale, labels, { force: true });
  ctx.restore();
}

function drawBusMarkers(ctx: CanvasRenderingContext2D, markers: BusMarker[], extent: MapExtent, scale: number, labels: LabelRect[]) {
  ctx.save();
  const fixed = fixedSize(scale);
  for (const marker of markers) {
    const alpha = busMarkerAlpha(marker);
    const point =
      typeof marker.snapped_lng === 'number' && typeof marker.snapped_lat === 'number'
        ? { lng: marker.snapped_lng, lat: marker.snapped_lat }
        : { lng: marker.lng, lat: marker.lat };
    const p = lngLatToPixel(point, extent);
    ctx.globalAlpha = alpha;
    ctx.beginPath();
    ctx.arc(p.x, p.y, fixed(54), 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(239, 1, 7, 0.2)';
    ctx.fill();
    ctx.beginPath();
    ctx.arc(p.x, p.y, fixed(24), 0, Math.PI * 2);
    ctx.fillStyle = '#EF0107';
    ctx.fill();
    ctx.lineWidth = fixed(9);
    ctx.strokeStyle = '#F5EFE4';
    ctx.stroke();
    drawLabel(ctx, alpha < 0.5 ? 'Old bus tap' : 'Bus tap', p.x + fixed(58), p.y, scale, labels);
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

function drawSideTings(ctx: CanvasRenderingContext2D, rows: SideTing[], extent: MapExtent, scale: number, labels: LabelRect[]) {
  ctx.save();
  const fixed = fixedSize(scale);
  for (const row of rows.slice(0, 5)) {
    if (!row.primary) continue;
    const p = lngLatToPixel(row.primary, extent);
    const ageSource = row.lastSeenAt ?? row.addedAt;
    const ageMin = (Date.now() - Date.parse(ageSource)) / 60_000;
    const stale = !Number.isFinite(ageMin) || ageMin > 10 || !row.lastSeenAt;
    ctx.beginPath();
    ctx.arc(p.x, p.y, fixed(34), 0, Math.PI * 2);
    ctx.fillStyle = stale ? 'rgba(237, 187, 74, 0.18)' : '#EDBB4A';
    ctx.fill();
    ctx.lineWidth = fixed(stale ? 7 : 9);
    ctx.strokeStyle = stale ? 'rgba(20, 18, 15, 0.7)' : '#14120F';
    ctx.stroke();
    if (stale) {
      ctx.beginPath();
      ctx.arc(p.x, p.y, fixed(20), 0, Math.PI * 2);
      ctx.strokeStyle = '#EDBB4A';
      ctx.lineWidth = fixed(5);
      ctx.stroke();
    }
    drawLabel(ctx, chipForGroupName(row.name), p.x + fixed(50), p.y, scale, labels);
  }
  ctx.restore();
}

function drawGroupMembers(
  ctx: CanvasRenderingContext2D,
  members: GroupLiveMember[],
  extent: MapExtent,
  scale: number,
  labels: LabelRect[],
) {
  ctx.save();
  const fixed = fixedSize(scale);
  for (const member of members.slice(0, 8)) {
    if (!member.hasLocation) continue;
    const p = lngLatToPixel(member, extent);
    const ageMs = Date.now() - Date.parse(member.lastSeenAt);
    const stale = !Number.isFinite(ageMs) || ageMs > 8 * 60_000;
    const radius = fixed(stale ? 26 : 34);
    ctx.beginPath();
    ctx.arc(p.x, p.y, radius + fixed(12), 0, Math.PI * 2);
    ctx.fillStyle = stale ? 'rgba(94, 123, 92, 0.10)' : 'rgba(94, 123, 92, 0.20)';
    ctx.fill();
    ctx.beginPath();
    ctx.arc(p.x, p.y, radius, 0, Math.PI * 2);
    ctx.fillStyle = stale ? '#EDE6D5' : '#5E7B5C';
    ctx.fill();
    ctx.lineWidth = fixed(8);
    ctx.strokeStyle = stale ? 'rgba(20, 18, 15, 0.58)' : '#14120F';
    ctx.stroke();
    ctx.fillStyle = stale ? '#14120F' : '#F5EFE4';
    ctx.font = `800 ${fixed(17)}px "JetBrains Mono", ui-monospace, monospace`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(initialsOf(member.memberName), p.x, p.y + fixed(1));
    drawLabel(ctx, memberLabel(member), p.x + radius + fixed(16), p.y, scale, labels);
  }
  ctx.textAlign = 'start';
  ctx.textBaseline = 'alphabetic';
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

function drawEventBadge(ctx: CanvasRenderingContext2D, type: FanEventType, x: number, y: number, scale: number) {
  const badge = FAN_EVENT_BADGES[type];
  const fixed = fixedSize(scale);
  ctx.save();
  ctx.fillStyle = type === 'crowd_dense' ? '#14120F' : '#F5EFE4';
  ctx.font = `${badge.length > 2 ? `800 ${fixed(14)}px` : `800 ${fixed(17)}px`} "JetBrains Mono", ui-monospace, monospace`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(badge, x, y + fixed(1));
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

function memberLabel(member: GroupLiveMember): string {
  const name = member.displayName.trim() || member.memberName;
  const ageMs = Date.now() - Date.parse(member.lastSeenAt);
  if (Number.isFinite(ageMs) && ageMs > 8 * 60_000) return `${name} · old`;
  return `${name} · live`;
}

function initialsOf(name: string): string {
  const cleaned = name.trim();
  if (!cleaned) return '?';
  const parts = cleaned.split(/\s+/);
  if (parts.length >= 2 && parts[1]) {
    return `${(parts[0]?.[0] ?? '').toUpperCase()}${(parts[1][0] ?? '').toUpperCase()}`;
  }
  return cleaned.slice(0, 2).toUpperCase();
}

function drawLabel(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  scale = 1,
  labels?: LabelRect[],
  options: { force?: boolean } = {},
) {
  const fixed = fixedSize(scale);
  const displayText = text.length > 30 ? `${text.slice(0, 27)}...` : text;
  ctx.font = `700 ${fixed(40)}px "JetBrains Mono", ui-monospace, monospace`;
  const padded = fixed(displayText.length * 24 + 30);
  let labelX = x;
  if (labelX + padded > 1782) labelX = x - padded - fixed(60);
  labelX = Math.max(18, Math.min(1782 - padded, labelX));
  const labelY = Math.max(42, Math.min(1758, y));
  const rect = { x: labelX - fixed(14), y: labelY - fixed(32), width: padded, height: fixed(64) };
  if (labels && !reserveLabel(labels, rect, fixed(8), Boolean(options.force))) return false;
  ctx.fillStyle = 'rgba(245, 239, 228, 0.94)';
  roundRect(ctx, rect.x, rect.y, rect.width, rect.height, 0);
  ctx.fill();
  ctx.lineWidth = fixed(3);
  ctx.strokeStyle = 'rgba(20, 18, 15, 0.82)';
  ctx.stroke();
  ctx.fillStyle = '#14120F';
  ctx.fillText(displayText, labelX, labelY + fixed(3));
  return true;
}

function drawMiniLabel(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  tone: 'default' | 'transit' | 'landmark' = 'default',
  scale = 1,
  labels?: LabelRect[],
) {
  const fixed = fixedSize(scale);
  const displayText = text.length > 22 ? `${text.slice(0, 19)}...` : text;
  ctx.font = `800 ${fixed(38)}px "JetBrains Mono", ui-monospace, monospace`;
  const padded = fixed(displayText.length * 23 + 30);
  let labelX = x;
  if (labelX + padded > 1782) labelX = x - padded - fixed(58);
  labelX = Math.max(18, Math.min(1782 - padded, labelX));
  const labelY = Math.max(42, Math.min(1758, y));
  const rect = { x: labelX - fixed(14), y: labelY - fixed(30), width: padded, height: fixed(60) };
  if (labels && !reserveLabel(labels, rect, fixed(8))) return false;
  ctx.fillStyle = tone === 'transit' ? 'rgba(245, 239, 228, 0.96)' : 'rgba(237, 230, 213, 0.94)';
  roundRect(ctx, rect.x, rect.y, rect.width, rect.height, 0);
  ctx.fill();
  ctx.lineWidth = fixed(tone === 'transit' ? 4 : 2);
  ctx.strokeStyle = tone === 'transit' ? '#14120F' : 'rgba(20, 18, 15, 0.72)';
  ctx.stroke();
  ctx.fillStyle = tone === 'transit' ? '#14120F' : '#4C473F';
  ctx.fillText(displayText, labelX, labelY + fixed(4));
  return true;
}

function reserveLabel(labels: LabelRect[], rect: LabelRect, padding: number, force = false): boolean {
  if (!force && labels.some((existing) => rectsOverlap(expandRect(existing, padding), expandRect(rect, padding)))) {
    return false;
  }
  labels.push(rect);
  return true;
}

function expandRect(rect: LabelRect, padding: number): LabelRect {
  return {
    x: rect.x - padding,
    y: rect.y - padding,
    width: rect.width + padding * 2,
    height: rect.height + padding * 2,
  };
}

function rectsOverlap(a: LabelRect, b: LabelRect): boolean {
  return a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;
}

function fixedSize(scale: number): (value: number) => number {
  const factor = 1 / Math.max(1, scale);
  return (value: number) => value * factor;
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
