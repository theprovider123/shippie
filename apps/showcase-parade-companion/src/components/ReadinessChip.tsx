import { useEffect, useMemo, useState } from 'react';
import type { RoutePack } from '../data/parade-2026';
import { packFreshnessLabel } from '../lib/route-pack';

const READINESS_CHECK_DELAYS_MS = [0, 1200, 4000];

interface ReadinessChipProps {
  pack: RoutePack;
  onShowStatus?: () => void;
  onReadinessChange?: (readiness: Readiness) => void;
  visible?: boolean;
}

export type Readiness = 'checking' | 'ready' | 'needs-online' | 'unknown';

export function ReadinessChip({ pack, onShowStatus, onReadinessChange, visible = true }: ReadinessChipProps) {
  const [readiness, setReadiness] = useState<Readiness>('checking');
  const assets = useMemo(
    () => [
      `${import.meta.env.BASE_URL}basemap/corridor.webp`,
      `${import.meta.env.BASE_URL}route-pack.json`,
      `${import.meta.env.BASE_URL}fonts/fraunces-roman.woff2`,
      `${import.meta.env.BASE_URL}fonts/fraunces-italic.woff2`,
      `${import.meta.env.BASE_URL}fonts/jetbrains-mono.woff2`,
      `${import.meta.env.BASE_URL}fonts/general-sans-400.woff2`,
      `${import.meta.env.BASE_URL}fonts/general-sans-500.woff2`,
      `${import.meta.env.BASE_URL}fonts/general-sans-600.woff2`,
      `${import.meta.env.BASE_URL}fonts/general-sans-700.woff2`,
    ],
    [],
  );

  useEffect(() => {
    let cancelled = false;
    const timers: number[] = [];

    async function readReadiness(): Promise<Readiness> {
      if (!('caches' in window)) {
        return 'unknown';
      }
      try {
        const matches = await Promise.all(
          assets.map(async (asset) => {
            const absolute = new URL(asset, window.location.href).toString();
            return (await caches.match(absolute, { ignoreSearch: true })) ?? (await caches.match(asset, { ignoreSearch: true }));
          }),
        );
        return matches.every(Boolean) ? 'ready' : 'needs-online';
      } catch {
        return 'unknown';
      }
    }

    async function check(finalPass = true) {
      const next = await readReadiness();
      if (cancelled) return;
      setReadiness(next === 'needs-online' && !finalPass ? 'checking' : next);
    }

    READINESS_CHECK_DELAYS_MS.forEach((delay, index) => {
      timers.push(window.setTimeout(() => void check(index === READINESS_CHECK_DELAYS_MS.length - 1), delay));
    });
    if ('serviceWorker' in navigator) {
      void navigator.serviceWorker.ready.then(() => check(false)).catch(() => undefined);
    }
    const checkFinal = () => void check(true);
    window.addEventListener('online', checkFinal);
    window.addEventListener('offline', checkFinal);
    return () => {
      cancelled = true;
      timers.forEach((timer) => window.clearTimeout(timer));
      window.removeEventListener('online', checkFinal);
      window.removeEventListener('offline', checkFinal);
    };
  }, [assets]);

  useEffect(() => {
    onReadinessChange?.(readiness);
  }, [onReadinessChange, readiness]);

  const copy = readinessCopy(readiness);
  if (!visible) return null;
  const stale = isPackStale(pack.packVersion);

  return (
    <button
      type="button"
      className={`readiness-chip ${readiness}${stale ? ' is-stale' : ''}`}
      onClick={onShowStatus}
      aria-live="polite"
    >
      <strong>{stale ? 'Pack stale' : copy.title}</strong>
      <span>
        {stale
          ? `Open on Wi-Fi for the latest route · pack ${packFreshnessLabel(pack)}`
          : `${copy.detail} · pack ${packFreshnessLabel(pack)}`}
      </span>
    </button>
  );
}

/**
 * Pack is "stale" once the route pack timestamp is more than 14 days old.
 * The user should open on Wi-Fi before travelling so a live pack sync picks
 * up any council route changes.
 */
function isPackStale(packVersion: string, now = Date.now()): boolean {
  const ts = Date.parse(packVersion);
  if (!Number.isFinite(ts)) return false;
  const fourteenDaysMs = 14 * 24 * 60 * 60 * 1000;
  return now - ts > fourteenDaysMs;
}

function readinessCopy(readiness: Readiness): { title: string; detail: string } {
  if (readiness === 'ready') {
    return { title: 'Saved offline', detail: 'Map, route pack, fonts and app shell saved' };
  }
  if (readiness === 'needs-online') {
    return { title: 'Open on Wi-Fi', detail: 'Saving map, route pack, fonts and app shell' };
  }
  if (readiness === 'unknown') {
    return { title: 'Check limited', detail: 'Keep this page open before leaving' };
  }
  return { title: 'Checking offline', detail: 'Verifying route pack' };
}
