import type { ShippieJson } from '@shippie/shared';
import type { PreflightReport } from '@/lib/preflight';
import type { TrustCheckResult } from '@/lib/trust';

export type WrapperCompatStatus = 'pass' | 'warn' | 'block' | 'not_tested';
export type WrapperCapabilityBadge = 'Works Offline' | 'Local Database' | 'Local Files' | 'Local AI' | 'Privacy First';
type WrapperCapabilityBadgeReport = WrapperCompatibilityReport['capability_badges'][number];

export interface WrapperCompatibilityReport {
  version: 1;
  generated_at: string;
  summary: {
    status: Exclude<WrapperCompatStatus, 'not_tested'>;
    passed: number;
    warnings: number;
    blockers: number;
  };
  csp: {
    status: WrapperCompatStatus;
    mode: 'enforced';
    reason: string;
    connect_src: string[];
  };
  service_worker: {
    status: WrapperCompatStatus;
    mode: 'shippie_root' | 'blocked_maker_root';
    conflicts: string[];
  };
  manifest: {
    status: WrapperCompatStatus;
    name: string;
    display?: string;
    theme_color?: string;
    categories: readonly string[];
    icon: {
      status: WrapperCompatStatus;
      source_path?: string;
      generated: boolean;
      errors: readonly string[];
    };
  };
  offline: {
    status: WrapperCompatStatus;
    html_entry: boolean;
    html_files: number;
    cacheable_assets: number;
  };
  storage: {
    status: WrapperCompatStatus;
    opfs_probe: 'client_runtime_required';
    persist_probe: 'client_runtime_required';
  };
  external_network: {
    status: WrapperCompatStatus;
    declared: boolean;
    discovered_domains: readonly string[];
    blocked_domains: readonly string[];
  };
  capability_badges: readonly {
    label: WrapperCapabilityBadge;
    status: WrapperCompatStatus;
    source: 'manifest' | 'wrapper' | 'trust';
    reason: string;
  }[];
}

export interface BuildWrapperCompatibilityReportInput {
  manifest: ShippieJson;
  preflight: PreflightReport;
  trust: TrustCheckResult;
  files: Map<string, Buffer>;
  icon?: {
    sourcePath?: string;
    generated: boolean;
    errors?: readonly string[];
  };
}

export function buildWrapperCompatibilityReport(
  input: BuildWrapperCompatibilityReportInput,
): WrapperCompatibilityReport {
  const swBlocker = input.preflight.blockers.find((f) => f.rule === 'service-worker-ownership');
  const swConflicts = Array.isArray(swBlocker?.metadata?.files)
    ? swBlocker.metadata.files.filter((f): f is string => typeof f === 'string')
    : [];
  const htmlFiles = [...input.files.keys()].filter((p) => /\.html?$/i.test(p));
  const cacheableAssets = [...input.files.keys()].filter((p) =>
    /\.(css|js|mjs|png|jpe?g|webp|gif|svg|woff2?|ttf)$/i.test(p),
  );
  const hasHtmlEntry = input.files.has('index.html') || htmlFiles.length > 0;
  const discoveredDomains = input.trust.domains.uniqueDomains;
  const allowed = new Set((input.manifest.allowed_connect_domains ?? []).map((d) => d.toLowerCase()));
  const blockedDomains = discoveredDomains.filter((domain) => !allowed.has(domain.toLowerCase()));
  const iconErrors = input.icon?.errors ?? [];
  const iconGenerated = input.icon?.generated === true;
  const categories = input.manifest.pwa?.categories ?? [input.manifest.category];

  const cspStatus: WrapperCompatStatus = input.trust.csp.connectSrc.length > 1 || discoveredDomains.length === 0 ? 'pass' : 'warn';
  const swStatus: WrapperCompatStatus = swBlocker ? 'block' : 'pass';
  const manifestStatus: WrapperCompatStatus = iconGenerated ? 'pass' : input.manifest.icon ? 'warn' : 'warn';
  const offlineStatus: WrapperCompatStatus = hasHtmlEntry ? 'pass' : 'block';
  const externalStatus: WrapperCompatStatus =
    blockedDomains.length > 0 ? 'warn' : discoveredDomains.length > 0 ? 'pass' : 'pass';
  const capabilityBadges = buildCapabilityBadges({
    manifest: input.manifest,
    offlineStatus,
    swStatus,
    discoveredDomains,
    blockedDomains,
  });

  const sections = [cspStatus, swStatus, manifestStatus, offlineStatus, externalStatus];
  const blockers = sections.filter((s) => s === 'block').length;
  const warnings = sections.filter((s) => s === 'warn').length;
  const passed = sections.filter((s) => s === 'pass').length;

  return {
    version: 1,
    generated_at: new Date().toISOString(),
    summary: {
      status: blockers > 0 ? 'block' : warnings > 0 ? 'warn' : 'pass',
      passed,
      warnings,
      blockers,
    },
    csp: {
      status: cspStatus,
      mode: 'enforced',
      reason: input.trust.csp.reason,
      connect_src: input.trust.csp.connectSrc,
    },
    service_worker: {
      status: swStatus,
      mode: swBlocker ? 'blocked_maker_root' : 'shippie_root',
      conflicts: swConflicts,
    },
    manifest: {
      status: manifestStatus,
      name: input.manifest.name,
      display: input.manifest.pwa?.display,
      theme_color: input.manifest.theme_color,
      categories,
      icon: {
        status: iconGenerated ? 'pass' : 'warn',
        source_path: input.icon?.sourcePath,
        generated: iconGenerated,
        errors: iconErrors,
      },
    },
    offline: {
      status: offlineStatus,
      html_entry: hasHtmlEntry,
      html_files: htmlFiles.length,
      cacheable_assets: cacheableAssets.length,
    },
    storage: {
      status: 'not_tested',
      opfs_probe: 'client_runtime_required',
      persist_probe: 'client_runtime_required',
    },
    external_network: {
      status: externalStatus,
      declared: input.manifest.permissions?.external_network === true,
      discovered_domains: discoveredDomains,
      blocked_domains: blockedDomains,
    },
    capability_badges: capabilityBadges,
  };
}

function buildCapabilityBadges(input: {
  manifest: ShippieJson;
  offlineStatus: WrapperCompatStatus;
  swStatus: WrapperCompatStatus;
  discoveredDomains: readonly string[];
  blockedDomains: readonly string[];
}): WrapperCompatibilityReport['capability_badges'] {
  const badges: WrapperCapabilityBadgeReport[] = [];
  const nativeBridge = input.manifest.permissions?.native_bridge ?? [];
  const hasLocalAi = nativeBridge.some((permission) => permission.startsWith('local-ai:'));

  badges.push({
    label: 'Works Offline',
    status: input.offlineStatus === 'pass' && input.swStatus === 'pass' ? 'pass' : input.offlineStatus === 'block' ? 'block' : 'warn',
    source: 'wrapper',
    reason:
      input.offlineStatus === 'pass' && input.swStatus === 'pass'
        ? 'HTML entry exists and Shippie can own the root service worker'
        : 'Offline proof requires an HTML entry and uncontested Shippie service worker scope',
  });

  if (input.manifest.permissions?.storage === 'rw') {
    badges.push({
      label: 'Local Database',
      status: 'not_tested',
      source: 'manifest',
      reason: 'Manifest requests local database/storage; client OPFS probe runs at runtime',
    });
  }

  if (input.manifest.permissions?.files === true) {
    badges.push({
      label: 'Local Files',
      status: 'not_tested',
      source: 'manifest',
      reason: 'Manifest requests local file access; client OPFS probe runs at runtime',
    });
  }

  if (hasLocalAi) {
    badges.push({
      label: 'Local AI',
      status: 'not_tested',
      source: 'manifest',
      reason: 'Manifest requests local AI features; model and device capability checks run at runtime',
    });
  }

  if (input.discoveredDomains.length === 0 && input.blockedDomains.length === 0 && input.manifest.permissions?.external_network !== true) {
    badges.push({
      label: 'Privacy First',
      status: 'pass',
      source: 'trust',
      reason: 'No external network domains discovered and external networking is not declared',
    });
  }

  return badges;
}
