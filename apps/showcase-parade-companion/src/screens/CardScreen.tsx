import { useMemo, useState } from 'react';
import type { RoutePack } from '../data/parade-2026';
import type { BusMarker } from '../lib/bus';
import {
  eventAgeLabel,
  eventSegmentLabel,
  summarizeFanEvents,
  type FanEvent,
} from '../lib/fan-events';
import type { GroupPlan } from '../lib/group-plan';

interface CardScreenProps {
  pack: RoutePack;
  fanEvents: FanEvent[];
  busMarkers: BusMarker[];
  plan: GroupPlan | null;
}

export function CardScreen({ pack, fanEvents, busMarkers, plan }: CardScreenProps) {
  const [status, setStatus] = useState('');
  const summary = useMemo(() => summarizeFanEvents(fanEvents), [fanEvents]);
  const card = useMemo(
    () => buildCardSvg({ pack, fanEvents, busMarkers, plan }),
    [pack, fanEvents, busMarkers, plan],
  );
  const cardUrl = useMemo(() => `data:image/svg+xml;charset=utf-8,${encodeURIComponent(card)}`, [card]);
  const shareText = makeShareText(summary.totalSignals, summary.latestBus, plan);

  const share = async () => {
    const nav = navigator as Navigator & {
      share?: (data: ShareData) => Promise<void>;
      clipboard?: { writeText: (text: string) => Promise<void> };
    };
    try {
      if (typeof nav.share === 'function') {
        await nav.share({
          title: 'Parade Companion',
          text: shareText,
        });
        setStatus('Share sheet opened.');
        return;
      }
      await nav.clipboard?.writeText(shareText);
      setStatus('Share text copied.');
    } catch {
      setStatus('Share cancelled. The card is still generated on this phone.');
    }
  };

  return (
    <section className="screen card-screen">
      <div className="screen-heading">
        <p className="eyebrow">Made on this phone</p>
        <h1>Card</h1>
        <p>A simple parade memory from your local taps. It does not upload photos, video, or location.</p>
      </div>

      <div className="card-preview-frame">
        <img src={cardUrl} className="parade-card-preview" alt="Generated parade card" />
      </div>

      <div className="card-actions">
        <button type="button" className="primary-action" onClick={() => void share()}>
          Share text
        </button>
        <a className="secondary-action download-link" href={cardUrl} download="parade-card.svg">
          Save card
        </a>
      </div>
      {status ? <p className="inline-status">{status}</p> : null}

      <div className="panel">
        <h2>Keep it quick</h2>
        <p>Tap, glance, pocket. The app gives you the memory without turning the parade into screen time.</p>
      </div>
    </section>
  );
}

function buildCardSvg({
  pack,
  fanEvents,
  busMarkers,
  plan,
}: {
  pack: RoutePack;
  fanEvents: FanEvent[];
  busMarkers: BusMarker[];
  plan: GroupPlan | null;
}): string {
  const summary = summarizeFanEvents(fanEvents);
  const latestBus = summary.latestBus;
  const busLine = latestBus
    ? `${eventAgeLabel(latestBus)} at ${eventSegmentLabel(latestBus)}`
    : busMarkers.length > 0
      ? 'saved locally'
      : 'not seen yet';
  const place = plan?.primary.label ?? 'Islington';
  const signals = summary.totalSignals.toString();
  const carried = summary.carriedPhones.toString();
  const title = 'Parade Companion';
  const subtitle = pack.event.dateLabel;

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1350" viewBox="0 0 1080 1350">
  <rect width="1080" height="1350" fill="#F5EFE4"/>
  <rect x="56" y="58" width="968" height="1234" fill="#EDE6D5" stroke="#14120F" stroke-opacity=".25" stroke-width="3"/>
  <rect x="56" y="58" width="968" height="28" fill="#EF0107"/>
  <text x="88" y="154" fill="#EF0107" font-family="monospace" font-size="30" font-weight="700" letter-spacing="7">UNOFFICIAL LOCAL TOOL</text>
  <text x="88" y="268" fill="#14120F" font-family="Georgia, serif" font-size="100" font-style="italic" font-weight="500">${escapeXml(title)}</text>
  <text x="88" y="338" fill="#14120F" fill-opacity=".72" font-family="Arial, sans-serif" font-size="40">${escapeXml(subtitle)}</text>
  <line x1="88" x2="992" y1="408" y2="408" stroke="#EF0107" stroke-width="5"/>
  <text x="88" y="505" fill="#14120F" font-family="monospace" font-size="34" font-weight="700">I WAS NEAR</text>
  <text x="88" y="580" fill="#14120F" font-family="Georgia, serif" font-size="74" font-style="italic">${escapeXml(place)}</text>
  <g transform="translate(88 700)">
    <rect width="276" height="188" fill="#F5EFE4" stroke="#14120F" stroke-opacity=".25" stroke-width="3"/>
    <text x="28" y="58" fill="#EF0107" font-family="monospace" font-size="26" font-weight="700">SIGNALS</text>
    <text x="28" y="138" fill="#14120F" font-family="monospace" font-size="68">${escapeXml(signals)}</text>
  </g>
  <g transform="translate(402 700)">
    <rect width="276" height="188" fill="#F5EFE4" stroke="#14120F" stroke-opacity=".25" stroke-width="3"/>
    <text x="28" y="58" fill="#EF0107" font-family="monospace" font-size="26" font-weight="700">CARRIED</text>
    <text x="28" y="138" fill="#14120F" font-family="monospace" font-size="68">${escapeXml(carried)}</text>
  </g>
  <g transform="translate(716 700)">
    <rect width="276" height="188" fill="#F5EFE4" stroke="#14120F" stroke-opacity=".25" stroke-width="3"/>
    <text x="28" y="58" fill="#EF0107" font-family="monospace" font-size="26" font-weight="700">BUS</text>
    <text x="28" y="138" fill="#14120F" font-family="monospace" font-size="40">${escapeXml(latestBus ? 'seen' : 'local')}</text>
  </g>
  <text x="88" y="1010" fill="#14120F" font-family="monospace" font-size="34" font-weight="700">BUS: ${escapeXml(busLine)}</text>
  <text x="88" y="1090" fill="#14120F" fill-opacity=".72" font-family="Arial, sans-serif" font-size="34">Offline map. Local taps. Phone-to-phone pulse.</text>
  <text x="88" y="1228" fill="#EF0107" font-family="monospace" font-size="34" font-weight="700" letter-spacing="7">A R S E N A L</text>
  <text x="88" y="1275" fill="#14120F" fill-opacity=".55" font-family="monospace" font-size="24">Parade Companion - Islington. Unofficial, not affiliated.</text>
</svg>`;
}

function makeShareText(totalSignals: number, latestBus: FanEvent | null, plan: GroupPlan | null): string {
  const place = plan?.primary.label ?? 'Islington';
  const bus = latestBus ? ` Bus seen ${eventAgeLabel(latestBus)} near ${eventSegmentLabel(latestBus)}.` : '';
  return `I used Parade Companion offline near ${place}. ${totalSignals} local signal${totalSignals === 1 ? '' : 's'} carried on my phone.${bus}`;
}

function escapeXml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
}
