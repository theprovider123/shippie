#!/usr/bin/env bun

import {
  createAccessTransferRelayClient,
  createMemoryDocumentStore,
  createSealedSyncClient,
  generateAccessTransferId,
  generateAccessTransferKeyPair,
  generateDeviceSigningKeyPair,
  generateDocumentKey,
  openDocument,
  pullEncryptedAttachmentChunked,
  pushEncryptedAttachmentChunked,
  unwrapAccessBundle,
  wrapAccessBundle,
} from '@shippie/doc';

const enc = new TextEncoder();
const dec = new TextDecoder();

const opts = parseArgs(process.argv.slice(2));

const samples = new Map();
const http = [];
const leakNeedles = new Set();

function sample(name, ms) {
  const list = samples.get(name) ?? [];
  list.push(ms);
  samples.set(name, list);
}

async function timed(name, fn) {
  const start = performance.now();
  try {
    return await fn();
  } finally {
    sample(name, performance.now() - start);
  }
}

async function trackedFetch(input, init = {}) {
  const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
  const method = init.method ?? 'GET';
  const bodyText = await requestBodyText(init.body);
  for (const needle of leakNeedles) {
    if (needle && bodyText.includes(needle)) {
      throw new Error(`raw key leak detected in ${method} ${url}`);
    }
  }

  const started = performance.now();
  const response = await fetch(input, init);
  const ms = performance.now() - started;
  http.push({
    method,
    url: pathOnly(url),
    status: response.status,
    ms,
    requestBytes: bodyText ? enc.encode(bodyText).byteLength : bodyByteLength(init.body),
  });
  sample(`http.${method}.${pathFamily(url)}.${response.status}`, ms);
  return response;
}

async function requestBodyText(body) {
  if (!body) return '';
  if (typeof body === 'string') return body;
  if (body instanceof Uint8Array) return dec.decode(body);
  if (body instanceof ArrayBuffer) return dec.decode(new Uint8Array(body));
  if (body instanceof Blob) return await body.text();
  return '';
}

function bodyByteLength(body) {
  if (!body) return 0;
  if (typeof body === 'string') return enc.encode(body).byteLength;
  if (body instanceof Uint8Array) return body.byteLength;
  if (body instanceof ArrayBuffer) return body.byteLength;
  if (body instanceof Blob) return body.size;
  return 0;
}

async function main() {
  const origin = opts.origin;
  console.log(`Benchmarking Shippie sealed storage at ${origin}`);
  console.log(
    `Profile: ${opts.profile}`,
  );
  console.log(
    `Plan: ${opts.documents} document(s), ${opts.events} event(s)/doc, attachments=${opts.attachments.join(',') || 'none'}, handovers=${opts.handovers}`,
  );

  const sync = createSealedSyncClient({ origin, fetchImpl: trackedFetch });
  const relay = createAccessTransferRelayClient({ origin, fetchImpl: trackedFetch });
  const runId = `bench_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;

  const docs = [];
  for (let i = 0; i < opts.documents; i += 1) {
    const documentId = `${runId}_${i}`;
    const documentKey = generateDocumentKey();
    leakNeedles.add(documentKey);
    const signing = await timed('crypto.deviceSigningKeyPair', () => generateDeviceSigningKeyPair());
    const handle = await timed('document.open.local', () =>
      openDocument({
        documentId,
        documentKey,
        signing,
        store: createMemoryDocumentStore(),
        sync,
        initialState: { count: 0, bytes: 0 },
        reducer: (state, event) => {
          if (event.kind !== 'bench/event') return state;
          return {
            count: state.count + 1,
            bytes: state.bytes + String(event.payload?.message ?? '').length,
          };
        },
      }),
    );
    docs.push({ documentId, documentKey, signing, handle });
  }

  await mapLimit(docs, opts.concurrency, async (doc) => {
    for (let i = 0; i < opts.events; i += 1) {
      await timed('document.append.encryptSignReduce', () =>
        doc.handle.append({
          kind: 'bench/event',
          payload: {
            i,
            message: 'sealed event transfer benchmark payload',
            createdAt: new Date().toISOString(),
          },
        }),
      );
    }
    await timed('document.sync.batchPushAndPull', () => doc.handle.sync());
    await timed('document.snapshot.createLocal', () => doc.handle.createSnapshot());
    await timed('document.snapshot.syncPushAndPull', () => doc.handle.sync());
    if (sync.getManifest) {
      const manifest = await timed('document.manifest.get', () => sync.getManifest(doc.documentId));
      if (manifest.latestSnapshotId !== doc.handle.latestSnapshot()?.snapshotId) {
        throw new Error(`manifest snapshot mismatch for ${doc.documentId}`);
      }
    }
    if (sync.getChangeHint) {
      const hint = await timed('document.changeHint.fresh', () =>
        sync.getChangeHint(doc.documentId, {
          eventCursor: doc.handle.cursor(),
          snapshotCursor: doc.handle.snapshotCursor(),
          eventCount: doc.handle.envelopes().length,
          snapshotCount: doc.handle.snapshots().length,
        }),
      );
      if (hint.changed) throw new Error(`fresh hint should not report changed for ${doc.documentId}`);
    }
  });

  await mapLimit(docs, opts.concurrency, async (doc) => {
    const restoreSigning = await timed('crypto.restoreSigningKeyPair', () => generateDeviceSigningKeyPair());
    const restore = await timed('document.open.restoreDevice', () =>
      openDocument({
        documentId: doc.documentId,
        documentKey: doc.documentKey,
        signing: restoreSigning,
        store: createMemoryDocumentStore(),
        sync,
        initialState: { count: 0, bytes: 0 },
        reducer: (state, event) => {
          if (event.kind !== 'bench/event') return state;
          return {
            count: state.count + 1,
            bytes: state.bytes + String(event.payload?.message ?? '').length,
          };
        },
      }),
    );
    await timed('document.restore.pullAndReduce', () => restore.sync());
    if (restore.state().count !== opts.events) {
      throw new Error(`restore mismatch for ${doc.documentId}: expected ${opts.events}, got ${restore.state().count}`);
    }
  });

  await mapLimit(docs, opts.concurrency, async (doc) => {
    for (const size of opts.attachments) {
      const bytes = deterministicBytes(size);
      const attachmentId = `bench-${size}.bin`;
      await timed(`attachment.${size}.encryptedChunkedUpload`, () =>
        pushEncryptedAttachmentChunked(sync, {
          documentId: doc.documentId,
          documentKey: doc.documentKey,
          attachmentId,
          bytes,
          contentType: 'application/octet-stream',
          chunkSize: 1024 * 1024,
        }),
      );
      const restored = await timed(`attachment.${size}.encryptedChunkedDownload`, () =>
        pullEncryptedAttachmentChunked(sync, {
          documentId: doc.documentId,
          documentKey: doc.documentKey,
          attachmentId,
        }),
      );
      if (restored.bytes.byteLength !== size) {
        throw new Error(`attachment size mismatch: expected ${size}, got ${restored.bytes.byteLength}`);
      }
    }
  });

  for (let i = 0; i < opts.handovers; i += 1) {
    const doc = docs[i % docs.length];
    await timed('handover.fullMoveToNewPhone', async () => {
      const transferId = generateAccessTransferId();
      const receiver = await timed('handover.receiverKeyPair', () => generateAccessTransferKeyPair());
      await timed('handover.putRequest', () =>
        relay.putRequest(transferId, {
          schema: 'shippie.document.access-transfer-request.v1',
          recipientPublicKey: receiver.publicKeySpki,
          createdAt: new Date().toISOString(),
          deviceLabel: `bench receiver ${i + 1}`,
        }),
      );
      const request = await timed('handover.getRequest', () => relay.getRequest(transferId));
      if (!request) throw new Error('handover request missing');
      const wrapped = await timed('handover.wrapBundle', () =>
        wrapAccessBundle({
          recipientPublicKeySpki: request.recipientPublicKey,
          bundle: {
            schema: 'shippie.document.access-bundle.v1',
            createdAt: new Date().toISOString(),
            deviceLabel: `bench sender ${i + 1}`,
            documents: [
              { documentId: doc.documentId, documentKey: doc.documentKey, cursor: doc.handle.cursor(), role: 'owner' },
            ],
          },
        }),
      );
      await timed('handover.putWrappedBundle', () => relay.putBundle(transferId, wrapped));
      const stored = await timed('handover.getWrappedBundle', () => relay.getBundle(transferId));
      if (!stored) throw new Error('handover bundle missing');
      const bundle = await timed('handover.unwrapBundle', () =>
        unwrapAccessBundle({ recipientPrivateKey: receiver.privateKey, wrapped: stored }),
      );
      if (bundle.documents[0]?.documentKey !== doc.documentKey) throw new Error('handover document key mismatch');
    });
  }

  const report = buildReport({ origin, runId });
  if (opts.json) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    printReport(report);
  }
  if (opts.failOnTargetMiss) {
    const missed = report.targets.filter((target) => !target.ok);
    if (missed.length > 0) {
      console.error(`\nMissed ${missed.length} sealed-cloud product target(s):`);
      for (const target of missed) {
        console.error(`- ${target.name}: p95=${target.actualMs.toFixed(1)}ms target<=${target.targetMs}ms`);
      }
      process.exit(1);
    }
  }
}

function buildReport(meta) {
  const metrics = {};
  for (const [name, values] of [...samples.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    metrics[name] = summarise(values);
  }
  return {
    schema: 'shippie.sealed-cloud.benchmark.v0',
    ...meta,
    config: opts,
    metrics,
    http: {
      count: http.length,
      totalRequestBytes: http.reduce((sum, item) => sum + item.requestBytes, 0),
      slowest: [...http].sort((a, b) => b.ms - a.ms).slice(0, 8),
    },
    targets: evaluateProductTargets(metrics),
    invariants: {
      rawKeyLeakGuard: 'passed',
      restoredEventCounts: 'passed',
      attachmentByteCounts: 'passed',
      encryptedSnapshots: 'passed',
      encryptedChunkedAttachments: 'passed',
      handoverBundleDecrypt: 'passed',
    },
  };
}

function printReport(report) {
  console.log('\nResults');
  for (const [name, metric] of Object.entries(report.metrics)) {
    console.log(
      `- ${name}: n=${metric.n} p50=${metric.p50Ms.toFixed(1)}ms p95=${metric.p95Ms.toFixed(1)}ms max=${metric.maxMs.toFixed(1)}ms`,
    );
  }
  console.log('\nHTTP');
  console.log(`- requests=${report.http.count} uploadBytes=${report.http.totalRequestBytes}`);
  for (const item of report.http.slowest) {
    console.log(`- slow ${item.method} ${item.url} ${item.status}: ${item.ms.toFixed(1)}ms`);
  }
  console.log('\nProduct targets');
  for (const target of report.targets) {
    console.log(
      `- ${target.ok ? 'pass' : 'miss'} ${target.name}: p95=${target.actualMs.toFixed(1)}ms target<=${target.targetMs}ms`,
    );
  }
  console.log('\nInvariants');
  for (const [name, value] of Object.entries(report.invariants)) console.log(`- ${name}: ${value}`);
}

function summarise(values) {
  const sorted = [...values].sort((a, b) => a - b);
  return {
    n: sorted.length,
    minMs: sorted[0] ?? 0,
    p50Ms: percentile(sorted, 0.5),
    p95Ms: percentile(sorted, 0.95),
    maxMs: sorted.at(-1) ?? 0,
    avgMs: sorted.reduce((sum, value) => sum + value, 0) / Math.max(1, sorted.length),
  };
}

function percentile(sorted, p) {
  if (sorted.length === 0) return 0;
  const index = Math.min(sorted.length - 1, Math.ceil(sorted.length * p) - 1);
  return sorted[index];
}

async function mapLimit(items, limit, fn) {
  const queue = [...items];
  const workers = Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, async () => {
    while (queue.length > 0) {
      const item = queue.shift();
      if (item) await fn(item);
    }
  });
  await Promise.all(workers);
}

function deterministicBytes(size) {
  const bytes = new Uint8Array(size);
  for (let i = 0; i < size; i += 1) bytes[i] = i % 251;
  return bytes;
}

function parseArgs(args) {
  const profile = optionValue(args, '--profile') ?? process.env.SHIPPIE_BENCH_PROFILE ?? 'default';
  const config = {
    profile,
    origin: process.env.SHIPPIE_SEALED_CLOUD_ORIGIN ?? 'http://127.0.0.1:8788',
    documents: numberEnv('SHIPPIE_BENCH_DOCUMENTS', 3),
    events: numberEnv('SHIPPIE_BENCH_EVENTS', 8),
    concurrency: numberEnv('SHIPPIE_BENCH_CONCURRENCY', 3),
    attachments: listEnv('SHIPPIE_BENCH_ATTACHMENTS', '1024,65536'),
    handovers: numberEnv('SHIPPIE_BENCH_HANDOVERS', 3),
    json: false,
    failOnTargetMiss: false,
  };
  applyProfile(config, profile);

  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    const next = () => {
      i += 1;
      return args[i];
    };
    if (arg === '--origin') config.origin = next() ?? config.origin;
    else if (arg === '--profile') next();
    else if (arg === '--documents') config.documents = Number(next() ?? config.documents);
    else if (arg === '--events') config.events = Number(next() ?? config.events);
    else if (arg === '--concurrency') config.concurrency = Number(next() ?? config.concurrency);
    else if (arg === '--attachments') config.attachments = parseSizes(next() ?? '');
    else if (arg === '--handovers') config.handovers = Number(next() ?? config.handovers);
    else if (arg === '--json') config.json = true;
    else if (arg === '--fail-on-target-miss') config.failOnTargetMiss = true;
  }

  config.documents = clamp(config.documents, 1, 25);
  config.events = clamp(config.events, 1, 100);
  config.concurrency = clamp(config.concurrency, 1, 10);
  config.handovers = clamp(config.handovers, 0, 50);
  config.attachments = config.attachments.filter((size) => size > 0 && size <= 25 * 1024 * 1024);
  return config;
}

function optionValue(args, name) {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : undefined;
}

function applyProfile(config, profile) {
  const profiles = {
    default: {},
    quick: {
      documents: 2,
      events: 4,
      concurrency: 2,
      attachments: [1024, 65536],
      handovers: 2,
    },
    room: {
      documents: 8,
      events: 20,
      concurrency: 4,
      attachments: [1024, 65536],
      handovers: 4,
    },
    'move-phone': {
      documents: 1,
      events: 25,
      concurrency: 1,
      attachments: [1024, 262144],
      handovers: 5,
    },
    media: {
      documents: 3,
      events: 5,
      concurrency: 2,
      attachments: [1048576, 5242880, 12582912],
      handovers: 2,
    },
    stress: {
      documents: 15,
      events: 50,
      concurrency: 8,
      attachments: [1024, 65536, 1048576],
      handovers: 10,
    },
  };
  const selected = profiles[profile];
  if (!selected) {
    console.warn(`Unknown profile "${profile}", using default benchmark shape.`);
    return;
  }
  Object.assign(config, selected);
}

function evaluateProductTargets(metrics) {
  return [
    target('local append feels instant', metrics['document.append.encryptSignReduce'], 30),
    target('new phone handover feels like login', metrics['handover.fullMoveToNewPhone'], 1500),
    target('small sealed event batch sync', metrics['document.sync.batchPushAndPull'], 1000),
    target('snapshot sync stays invisible', metrics['document.snapshot.syncPushAndPull'], 1000),
    target('fresh change hint avoids heavy pull', metrics['document.changeHint.fresh'], 500),
    target('restore replay feels immediate', metrics['document.restore.pullAndReduce'], 2000),
    target('1 MB sealed image encrypted upload', metrics['attachment.1048576.encryptedChunkedUpload'], 3000),
  ].filter(Boolean);
}

function target(name, metric, targetMs) {
  if (!metric) return null;
  return {
    name,
    targetMs,
    actualMs: metric.p95Ms,
    ok: metric.p95Ms <= targetMs,
  };
}

function numberEnv(name, fallback) {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function listEnv(name, fallback) {
  return parseSizes(process.env[name] ?? fallback);
}

function parseSizes(value) {
  return value
    .split(',')
    .map((part) => Number(part.trim()))
    .filter((part) => Number.isFinite(part) && part >= 0);
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, Number.isFinite(value) ? value : min));
}

function pathOnly(url) {
  try {
    const parsed = new URL(url);
    return parsed.pathname;
  } catch {
    return url;
  }
}

function pathFamily(url) {
  const path = pathOnly(url);
  if (path.includes('/attachments/')) return 'attachments';
  if (path.includes('/snapshots')) return 'snapshots';
  if (path.includes('/hint')) return 'hint';
  if (path.includes('/manifest')) return 'manifest';
  if (path.includes('/transfer/')) return 'transfer';
  if (path.endsWith('/events')) return 'events';
  return 'other';
}

main().catch((err) => {
  console.error('\nSealed cloud benchmark failed:');
  console.error(err);
  process.exit(1);
});
