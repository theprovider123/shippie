/**
 * `shippie classify [dir]` — Local Tool policy check. Pure local — no
 * platform call, runs offline.
 */
import { resolve } from 'node:path';
import { classifyDirectory } from '@shippie/core';

interface ClassifyOptions {
  json?: boolean;
}

export async function classifyCommand(dir: string | undefined, opts: ClassifyOptions): Promise<void> {
  const directory = resolve(dir ?? process.cwd());
  const result = classifyDirectory(directory);

  if ('error' in result) {
    console.error(result.error);
    process.exit(1);
  }

  if (opts.json) {
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  const policy = result.localToolPolicy;
  console.log(`Local Tool eligibility: ${policy.status}`);
  console.log(`Policy: ${policy.passed ? 'PASS' : 'NEEDS CONVERSION'}`);
  console.log(`Findings: ${policy.blocks} block · ${policy.warns} warn · ${policy.infos} info`);
  console.log(`Legacy kind signal: ${result.detectedKind} (${Math.round(result.confidence * 100)}%)`);
  console.log(`\n${policy.summary}`);
  if (policy.findings.length) {
    console.log('\nPolicy findings:');
    for (const finding of policy.findings.slice(0, 12)) {
      console.log(`  - ${finding.severity.toUpperCase()} ${finding.title}`);
      console.log(`    ${finding.location}: ${finding.detail}`);
    }
  }
  if (policy.referenceDomains.length) {
    console.log(`\nReference-data domains: ${policy.referenceDomains.join(', ')}`);
  }
  if (result.reasons.length) {
    console.log('\nLegacy kind reasons:');
    for (const r of result.reasons) console.log(`  - ${r}`);
  }
}
