/**
 * `shippie localize-plan [dir]` — preview the source migration that
 * transforms a cloud app into a local-first one.
 *
 * Per master plan Phase 8: source-migration-only, never silent runtime
 * shims. The output is a plan the maker reviews before applying.
 */
import { resolve } from 'node:path';
import { localizePlanForDirectory } from '@shippie/core';
import type { LocalizeTransform } from '@shippie/analyse';

interface LocalizePlanOptions {
  json?: boolean;
  transforms?: string;
}

const VALID_TRANSFORMS: LocalizeTransform[] = [
  'supabase-basic-queries',
  'supabase-storage-to-local-files',
  'authjs-to-local-identity',
];

export async function localizePlanCommand(dir: string | undefined, opts: LocalizePlanOptions): Promise<void> {
  const directory = resolve(dir ?? process.cwd());
  let transforms: LocalizeTransform[] | undefined;
  if (opts.transforms) {
    transforms = opts.transforms
      .split(',')
      .map((t) => t.trim())
      .filter(Boolean) as LocalizeTransform[];
    for (const t of transforms) {
      if (!VALID_TRANSFORMS.includes(t)) {
        console.error(`Unknown transform: ${t}. Valid: ${VALID_TRANSFORMS.join(', ')}`);
        process.exit(1);
      }
    }
  }

  const result = localizePlanForDirectory({ directory, transforms });
  if (!Array.isArray(result)) {
    console.error(result.error);
    process.exit(1);
  }

  if (opts.json) {
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  console.log(`Localize plan for ${directory}\n`);

  if (result.length === 0) {
    console.log('No transformations applicable. App may already be local-first.');
    return;
  }

  for (const patch of result) {
    console.log(`Transform: ${patch.transform}`);
    console.log(`  ${patch.fileChanges.length} file(s) modified, ${patch.newFiles.length} new file(s)`);
    if (patch.warnings.length > 0) {
      console.log('  Warnings:');
      for (const w of patch.warnings) console.log(`    - ${w}`);
    }
    console.log('');
  }
  console.log('Review the patches with --json. Apply via the dashboard once approved.');
}
