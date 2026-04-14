/**
 * Host header → app slug resolution.
 *
 * Production: `recipes.shippie.app` → `recipes`
 * CDN:        `cdn.shippie.app`     → `__cdn__` (sentinel for the hosted SDK route)
 * Dev:        `recipes.localhost:4200` → `recipes`
 * Dev root:   `localhost:4200`      → null (no slug; reject)
 *
 * Spec v6 §2.1, §5.
 */
export function resolveAppSlug(req: Request): string | null {
  const host = req.headers.get('host') ?? '';
  const hostname = host.split(':')[0] ?? '';

  // Strip port, keep the hostname.
  const parts = hostname.split('.').filter(Boolean);
  if (parts.length === 0) return null;

  // Local dev: *.localhost
  // `recipes.localhost` → ['recipes', 'localhost']
  // `localhost`         → ['localhost']
  if (parts[parts.length - 1] === 'localhost') {
    if (parts.length < 2) return null;
    return parts.slice(0, -1).join('.');
  }

  // Production: *.shippie.app or cdn.shippie.app
  // `recipes.shippie.app` → ['recipes', 'shippie', 'app']
  // `shippie.app`         → ['shippie', 'app']  (control plane — not served by Worker)
  if (parts.length >= 3 && parts[parts.length - 2] === 'shippie' && parts[parts.length - 1] === 'app') {
    const subdomain = parts.slice(0, -2).join('.');
    return subdomain;
  }

  // Unknown host — could be a custom domain in Phase 2.
  // For now, return null so the Worker returns a clear error.
  return null;
}
