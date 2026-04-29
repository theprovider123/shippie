import type { RequestHandler } from './$types';

const ICON = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <rect width="512" height="512" rx="112" fill="#14120F"/>
  <path d="M141 326c46-8 85-32 117-72 31-39 49-83 54-132 31 18 50 44 57 78 8 38-1 75-27 112-24 34-58 58-101 71-41 12-79 7-116-14 2-14 7-29 16-43Z" fill="#E8603C"/>
  <path d="M176 338c53 12 107 2 164-30-25 39-58 65-101 77-40 12-79 7-116-14 11-14 28-25 53-33Z" fill="#F2C94C"/>
  <circle cx="300" cy="172" r="18" fill="#F5EFE4"/>
  <path d="M147 383c24-18 51-27 81-27-19 23-48 42-87 57-5 2-9-4-6-9l12-21Z" fill="#74A57F"/>
</svg>`;

export const GET: RequestHandler = async () => {
  return new Response(ICON, {
    headers: {
      'content-type': 'image/svg+xml; charset=utf-8',
      'cache-control': 'public, max-age=604800',
    },
  });
};
