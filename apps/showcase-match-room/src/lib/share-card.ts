import { HOST_CITIES, HOST_CITY_PROFILES, OPENING_FIXTURE, fixtureTitle, teamByCode } from '../data/tournament.ts';

export interface ShareCardInput {
  roomName: string;
  prediction?: string;
  provenance: string;
  moment?: string;
  supporterName?: string;
  teamCode?: string;
  teamName?: string;
  primaryColor?: string;
  secondaryColor?: string;
}

export function createOpeningShareCardSvg(input: ShareCardInput): string {
  const title = fixtureTitle(OPENING_FIXTURE);
  const prediction = input.prediction ?? 'Prediction locked';
  const moment = input.moment ?? 'Match receipt';
  const cardLabel = momentLabel(moment);
  const roomName = escapeXml(input.roomName);
  const provenance = escapeXml(input.provenance);
  const supporterName = escapeXml(input.supporterName ?? 'Match Room');
  const teamCode = escapeXml(input.teamCode ?? 'MEX');
  const teamName = escapeXml(input.teamName ?? 'Mexico');
  const primaryColor = escapeXml(input.primaryColor ?? '#0E5C3A');
  const secondaryColor = escapeXml(input.secondaryColor ?? '#C9A24B');
  const city = HOST_CITIES.find((item) => item.code === OPENING_FIXTURE.cityCode) ?? HOST_CITIES[0]!;
  const cityProfile = HOST_CITY_PROFILES[city.code]!;
  const home = teamByCode(OPENING_FIXTURE.home);
  const away = teamByCode(OPENING_FIXTURE.away);
  const cityA = escapeXml(city.palette[0]);
  const cityB = escapeXml(city.palette[1]);
  const cityC = escapeXml(city.palette[2]);
  const homeA = escapeXml(home.swatch[0]);
  const homeB = escapeXml(home.swatch[1]);
  const awayA = escapeXml(away.swatch[0]);
  const awayB = escapeXml(away.swatch[1]);
  const titleLines = svgTextLines(title, 18, 2);
  const predictionLines = svgTextLines(prediction, 30, 3);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1350" viewBox="0 0 1080 1350">
  <defs>
    <linearGradient id="paper" x1="0" x2="1" y1="0" y2="1">
      <stop offset="0" stop-color="#FFFDF7"/>
      <stop offset="0.54" stop-color="#FAF7EF"/>
      <stop offset="1" stop-color="#EDE2CE"/>
    </linearGradient>
    <linearGradient id="inkWash" x1="0" x2="1" y1="0" y2="1">
      <stop offset="0" stop-color="${primaryColor}"/>
      <stop offset="0.58" stop-color="#173E31"/>
      <stop offset="1" stop-color="#10110F"/>
    </linearGradient>
    <pattern id="paperGrain" width="32" height="32" patternUnits="userSpaceOnUse">
      <path d="M0 20h32M14 0v32" stroke="#171513" stroke-opacity="0.035" stroke-width="1"/>
      <circle cx="7" cy="8" r="1.4" fill="#171513" fill-opacity="0.035"/>
      <circle cx="24" cy="24" r="1" fill="#171513" fill-opacity="0.03"/>
    </pattern>
    <pattern id="cityMotif" width="96" height="82" patternUnits="userSpaceOnUse">
      <path d="M0 20h96M16 0l32 40 32-40M16 82l32-40 32 40" fill="none" stroke="#FAF7EF" stroke-opacity="0.16" stroke-width="3"/>
    </pattern>
    <filter id="softShadow" x="-20%" y="-20%" width="140%" height="140%">
      <feDropShadow dx="0" dy="22" stdDeviation="20" flood-color="#171513" flood-opacity="0.18"/>
    </filter>
  </defs>
  <rect width="1080" height="1350" fill="url(#paper)"/>
  <rect width="1080" height="1350" fill="url(#paperGrain)" opacity="0.9"/>
  <path d="M0 0h1080v190c-86 30-156-18-240 14-94 36-164 18-236-12-84-36-168-22-258 8-104 34-184 4-346 26V0z" fill="${cityA}" opacity="0.9"/>
  <path d="M0 1086c172-42 262-2 380-34 126-34 198-98 338-56 112 34 202 20 362-38v392H0z" fill="${cityB}" opacity="0.16"/>
  <g filter="url(#softShadow)">
    <path d="M76 98h928v1100l-34 22 34 22v44H76v-44l34-22-34-22V98z" fill="#FFFDF7"/>
    <path d="M76 98h928v1100l-34 22 34 22v44H76v-44l34-22-34-22V98z" fill="url(#paperGrain)" opacity="0.64"/>
    <path d="M76 98h928v326H76z" fill="url(#inkWash)"/>
    <path d="M76 98h928v326H76z" fill="url(#cityMotif)" opacity="0.8"/>
    <path d="M76 424h928" stroke="${secondaryColor}" stroke-width="7"/>
  </g>
  <text x="126" y="164" fill="${cityC}" font-family="Inter, Arial" font-size="29" font-weight="900" letter-spacing="4">SHIPPIE MATCH ROOM</text>
  <text x="126" y="214" fill="#FAF7EF" font-family="Inter, Arial" font-size="25" font-weight="800" letter-spacing="2">${escapeXml(city.name)} · ${escapeXml(cityProfile.venueName)}</text>
  <text x="126" y="314" fill="#FAF7EF" font-family="Georgia, Fraunces, serif" font-size="78" font-weight="800" letter-spacing="0">
    ${titleLines.map((line, index) => `<tspan x="126" dy="${index === 0 ? 0 : 84}">${escapeXml(line)}</tspan>`).join('')}
  </text>
  <g transform="translate(126 480)">
    <rect width="828" height="190" rx="32" fill="#171513"/>
    <rect width="414" height="190" rx="32" fill="${homeA}"/>
    <rect y="95" width="414" height="95" rx="0" fill="${homeB}" opacity="0.82"/>
    <rect x="414" width="414" height="190" rx="32" fill="${awayA}"/>
    <rect x="414" y="95" width="414" height="95" rx="0" fill="${awayB}" opacity="0.82"/>
    <rect x="358" y="40" width="112" height="112" rx="56" fill="#FFFDF7"/>
    <text x="414" y="116" text-anchor="middle" fill="#171513" font-family="Georgia, serif" font-size="44" font-weight="900">v</text>
    <text x="70" y="84" fill="#FFFDF7" font-family="Inter, Arial" font-size="42" font-weight="900">${escapeXml(home.code)}</text>
    <text x="70" y="135" fill="#FFFDF7" font-family="Inter, Arial" font-size="26" font-weight="700">${escapeXml(home.name)}</text>
    <text x="758" y="84" text-anchor="end" fill="#FFFDF7" font-family="Inter, Arial" font-size="42" font-weight="900">${escapeXml(away.code)}</text>
    <text x="758" y="135" text-anchor="end" fill="#FFFDF7" font-family="Inter, Arial" font-size="26" font-weight="700">${escapeXml(away.name)}</text>
  </g>
  <text x="126" y="760" fill="#8A1538" font-family="Inter, Arial" font-size="24" font-weight="900" letter-spacing="4">${escapeXml(cardLabel)}</text>
  <text x="126" y="830" fill="#171513" font-family="Georgia, Fraunces, serif" font-size="58" font-weight="800">
    ${predictionLines.map((line, index) => `<tspan x="126" dy="${index === 0 ? 0 : 66}">${escapeXml(line)}</tspan>`).join('')}
  </text>
  <g transform="translate(126 1012)">
    <rect width="828" height="128" rx="28" fill="#F3E9D8"/>
    <rect width="14" height="128" fill="${primaryColor}"/>
    <text x="42" y="52" fill="#171513" font-family="Inter, Arial" font-size="27" font-weight="900">${supporterName}</text>
    <text x="42" y="92" fill="#5F584F" font-family="Inter, Arial" font-size="25" font-weight="700">Backing ${teamName} · ${roomName}</text>
    <text x="788" y="76" text-anchor="end" fill="${primaryColor}" font-family="Inter, Arial" font-size="42" font-weight="950">${teamCode}</text>
  </g>
  <g transform="translate(126 1178)">
    <text x="0" y="0" fill="#5F584F" font-family="Inter, Arial" font-size="24" font-weight="800">${provenance}</text>
    <text x="0" y="48" fill="#171513" font-family="Inter, Arial" font-size="30" font-weight="900">no ads · no account · shippie.app</text>
    <path d="M0 78h828" stroke="${secondaryColor}" stroke-width="4" stroke-dasharray="18 16"/>
  </g>
</svg>`;
}

export function shareCardDataUrl(svg: string): string {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

function momentLabel(value: string): string {
  const lower = value.toLowerCase();
  if (lower.includes('var')) return 'VAR VERDICT';
  if (lower.includes('trivia') || lower.includes('daily')) return 'TRIVIA FLEX';
  if (lower.includes('invite')) return 'ROOM INVITE';
  if (lower.includes('score') || lower.includes('prediction')) return 'PREDICTION RECEIPT';
  if (lower.includes('leader')) return 'LEADERBOARD DRAMA';
  return 'MATCH RECEIPT';
}

function escapeXml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

function svgTextLines(value: string, maxChars: number, maxLines: number): string[] {
  const words = value.replace(/\s+/g, ' ').trim().split(' ').filter(Boolean);
  const lines: string[] = [];
  for (const word of words) {
    const current = lines[lines.length - 1];
    if (!current) {
      lines.push(word);
      continue;
    }
    if (`${current} ${word}`.length <= maxChars) {
      lines[lines.length - 1] = `${current} ${word}`;
      continue;
    }
    if (lines.length < maxLines) {
      lines.push(word);
    } else {
      lines[lines.length - 1] = `${current}...`;
      break;
    }
  }
  return lines.length ? lines : ['Match Room'];
}
