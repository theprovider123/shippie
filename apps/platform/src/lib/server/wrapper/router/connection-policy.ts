type RuntimeConnectionGuard = {
  schema: string;
  passed: boolean;
  summary: string;
  blocks: number;
  warns: number;
  infos: number;
  connections: Array<{
    host: string;
    protocol: string;
    category: string;
    reason: string;
    destinations: string[];
    methods: string[];
    occurrences: number;
    files: string[];
    risk: 'low' | 'medium' | 'high';
    requiresConsent: boolean;
    data: string[];
    purpose: string;
  }>;
  csp: {
    connectSrc: string[];
    scriptSrc: string[];
    styleSrc: string[];
    fontSrc: string[];
    imgSrc: string[];
    frameSrc: string[];
    workerSrc: string[];
    manifestSrc: string[];
  };
};

export const EMPTY_CONNECTION_GUARD: RuntimeConnectionGuard = {
  schema: 'shippie.connection-guard.v1',
  passed: true,
  summary: 'No external connections detected. App remains device-local by default.',
  blocks: 0,
  warns: 0,
  infos: 0,
  connections: [],
  csp: {
    connectSrc: [],
    scriptSrc: [],
    styleSrc: [],
    fontSrc: [],
    imgSrc: [],
    frameSrc: [],
    workerSrc: [],
    manifestSrc: [],
  },
};

export function wrappedUrlConnectionGuard(upstreamUrl: string): RuntimeConnectionGuard {
  const upstream = safeUrl(upstreamUrl);
  if (!upstream) return EMPTY_CONNECTION_GUARD;
  const host = upstream.hostname.toLowerCase();

  return {
    schema: 'shippie.connection-guard.v1',
    passed: true,
    summary: `Wrapped URL app. Shippie proxies ${host} and discloses it because static bundle scanning is unavailable for hosted upstreams.`,
    blocks: 0,
    warns: 1,
    infos: 0,
    connections: [
      {
        host,
        protocol: upstream.protocol,
        category: 'wrapped-url',
        reason: 'hosted upstream declared for legacy wrapped URL mode',
        destinations: ['connect'],
        methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
        occurrences: 1,
        files: ['apps:{slug}:wrap'],
        risk: 'high',
        requiresConsent: true,
        data: ['user_data', 'personal_context'],
        purpose: 'Hosted app upstream',
      },
    ],
    csp: {
      connectSrc: [host],
      scriptSrc: [],
      styleSrc: [],
      fontSrc: [],
      imgSrc: [],
      frameSrc: [],
      workerSrc: [],
      manifestSrc: [],
    },
  };
}

export function connectionGuardHost(guard: unknown): string[] {
  if (!guard || typeof guard !== 'object') return [];
  const connections = (guard as { connections?: unknown }).connections;
  if (!Array.isArray(connections)) return [];
  return connections
    .map((connection) => {
      if (!connection || typeof connection !== 'object') return '';
      const host = (connection as { host?: unknown }).host;
      return typeof host === 'string' ? host : '';
    })
    .filter(Boolean)
    .sort();
}

function safeUrl(raw: string): URL | null {
  try {
    return new URL(raw);
  } catch {
    return null;
  }
}
