import { buildSignalUrl } from '@shippie/proximity';
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
  const role = readRole(url);
  const roomId = url.searchParams.get('room');
  const signalBase = url.searchParams.get('signal') || defaultSignalBase;
  const roomKey = new URLSearchParams(url.hash.replace(/^#/, '')).get('k');
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
  if (signalBase.includes('{room}')) {
    const resolved = signalBase.replace('{room}', encodeURIComponent(roomId));
    return resolved.replace(/^http:/, 'ws:').replace(/^https:/, 'wss:');
  }
  return buildSignalUrl(signalBase, roomId);
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
  const url = new URL(typeof location === 'undefined' ? 'https://shippie.app/run/match-room/' : location.href);
  url.pathname = url.pathname.replace('/run/matchday/', '/run/match-room/');
  url.pathname = url.pathname.replace(/\/(host|play|display)\/?$/, '/');
  url.search = '';
  url.hash = '';
  url.searchParams.set('role', input.role);
  url.searchParams.set('room', input.roomId);
  if (input.template && input.template !== DEFAULT_TEMPLATE) {
    url.searchParams.set('template', input.template);
  }
  if (input.locale) {
    url.searchParams.set('lang', input.locale);
  }
  if (input.timeZone) {
    url.searchParams.set('tz', input.timeZone);
  }
  const defaultSignalBase = defaultSignalBaseForRuntime();
  if (input.signalBase && input.signalBase !== defaultSignalBase) {
    url.searchParams.set('signal', input.signalBase);
  }
  url.hash = `k=${encodeURIComponent(input.roomKey)}`;
  return url.toString();
}

export const matchdayUrl = matchRoomUrl;

export function defaultSignalBaseForRuntime(): string {
  if (typeof location === 'undefined') return PUBLIC_SIGNAL_BASE;
  return `${location.protocol}//${location.host}/__shippie/signal`;
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
  if (queryRole === 'host' || queryRole === 'play' || queryRole === 'display') return queryRole;
  const path = url.pathname.replace(/\/$/, '').split('/').at(-1);
  if (path === 'host' || path === 'play' || path === 'display') return path;
  return null;
}
