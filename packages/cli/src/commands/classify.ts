/**
 * `shippie classify [dir]` — App Kind classification (local / connected /
 * cloud). Pure local — no platform call, runs offline.
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

  console.log(`App Kind: ${result.detectedKind}`);
  console.log(`Confidence: ${Math.round(result.confidence * 100)}%`);
  if (result.reasons.length) {
    console.log('\nReasons:');
    for (const r of result.reasons) console.log(`  - ${r}`);
  }
}
