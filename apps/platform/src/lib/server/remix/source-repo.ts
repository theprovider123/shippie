export interface NormalizedSourceRepo {
  webUrl: string;
  cloneUrl: string | null;
  forkUrl: string | null;
  owner: string | null;
  repo: string | null;
  ref: string | null;
  path: string | null;
}

export function normalizeSourceRepo(input: unknown): NormalizedSourceRepo | null {
  if (typeof input !== 'string') return null;
  const raw = input.trim();
  if (!raw) return null;

  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;

  url.username = '';
  url.password = '';
  url.hash = '';
  url.search = '';

  const host = url.hostname.toLowerCase();
  if (host === 'github.com' || host === 'www.github.com') {
    return normalizeGithubSource(url);
  }

  return {
    webUrl: url.toString(),
    cloneUrl: url.toString(),
    forkUrl: null,
    owner: null,
    repo: null,
    ref: null,
    path: null,
  };
}

function normalizeGithubSource(url: URL): NormalizedSourceRepo | null {
  const parts = url.pathname.split('/').filter(Boolean);
  const owner = parts[0];
  const repoPart = parts[1];
  if (!owner || !repoPart) return null;

  const repo = repoPart.replace(/\.git$/, '');
  if (!isGithubName(owner) || !isGithubName(repo)) return null;

  let ref: string | null = null;
  let path: string | null = null;
  let webPath = `/${owner}/${repo}`;
  const marker = parts[2];

  if (marker === 'tree' && parts[3]) {
    ref = parts[3] ?? null;
    path = parts.slice(4).join('/') || null;
    webPath = `/${owner}/${repo}/tree/${[ref, path].filter(Boolean).join('/')}`;
  }

  return {
    webUrl: `https://github.com${webPath}`,
    cloneUrl: `https://github.com/${owner}/${repo}.git`,
    forkUrl: `https://github.com/${owner}/${repo}/fork`,
    owner,
    repo,
    ref,
    path,
  };
}

function isGithubName(value: string): boolean {
  return /^[A-Za-z0-9_.-]+$/.test(value);
}
