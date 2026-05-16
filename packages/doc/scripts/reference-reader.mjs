#!/usr/bin/env bun

import { readFile } from 'node:fs/promises';
import {
  decryptDocumentEvent,
  decryptDocumentSnapshot,
} from '../src/index.ts';

const opts = parseArgs(process.argv.slice(2));

async function main() {
  if (!opts.file) {
    throw new Error('usage: bun scripts/reference-reader.mjs <sealed-export.json> --key <documentKey>');
  }
  const raw = await readFile(opts.file, 'utf8');
  const input = JSON.parse(raw);
  const documentKey = opts.key ?? input.documentKey;
  if (typeof documentKey !== 'string' || documentKey.length === 0) {
    throw new Error('missing document key; pass --key or include documentKey in the export');
  }
  const events = Array.isArray(input.events) ? input.events : Array.isArray(input.envelopes) ? input.envelopes : [];
  const snapshots = Array.isArray(input.snapshots) ? input.snapshots : [];

  const decryptedEvents = [];
  for (const envelope of events) {
    const signed = await decryptDocumentEvent({ documentKey, envelope });
    decryptedEvents.push(signed.event);
  }

  const decryptedSnapshots = [];
  for (const envelope of snapshots) {
    const signed = await decryptDocumentSnapshot({ documentKey, envelope });
    decryptedSnapshots.push(signed.snapshot);
  }

  const out = {
    schema: 'shippie.document.reference-read.v0',
    documentId: input.documentId ?? decryptedEvents[0]?.documentId ?? decryptedSnapshots[0]?.documentId ?? null,
    eventCount: decryptedEvents.length,
    snapshotCount: decryptedSnapshots.length,
    events: decryptedEvents,
    snapshots: decryptedSnapshots,
  };
  process.stdout.write(`${JSON.stringify(out, null, 2)}\n`);
}

function parseArgs(args) {
  const opts = { file: null, key: null };
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (arg === '--key') opts.key = args[++i] ?? null;
    else if (!opts.file) opts.file = arg;
  }
  return opts;
}

main().catch((err) => {
  console.error('Shippie reference reader failed:');
  console.error(err);
  process.exit(1);
});
