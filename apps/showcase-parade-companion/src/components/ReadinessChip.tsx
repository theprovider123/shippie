import { useEffect, useMemo, useState } from 'react';
import type { RoutePack } from '../data/parade-2026';
import { packFreshnessLabel } from '../lib/route-pack';

interface ReadinessChipProps {
  pack: RoutePack;
}

type Readiness = 'checking' | 'ready' | 'needs-online' | 'unknown';

export function ReadinessChip({ pack }: ReadinessChipProps) {
  const [readiness, setReadiness] = useState<Readiness>('checking');
  const assets = useMemo(
    () => [
      `${import.meta.env.BASE_URL}basemap/corridor.webp`,
      `${import.meta.env.BASE_URL}route-pack.json`,
      `${import.meta.env.BASE_URL}fonts/general-sans-400.woff2`,
      `${import.meta.env.BASE_URL}fonts/fraunces-italic.woff2`,
    ],
    [],
  );

  useEffect(() => {
    let cancelled = false;

    async function check() {
      if (!('caches' in window)) {
        if (!cancelled) setReadiness('unknown');
        return;
      }
      try {
        const matches = await Promise.all(
          assets.map(async (asset) => {
            const absolute = new URL(asset, window.location.href).toString();
            return (await caches.match(absolute, { ignoreSearch: true })) ?? (await caches.match(asset, { ignoreSearch: true }));
          }),
        );
        if (!cancelled) setReadiness(matches.every(Boolean) ? 'ready' : 'needs-online');
      } catch {
        if (!cancelled) setReadiness('unknown');
      }
    }

    void check();
    window.addEventListener('online', check);
    window.addEventListener('offline', check);
    return () => {
      cancelled = true;
      window.removeEventListener('online', check);
      window.removeEventListener('offline', check);
    };
  }, [assets]);

  const copy = readinessCopy(readiness);
  return (
    <div className={`readiness-chip ${readiness}`} role="status" aria-live="polite">
      <strong>{copy.title}</strong>
      <span>{copy.detail} · pack {packFreshnessLabel(pack)}</span>
    </div>
  );
}

function readinessCopy(readiness: Readiness): { title: string; detail: string } {
  if (readiness === 'ready') {
    return { title: 'Saved offline', detail: 'Map and fonts are on this phone' };
  }
  if (readiness === 'needs-online') {
    return { title: 'Open on Wi-Fi', detail: 'Finish saving before parade day' };
  }
  if (readiness === 'unknown') {
    return { title: 'Offline check limited', detail: 'Keep this page open once before leaving' };
  }
  return { title: 'Checking offline', detail: 'Verifying saved route pack' };
}
