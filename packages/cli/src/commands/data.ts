import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

export interface DataDoctorOptions {
  json?: boolean;
}

interface DataDoctorFinding {
  severity: 'pass' | 'warn' | 'fail';
  message: string;
}

const DOCUMENT_ID_RE = /^[a-z][a-z0-9_-]{0,63}$/;

export async function dataDoctorCommand(pathArg = '.', opts: DataDoctorOptions = {}) {
  const report = inspectDataPolicy(pathArg);

  if (opts.json) {
    console.log(JSON.stringify(report, null, 2));
    if (!report.ok) process.exitCode = 1;
    return;
  }

  console.log(`Shippie data doctor: ${report.manifestPath}`);
  for (const finding of report.findings) {
    const prefix =
      finding.severity === 'pass' ? 'PASS' : finding.severity === 'warn' ? 'WARN' : 'FAIL';
    console.log(`${prefix} ${finding.message}`);
  }

  if (!report.ok) {
    console.log('');
    console.log('Recommended shippie.json data block:');
    console.log(JSON.stringify(recommendedDataPolicy(), null, 2));
    process.exitCode = 1;
  }
}

export function inspectDataPolicy(pathArg = '.') {
  const dir = resolve(process.cwd(), pathArg);
  const manifestPath = dir.endsWith('shippie.json') ? dir : resolve(dir, 'shippie.json');
  const findings: DataDoctorFinding[] = [];

  if (!existsSync(manifestPath)) {
    return {
      ok: false,
      manifestPath,
      findings: [
        {
          severity: 'fail' as const,
          message: 'No shippie.json found. Run `shippie init` to create one with inherited Your Data support.',
        },
      ],
    };
  }

  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(manifestPath, 'utf8')) as unknown;
  } catch (err) {
    return {
      ok: false,
      manifestPath,
      findings: [
        {
          severity: 'fail' as const,
          message: `shippie.json is not valid JSON: ${(err as Error).message}`,
        },
      ],
    };
  }

  if (typeof raw !== 'object' || raw === null) {
    return {
      ok: false,
      manifestPath,
      findings: [{ severity: 'fail' as const, message: 'shippie.json must be a JSON object.' }],
    };
  }

  const data = (raw as Record<string, unknown>).data;
  if (typeof data !== 'object' || data === null) {
    findings.push({
      severity: 'fail',
      message:
        'Missing data block. Apps should explicitly inherit Your Data sealed copies unless they are stateless.',
    });
    return { ok: false, manifestPath, findings };
  }

  const obj = data as Record<string, unknown>;
  if (obj.mode === 'none') {
    findings.push({ severity: 'pass', message: 'App declares no durable private data.' });
    return { ok: true, manifestPath, findings };
  }

  if (obj.mode === 'local-only') {
    findings.push({
      severity: 'pass',
      message: 'App is explicitly local-only. Cross-device handover and sealed copies are disabled.',
    });
    return { ok: true, manifestPath, findings };
  }

  if (obj.mode !== 'shippie-documents') {
    findings.push({
      severity: 'fail',
      message: 'data.mode must be "shippie-documents", "local-only", or "none".',
    });
  }

  const documents = Array.isArray(obj.documents)
    ? obj.documents.filter((value): value is string => typeof value === 'string')
    : [];
  if (documents.length === 0) {
    findings.push({ severity: 'fail', message: 'data.documents must include at least one id, usually "main".' });
  } else {
    const bad = documents.filter((id) => !DOCUMENT_ID_RE.test(id));
    if (bad.length > 0) {
      findings.push({
        severity: 'fail',
        message: `Invalid document id(s): ${bad.join(', ')}. Use lowercase letters, digits, hyphens, or underscores.`,
      });
    } else {
      findings.push({ severity: 'pass', message: `Document ids declared: ${documents.join(', ')}.` });
    }
  }

  if (obj.recovery !== 'inherited') {
    findings.push({
      severity: 'fail',
      message: 'data.recovery must be "inherited" so Your Data can move devices and restore sealed copies.',
    });
  } else {
    findings.push({ severity: 'pass', message: 'Your Data recovery is inherited.' });
  }

  if (typeof obj.attachments !== 'boolean') {
    findings.push({
      severity: 'warn',
      message: 'data.attachments is missing. Use true only when the app stores sealed files or images.',
    });
  }

  if (obj.snapshots !== 'inherited') {
    findings.push({
      severity: 'warn',
      message: 'data.snapshots should be "inherited" so restores can start from sealed checkpoints instead of replaying long histories.',
    });
  } else {
    findings.push({ severity: 'pass', message: 'Sealed snapshots are inherited for fast restore.' });
  }

  if (obj.realtime !== 'inherited') {
    findings.push({
      severity: 'fail',
      message: 'data.realtime must be "inherited" so sealed cloud transfer, retry, and cross-device freshness are SDK-owned.',
    });
  } else {
    findings.push({ severity: 'pass', message: 'Realtime sealed sync is inherited.' });
  }

  if (obj.attachments === true && obj.media !== 'encrypted-chunked') {
    findings.push({
      severity: 'warn',
      message: 'Apps with attachments should set data.media="encrypted-chunked" so files are encrypted and resumable by default.',
    });
  }

  const ok = findings.every((finding) => finding.severity !== 'fail');
  return { ok, manifestPath, findings };
}

function recommendedDataPolicy() {
  return {
    data: {
      mode: 'shippie-documents',
      documents: ['main'],
      attachments: false,
      recovery: 'inherited',
      migrations: 'snapshot-v0',
      snapshots: 'inherited',
      media: 'none',
      realtime: 'inherited',
    },
  };
}
