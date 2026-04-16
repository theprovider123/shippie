/**
 * Font loader for satori OG card rendering.
 *
 * Fonts live at apps/web/assets/fonts/*.ttf (actually OTF renamed — both
 * work in satori). They're loaded lazily on first OG card build and
 * cached for the process lifetime.
 */
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

interface LoadedFont {
  name: string;
  data: ArrayBuffer;
  weight: 400 | 700;
  style: 'normal';
}

let cached: LoadedFont[] | null = null;

export async function loadDefaultFonts(): Promise<LoadedFont[]> {
  if (cached) return cached;
  const dir = join(process.cwd(), 'assets', 'fonts');
  const [regular, bold] = await Promise.all([
    readFile(join(dir, 'Inter-Regular.ttf')),
    readFile(join(dir, 'Inter-Bold.ttf')),
  ]);
  cached = [
    { name: 'Inter', data: regular.buffer.slice(regular.byteOffset, regular.byteOffset + regular.byteLength), weight: 400, style: 'normal' },
    { name: 'Inter', data: bold.buffer.slice(bold.byteOffset, bold.byteOffset + bold.byteLength), weight: 700, style: 'normal' },
  ];
  return cached;
}
