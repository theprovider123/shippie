import type { ReactElement, SVGProps } from 'react';

export type IconName =
  | 'trip'
  | 'crew'
  | 'vote'
  | 'games'
  | 'memories'
  | 'chat'
  | 'requests'
  | 'wrap'
  | 'host'
  | 'more'
  | 'plus'
  | 'share'
  | 'switch'
  | 'back'
  | 'close'
  | 'check'
  | 'eye'
  | 'sparkle';

interface IconProps extends Omit<SVGProps<SVGSVGElement>, 'name'> {
  name: IconName;
  size?: number;
}

export function Icon({ name, size = 20, ...rest }: IconProps) {
  const path = ICON_PATHS[name];
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      {...rest}
    >
      {path}
    </svg>
  );
}

const ICON_PATHS: Record<IconName, ReactElement> = {
  trip: (
    <>
      <path d="M5 19l4-14 6 14" />
      <path d="M9 19h10" />
      <circle cx="17" cy="9" r="1.6" fill="currentColor" stroke="none" />
    </>
  ),
  crew: (
    <>
      <circle cx="9" cy="9" r="3" />
      <circle cx="17" cy="11" r="2.4" />
      <path d="M3 19c0-3 2.7-5 6-5s6 2 6 5" />
      <path d="M14 19c0-2 2-3.5 4.5-3.5S22 17 22 19" />
    </>
  ),
  vote: (
    <>
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path d="M8 11l3 3 5-6" />
    </>
  ),
  games: (
    <>
      <rect x="3" y="7" width="18" height="12" rx="3" />
      <circle cx="8.5" cy="13" r="1" fill="currentColor" stroke="none" />
      <circle cx="15.5" cy="13" r="1" fill="currentColor" stroke="none" />
      <path d="M9 4l2 2h2l2-2" />
    </>
  ),
  memories: (
    <>
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <circle cx="9" cy="11" r="1.8" />
      <path d="M3 17l5-4 4 3 4-2 5 3" />
    </>
  ),
  chat: (
    <>
      <path d="M5 6h12a3 3 0 013 3v5a3 3 0 01-3 3h-7l-4 3v-3H5a3 3 0 01-3-3V9a3 3 0 013-3z" />
    </>
  ),
  requests: (
    <>
      <path d="M5 5h14v9H9l-4 4z" />
      <path d="M9 9h6" />
      <path d="M9 12h4" />
    </>
  ),
  wrap: (
    <>
      <path d="M4 8l8-4 8 4-8 4-8-4z" />
      <path d="M4 12l8 4 8-4" />
      <path d="M4 16l8 4 8-4" />
    </>
  ),
  host: (
    <>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.7 1.7 0 00.3 1.8l.1.1a2 2 0 11-2.8 2.8l-.1-.1a1.7 1.7 0 00-1.8-.3 1.7 1.7 0 00-1 1.5V21a2 2 0 11-4 0v-.1a1.7 1.7 0 00-1.1-1.5 1.7 1.7 0 00-1.8.3l-.1.1a2 2 0 11-2.8-2.8l.1-.1a1.7 1.7 0 00.3-1.8 1.7 1.7 0 00-1.5-1H3a2 2 0 110-4h.1a1.7 1.7 0 001.5-1.1 1.7 1.7 0 00-.3-1.8l-.1-.1a2 2 0 112.8-2.8l.1.1a1.7 1.7 0 001.8.3H9a1.7 1.7 0 001-1.5V3a2 2 0 114 0v.1a1.7 1.7 0 001 1.5 1.7 1.7 0 001.8-.3l.1-.1a2 2 0 112.8 2.8l-.1.1a1.7 1.7 0 00-.3 1.8V9a1.7 1.7 0 001.5 1H21a2 2 0 110 4h-.1a1.7 1.7 0 00-1.5 1z" />
    </>
  ),
  more: (
    <>
      <circle cx="6" cy="12" r="1.5" fill="currentColor" stroke="none" />
      <circle cx="12" cy="12" r="1.5" fill="currentColor" stroke="none" />
      <circle cx="18" cy="12" r="1.5" fill="currentColor" stroke="none" />
    </>
  ),
  plus: (
    <>
      <path d="M12 5v14M5 12h14" />
    </>
  ),
  share: (
    <>
      <circle cx="6" cy="12" r="2.4" />
      <circle cx="18" cy="6" r="2.4" />
      <circle cx="18" cy="18" r="2.4" />
      <path d="M8.2 11l7.6-4M8.2 13l7.6 4" />
    </>
  ),
  switch: (
    <>
      <path d="M4 8h13l-3-3" />
      <path d="M20 16H7l3 3" />
    </>
  ),
  back: (
    <>
      <path d="M14 6l-6 6 6 6" />
    </>
  ),
  close: (
    <>
      <path d="M6 6l12 12M18 6L6 18" />
    </>
  ),
  check: (
    <>
      <path d="M5 12l5 5L20 7" />
    </>
  ),
  eye: (
    <>
      <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z" />
      <circle cx="12" cy="12" r="3" />
    </>
  ),
  sparkle: (
    <>
      <path d="M12 4v4M12 16v4M4 12h4M16 12h4M6.3 6.3l2.8 2.8M14.9 14.9l2.8 2.8M6.3 17.7l2.8-2.8M14.9 9.1l2.8-2.8" />
    </>
  ),
};
