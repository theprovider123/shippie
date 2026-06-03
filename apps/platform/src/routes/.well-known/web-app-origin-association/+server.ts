import type { RequestHandler } from './$types';

const ASSOCIATION = {
  'https://shippie.app/': {
    scope: '/',
  },
  'https://www.shippie.app/': {
    scope: '/',
  },
  web_apps: [
    {
      manifest: 'https://shippie.app/manifest.webmanifest',
      details: {
        paths: ['/*'],
        exclude_paths: [],
      },
    },
  ],
};

export const GET: RequestHandler = async () =>
  new Response(JSON.stringify(ASSOCIATION), {
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'public, max-age=3600',
    },
  });
