import { readdir, readFile } from 'node:fs/promises';
import { join, relative } from 'node:path';
import { buildShippiePackage, type BuildShippiePackageInput, type BuiltShippiePackage } from './index.ts';

export interface BuildShippiePackageFromDirectoryInput extends Omit<BuildShippiePackageInput, 'appFiles'> {
  directory: string;
  ignore?: (relativePath: string) => boolean;
}

export async function buildShippiePackageFromDirectory(
  input: BuildShippiePackageFromDirectoryInput,
): Promise<BuiltShippiePackage> {
  const appFiles = await readDirectoryFiles(input.directory, input.ignore);
  return buildShippiePackage({
    ...input,
    appFiles,
  });
}

async function readDirectoryFiles(
  directory: string,
  ignore: (relativePath: string) => boolean = defaultIgnore,
): Promise<Map<string, Uint8Array>> {
  const files = new Map<string, Uint8Array>();

  async function walk(current: string): Promise<void> {
    const entries = await readdir(current, { withFileTypes: true });
    for (const entry of entries) {
      const absolute = join(current, entry.name);
      const rel = relative(directory, absolute).replaceAll('\\', '/');

      if (ignore(rel)) continue;

      if (entry.isDirectory()) {
        await walk(absolute);
        continue;
      }

      if (entry.isFile()) {
        files.set(rel, new Uint8Array(await readFile(absolute)));
      }
    }
  }

  await walk(directory);
  return new Map([...files.entries()].sort(([a], [b]) => a.localeCompare(b)));
}

function defaultIgnore(relativePath: string): boolean {
  const parts = relativePath.split('/');
  return (
    parts.includes('node_modules') ||
    parts.includes('.turbo') ||
    parts.includes('dist') ||
    relativePath.endsWith('.tsbuildinfo')
  );
}
