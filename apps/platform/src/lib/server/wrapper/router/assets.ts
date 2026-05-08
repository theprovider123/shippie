import type { WrapperContext } from '../env';

interface AssetManifest {
  slug: string;
  version: string;
  assets: string[];
  generated_at: string;
}

export async function handleAssetsManifest(ctx: WrapperContext): Promise<Response> {
  const active = await ctx.env.CACHE.get(`apps:${ctx.slug}:active`);
  if (!active) {
    return Response.json(
      { slug: ctx.slug, version: null, assets: [], generated_at: new Date().toISOString() },
      { status: 404 },
    );
  }

  const prefix = `apps/${ctx.slug}/v${active}/`;
  const assets = new Set<string>(['/', '/index.html', '/__shippie/manifest', '/__shippie/sw.js', '/__shippie/sdk.js']);
  let cursor: string | undefined;

  do {
    const page = await ctx.env.APPS.list({ prefix, cursor });
    for (const object of page.objects) {
      const relative = object.key.slice(prefix.length);
      if (!relative || relative.startsWith('_shippie/')) continue;
      assets.add(`/${relative}`);
      if (relative === 'index.html') assets.add('/');
    }
    cursor = page.truncated ? page.cursor : undefined;
  } while (cursor);

  const body: AssetManifest = {
    slug: ctx.slug,
    version: String(active),
    assets: [...assets].sort(),
    generated_at: new Date().toISOString(),
  };

  return Response.json(body, {
    headers: {
      'cache-control': 'no-store',
      'x-shippie-version': String(active),
    },
  });
}
