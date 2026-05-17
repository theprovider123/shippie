import {
  buildSpaceUrl,
  defaultSignalBaseForRuntime as defaultSpaceSignalBaseForRuntime,
  readSpaceParams,
  signalUrlFor as spaceSignalUrlFor,
} from '@shippie/spaces';
import { normaliseLocale, type Locale } from '../i18n.ts';
import { supportedTimeZone } from '../lib/time-zone.ts';
import type { RoomParams, Role, RoomTemplate } from './types.ts';

const PUBLIC_SIGNAL_BASE = 'https://shippie.app/__shippie/signal';
const DEFAULT_TEMPLATE: RoomTemplate = 'friends';

export function readRoomParams(): RoomParams {
  const defaultSignalBase = defaultSignalBaseForRuntime();
  if (typeof window === 'undefined') {
    return { role: null, roomId: null, signalBase: defaultSignalBase, roomKey: null, template: DEFAULT_TEMPLATE, locale: null, timeZone: null };
  }
  const url = new URL(window.location.href);
  const space = readSpaceParams(url.toString());
  const role = readRole(url) ?? readRoleValue(space.role);
  const roomId = url.searchParams.get('room') ?? space.spaceId;
  const signalBase = url.searchParams.get('signal') || defaultSignalBase;
  const roomKey = new URLSearchParams(url.hash.replace(/^#/, '')).get('k') ?? space.secret;
  return {
    role,
    roomId,
    signalBase,
    roomKey,
    template: readTemplate(url) ?? DEFAULT_TEMPLATE,
    locale: normaliseLocale(url.searchParams.get('lang') ?? undefined),
    timeZone: readTimeZone(url),
  };
}

export function signalUrlFor(signalBase: string, roomId: string): string {
  return spaceSignalUrlFor(signalBase, roomId);
}

export function matchRoomUrl(input: {
  role: Role;
  roomId: string;
  roomKey: string;
  signalBase?: string;
  template?: RoomTemplate;
  locale?: Locale;
  timeZone?: string;
}): string {
  const current = new URL(typeof location === 'undefined' ? 'https://shippie.app/run/match-room/' : location.href);
  current.pathname = current.pathname.replace('/run/matchday/', '/run/match-room/');
  current.pathname = current.pathname.replace(/\/(host|play|display)\/?$/, '/');
  const defaultSignalBase = defaultSignalBaseForRuntime();
  return buildSpaceUrl({
    baseUrl: current.origin + current.pathname,
    appSlug: 'match-room',
    spaceId: input.roomId,
    role: input.role,
    secret: input.roomKey,
    extraSearch: {
      room: input.roomId,
      template: input.template && input.template !== DEFAULT_TEMPLATE ? input.template : undefined,
      lang: input.locale,
      tz: input.timeZone,
      signal: input.signalBase && input.signalBase !== defaultSignalBase ? input.signalBase : undefined,
    },
  });
}

export const matchdayUrl = matchRoomUrl;

export function defaultSignalBaseForRuntime(): string {
  return defaultSpaceSignalBaseForRuntime('/__shippie/signal') || PUBLIC_SIGNAL_BASE;
}

function readTemplate(url: URL): RoomTemplate | null {
  const template = url.searchParams.get('template');
  if (
    template === 'friends' ||
    template === 'pub' ||
    template === 'family' ||
    template === 'office' ||
    template === 'hardcore' ||
    template === 'watch-party'
  ) {
    return template;
  }
  return null;
}

function readTimeZone(url: URL): string | null {
  const raw = url.searchParams.get('tz');
  return raw ? supportedTimeZone(raw) : null;
}

function readRole(url: URL): Role | null {
  const queryRole = url.searchParams.get('role');
  const role = readRoleValue(queryRole);
  if (role) return role;
  const path = url.pathname.replace(/\/$/, '').split('/').at(-1);
  return readRoleValue(path);
}

function readRoleValue(value: string | null | undefined): Role | null {
  if (value === 'host' || value === 'play' || value === 'display') return value;
  return null;
}
