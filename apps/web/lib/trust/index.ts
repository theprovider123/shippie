/**
 * Trust enforcement pipeline — runs during deployStatic after preflight
 * and before (or alongside) auto-packaging.
 *
 * Steps:
 *   1. Malware scan — blockers reject the deploy
 *   2. Outbound domain scan — every discovered domain is persisted
 *      to app_external_domains with allowed=true/false based on the
 *      manifest's allowed_connect_domains list
 *   3. Public listing gate — if visibility=public, check support/privacy
 *      fields; blockers reject the deploy
 *   4. CSP build — returns a per-deploy CSP string that the PWA injector
 *      embeds as a meta tag on every HTML file
 *
 * Spec v6 §9.
 */
import { eq, and } from 'drizzle-orm';
import { schema, type ShippieDb } from '@shippie/db';
import type { ShippieJson } from '@shippie/shared';
import { scanFilesForDomains, type DomainScanResult } from './domain-scan';
import { buildCsp, type BuildCspResult } from './csp-builder';
import { scanForMalware, type ScanMalwareResult } from './malware-scan';
import { checkPublicListingGate, type PublicListingGateResult } from './public-listing-gate';

export interface TrustCheckInput {
  db: ShippieDb;
  appId: string;
  deployId: string;
  files: Map<string, Buffer>;
  manifest: ShippieJson;
  visibility: 'public' | 'unlisted' | 'private_org' | 'private_link';
}

export interface TrustCheckResult {
  passed: boolean;
  blockers: string[];
  warnings: string[];
  malware: ScanMalwareResult;
  domains: DomainScanResult;
  gate: PublicListingGateResult;
  csp: BuildCspResult;
}

export async function runTrustChecks(input: TrustCheckInput): Promise<TrustCheckResult> {
  const blockers: string[] = [];
  const warnings: string[] = [];

  // 1. Malware scan
  const malware = scanForMalware({ files: input.files });
  for (const b of malware.blockers) blockers.push(`malware:${b.rule} in ${b.path}`);
  for (const w of malware.warnings) warnings.push(`malware:${w.rule} in ${w.path}`);

  // 2. Outbound domain scan + persist
  const domains = scanFilesForDomains(input.files);
  const allowed = new Set(
    (input.manifest.allowed_connect_domains ?? []).map((d) => d.toLowerCase()),
  );

  // Delete previous rows for this deploy (idempotent re-run) + reinsert
  await input.db
    .delete(schema.appExternalDomains)
    .where(
      and(
        eq(schema.appExternalDomains.appId, input.appId),
        eq(schema.appExternalDomains.deployId, input.deployId),
      ),
    );

  // Dedupe per (domain, source) — we only care about first-seen per source
  const seen = new Set<string>();
  const rows: Array<typeof schema.appExternalDomains.$inferInsert> = [];
  for (const hit of domains.hits) {
    const key = `${hit.domain}|${hit.source}`;
    if (seen.has(key)) continue;
    seen.add(key);
    // The table's PK is (app_id, deploy_id, domain) so we collapse across
    // sources here — first-seen source wins.
    const pkKey = `${hit.domain}`;
    if ([...seen].filter((k) => k.startsWith(`${hit.domain}|`)).length > 1) continue;
    // Skip if already in rows under the same domain
    if (rows.find((r) => r.domain === hit.domain)) continue;
    rows.push({
      appId: input.appId,
      deployId: input.deployId,
      domain: hit.domain,
      source: hit.source,
      allowed: allowed.has(hit.domain) || allowed.has(`*.${hit.domain.split('.').slice(-2).join('.')}`),
    });
    void pkKey;
  }

  if (rows.length > 0) {
    await input.db.insert(schema.appExternalDomains).values(rows);
  }

  // Unapproved domains become warnings (they'll be blocked by CSP at runtime)
  const externalNet = input.manifest.permissions?.external_network === true;
  for (const row of rows) {
    if (!row.allowed) {
      const msg = `domain ${row.domain} used in ${row.source} but not in allowed_connect_domains`;
      if (externalNet) {
        warnings.push(msg);
      } else {
        // Pure external_network=false apps: this is just info,
        // CSP will block it regardless. Still surface as a warning.
        warnings.push(msg);
      }
    }
  }

  // 3. Public listing gate
  const gate = checkPublicListingGate({ manifest: input.manifest, visibility: input.visibility });
  if (!gate.allowed) {
    for (const v of gate.violations) {
      blockers.push(`listing_gate:${v.field}: ${v.message}`);
    }
  }

  // 4. Build CSP
  const csp = buildCsp({
    allowedConnectDomains: input.manifest.allowed_connect_domains,
    discoveredDomains: domains.uniqueDomains,
    externalNetworkEnabled: externalNet,
  });

  return {
    passed: blockers.length === 0,
    blockers,
    warnings,
    malware,
    domains,
    gate,
    csp,
  };
}
