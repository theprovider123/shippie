export function normalizeLocalPath(path: string): string {
  const cleaned = path.replace(/\\/g, '/').replace(/^\/+/, '').trim();
  if (!cleaned || cleaned === '.') throw new Error('Path must not be empty');
  const parts = cleaned.split('/').filter(Boolean);
  if (parts.some((part) => part === '.' || part === '..')) {
    throw new Error('Path traversal is not allowed');
  }
  return parts.join('/');
}

export function splitLocalPath(path: string): { dirs: string[]; name: string } {
  const normalized = normalizeLocalPath(path);
  const parts = normalized.split('/');
  const name = parts.pop();
  if (!name) throw new Error('Path must include a file name');
  return { dirs: parts, name };
}
