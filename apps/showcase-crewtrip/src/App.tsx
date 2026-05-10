import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties, ChangeEvent } from 'react';
import { createShippieIframeSdk } from '@shippie/iframe-sdk';
import { createLocalNavigation } from '@shippie/sdk/wrapper';
import { qrSvg } from '@shippie/qr';

import type {
  CrewtripState,
  Role,
  Tab,
  MemoryFilter,
  MessageScope,
  HostSection,
  PulseKind,
  GameKind,
  Player,
  CrewGroup,
  MemoryKind,
  RequestStatus,
  TripTimelineItem,
  EventTemplate,
  FeatureKey,
  AwardEffect,
  WrapUpSettings,
  Challenge,
  SurpriseUnlock,
  Language,
  ThemeKey,
  SoundtrackSlot,
  TripDay,
  StopStatus,
  ItineraryStop,
} from './types';
import { translations } from './data/translations';
import { themePalettes, paletteFor } from './data/themes';
import { gamePresets, pulseActions, tabFeatureOptions, detailFeatureOptions, featurePresets } from './data/games';
import { eventTemplates } from './data/templates';
import { newId, newEventCode, timeNow } from './utils/ids';
import {
  AVATAR_IMAGE_MAX,
  SHARED_IMAGE_MAX,
  VIDEO_HARD_LIMIT_BYTES,
  VideoTooLargeError,
  formatMb,
  readImageFileAsDataUrl,
  readSyncMediaDataUrl,
  readOpfsFileUrl,
  writeOpfsFile,
} from './utils/media';
import {
  STORAGE_KEY,
  buildHostPrompts,
  buildLiveActivities,
  buildPersonalTrip,
  buildPulseStats,
  buildTripPhase,
  buildTripTimelineItems,
  buildGameHighlights,
  buildCrewAwards,
  buildWrapHighlights,
  buildCrewReturnUrl,
  buildShareUrl,
  canSeeChallenge,
  createFreshCrewtripState,
  downloadTextFile,
  formatBackupTime,
  formatBytes,
  getDeviceId,
  initialRole,
  initialState,
  isSurpriseUnlocked,
  markLocalUpdate,
  nextTripDayLabel,
  normalizeEventCode,
  normalizePlaylistUrl,
  pollSelectionForPlayer,
  parseRecoveryPack,
  readLocalHostClaim,
  readHostedLocalBackups,
  readLocalPlayerId,
  readJoinedEventCode,
  readLocalBackups,
  recoveryPackFileName,
  resolveInitialCrewtripState,
  setPollVote,
  stringifyRecoveryPack,
  syncLabel,
  syncLabelShort,
  clearPollVote,
  totalScore,
  unlockLabel,
  tripDayDateInputValue,
  formatTripDayDate,
  writeLocalHostClaim,
  writeLocalPlayerId,
  writeLocalBackup,
  crewColorAt,
  type TripPhase,
} from './utils/state';
import { useCrewtripSync } from './utils/sync';
import { useFocusedFieldStability } from './utils/useFocusedFieldStability';
import { useViewportDock } from './utils/useViewportDock';

import {
  ControlPanel,
  DayToggle,
  GroupMark,
  HostDisclosure,
  MemoryCard,
  Metric,
  MoreButton,
  PlayerAvatar,
  PollCard,
  SegmentedControl,
  View,
} from './components/Atoms';
import { Icon, type IconName } from './components/Icon';
import { TripView, LiveActivityStrip } from './components/TripView';
import { ChallengeGrid, GameHighlights, GameSubmissions, Leaderboard } from './components/Games';
import { EntryScreen } from './components/EntryScreen';
import { Dialog } from './components/Dialog';
import { Confirm, type ConfirmRequest } from './components/Confirm';
import { OnboardingCard } from './components/OnboardingCard';
import { Tournament } from './components/Tournament';
import { generateWrapCard, shareWrapCard } from './utils/wrap-card';

import './styles.css';

export type { CrewtripState } from './types';
export { mergeCrewtripState } from './utils/state';

const awardEffectOptions = [
  { effect: 'gold', trophy: '🏆', label: 'Trophy' },
  { effect: 'spark', trophy: '✨', label: 'Spark' },
  { effect: 'heart', trophy: '💚', label: 'Heart' },
  { effect: 'star', trophy: '⭐', label: 'Star' },
  { effect: 'camera', trophy: '📸', label: 'Memory' },
] as const satisfies Array<{ effect: AwardEffect; trophy: string; label: string }>;

function usePersistentState() {
  const [state, setState] = useState<CrewtripState>(() => {
    try {
      const joinedEventCode = readJoinedEventCode();
      const raw = localStorage.getItem(STORAGE_KEY);
      return resolveInitialCrewtripState(raw, joinedEventCode);
    } catch {
      return resolveInitialCrewtripState(null, readJoinedEventCode());
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
      // Local persistence is an enhancement; ignore quota errors.
    }
  }, [state]);

  return [state, setState] as const;
}

function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return false;
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  });
  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const onChange = () => setReduced(mq.matches);
    mq.addEventListener?.('change', onChange);
    return () => mq.removeEventListener?.('change', onChange);
  }, []);
  return reduced;
}

function themeStyle(theme: ThemeKey): CSSProperties {
  return paletteFor(theme).vars as CSSProperties;
}

function findDayByInputDate(days: TripDay[], dateValue: string): TripDay | undefined {
  if (!dateValue) return undefined;
  return days.find((day) => tripDayDateInputValue(day.date) === dateValue);
}

function tabsForRole(role: Role | null, features: CrewtripState['features']): Tab[] {
  const enabled = features ?? initialState.features;
  const tabs: Tab[] = ['now'];
  if (enabled.crew) tabs.push('crew');
  if (role === 'host' || enabled.games || enabled.tournaments) tabs.push('games');
  if (enabled.memories) tabs.push('memories');
  if (role === 'host' || enabled.polls || enabled.requests || enabled.soundtrack || enabled.chat || enabled.wrap) {
    tabs.push('more');
  }
  return tabs;
}

function isTabAllowed(tab: Tab, role: Role | null, features: CrewtripState['features']): boolean {
  const enabled = features ?? initialState.features;
  if (tabsForRole(role, enabled).includes(tab)) return true;
  if (tab === 'vote') return enabled.polls;
  if (tab === 'requests') return enabled.requests;
  if (tab === 'chat') return enabled.chat;
  if (tab === 'wrap') return enabled.wrap;
  if (tab === 'games') return role === 'host' || enabled.games || enabled.tournaments;
  if (tab === 'host') return role === 'host';
  return false;
}

function featureAllowsTimelineItem(item: TripTimelineItem, features: CrewtripState['features']): boolean {
  const enabled = features ?? initialState.features;
  if (item.kind === 'plan') return enabled.plan;
  if (item.kind === 'poll') return enabled.polls;
  if (item.kind === 'game') return enabled.games;
  if (item.kind === 'tournament') return enabled.tournaments || Boolean(item.locked);
  if (item.kind === 'memory') return enabled.memories;
  if (item.kind === 'soundtrack') return enabled.soundtrack;
  return true;
}

function shapeTimelineItem(item: TripTimelineItem, features: CrewtripState['features']): TripTimelineItem {
  const enabled = features ?? initialState.features;
  if (item.kind === 'game' && !enabled.scores) {
    return { ...item, detail: item.detail.replace(/^\d+ pts \/ /, '') };
  }
  return item;
}

function featureAllowsActivity(activity: { kind: string }, features: CrewtripState['features']): boolean {
  const enabled = features ?? initialState.features;
  if (activity.kind === 'poll') return enabled.polls;
  if (activity.kind === 'game') return enabled.games;
  if (activity.kind === 'tournament') return enabled.tournaments;
  if (activity.kind === 'memory') return enabled.memories;
  if (activity.kind === 'soundtrack') return enabled.soundtrack;
  if (activity.kind === 'surprise') return enabled.surprises;
  return true;
}

function participantNoticeName(id: string, state: CrewtripState): string {
  if (id === '__bye__' || id === '__score_entry__') return 'Bye';
  return state.players.find((player) => player.id === id)?.name
    ?? state.groups.find((group) => group.id === id)?.name
    ?? id;
}

function appendTournamentSystemNotices(current: CrewtripState, now: number): CrewtripState {
  if (!current.features?.tournaments) return current;
  const existingMessageIds = new Set(current.messages.map((message) => message.id));
  const existingBroadcastIds = new Set(current.broadcasts.map((broadcast) => broadcast.id));
  const messages: CrewtripState['messages'] = [];
  const broadcasts: CrewtripState['broadcasts'] = [];

  const pushNotice = (id: string, text: string) => {
    if (!existingMessageIds.has(id)) {
      messages.push({ id, authorId: 'system', authorName: 'Crewtrip', scope: 'all', text, at: timeNow() });
    }
    if (!existingBroadcastIds.has(id)) {
      broadcasts.push({ id, text, at: timeNow() });
    }
  };

  current.tournamentEvents.forEach((event) => {
    const label = `${event.emoji ? `${event.emoji} ` : ''}${event.name}`;
    if (event.scheduledAt && event.status !== 'done') {
      const minutesUntil = Math.round((event.scheduledAt - now) / 60000);
      if (minutesUntil >= 0 && minutesUntil <= 15) {
        const clock = new Date(event.scheduledAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        pushNotice(`tour-soon-${event.id}-${Math.floor(event.scheduledAt / 60000)}`, `${label} starts ${minutesUntil <= 1 ? 'now' : `at ${clock}`}. Open Games for the live card.`);
      }
    }
  });

  current.tournamentMatches.forEach((match) => {
    const event = current.tournamentEvents.find((item) => item.id === match.eventId);
    if (!event) return;
    const label = `${event.emoji ? `${event.emoji} ` : ''}${event.name}`;
    if (match.status === 'live' && match.startedAt && now - match.startedAt < 5 * 60000) {
      pushNotice(`tour-live-${match.id}-${Math.floor(match.startedAt / 60000)}`, `${label}: ${participantNoticeName(match.sideA.participantId, current)} vs ${participantNoticeName(match.sideB.participantId, current)} is live.`);
    }
    if ((match.status === 'done' || match.status === 'forfeit') && match.finishedAt && match.winnerId && now - match.finishedAt < 5 * 60000) {
      pushNotice(`tour-result-${match.id}-${Math.floor(match.finishedAt / 60000)}`, `${label}: ${participantNoticeName(match.winnerId, current)} advanced.`);
    }
    if (match.status === 'pending' && (match.readyParticipantIds?.length ?? 0) === 1) {
      const readyId = match.readyParticipantIds![0]!;
      pushNotice(`tour-ready-${match.id}-${readyId}`, `${participantNoticeName(readyId, current)} is ready for ${label}. Waiting for the other side.`);
    }
  });

  if (!messages.length && !broadcasts.length) return current;
  return {
    ...current,
    messages: [...messages, ...current.messages].slice(0, 72),
    broadcasts: [...broadcasts, ...current.broadcasts].slice(0, 24),
  };
}

function fallbackBackTab(tab: Tab, role: Role | null, features: CrewtripState['features']): Tab {
  if (tab === 'vote' || tab === 'requests' || tab === 'chat' || tab === 'wrap' || tab === 'host') {
    return isTabAllowed('more', role, features) ? 'more' : 'now';
  }
  return 'now';
}

function buildTripFallbackPhase(state: CrewtripState, role: Role | null, features: CrewtripState['features']): TripPhase {
  const primaryTab: Tab = features.memories
    ? 'memories'
    : features.requests
      ? 'requests'
      : isTabAllowed('more', role, features)
        ? 'more'
        : 'now';
  return {
    label: state.location || 'Live trip',
    title: state.eventName || 'Crewtrip',
    detail: state.description || 'A shared trip hub for the crew.',
    primaryAction: features.memories ? 'Add memory' : features.requests ? 'Ask host' : 'Open trip',
    primaryTab,
  };
}

function tabIcon(tab: Tab): IconName {
  return ({
    now: 'trip',
    crew: 'crew',
    vote: 'vote',
    games: 'games',
    requests: 'requests',
    memories: 'memories',
    chat: 'chat',
    wrap: 'wrap',
    host: 'host',
    more: 'more',
  } as Record<Tab, IconName>)[tab];
}

function tabLabel(tab: Tab, role: Role | null, copy: ReturnType<typeof getCopy>): string {
  if (tab === 'host') return copy.settings;
  if (tab === 'more') return 'More';
  if (tab === 'requests') return role === 'host' ? copy.inbox : copy.requests;
  if (tab === 'now') return copy.trip;
  if (tab === 'vote') return copy.poll;
  if (tab === 'crew') return copy.crew;
  if (tab === 'games') return copy.games;
  if (tab === 'memories') return copy.memories;
  if (tab === 'chat') return copy.chat;
  if (tab === 'wrap') return copy.wrap;
  return tab;
}

function getCopy(language: Language) {
  return translations[language];
}

function filterMemories(memories: CrewtripState['memories'], filter: MemoryFilter, activeName: string): CrewtripState['memories'] {
  if (filter === 'media') return memories.filter((memory) => memory.kind === 'image' || memory.kind === 'video');
  if (filter === 'awards') return memories.filter((memory) => memory.kind === 'award');
  if (filter === 'mine') return memories.filter((memory) => memory.author === activeName);
  return memories;
}

interface InboxItem {
  id: string;
  kind: 'notification' | 'chat' | 'request';
  title: string;
  meta: string;
  text: string;
  at: string;
  rank: number;
  scope?: MessageScope | 'system';
  groupId?: string;
  status?: RequestStatus;
  requestId?: string;
}

function inboxTimeRank(label: string, fallback: number): number {
  if (label.toLowerCase() === 'now') return 24 * 60 + fallback / 1000;
  const match = /^(\d{1,2}):(\d{2})/.exec(label);
  if (!match) return fallback / 1000;
  return Number(match[1]) * 60 + Number(match[2]) + fallback / 1000;
}

export function App() {
  const sdk = useMemo(() => createShippieIframeSdk({ appId: 'crewtrip' }), []);
  const [state, setState] = usePersistentState();
  const deviceId = useMemo(getDeviceId, []);
  const dock = useViewportDock();
  useFocusedFieldStability();
  const [role, setRole] = useState<Role | null>(() => initialRole(state.eventCode));
  const [localPlayerId, setLocalPlayerId] = useState<string | null>(() => readLocalPlayerId(state.eventCode));
  const sync = useCrewtripSync(state, setState, deviceId, Boolean(role));
  const reduceMotion = usePrefersReducedMotion();

  const [tab, setTab] = useState<Tab>('now');
  const [tabStack, setTabStack] = useState<Tab[]>([]);
  const tabRef = useRef<Tab>('now');
  const localNavigationRef = useRef<ReturnType<typeof createLocalNavigation<Tab>> | null>(null);
  const getLocalNavigation = () => {
    if (!localNavigationRef.current) {
      localNavigationRef.current = createLocalNavigation<Tab>('now', (next) => {
        tabRef.current = next;
        setTab(next);
      });
    }
    return localNavigationRef.current;
  };
  const touchStartRef = useRef<{ x: number; y: number; at: number } | null>(null);
  const [draftMemory, setDraftMemory] = useState('');
  const [draftRequest, setDraftRequest] = useState('');
  const [draftBroadcast, setDraftBroadcast] = useState('');
  const [draftCrewName, setDraftCrewName] = useState('');
  const [draftCrewTeam, setDraftCrewTeam] = useState('all');
  const [selectedDayId, setSelectedDayId] = useState('day-1');
  const [hostSection, setHostSection] = useState<HostSection>('manage');
  const [editingStopId, setEditingStopId] = useState<string | null>(null);
  const [draftStop, setDraftStop] = useState({ dayId: 'day-1', date: '', groupId: 'all', time: '', title: '', place: '', status: 'later' as StopStatus });
  const [draftDay, setDraftDay] = useState({ label: '', date: '' });
  const [draftGroup, setDraftGroup] = useState('');
  const [draftMessage, setDraftMessage] = useState('');
  const [draftAward, setDraftAward] = useState<{ playerId: string; title: string; detail: string; trophy: string; effect: AwardEffect }>({ playerId: '', title: '', detail: '', trophy: '🏆', effect: 'gold' });
  const [draftPoll, setDraftPoll] = useState({ question: '', options: 'Yes, No, Maybe', closes: 'Open' });
  const [draftChallenge, setDraftChallenge] = useState({ title: '', points: '8', kind: 'challenge' as GameKind, groupId: 'all', deadline: 'TBC' });
  const [draftSurprise, setDraftSurprise] = useState({ title: '', message: '', unlockType: 'time' as SurpriseUnlock, unlockValue: '21:00' });
  const [draftSoundtrack, setDraftSoundtrack] = useState({ time: '21:00', title: '', dj: '', link: '', note: '' });
  const [draftGameEntry, setDraftGameEntry] = useState('');
  const [memoryFilter, setMemoryFilter] = useState<MemoryFilter>('all');
  const [leaderboardMode, setLeaderboardMode] = useState<'people' | 'teams'>('people');
  const [selectedChallengeId, setSelectedChallengeId] = useState<string | null>(null);
  const [gameComposerMode, setGameComposerMode] = useState<'challenge' | 'structured'>('challenge');
  const [selectedTournamentEventId, setSelectedTournamentEventId] = useState<string | null>(null);
  const [selectedTournamentMatchId, setSelectedTournamentMatchId] = useState<string | null>(null);
  const [inboxOpen, setInboxOpen] = useState(false);
  const [shareCopied, setShareCopied] = useState(false);
  const [backupNotice, setBackupNotice] = useState<string | null>(null);
  const [backupRevision, setBackupRevision] = useState(0);
  const [qrMarkup, setQrMarkup] = useState<string | null>(null);
  const [hostHandoffQrMarkup, setHostHandoffQrMarkup] = useState<string | null>(null);
  const [crewReturnQrMarkup, setCrewReturnQrMarkup] = useState<string | null>(null);
  const [coverUrl, setCoverUrl] = useState<string | null>(null);
  const [actionSheetOpen, setActionSheetOpen] = useState(false);
  const [confirmRequest, setConfirmRequest] = useState<ConfirmRequest | null>(null);
  const [minuteTick, setMinuteTick] = useState(0);
  const [handoffCopied, setHandoffCopied] = useState<'host' | 'crew' | null>(null);

  const shareUrl = useMemo(() => buildShareUrl(state.eventCode, 'crew'), [state.eventCode]);
  const hostReturnUrl = useMemo(() => buildShareUrl(state.eventCode, 'join-host', state.hostAccessToken), [state.eventCode, state.hostAccessToken]);
  const hostReturnToken = useMemo(() => {
    if (typeof window === 'undefined') return '';
    return new URLSearchParams(window.location.search).get('host') ?? '';
  }, []);
  const crewReturnPlayerId = useMemo(() => {
    if (typeof window === 'undefined') return '';
    return new URLSearchParams(window.location.search).get('player') ?? '';
  }, []);
  const hostPlayer = state.players.find((player) => player.id === 'host') ?? state.players[0]!;
  const localPlayer = localPlayerId ? state.players.find((player) => player.id === localPlayerId) : undefined;
  const crewNeedsProfile = role === 'eventee' && (!localPlayer || localPlayer.id === 'host');
  const crewReturnUrl = useMemo(() => {
    if (!localPlayer || localPlayer.id === 'host') return '';
    return buildCrewReturnUrl(state.eventCode, localPlayer.id);
  }, [localPlayer?.id, state.eventCode]);
  const activePlayer = role === 'host'
    ? hostPlayer
    : (localPlayer && localPlayer.id !== 'host' ? localPlayer : state.players.find((player) => player.id !== 'host') ?? hostPlayer);
  const openPolls = state.polls.filter((poll) => poll.open);
  const pendingRequests = state.requests.filter((request) => request.status === 'new');
  const sortedPlayers = [...state.players].sort((a, b) => b.score - a.score);
  const features = state.features ?? initialState.features;
  const days = state.days?.length ? state.days : initialState.days;
  const groups = state.groups?.length ? state.groups : initialState.groups;
  const messages = state.messages ?? initialState.messages;
  const wrapUp = state.wrapUp ?? initialState.wrapUp;
  const language = state.language ?? 'en';
  const theme = state.theme ?? initialState.theme;
  const inboxEnabled = features.requests || features.chat || features.tournaments;
  const palette = paletteFor(theme);
  const themeVars = useMemo(() => themeStyle(theme), [theme]);
  const shellStyle = useMemo(() => ({ ...themeVars, ...dock.style }), [dock.style, themeVars]);
  const copy = getCopy(language);
  const localBackups = useMemo(() => readLocalBackups()
    .filter((backup) => normalizeEventCode(backup.eventCode) === normalizeEventCode(state.eventCode))
    .sort((a, b) => b.at - a.at), [backupRevision, minuteTick, state.eventCode, state.updatedAt]);
  const hostedBackups = useMemo(() => readHostedLocalBackups(), [backupRevision, minuteTick, state.eventCode, state.updatedAt]);
  const activeDayId = days.some((day) => day.id === selectedDayId) ? selectedDayId : days[0]!.id;
  const activeDay = days.find((day) => day.id === activeDayId) ?? days[0]!;
  const draftStopDay = days.find((day) => day.id === draftStop.dayId) ?? activeDay;
  const draftStopDateValue = draftStop.date || tripDayDateInputValue(draftStopDay.date);
  const activeGroup = activePlayer.groupId ? groups.find((group) => group.id === activePlayer.groupId) : null;
  const dayStops = state.stops.filter((stop) => (stop.dayId ?? days[0]!.id) === activeDayId);
  const currentStop = dayStops.find((stop) => stop.status === 'now') ?? dayStops[0] ?? state.stops[0]!;
  const nextStop = dayStops.find((stop) => stop.status === 'next');
  const filteredMemories = state.memories.filter((memory) => (memory.dayId ?? days[0]!.id) === activeDayId);
  const visibleMemories = filterMemories(filteredMemories, memoryFilter, activePlayer.name);
  const dayChallenges = state.challenges.filter((challenge) => (challenge.dayId ?? activeDayId) === activeDayId && canSeeChallenge(challenge, role, activePlayer));
  const selectedChallenge = selectedChallengeId ? state.challenges.find((challenge) => challenge.id === selectedChallengeId) : null;
  const latestMemory = filteredMemories[0] ?? state.memories[0];
  const latestBroadcast = state.broadcasts[0] ?? null;
  const activeSoundtrack = (state.soundtracks ?? []).find((slot) => (slot.dayId ?? activeDayId) === activeDayId && slot.status === 'now')
    ?? (state.soundtracks ?? []).find((slot) => (slot.dayId ?? activeDayId) === activeDayId)
    ?? state.soundtracks?.[0];
  const unlockedSurprises = useMemo(() => state.surprises.filter((drop) => isSurpriseUnlocked(drop, state)), [minuteTick, state]);
  const lockedSurpriseCount = Math.max(0, state.surprises.length - unlockedSurprises.length);
  const liveActivities = useMemo(() => buildLiveActivities(state, sync, groups)
    .filter((activity) => featureAllowsActivity(activity, features)), [features, groups, state, sync]);
  const pulseStats = useMemo(() => buildPulseStats(state.pulses, groups), [groups, state.pulses]);
  const tripPhase = useMemo(() => features.plan
    ? buildTripPhase(
      state,
      role,
      sync,
      currentStop,
      nextStop,
      features.wrap ? wrapUp : { ...wrapUp, published: false },
      features.surprises ? unlockedSurprises.length : 0,
    )
    : buildTripFallbackPhase(state, role, features),
  [currentStop, features, nextStop, role, state, sync, unlockedSurprises.length, wrapUp]);
  const hostPrompts = useMemo(() => buildHostPrompts(state, sync, wrapUp, features), [features, state, sync, wrapUp]);
  const personalTrip = useMemo(() => buildPersonalTrip(activePlayer, state, groups), [activePlayer, groups, state]);
  const gameHighlights = useMemo(() => buildGameHighlights(state.challenges, state.players, groups), [groups, state.challenges, state.players]);
  const wrapAwards = useMemo(() => buildCrewAwards(state.players, state.memories, state.challenges, groups, features, wrapUp.assignedAwards), [features, groups, state.challenges, state.memories, state.players, wrapUp.assignedAwards]);
  const wrapHighlights = useMemo(() => buildWrapHighlights(state, wrapAwards, gameHighlights, features), [features, gameHighlights, state, wrapAwards]);
  const tripTimelineItems = useMemo(
    () => buildTripTimelineItems(state, activeDayId, days, groups, role, activePlayer)
      .filter((item) => featureAllowsTimelineItem(item, features))
      .map((item) => shapeTimelineItem(item, features)),
    [activeDayId, days, features, groups, role, activePlayer, state],
  );
  const inboxMessages = messages.filter((message) => message.authorId !== activePlayer.id && (
    message.scope === 'all' || message.groupId === activePlayer.groupId || role === 'host'
  ));
  const visibleInboxRequests = state.requests.filter((request) =>
    role === 'host' || request.authorId === activePlayer.id || request.status === 'shared',
  );
  const inboxItems = useMemo<InboxItem[]>(() => {
    const messageIds = new Set(messages.map((message) => message.id));
    const messageItems = messages
      .filter((message) => role === 'host' || message.scope === 'all' || message.groupId === activePlayer.groupId || message.authorId === activePlayer.id)
      .map((message, index): InboxItem => {
        const group = message.groupId ? groups.find((item) => item.id === message.groupId) : null;
        const isSystem = message.authorId === 'system';
        return {
          id: `message-${message.id}`,
          kind: isSystem ? 'notification' : 'chat',
          title: isSystem ? 'Trip update' : message.authorName,
          meta: message.scope === 'group' && group ? `${message.at} / ${group.name}` : message.at,
          text: message.text,
          at: message.at,
          rank: inboxTimeRank(message.at, 900 - index),
          scope: message.scope,
          groupId: message.groupId,
        };
      });
    const broadcastItems = state.broadcasts
      .filter((broadcast) => !messageIds.has(broadcast.id))
      .map((broadcast, index): InboxItem => ({
        id: `broadcast-${broadcast.id}`,
        kind: 'notification',
        title: 'Host update',
        meta: broadcast.at,
        text: broadcast.text,
        at: broadcast.at,
        rank: inboxTimeRank(broadcast.at, 800 - index),
        scope: 'system',
      }));
    const requestItems = visibleInboxRequests.map((request, index): InboxItem => ({
      id: `request-${request.id}`,
      kind: 'request',
      title: `${request.authorName} request`,
      meta: `${request.at} / ${request.status}`,
      text: request.text,
      at: request.at,
      status: request.status,
      requestId: request.id,
      rank: inboxTimeRank(request.at, 700 - index),
      scope: 'system',
    }));
    return [...messageItems, ...broadcastItems, ...requestItems].sort((a, b) => b.rank - a.rank);
  }, [activePlayer.groupId, activePlayer.id, groups, messages, role, state.broadcasts, visibleInboxRequests]);
  const visibleChatTimelineItems = inboxItems;
  const openOwnRequests = state.requests.filter((request) => request.authorId === activePlayer.id && request.status !== 'done');
  const headerInboxCount = (inboxEnabled ? inboxMessages.length : 0)
    + (features.requests ? (role === 'host' ? pendingRequests.length : openOwnRequests.length) : 0)
    + (inboxEnabled ? state.broadcasts.filter((broadcast) => !messages.some((message) => message.id === broadcast.id)).length : 0);
  const headerInboxIcon: IconName = features.requests && (pendingRequests.length > 0 || !features.chat) ? 'requests' : 'chat';
  const wrapMemories = state.memories.slice(0, 10);
  const memoryStats = useMemo(() => ({
    total: filteredMemories.length,
    media: filteredMemories.filter((memory) => memory.kind === 'image' || memory.kind === 'video').length,
    awards: filteredMemories.filter((memory) => memory.kind === 'award').length,
  }), [filteredMemories]);
  const visibleTabs = useMemo(() => tabsForRole(role, features), [features, role]);
  const dockTabs = useMemo(() => visibleTabs.filter((item) => item !== 'crew'), [visibleTabs]);
  const visibleHostSections = useMemo(
    () => (['manage', 'fun', 'setup', 'wrap'] as HostSection[]).filter((section) => section !== 'wrap' || features.wrap),
    [features.wrap],
  );
  const resolveTab = (nextTab: Tab): Tab => (isTabAllowed(nextTab, role, features) ? nextTab : visibleTabs[0] ?? 'now');
  const goToTab = (nextTab: Tab, options: { replace?: boolean } = {}) => {
    const resolved = resolveTab(nextTab);
    const current = tabRef.current;
    if (resolved !== current && !options.replace) {
      setTabStack((stack) => [...stack, current].slice(-10));
    }
    if (options.replace) {
      void getLocalNavigation().replace(resolved, { kind: 'crossfade' });
    } else {
      void getLocalNavigation().navigate(resolved, { kind: 'crossfade' });
    }
  };
  const goBack = () => {
    if (inboxOpen) {
      setInboxOpen(false);
      return;
    }
    if (confirmRequest) {
      setConfirmRequest(null);
      return;
    }
    if (selectedChallengeId) {
      setSelectedChallengeId(null);
      return;
    }
    if (selectedTournamentEventId || selectedTournamentMatchId) {
      setSelectedTournamentEventId(null);
      setSelectedTournamentMatchId(null);
      return;
    }
    if (actionSheetOpen) {
      setActionSheetOpen(false);
      return;
    }
    const fallback = fallbackBackTab(tab, role, features);
    setTabStack([]);
    void getLocalNavigation().backOrReplace(fallback, { kind: 'crossfade' });
  };
  const resetToNow = () => {
    setTabStack([]);
    void getLocalNavigation().replace('now', { kind: 'crossfade' });
  };
  const hasQuickActions = role === 'host' || features.memories || features.requests || features.crew || features.chat;

  function openHeaderInbox() {
    if (inboxEnabled) {
      setInboxOpen(true);
      return;
    }
    goToTab('more');
  }

  useEffect(() => {
    const controller = getLocalNavigation();
    return () => {
      controller.destroy();
      if (localNavigationRef.current === controller) localNavigationRef.current = null;
    };
  }, []);

  // Sync browser theme-color with the active palette.
  useEffect(() => {
    if (typeof document === 'undefined') return;
    const meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', palette.themeColor);
  }, [palette.themeColor]);

  useEffect(() => {
    tabRef.current = tab;
  }, [tab]);

  useEffect(() => {
    const storedPlayer = readLocalPlayerId(state.eventCode);
    if (storedPlayer !== localPlayerId) setLocalPlayerId(storedPlayer);
  }, [state.eventCode]);

  useEffect(() => {
    if (role === 'host' && localPlayerId !== 'host') {
      chooseLocalPlayer('host');
    }
  }, [localPlayerId, role, state.eventCode]);

  useEffect(() => {
    if (role === 'host') return;
    if (!hostReturnToken || hostReturnToken !== state.hostAccessToken) return;
    writeLocalHostClaim(state.eventCode);
    writeLocalPlayerId(state.eventCode, 'host');
    setLocalPlayerId('host');
    setRole('host');
    setBackupNotice('Host access restored on this device.');
  }, [hostReturnToken, role, state.eventCode, state.hostAccessToken]);

  useEffect(() => {
    if (!crewReturnPlayerId || crewReturnPlayerId === 'host') return;
    if (!state.players.some((player) => player.id === crewReturnPlayerId)) return;
    writeLocalPlayerId(state.eventCode, crewReturnPlayerId);
    setLocalPlayerId(crewReturnPlayerId);
    setRole('eventee');
  }, [crewReturnPlayerId, state.eventCode, state.players]);

  useEffect(() => {
    if (role) return;
    if (!localPlayerId || localPlayerId === 'host') return;
    if (!state.players.some((player) => player.id === localPlayerId)) return;
    setRole('eventee');
  }, [localPlayerId, role, state.players]);

  // Flip data-mode on the document so light/dark CSS branches work, and
  // make sure the page background matches the palette outside our shell.
  useEffect(() => {
    if (typeof document === 'undefined') return;
    const mode = palette.vars['--mode'] ?? 'light';
    document.documentElement.setAttribute('data-mode', mode);
    document.documentElement.style.colorScheme = mode === 'dark' ? 'dark' : 'light';
  }, [palette.vars]);

  useEffect(() => {
    if (!isTabAllowed(tab, role, features)) {
      goToTab(visibleTabs[0] ?? 'now', { replace: true });
    }
  }, [features, role, tab, visibleTabs]);

  useEffect(() => {
    if (!visibleHostSections.includes(hostSection)) {
      setHostSection(visibleHostSections[0] ?? 'setup');
    }
  }, [hostSection, visibleHostSections]);

  useEffect(() => {
    if (!features.games && selectedChallengeId) setSelectedChallengeId(null);
  }, [features.games, selectedChallengeId]);

  useEffect(() => {
    if (!features.tournaments) {
      if (selectedTournamentEventId) setSelectedTournamentEventId(null);
      if (selectedTournamentMatchId) setSelectedTournamentMatchId(null);
    }
  }, [features.tournaments, selectedTournamentEventId, selectedTournamentMatchId]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const interactiveSelector = 'input, textarea, select, button, a, label, [role="tab"], .day-toggle, .segmented-control, .action-sheet';
    function onTouchStart(event: TouchEvent) {
      const touch = event.touches[0];
      if (!touch || touch.clientX > 38) return;
      const target = event.target as Element | null;
      if (target?.closest(interactiveSelector)) return;
      touchStartRef.current = { x: touch.clientX, y: touch.clientY, at: Date.now() };
    }
    function onTouchEnd(event: TouchEvent) {
      const start = touchStartRef.current;
      touchStartRef.current = null;
      const touch = event.changedTouches[0];
      if (!start || !touch) return;
      const dx = touch.clientX - start.x;
      const dy = Math.abs(touch.clientY - start.y);
      if (dx > 84 && dy < 60 && Date.now() - start.at < 650) {
        goBack();
      }
    }
    window.addEventListener('touchstart', onTouchStart, { passive: true });
    window.addEventListener('touchend', onTouchEnd, { passive: true });
    return () => {
      window.removeEventListener('touchstart', onTouchStart);
      window.removeEventListener('touchend', onTouchEnd);
    };
  }, [actionSheetOpen, confirmRequest, features, inboxOpen, role, selectedChallengeId, selectedTournamentEventId, selectedTournamentMatchId, tab, tabStack, visibleTabs]);

  useEffect(() => {
    const interval = window.setInterval(() => setMinuteTick((tick) => tick + 1), 30_000);
    return () => window.clearInterval(interval);
  }, []);

  useEffect(() => {
    if (!features.tournaments) return;
    setState((current) => {
      const next = appendTournamentSystemNotices(current, Date.now());
      return next === current ? current : markLocalUpdate(next, deviceId);
    });
  }, [deviceId, features.tournaments, minuteTick, setState, state.tournamentEvents, state.tournamentMatches]);

  useEffect(() => {
    let cancelled = false;
    void qrSvg(shareUrl, { ecc: 'M', size: 210, brand: 'none', fg: '#14120F', bg: '#F5EFE4' })
      .then((svg) => {
        if (!cancelled) setQrMarkup(svg);
      })
      .catch(() => {
        if (!cancelled) setQrMarkup(null);
      });
    return () => {
      cancelled = true;
    };
  }, [shareUrl]);

  useEffect(() => {
    let cancelled = false;
    void qrSvg(hostReturnUrl, { ecc: 'M', size: 210, brand: 'none', fg: '#14120F', bg: '#F5EFE4' })
      .then((svg) => {
        if (!cancelled) setHostHandoffQrMarkup(svg);
      })
      .catch(() => {
        if (!cancelled) setHostHandoffQrMarkup(null);
      });
    return () => {
      cancelled = true;
    };
  }, [hostReturnUrl]);

  useEffect(() => {
    let cancelled = false;
    if (!crewReturnUrl) {
      setCrewReturnQrMarkup(null);
      return;
    }
    void qrSvg(crewReturnUrl, { ecc: 'M', size: 210, brand: 'none', fg: '#14120F', bg: '#F5EFE4' })
      .then((svg) => {
        if (!cancelled) setCrewReturnQrMarkup(svg);
      })
      .catch(() => {
        if (!cancelled) setCrewReturnQrMarkup(null);
      });
    return () => {
      cancelled = true;
    };
  }, [crewReturnUrl]);

  useEffect(() => {
    let cancelled = false;
    let objectUrl: string | null = null;
    if (state.coverImageDataUrl) {
      setCoverUrl(state.coverImageDataUrl);
      return;
    }
    if (!state.coverImagePath) {
      setCoverUrl(null);
      return;
    }
    void readOpfsFileUrl(state.coverImagePath)
      .then((next) => {
        if (cancelled) {
          URL.revokeObjectURL(next);
          return;
        }
        objectUrl = next;
        setCoverUrl(next);
      })
      .catch(() => {
        if (!cancelled) setCoverUrl(null);
      });
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [state.coverImageDataUrl, state.coverImagePath]);

  useEffect(() => {
    const result = writeLocalBackup(state, 'auto');
    if (result.saved) setBackupRevision((revision) => revision + 1);
    if (result.error) setBackupNotice('Save a copy outside the browser — local snapshots paused.');
  }, [state]);

  function update(updater: (current: CrewtripState) => CrewtripState) {
    setState((current) => markLocalUpdate(updater(current), deviceId));
  }

  function chooseLocalPlayer(playerId: string) {
    setLocalPlayerId(playerId);
    writeLocalPlayerId(state.eventCode, playerId);
  }

  function becomeHost(eventCode: string) {
    writeLocalHostClaim(eventCode);
    writeLocalPlayerId(eventCode, 'host');
    setLocalPlayerId('host');
    setRole('host');
  }

  function vote(pollId: string, optionId: string) {
    update((current) => ({
      ...current,
      polls: current.polls.map((poll) => (poll.id === pollId ? setPollVote(poll, optionId, activePlayer.id) : poll)),
      broadcasts: current.polls.find((poll) => poll.id === pollId && pollSelectionForPlayer(poll, activePlayer.id) !== optionId)
        ? [{ id: newId('b'), text: `${activePlayer.name} voted.`, at: timeNow() }, ...current.broadcasts].slice(0, 18)
        : current.broadcasts,
    }));
    sdk.feel.texture('confirm');
  }

  function changeVote(pollId: string) {
    update((current) => ({
      ...current,
      polls: current.polls.map((poll) => (poll.id === pollId ? clearPollVote(poll, activePlayer.id) : poll)),
    }));
  }

  function addCrewMember() {
    const name = draftCrewName.trim();
    if (!name) return;
    const id = newId('crew');
    const group = groups.find((item) => item.id === draftCrewTeam) ?? groups.find((item) => item.name === draftCrewTeam);
    const nextPlayer: Player = {
      id,
      name,
      team: group?.name ?? (draftCrewTeam.trim() || 'Crew'),
      groupId: group?.id,
      color: crewColorAt(theme, state.players.length),
      score: 0,
    };
    update((current) => ({
      ...current,
      activePlayerId: role === 'host' ? current.activePlayerId : id,
      players: [...current.players, nextPlayer],
      broadcasts: [{ id: newId('b'), text: `${name} joined the crew.`, at: timeNow() }, ...current.broadcasts],
    }));
    chooseLocalPlayer(id);
    setDraftCrewName('');
    setDraftCrewTeam(groups[1]?.id ?? 'all');
    sdk.feel.texture('confirm');
  }

  function updatePlayer(playerId: string, patch: Partial<Player>) {
    update((current) => ({
      ...current,
      players: current.players.map((player) => (player.id === playerId ? { ...player, ...patch } : player)),
    }));
  }

  async function addPlayerImage(event: ChangeEvent<HTMLInputElement>, playerId: string) {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = '';
    if (!file) return;
    const avatarDataUrl = await readImageFileAsDataUrl(file, AVATAR_IMAGE_MAX);
    updatePlayer(playerId, { avatarDataUrl, avatarName: file.name });
    sdk.feel.texture('confirm');
  }

  function completeChallenge(challengeId: string) {
    const challenge = state.challenges.find((item) => item.id === challengeId);
    if (!challenge || challenge.status === 'closed' || challenge.doneBy.includes(activePlayer.id)) return;
    submitGameEntry(challengeId, '');
  }

  function submitGameEntry(challengeId: string, text = draftGameEntry.trim(), media?: { mediaDataUrl?: string; mediaKind?: 'image' | 'video'; mediaName?: string }) {
    const challenge = state.challenges.find((item) => item.id === challengeId);
    if (!challenge || challenge.status === 'closed') return;
    const alreadyScored = challenge.doneBy.includes(activePlayer.id);
    const entryText = text || `${activePlayer.name} completed this.`;
    update((current) => ({
      ...current,
      challenges: current.challenges.map((item) =>
        item.id === challengeId
          ? {
              ...item,
              doneBy: alreadyScored ? item.doneBy : [...item.doneBy, activePlayer.id],
              submissions: [
                {
                  id: newId('entry'),
                  playerId: activePlayer.id,
                  playerName: activePlayer.name,
                  groupId: activePlayer.groupId,
                  text: entryText,
                  at: timeNow(),
                  cheers: [],
                  ...media,
                },
                ...(item.submissions ?? []),
              ],
            }
          : item,
      ),
      players: alreadyScored || !features.scores
        ? current.players
        : current.players.map((player) =>
            player.id === activePlayer.id ? { ...player, score: player.score + challenge.points } : player,
          ),
      broadcasts: [{ id: newId('b'), text: `${activePlayer.name} added proof for ${challenge.title}.`, at: timeNow() }, ...current.broadcasts].slice(0, 18),
    }));
    setDraftGameEntry('');
    sdk.feel.texture('complete');
  }

  async function addGameMediaEntry(event: ChangeEvent<HTMLInputElement>, challengeId: string) {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = '';
    if (!file) return;
    let mediaDataUrl: string | null = null;
    try {
      mediaDataUrl = await readSyncMediaDataUrl(file);
    } catch (error) {
      if (error instanceof VideoTooLargeError) {
        setBackupNotice(`Video too large (${formatMb(error.bytes)}). Upload under ${formatMb(VIDEO_HARD_LIMIT_BYTES)}.`);
        return;
      }
      throw error;
    }
    submitGameEntry(challengeId, draftGameEntry.trim() || file.name, {
      mediaDataUrl: mediaDataUrl ?? undefined,
      mediaKind: file.type.startsWith('video/') ? 'video' : 'image',
      mediaName: file.name,
    });
    if (mediaDataUrl === null) {
      setBackupNotice(`Video kept on this device only — too large to send to other crew (${formatMb(file.size)}).`);
    }
  }

  function cheerSubmission(challengeId: string, submissionId: string) {
    update((current) => ({
      ...current,
      challenges: current.challenges.map((challenge) => {
        if (challenge.id !== challengeId) return challenge;
        return {
          ...challenge,
          submissions: (challenge.submissions ?? []).map((submission) => {
            if (submission.id !== submissionId) return submission;
            const alreadyCheered = submission.cheers.includes(activePlayer.id);
            return {
              ...submission,
              cheers: alreadyCheered
                ? submission.cheers.filter((playerId) => playerId !== activePlayer.id)
                : [...submission.cheers, activePlayer.id],
            };
          }),
        };
      }),
    }));
    sdk.feel.texture('toggle');
  }

  function addMemory(kind: MemoryKind = 'text') {
    const text = draftMemory.trim();
    if (!text) return;
    update((current) => ({
      ...current,
      memories: [
        {
          id: newId('m'),
          author: activePlayer.name,
          kind,
          text,
          dayId: activeDayId,
          groupId: activePlayer.groupId,
          at: timeNow(),
        },
        ...current.memories,
      ],
      broadcasts: [{ id: newId('b'), text: `${activePlayer.name} saved a memory.`, at: timeNow() }, ...current.broadcasts].slice(0, 18),
    }));
    setDraftMemory('');
    sdk.feel.texture('confirm');
  }

  async function addMediaMemory(event: ChangeEvent<HTMLInputElement>) {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = '';
    if (!file) return;
    const mediaPath = `crewtrip/${state.eventCode}/memories/${newId('media')}-${file.name}`;
    await writeOpfsFile(mediaPath, file);
    let mediaDataUrl: string | null = null;
    try {
      mediaDataUrl = await readSyncMediaDataUrl(file);
    } catch (error) {
      if (error instanceof VideoTooLargeError) {
        setBackupNotice(`Video too large (${formatMb(error.bytes)}). Upload under ${formatMb(VIDEO_HARD_LIMIT_BYTES)}.`);
        return;
      }
      throw error;
    }
    const kind: MemoryKind = file.type.startsWith('video/') ? 'video' : 'image';
    update((current) => ({
      ...current,
      memories: [
        {
          id: newId('m'),
          author: activePlayer.name,
          kind,
          text: draftMemory.trim() || file.name,
          dayId: activeDayId,
          groupId: activePlayer.groupId,
          at: timeNow(),
          mediaPath,
          mediaDataUrl: mediaDataUrl ?? undefined,
          mediaName: file.name,
        },
        ...current.memories,
      ],
      broadcasts: [{ id: newId('b'), text: `${activePlayer.name} uploaded ${kind === 'video' ? 'a video' : 'a photo'}.`, at: timeNow() }, ...current.broadcasts].slice(0, 18),
    }));
    setDraftMemory('');
    sdk.feel.texture('confirm');
    if (mediaDataUrl === null) {
      setBackupNotice(`Video kept on this device only — too large to send to other crew (${formatMb(file.size)}).`);
    }
  }

  async function addCoverImage(event: ChangeEvent<HTMLInputElement>) {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = '';
    if (!file) return;
    const mediaPath = `crewtrip/${state.eventCode}/cover/${newId('cover')}-${file.name}`;
    await writeOpfsFile(mediaPath, file);
    const coverImageDataUrl = await readImageFileAsDataUrl(file, SHARED_IMAGE_MAX);
    update((current) => ({ ...current, coverImagePath: mediaPath, coverImageDataUrl, coverImageName: file.name }));
    sdk.feel.texture('confirm');
  }

  function resetDraftStop(dayId = activeDayId, date = '') {
    const day = days.find((item) => item.id === dayId);
    setDraftStop({
      dayId: day?.id ?? dayId,
      date: date || tripDayDateInputValue(day?.date),
      groupId: 'all',
      time: '',
      title: '',
      place: '',
      status: 'later',
    });
    setEditingStopId(null);
  }

  function startEditingStop(stop: ItineraryStop) {
    const dayId = stop.dayId ?? activeDayId;
    const day = days.find((item) => item.id === dayId);
    setEditingStopId(stop.id);
    setSelectedDayId(dayId);
    setDraftStop({
      dayId,
      date: tripDayDateInputValue(day?.date),
      groupId: stop.groupId ?? 'all',
      time: stop.time,
      title: stop.title,
      place: stop.place,
      status: stop.status,
    });
    setHostSection('manage');
    goToTab('host');
  }

  function resolveDraftStopDay() {
    const date = draftStop.date.trim();
    const currentDays = days.length ? days : initialState.days;
    const existingDateDay = findDayByInputDate(currentDays, date);
    const newDateDay = date && !existingDateDay
      ? { id: newId('day'), label: nextTripDayLabel(currentDays), date }
      : null;
    const stopDayId = existingDateDay?.id
      ?? newDateDay?.id
      ?? (currentDays.some((day) => day.id === draftStop.dayId) ? draftStop.dayId : activeDayId);
    return { date, existingDateDay, newDateDay, stopDayId };
  }

  function selectDraftStopDay(dayId: string) {
    const day = days.find((item) => item.id === dayId) ?? activeDay;
    setDraftStop((current) => ({
      ...current,
      dayId: day.id,
      date: tripDayDateInputValue(day.date),
    }));
  }

  function selectDraftStopDate(date: string) {
    const existingDay = findDayByInputDate(days, date);
    setDraftStop((current) => ({
      ...current,
      date,
      dayId: existingDay?.id ?? current.dayId,
    }));
  }

  function addDay() {
    const date = draftDay.date.trim();
    const label = draftDay.label.trim() || nextTripDayLabel(days);
    if (!date && !draftDay.label.trim()) return;
    const existingDay = findDayByInputDate(days, date);
    if (existingDay) {
      setSelectedDayId(existingDay.id);
      resetDraftStop(existingDay.id);
      setDraftDay({ label: '', date: '' });
      return;
    }
    const day = { id: newId('day'), label, date: date || label };
    update((current) => ({ ...current, days: [...(current.days ?? initialState.days), day] }));
    setSelectedDayId(day.id);
    setDraftStop((current) => ({ ...current, dayId: day.id, date }));
    setDraftDay({ label: '', date: '' });
  }

  function addDraftStopDate(dateValue = draftStop.date) {
    const date = dateValue.trim();
    if (!date) return null;
    const currentDays = days.length ? days : initialState.days;
    const existingDay = findDayByInputDate(currentDays, date);
    if (existingDay) {
      setSelectedDayId(existingDay.id);
      setDraftStop((current) => ({ ...current, dayId: existingDay.id, date }));
      return existingDay;
    }
    const day = { id: newId('day'), label: nextTripDayLabel(currentDays), date };
    update((current) => ({
      ...current,
      days: findDayByInputDate(current.days ?? initialState.days, date)
        ? current.days
        : [...(current.days ?? initialState.days), day],
    }));
    setSelectedDayId(day.id);
    setDraftStop((current) => ({ ...current, dayId: day.id, date }));
    return day;
  }

  function addGroup() {
    const name = draftGroup.trim();
    if (!name) return;
    const group: CrewGroup = {
      id: newId('group'),
      name,
      color: crewColorAt(theme, groups.length + 1),
      emoji: defaultGroupEmojiInline(name),
    };
    update((current) => ({ ...current, groups: [...(current.groups ?? initialState.groups), group] }));
    setDraftGroup('');
  }

  function updateGroup(groupId: string, patch: Partial<CrewGroup>) {
    update((current) => ({
      ...current,
      groups: current.groups.map((group) => (group.id === groupId ? { ...group, ...patch } : group)),
    }));
  }

  async function addGroupImage(event: ChangeEvent<HTMLInputElement>, groupId: string) {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = '';
    if (!file) return;
    const imageDataUrl = await readImageFileAsDataUrl(file, AVATAR_IMAGE_MAX);
    updateGroup(groupId, { imageDataUrl, imageName: file.name });
    sdk.feel.texture('confirm');
  }

  function assignPlayerGroup(playerId: string, groupId: string) {
    const group = groups.find((item) => item.id === groupId);
    update((current) => ({
      ...current,
      players: current.players.map((player) =>
        player.id === playerId ? { ...player, groupId, team: group?.name ?? player.team } : player,
      ),
    }));
  }

  function addMessage() {
    const text = draftMessage.trim();
    if (!text) return;
    update((current) => ({
      ...current,
      messages: [
        {
          id: newId('msg'),
          authorId: activePlayer.id,
          authorName: activePlayer.name,
          scope: 'all',
          text,
          at: timeNow(),
        },
        ...(current.messages ?? []),
      ],
    }));
    setDraftMessage('');
    sdk.feel.texture('confirm');
  }

  function addRequest() {
    const text = draftRequest.trim();
    if (!text) return;
    update((current) => ({
      ...current,
      requests: [
        { id: newId('r'), authorId: activePlayer.id, authorName: activePlayer.name, text, status: 'new', at: timeNow() },
        ...current.requests,
      ],
    }));
    setDraftRequest('');
    sdk.feel.texture('confirm');
  }

  function updateRequest(id: string, status: RequestStatus) {
    const request = state.requests.find((item) => item.id === id);
    update((current) => ({
      ...current,
      requests: current.requests.map((item) => (item.id === id ? { ...item, status } : item)),
      broadcasts:
        status === 'shared' && request
          ? [{ id: newId('b'), text: `Crew request shared: ${request.text}`, at: timeNow() }, ...current.broadcasts]
          : current.broadcasts,
    }));
  }

  function transformRequest(requestId: string, target: 'plan' | 'poll' | 'game') {
    update((current) => {
      const request = current.requests.find((item) => item.id === requestId);
      if (!request) return current;
      const sharedRequests = current.requests.map((item) => (item.id === request.id ? { ...item, status: 'shared' as const } : item));
      if (target === 'plan') {
        return {
          ...current,
          requests: sharedRequests,
          stops: [
            ...current.stops,
            { id: newId('s'), dayId: activeDayId, time: 'TBC', title: request.text, place: `Requested by ${request.authorName}`, status: 'later' as const },
          ],
          broadcasts: [{ id: newId('b'), text: `Crew request added to plan: ${request.text}`, at: timeNow() }, ...current.broadcasts],
        };
      }
      if (target === 'poll') {
        return {
          ...current,
          requests: sharedRequests,
          polls: [
            {
              id: newId('p'),
              question: request.text,
              closes: 'Open',
              open: true,
              options: ['Yes', 'No', 'Maybe'].map((label) => ({ id: newId('o'), label, votes: 0 })),
            },
            ...current.polls,
          ],
          broadcasts: [{ id: newId('b'), text: `Crew request is now a vote: ${request.text}`, at: timeNow() }, ...current.broadcasts],
        };
      }
      return {
        ...current,
        requests: sharedRequests,
        challenges: [{ id: newId('c'), kind: 'mission' as GameKind, dayId: activeDayId, status: 'open' as const, title: request.text, points: 8, doneBy: [], submissions: [] }, ...current.challenges],
        broadcasts: [{ id: newId('b'), text: `Crew request became a game: ${request.text}`, at: timeNow() }, ...current.broadcasts],
      };
    });
    sdk.feel.texture('confirm');
  }

  function addBroadcast() {
    const text = draftBroadcast.trim();
    if (!text) return;
    update((current) => ({
      ...current,
      hostNote: text,
      broadcasts: [{ id: newId('b'), text, at: timeNow() }, ...current.broadcasts],
    }));
    setDraftBroadcast('');
    sdk.feel.texture('confirm');
  }

  function sendPulse(kind: PulseKind) {
    const pulse = pulseActions.find((item) => item.kind === kind);
    if (!pulse) return;
    update((current) => ({
      ...current,
      energy: Math.min(100, current.energy + (kind === 'lost' || kind === 'hungry' ? 1 : 3)),
      pulses: [
        {
          id: newId('pulse'),
          playerId: activePlayer.id,
          playerName: activePlayer.name,
          groupId: activePlayer.groupId,
          kind,
          label: pulse.label,
          at: timeNow(),
        },
        ...(current.pulses ?? []),
      ].slice(0, 36),
      broadcasts: [{ id: newId('b'), text: `${activePlayer.name}: ${pulse.label}`, at: timeNow() }, ...current.broadcasts].slice(0, 18),
    }));
    sdk.feel.texture(kind === 'lost' ? 'toggle' : 'confirm');
  }

  function addSurpriseDrop() {
    const title = draftSurprise.title.trim();
    const message = draftSurprise.message.trim();
    const unlockValue = draftSurprise.unlockValue.trim();
    if (!title || !message || !unlockValue) return;
    update((current) => ({
      ...current,
      surprises: [
        {
          id: newId('drop'),
          title,
          message,
          unlockType: draftSurprise.unlockType,
          unlockValue,
          createdAt: timeNow(),
        },
        ...(current.surprises ?? []),
      ],
      broadcasts: [{ id: newId('b'), text: `Host scheduled a surprise: ${title}`, at: timeNow() }, ...current.broadcasts].slice(0, 18),
    }));
    setDraftSurprise({ title: '', message: '', unlockType: 'time', unlockValue: '21:00' });
    sdk.feel.texture('confirm');
  }

  function addSoundtrack() {
    const title = draftSoundtrack.title.trim();
    const dj = draftSoundtrack.dj.trim() || 'Host';
    if (!title) return;
    const slot: SoundtrackSlot = {
      id: newId('dj'),
      dayId: activeDayId,
      time: draftSoundtrack.time.trim() || 'TBC',
      title,
      dj,
      link: normalizePlaylistUrl(draftSoundtrack.link),
      note: draftSoundtrack.note.trim() || undefined,
      status: 'later',
    };
    update((current) => ({
      ...current,
      soundtracks: [slot, ...(current.soundtracks ?? [])],
      broadcasts: [{ id: newId('b'), text: `${dj} added ${title} to the soundtrack.`, at: timeNow() }, ...current.broadcasts].slice(0, 18),
    }));
    setDraftSoundtrack({ time: '21:00', title: '', dj: '', link: '', note: '' });
    sdk.feel.texture('confirm');
  }

  function revealSurprise(dropId: string) {
    update((current) => ({
      ...current,
      surprises: current.surprises.map((drop) => (drop.id === dropId ? { ...drop, revealedAt: timeNow() } : drop)),
      broadcasts: [{ id: newId('b'), text: 'A host surprise unlocked.', at: timeNow() }, ...current.broadcasts].slice(0, 18),
    }));
    sdk.feel.texture('complete');
  }

  function addStop() {
    const title = draftStop.title.trim();
    if (!title) return;
    const { date, existingDateDay, newDateDay, stopDayId } = resolveDraftStopDay();
    update((current) => ({
      ...current,
      days: newDateDay && !findDayByInputDate(current.days ?? initialState.days, date)
        ? [...(current.days ?? initialState.days), newDateDay]
        : current.days,
      stops: [
        ...current.stops,
        {
          id: newId('s'),
          dayId: stopDayId,
          groupId: draftStop.groupId === 'all' ? undefined : draftStop.groupId,
          time: draftStop.time.trim() || 'TBC',
          title,
          place: draftStop.place.trim() || 'Host drop',
          status: draftStop.status,
        },
      ],
    }));
    setSelectedDayId(stopDayId);
    resetDraftStop(stopDayId, newDateDay?.date ?? existingDateDay?.date ?? '');
  }

  function saveStopEdit() {
    if (!editingStopId) {
      addStop();
      return;
    }
    const title = draftStop.title.trim();
    if (!title) return;
    const { date, existingDateDay, newDateDay, stopDayId } = resolveDraftStopDay();
    update((current) => ({
      ...current,
      days: newDateDay && !findDayByInputDate(current.days ?? initialState.days, date)
        ? [...(current.days ?? initialState.days), newDateDay]
        : current.days,
      stops: current.stops.map((stop) => stop.id === editingStopId
        ? {
            ...stop,
            dayId: stopDayId,
            groupId: draftStop.groupId === 'all' ? undefined : draftStop.groupId,
            time: draftStop.time.trim() || 'TBC',
            title,
            place: draftStop.place.trim() || 'Host drop',
            status: draftStop.status,
          }
        : stop),
      broadcasts: [{ id: newId('b'), text: `Host updated the plan: ${title}`, at: timeNow() }, ...current.broadcasts].slice(0, 18),
    }));
    setSelectedDayId(stopDayId);
    resetDraftStop(stopDayId, newDateDay?.date ?? existingDateDay?.date ?? '');
    sdk.feel.texture('confirm');
  }

  function submitStopDraft() {
    if (editingStopId) {
      saveStopEdit();
      return;
    }
    addStop();
    sdk.feel.texture('confirm');
  }

  function renderPlanDateControls(prefix: string) {
    const newDateSelected = Boolean(draftStop.date && !findDayByInputDate(days, draftStop.date));
    return (
      <>
        <div className="plan-day-picker" role="group" aria-label="Existing trip dates">
          {days.map((day) => {
            const selected = !newDateSelected && draftStop.dayId === day.id;
            return (
              <button
                key={day.id}
                type="button"
                aria-pressed={selected}
                className={selected ? 'active' : ''}
                onClick={() => selectDraftStopDay(day.id)}
              >
                <strong>{day.label}</strong>
                <span>{formatTripDayDate(day.date)}</span>
              </button>
            );
          })}
        </div>
        <div className="plan-date-controls">
          <label>
            <span>Date</span>
            <input
              name={`${prefix}-date`}
              type="date"
              value={draftStopDateValue}
              onChange={(event) => selectDraftStopDate(event.target.value)}
            />
          </label>
          {newDateSelected ? (
            <button type="button" className="ghost date-add-button" onClick={() => addDraftStopDate()}>
              Add {formatTripDayDate(draftStop.date)}
            </button>
          ) : null}
          <label>
            <span>Group</span>
            <select name={`${prefix}-group`} value={draftStop.groupId} onChange={(event) => setDraftStop((current) => ({ ...current, groupId: event.target.value }))}>
              {groups.map((group) => <option key={group.id} value={group.id}>{group.name}</option>)}
            </select>
          </label>
        </div>
      </>
    );
  }

  function addPoll() {
    const question = draftPoll.question.trim();
    const options = draftPoll.options.split(',').map((item) => item.trim()).filter(Boolean).slice(0, 6);
    if (!question || options.length < 2) return;
    update((current) => ({
      ...current,
      polls: [
        {
          id: newId('p'),
          question,
          closes: draftPoll.closes.trim() || 'Open',
          open: true,
          options: options.map((label) => ({ id: newId('o'), label, votes: 0 })),
        },
        ...current.polls,
      ],
    }));
    setDraftPoll({ question: '', options: 'Yes, No, Maybe', closes: 'Open' });
    sdk.feel.texture('confirm');
  }

  function addChallenge() {
    const title = draftChallenge.title.trim();
    const points = Math.max(1, Number(draftChallenge.points) || 1);
    if (!title) return;
    update((current) => ({
      ...current,
      challenges: [
        {
          id: newId('c'),
          kind: draftChallenge.kind,
          dayId: activeDayId,
          groupId: draftChallenge.groupId === 'all' ? undefined : draftChallenge.groupId,
          deadline: draftChallenge.deadline.trim() || 'TBC',
          status: 'open' as const,
          title,
          points,
          doneBy: [],
          submissions: [],
        },
        ...current.challenges,
      ],
    }));
    setDraftChallenge({ title: '', points: '8', kind: 'challenge', groupId: 'all', deadline: 'TBC' });
    sdk.feel.texture('confirm');
  }

  function addGamePreset(kind: GameKind) {
    const preset = gamePresets[kind];
    update((current) => ({
      ...current,
      challenges: [
        {
          id: newId('c'),
          kind,
          dayId: activeDayId,
          groupId: draftChallenge.groupId === 'all' ? undefined : draftChallenge.groupId,
          deadline: draftChallenge.deadline.trim() || 'TBC',
          status: 'open' as const,
          title: preset.title,
          points: preset.points,
          doneBy: [],
          submissions: [],
        },
        ...current.challenges,
      ],
    }));
    sdk.feel.texture('confirm');
  }

  function updateChallenge(challengeId: string, patch: Partial<Challenge>) {
    update((current) => ({
      ...current,
      challenges: current.challenges.map((challenge) => (
        challenge.id === challengeId ? { ...challenge, ...patch } : challenge
      )),
    }));
  }

  function toggleFeature(feature: FeatureKey) {
    update((current) => ({
      ...current,
      features: {
        ...(current.features ?? initialState.features),
        [feature]: !(current.features ?? initialState.features)[feature],
      },
    }));
  }

  function applyFeaturePreset(features: Record<FeatureKey, boolean>) {
    update((current) => ({ ...current, features: { ...features } }));
  }

  function updateWrap(updater: (current: WrapUpSettings) => WrapUpSettings) {
    update((current) => ({ ...current, wrapUp: updater(current.wrapUp ?? initialState.wrapUp) }));
  }

  function assignWrapAward() {
    const playerId = draftAward.playerId || state.players[0]?.id;
    const title = draftAward.title.trim();
    const detail = draftAward.detail.trim();
    if (!playerId || !title) return;
    updateWrap((current) => {
      const existing = current.assignedAwards ?? [];
      const assigned = {
        id: existing.find((award) => award.playerId === playerId)?.id ?? newId('award'),
        playerId,
        title,
        detail,
        trophy: draftAward.trophy,
        effect: draftAward.effect,
        updatedAt: Date.now(),
        updatedBy: deviceId,
      };
      return {
        ...current,
        assignedAwards: [assigned, ...existing.filter((award) => award.playerId !== playerId)],
      };
    });
    setDraftAward((current) => ({ ...current, title: '', detail: '' }));
  }

  function removeWrapAward(playerId: string) {
    updateWrap((current) => ({
      ...current,
      assignedAwards: (current.assignedAwards ?? []).filter((award) => award.playerId !== playerId),
    }));
  }

  function leaveSession() {
    setConfirmRequest({
      title: 'Leave this trip?',
      body: 'You will return to the entry screen and can rejoin with the same link any time.',
      confirmLabel: 'Leave',
      onConfirm: () => {
        setRole(null);
        resetToNow();
        setSelectedChallengeId(null);
        setActionSheetOpen(false);
      },
    });
  }

  function resetTrip(mode: 'same-event' | 'new-event') {
    const keepJoinLink = mode === 'same-event';
    setConfirmRequest({
      title: keepJoinLink ? 'Clear this trip?' : 'Start a new trip?',
      body: keepJoinLink
        ? 'Removes plans, votes, games, playlists, memories, requests, messages, crew, and media from this device and live peers. The join link stays the same.'
        : 'Creates a fresh blank trip with a new join code. Your selected language and theme stay.',
      confirmLabel: keepJoinLink ? 'Clear' : 'Start new',
      destructive: true,
      onConfirm: () => {
        const next = createFreshCrewtripState({
          eventCode: keepJoinLink ? state.eventCode : newEventCode(),
          language,
          theme,
        });
        setState(markLocalUpdate(next, deviceId));
        becomeHost(next.eventCode);
        resetToNow();
        setSelectedDayId(next.days[0]?.id ?? 'day-1');
        setSelectedChallengeId(null);
        setActionSheetOpen(false);
        sdk.feel.texture('confirm');
      },
    });
  }

  function applyTemplate(template: EventTemplate) {
    update((current) => ({
      ...current,
      eventName: template.name,
      location: template.location,
      description: template.description,
      hostNote: template.hostNote,
      stops: template.stops.map((stop) => ({ ...stop, id: newId('s') })),
      soundtracks: (template.soundtracks ?? current.soundtracks ?? []).map((slot) => ({ ...slot, id: newId('dj') })),
      polls: template.polls.map((poll) => ({
        ...poll,
        id: newId('p'),
        options: poll.options.map((option) => ({ ...option, id: newId('o'), votes: 0 })),
      })),
      challenges: template.challenges.map((challenge) => ({ ...challenge, id: newId('c'), doneBy: [], submissions: [] })),
      broadcasts: [{ id: newId('b'), text: `${template.name} template applied.`, at: timeNow() }, ...current.broadcasts],
    }));
  }

  function advancePlan() {
    update((current) => {
      const nowIndex = current.stops.findIndex((stop) => (stop.dayId ?? activeDayId) === activeDayId && stop.status === 'now');
      const nextIndex = current.stops.findIndex((stop) => (stop.dayId ?? activeDayId) === activeDayId && stop.status === 'next');
      return {
        ...current,
        stops: current.stops.map((stop, index) => {
          if ((stop.dayId ?? activeDayId) !== activeDayId) return stop;
          if (index === nowIndex) return { ...stop, status: 'later' as const };
          if (index === nextIndex) return { ...stop, status: 'now' as const };
          if (index === nextIndex + 1) return { ...stop, status: 'next' as const };
          return stop.status === 'next' ? { ...stop, status: 'later' as const } : stop;
        }),
      };
    });
  }

  async function copyShareLink() {
    try {
      await navigator.clipboard?.writeText(shareUrl);
      setShareCopied(true);
      window.setTimeout(() => setShareCopied(false), 1600);
    } catch {
      setShareCopied(false);
    }
  }

  async function copyHostReturnLink() {
    try {
      await navigator.clipboard?.writeText(hostReturnUrl);
      setHandoffCopied('host');
      window.setTimeout(() => setHandoffCopied((current) => (current === 'host' ? null : current)), 1600);
      setBackupNotice('Host handoff link copied. Open it on your other device while this trip is open.');
      sdk.feel.texture('confirm');
    } catch {
      setBackupNotice('Could not copy the host return link here. Use the recovery pack as a backup.');
    }
  }

  async function copyCrewReturnLink() {
    if (!crewReturnUrl) return;
    try {
      await navigator.clipboard?.writeText(crewReturnUrl);
      setHandoffCopied('crew');
      window.setTimeout(() => setHandoffCopied((current) => (current === 'crew' ? null : current)), 1600);
      sdk.feel.texture('confirm');
    } catch {
      setHandoffCopied(null);
    }
  }

  function downloadRecoveryPack() {
    const result = writeLocalBackup(state, 'manual', true);
    setBackupRevision((revision) => revision + 1);
    const pack = stringifyRecoveryPack(state);
    downloadTextFile(recoveryPackFileName(state), pack, 'application/json');
    setBackupNotice(result.error
      ? 'Recovery pack downloaded. Local snapshots could not be updated on this device.'
      : 'Recovery pack downloaded. Save it somewhere safe.');
  }

  async function copyRecoveryPack() {
    try {
      writeLocalBackup(state, 'manual', true);
      setBackupRevision((revision) => revision + 1);
      await navigator.clipboard.writeText(stringifyRecoveryPack(state));
      setBackupNotice('Recovery pack copied. Paste it somewhere safe.');
    } catch {
      setBackupNotice('Could not copy here — use Download recovery pack instead.');
    }
  }

  async function importRecoveryPack(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    try {
      const pack = parseRecoveryPack(await file.text());
      const restored = markLocalUpdate(pack.state, deviceId);
      setState(restored);
      becomeHost(restored.eventCode);
      resetToNow();
      setSelectedDayId(restored.days[0]?.id ?? 'day-1');
      setSelectedChallengeId(null);
      setSelectedTournamentEventId(null);
      setSelectedTournamentMatchId(null);
      writeLocalBackup(restored, 'restore', true);
      setBackupRevision((revision) => revision + 1);
      setBackupNotice(`Restored ${restored.eventName || 'Crewtrip'} from a recovery pack.`);
      sdk.feel.texture('confirm');
    } catch {
      setBackupNotice('That file is not a valid Crewtrip recovery pack.');
    }
  }

  function restoreLocalBackup(backup: ReturnType<typeof readLocalBackups>[number]) {
    const restored = markLocalUpdate(backup.pack.state, deviceId);
    setState(restored);
    becomeHost(restored.eventCode);
    resetToNow();
    setSelectedDayId(restored.days[0]?.id ?? 'day-1');
    setSelectedChallengeId(null);
    setSelectedTournamentEventId(null);
    setSelectedTournamentMatchId(null);
    writeLocalBackup(restored, 'restore', true);
    setBackupRevision((revision) => revision + 1);
    setBackupNotice(`Restored local snapshot from ${formatBackupTime(backup.at)}.`);
    sdk.feel.texture('confirm');
  }

  function onTimelineSelect(item: TripTimelineItem) {
    if (item.stopId && role === 'host') {
      const stop = state.stops.find((entry) => entry.id === item.stopId);
      if (stop) {
        startEditingStop(stop);
        return;
      }
    }
    if (item.tournamentEventId) {
      setGameComposerMode('structured');
      setSelectedTournamentEventId(item.tournamentEventId);
      setSelectedTournamentMatchId(item.matchId ?? null);
      goToTab('games');
      return;
    }
    if (item.challengeId) setSelectedChallengeId(item.challengeId);
    if (item.tab) goToTab(item.tab);
  }

  if (!role) {
    const hasHostClaim = readLocalHostClaim(state.eventCode);
    const hostResumeBackup = hostedBackups.find((backup) => normalizeEventCode(backup.eventCode) !== normalizeEventCode(state.eventCode)) ?? hostedBackups[0] ?? null;
    return (
      <EntryScreen
        themeStyle={themeVars}
        hasExistingTrip={hasHostClaim || Boolean(hostResumeBackup)}
        existingTripName={hasHostClaim
          ? (state.eventName !== 'Crewtrip' ? state.eventName : undefined)
          : hostResumeBackup?.eventName}
        onContinue={() => {
          if (hasHostClaim) {
            becomeHost(state.eventCode);
            resetToNow();
            return;
          }
          if (hostResumeBackup) {
            restoreLocalBackup(hostResumeBackup);
          }
        }}
        onStartNew={(name) => {
          const next = createFreshCrewtripState({
            eventCode: newEventCode(),
            language,
            theme,
          });
          if (name) next.eventName = name;
          setState(markLocalUpdate(next, deviceId));
          becomeHost(next.eventCode);
          resetToNow();
          setSelectedDayId(next.days[0]?.id ?? 'day-1');
        }}
        onJoinCode={(code) => {
          if (typeof window === 'undefined') return;
          const eventCode = normalizeEventCode(code);
          if (!eventCode) return;
          const url = new URL(window.location.href);
          url.searchParams.set('event', eventCode);
          url.searchParams.set('role', 'crew');
          window.location.assign(url.toString());
        }}
        onTryDemo={() => {
          // The original seeded state lives in `initialState`. Opt-in path
          // for browsing the showcase rather than a real first run.
          setState(markLocalUpdate(initialState, deviceId));
          becomeHost(initialState.eventCode);
          resetToNow();
        }}
      />
    );
  }

  if (crewNeedsProfile) {
    return (
      <main className={`app-shell ${dock.className}`} style={shellStyle}>
        <header className="app-header">
          <div className="header-copy">
            <h1>{state.eventName || 'Crewtrip'}</h1>
            <p className="trip-meta">
              <span className="trip-code">{state.eventCode}</span>
            </p>
          </div>
          <div className="header-actions">
            <button
              type="button"
              className="share-button"
              onClick={copyShareLink}
              aria-label={shareCopied ? copy.copied : copy.share}
              title={shareCopied ? copy.copied : copy.share}
            >
              <span aria-hidden="true">{shareCopied ? '✓' : '🔗'}</span>
            </button>
          </div>
        </header>
        <LiveActivityStrip activities={liveActivities} reduceMotion={reduceMotion} />
        <View title={copy.joinTrip} kicker="Crew view" onBack={leaveSession} backLabel="Leave">
          <section className="crew-join-gate app-card">
            <div>
              <p className="eyebrow">{state.eventCode}</p>
              <h2>Join as yourself</h2>
              <p>
                This invite opens the crew environment. Hosts manage plans, games, and settings;
                crew can vote, request, chat, submit moments, and follow the trip.
              </p>
            </div>
            <div className="composer three">
              <input
                name="crew-name"
                value={draftCrewName}
                onChange={(event) => setDraftCrewName(event.target.value)}
                placeholder="Your name"
              />
              <select name="crew-team" value={draftCrewTeam} onChange={(event) => setDraftCrewTeam(event.target.value)}>
                {groups.map((group) => <option key={group.id} value={group.id}>{group.name}</option>)}
              </select>
              <button type="button" disabled={!draftCrewName.trim()} onClick={addCrewMember}>{copy.addMe}</button>
            </div>
          </section>
          {state.players.some((player) => player.id !== 'host') ? (
            <section className="crew-join-gate app-card">
              <div>
                <p className="eyebrow">Already joined?</p>
                <h3>Use an existing crew profile</h3>
              </div>
              <div className="group-chip-row">
                {state.players.filter((player) => player.id !== 'host').map((player) => (
                  <button key={player.id} type="button" onClick={() => chooseLocalPlayer(player.id)}>
                    <span className="mini-avatar" style={{ background: player.color }}>{player.name.slice(0, 1).toUpperCase()}</span>
                    {player.name}
                    <small>{player.team}</small>
                  </button>
                ))}
              </div>
            </section>
          ) : null}
        </View>
        <Confirm request={confirmRequest} onClose={() => setConfirmRequest(null)} />
      </main>
    );
  }

  return (
    <main className={`app-shell ${dock.className}`} style={shellStyle}>
      <header className="app-header">
        <div className="header-copy">
          <h1>{state.eventName || 'Crewtrip'}</h1>
          <p className="trip-meta">
            <span className="trip-code">{state.eventCode}</span>
          </p>
        </div>
        <div className="header-actions">
          {features.crew ? (
            <button type="button" className={`header-crew-button${tab === 'crew' ? ' active' : ''}`} aria-label="Open crew" onClick={() => goToTab('crew')}>
              <GroupMark group={activeGroup ?? groups[0]!} />
            </button>
          ) : null}
          {inboxEnabled ? (
            <button type="button" className="header-icon-button" aria-label="Open crew inbox" onClick={openHeaderInbox}>
              <Icon name={headerInboxIcon} size={17} />
              {headerInboxCount ? <span>{Math.min(headerInboxCount, 9)}</span> : null}
            </button>
          ) : null}
          <button
            type="button"
            className="share-button"
            onClick={copyShareLink}
            aria-label={shareCopied ? copy.copied : copy.share}
            title={shareCopied ? copy.copied : copy.share}
          >
            <span aria-hidden="true">{shareCopied ? '✓' : '🔗'}</span>
          </button>
        </div>
      </header>

      <LiveActivityStrip activities={liveActivities} reduceMotion={reduceMotion} />

      {tab === 'now' && (
        <TripView
          copy={copy}
          role={role}
          days={days}
          activeDayId={activeDayId}
          onSelectDay={setSelectedDayId}
          phase={tripPhase}
          pulseStats={pulseStats}
          latestBroadcast={latestBroadcast}
          surprises={features.surprises ? unlockedSurprises : []}
          lockedSurpriseCount={features.surprises ? lockedSurpriseCount : 0}
          soundtrack={features.soundtrack ? activeSoundtrack : undefined}
          showPlan={features.plan}
          showPoints={features.scores}
          personalTrip={personalTrip}
          hostPrompts={hostPrompts}
          currentStop={currentStop}
          nextStop={nextStop}
          tripTimelineItems={tripTimelineItems}
          coverUrl={coverUrl}
          groups={groups}
          activePlayer={activePlayer}
          palette={palette}
          onboarding={
            <OnboardingCard
              state={state}
              role={role}
              features={features}
              syncPeers={sync.peers}
              onShare={copyShareLink}
              onAddStop={() => {
                if (role === 'host') {
                  setHostSection('manage');
                  goToTab('host');
                } else {
                  setActionSheetOpen(true);
                }
              }}
              onAddMemory={() => goToTab('memories')}
            />
          }
          onPulse={sendPulse}
          onGo={goToTab}
          onSecondary={() => {
            if (role === 'host') {
              setHostSection('manage');
              goToTab('host');
              return;
            }
            goToTab('memories');
          }}
          onReveal={revealSurprise}
          onSelectTimelineItem={onTimelineSelect}
        />
      )}

      {tab === 'crew' && features.crew && (
        <View title={copy.crew} kicker={copy.crewKicker} onBack={goBack} backLabel={copy.backToTrip}>
          <section className="crew-summary">
            <article className="you-card">
              <div>
                <PlayerAvatar player={activePlayer} size="large" />
                <div>
                  <small>{copy.activeAs}</small>
                  <strong>{activePlayer.name}</strong>
                </div>
              </div>
              {features.scores ? <b>{activePlayer.score} pts</b> : null}
              <p>{activeGroup ? activeGroup.name : activePlayer.team}</p>
              <label className="file-button profile-file">
                {activePlayer.avatarName ? copy.changePhoto : copy.addPhoto}
                <input name={`player-photo-${activePlayer.id}`} type="file" accept="image/*" onChange={(event) => addPlayerImage(event, activePlayer.id)} />
              </label>
            </article>
            <details className="simple-drawer">
              <summary>
                <span>Your team</span>
                <small>Tap one to switch</small>
              </summary>
              <div className="group-chip-row">
                {groups.map((group) => {
                  const count = state.players.filter((player) => (player.groupId ?? 'all') === group.id).length;
                  return (
                    <button
                      key={group.id}
                      type="button"
                      className={activePlayer.groupId === group.id || (!activePlayer.groupId && group.id === 'all') ? 'active' : ''}
                      onClick={() => assignPlayerGroup(activePlayer.id, group.id)}
                    >
                      <GroupMark group={group} />
                      {group.name}
                      <small>{count}</small>
                    </button>
                  );
                })}
              </div>
            </details>
          </section>

          <details className="join-panel compact-join">
            <summary>
              <span>{copy.joinOrSwitch}</span>
              <small>{copy.joinOrSwitchHint}</small>
            </summary>
            <div>
              <h3>{copy.joinTrip}</h3>
              <p>{copy.joinTripHint}</p>
            </div>
            <select
              name="active-player"
              value={activePlayer.id}
              onChange={(event) => {
                chooseLocalPlayer(event.target.value);
                if (role === 'host') update((current) => ({ ...current, activePlayerId: event.target.value }));
              }}
            >
              {state.players.filter((player) => role === 'host' || player.id !== 'host').map((player) => (
                <option key={player.id} value={player.id}>{player.name}</option>
              ))}
            </select>
            <div className="composer three">
              <input name="crew-name" value={draftCrewName} onChange={(event) => setDraftCrewName(event.target.value)} placeholder="Your name" />
              <select name="crew-team" value={draftCrewTeam} onChange={(event) => setDraftCrewTeam(event.target.value)}>
                {groups.map((group) => <option key={group.id} value={group.id}>{group.name}</option>)}
              </select>
              <button onClick={addCrewMember}>{copy.addMe}</button>
            </div>
          </details>

          {crewReturnUrl && role !== 'host' ? (
            <details className="simple-drawer device-handoff">
              <summary>
                <span>Switch device</span>
                <small>Open your crew profile elsewhere</small>
              </summary>
              <div className="handoff-grid">
                {crewReturnQrMarkup ? <div className="qr-frame" dangerouslySetInnerHTML={{ __html: crewReturnQrMarkup }} /> : <code>{crewReturnUrl}</code>}
                <div className="handoff-copy">
                  <h3>Scan from your other device</h3>
                  <p>Keep this trip open here while your other device joins. It will reopen as {localPlayer?.name ?? 'you'}.</p>
                  <button type="button" onClick={() => void copyCrewReturnLink()}>{handoffCopied === 'crew' ? 'Copied' : 'Copy switch link'}</button>
                </div>
              </div>
            </details>
          ) : null}

          {features.scores ? (
            <details className="simple-drawer">
              <summary>
                <span>{copy.leaderboard}</span>
                <small>{state.players.length} people</small>
              </summary>
              <div className="leaderboard">
                <div className="list-head">
                  <h3>{copy.leaderboard}</h3>
                  <span>{state.players.length} {copy.crew}</span>
                </div>
                {sortedPlayers.length ? sortedPlayers.map((player, index) => (
                  <article key={player.id} className="rank-row">
                    <span>{index + 1}</span>
                    <PlayerAvatar player={player} />
                    <div>
                      <strong>{player.name}</strong>
                      <small>{player.team}</small>
                    </div>
                    <b>{player.score}</b>
                  </article>
                )) : <p className="empty-note">No crew yet - add the first name above.</p>}
              </div>
            </details>
          ) : null}
        </View>
      )}

      {tab === 'vote' && features.polls && (
        <View title={copy.polls} kicker={copy.pollsKicker} onBack={goBack} backLabel="Back">
          {state.polls.length ? (
            <div className="poll-stack">
              {state.polls.map((poll) => (
                <PollCard
                  key={poll.id}
                  poll={poll}
                  selected={pollSelectionForPlayer(poll, activePlayer.id)}
                  onVote={(optionId) => vote(poll.id, optionId)}
                  onChange={() => changeVote(poll.id)}
                />
              ))}
            </div>
          ) : (
            <p className="empty-note">No votes yet — host can add one from the + menu.</p>
          )}
        </View>
      )}

      {tab === 'games' && (features.games || features.tournaments || role === 'host') && (
        <View title={copy.games} kicker="Quick games and tournaments" onBack={goBack} backLabel={copy.backToTrip}>
          <DayToggle days={days} selectedDayId={activeDayId} onSelect={setSelectedDayId} />
          <div className="games-hub">
            {role === 'host' ? (
              <section className="game-composer">
                <header>
                  <div>
                    <p className="eyebrow">Add game</p>
                    <h3>Choose quick proof or a tournament</h3>
                  </div>
                  {!features.tournaments && gameComposerMode === 'structured' ? <button type="button" onClick={() => toggleFeature('tournaments')}>Publish formats</button> : null}
                </header>
                <SegmentedControl
                  value={gameComposerMode}
                  options={[
                    { value: 'challenge', label: 'Quick game' },
                    { value: 'structured', label: 'Tournament' },
                  ]}
                  onChange={setGameComposerMode}
                  ariaLabel="Game type"
                />
                {gameComposerMode === 'challenge' ? (
                  <div className="quick-game-composer">
                    <div className="inline-game-presets">
                      {(Object.keys(gamePresets) as GameKind[]).map((kind) => (
                        <button key={kind} type="button" onClick={() => addGamePreset(kind)}>
                          <strong>{gamePresets[kind].label}</strong>
                          <small>{features.scores ? `${gamePresets[kind].points} pts` : gamePresets[kind].title}</small>
                        </button>
                      ))}
                    </div>
                    <div className="quick-game-custom">
                      <label>
                        <span>Custom game</span>
                        <input name="quick-game-title" value={draftChallenge.title} onChange={(event) => setDraftChallenge((current) => ({ ...current, title: event.target.value }))} placeholder="e.g. Best group photo" />
                      </label>
                      {features.scores ? (
                        <label>
                          <span>Points</span>
                          <input name="quick-game-points" type="number" min="1" value={draftChallenge.points} onChange={(event) => setDraftChallenge((current) => ({ ...current, points: event.target.value }))} />
                        </label>
                      ) : null}
                      <label>
                        <span>Crew</span>
                        <select name="quick-game-group" value={draftChallenge.groupId} onChange={(event) => setDraftChallenge((current) => ({ ...current, groupId: event.target.value }))}>
                          <option value="all">Everyone</option>
                          {groups.map((group) => <option key={group.id} value={group.id}>{group.name}</option>)}
                        </select>
                      </label>
                      <label>
                        <span>Due</span>
                        <input name="quick-game-deadline" value={draftChallenge.deadline} onChange={(event) => setDraftChallenge((current) => ({ ...current, deadline: event.target.value }))} placeholder="TBC" />
                      </label>
                      <button type="button" disabled={!draftChallenge.title.trim()} onClick={addChallenge}>Add custom</button>
                    </div>
                  </div>
                ) : (
                  <Tournament
                    state={state}
                    role={role}
                    activePlayer={activePlayer}
                    groups={groups}
                    days={days}
                    activeDayId={activeDayId}
                    selectedEventId={selectedTournamentEventId}
                    selectedMatchId={selectedTournamentMatchId}
                    published={features.tournaments}
                    deviceId={deviceId}
                    onPublish={() => toggleFeature('tournaments')}
                    onSelectEvent={(eventId) => {
                      setSelectedTournamentEventId(eventId);
                      setSelectedTournamentMatchId(null);
                    }}
                    onChange={update}
                  />
                )}
              </section>
            ) : null}

            {features.games ? (
              <section className="games-section">
                <header>
                  <div>
                    <p className="eyebrow">Today</p>
                    <h3>Quick games</h3>
                  </div>
                </header>
                <ChallengeGrid
                  copy={copy}
                  challenges={dayChallenges}
                  groups={groups}
                  activePlayerId={activePlayer.id}
                  showPoints={features.scores}
                  onSelect={setSelectedChallengeId}
                  onScore={completeChallenge}
                  onUploadProof={(event, challengeId) => void addGameMediaEntry(event, challengeId)}
                />
              </section>
            ) : null}

            {(features.tournaments || role === 'host') && (gameComposerMode !== 'structured' || role !== 'host') && state.tournaments.length ? (
              <section className="games-section tournament-section">
                <header>
                  <div>
                    <p className="eyebrow">{features.tournaments ? 'Live tournament' : 'Private tournament'}</p>
                    <h3>Tournament</h3>
                  </div>
                  {role === 'host' ? <button type="button" onClick={() => setGameComposerMode('structured')}>Edit tournament</button> : null}
                </header>
                <Tournament
                  state={state}
                  role={role}
                  activePlayer={activePlayer}
                  groups={groups}
                  days={days}
                  activeDayId={activeDayId}
                  selectedEventId={selectedTournamentEventId}
                  selectedMatchId={selectedTournamentMatchId}
                  published={features.tournaments}
                  deviceId={deviceId}
                  onPublish={() => toggleFeature('tournaments')}
                  onSelectEvent={(eventId) => {
                    setSelectedTournamentEventId(eventId);
                    setSelectedTournamentMatchId(null);
                  }}
                  onChange={update}
                />
              </section>
            ) : null}

            {features.scores ? (
              <details className="simple-drawer">
                <summary>
                  <span>{copy.leaderboard}</span>
                  <small>{activePlayer.score} {copy.pointsFor}</small>
                </summary>
                <SegmentedControl
                  value={leaderboardMode}
                  options={[
                    { value: 'people', label: copy.people },
                    { value: 'teams', label: copy.teams },
                  ]}
                  onChange={setLeaderboardMode}
                  ariaLabel="Points scope"
                />
                <Leaderboard players={sortedPlayers} groups={groups} title={copy.leaderboard} mode={leaderboardMode} />
                <GameHighlights highlights={gameHighlights} onSelect={setSelectedChallengeId} />
              </details>
            ) : null}
          </div>
        </View>
      )}

      {tab === 'requests' && features.requests && (
        <View title={role === 'host' ? copy.inbox : copy.requests} kicker={copy.requestsKicker} onBack={goBack} backLabel="Back">
          <div className="composer">
            <input
              name="crew-request"
              value={draftRequest}
              onChange={(event) => setDraftRequest(event.target.value)}
              placeholder="Ask the host for a plan, vote, game, song, or change"
            />
            <button onClick={addRequest}>{copy.request}</button>
          </div>
          {state.requests.length ? (
            <div className="request-list">
              {state.requests.map((request) => (
                <article key={request.id} className={`request ${request.status}`}>
                  <span>{request.at} / {request.authorName}</span>
                  <p>{request.text}</p>
                  <strong>{request.status}</strong>
                </article>
              ))}
            </div>
          ) : (
            <p className="empty-note">No requests yet — be first to ask the host.</p>
          )}
        </View>
      )}

      {tab === 'memories' && features.memories && (
        <View title={copy.memories} kicker={copy.memoriesKicker} onBack={goBack} backLabel={copy.backToTrip}>
          <DayToggle days={days} selectedDayId={activeDayId} onSelect={setSelectedDayId} />
          <section className="memory-studio">
            <div className="memory-spotlight">
              {latestMemory ? <MemoryCard memory={latestMemory} group={groups.find((group) => group.id === latestMemory.groupId)} featured /> : null}
              <div className="memory-stats">
                <Metric label={copy.memoryTotal} value={String(memoryStats.total)} />
                <Metric label={copy.media} value={String(memoryStats.media)} />
                <Metric label={copy.awards} value={String(memoryStats.awards)} />
              </div>
            </div>
            <div className="memory-composer">
              <textarea
                name="memory-text"
                value={draftMemory}
                onChange={(event) => setDraftMemory(event.target.value)}
                placeholder={copy.memoryPlaceholder}
              />
              <div className="memory-actions">
                <button onClick={() => addMemory('text')}>{copy.saveMoment}</button>
                <button className="ghost" onClick={() => addMemory('award')}>{copy.giveAward}</button>
                <label className="file-button">
                  {copy.media}
                  <input name="memory-media" type="file" accept="image/*,video/*" onChange={addMediaMemory} />
                </label>
              </div>
            </div>
          </section>
          <div className="memory-filters" role="tablist" aria-label="Memory filters">
            {([
              ['all', copy.allMemories],
              ['media', copy.media],
              ['awards', copy.awards],
              ['mine', copy.mine],
            ] as Array<[MemoryFilter, string]>).map(([filter, label]) => {
              const active = memoryFilter === filter;
              return (
                <button key={filter} role="tab" aria-selected={active} className={active ? 'active' : ''} onClick={() => setMemoryFilter(filter)}>{label}</button>
              );
            })}
          </div>
          <div className="memory-feed polished">
            {visibleMemories.length ? visibleMemories.map((memory) => (
              <MemoryCard key={memory.id} memory={memory} group={groups.find((group) => group.id === memory.groupId)} />
            )) : <p className="empty-note">{copy.noMemories}</p>}
          </div>
        </View>
      )}

      {tab === 'chat' && features.chat && (
        <View title={copy.chat} kicker="Messages and updates" onBack={goBack} backLabel="Back">
          <div className="composer">
            <input
              name="chat-message"
              value={draftMessage}
              onChange={(event) => setDraftMessage(event.target.value)}
              placeholder="Message the crew"
            />
            <button onClick={() => addMessage()}>{copy.send}</button>
          </div>
          {visibleChatTimelineItems.length ? (
            <div className="message-timeline">
              {visibleChatTimelineItems.map((item) => (
                <article key={item.id} className={`message-timeline-item ${item.kind}${item.status ? ` ${item.status}` : ''}`}>
                  <time>{item.meta}</time>
                  <div>
                    <strong>{item.title}</strong>
                    <p>{item.text}</p>
                    {item.kind === 'request' && item.requestId && role === 'host' ? (
                      <div className="inbox-actions">
                        <button type="button" onClick={() => updateRequest(item.requestId!, 'shared')} disabled={item.status === 'shared'}>Share</button>
                        <button type="button" onClick={() => transformRequest(item.requestId!, 'plan')}>Plan</button>
                        <button type="button" onClick={() => transformRequest(item.requestId!, 'poll')}>Vote</button>
                        {features.games ? <button type="button" onClick={() => transformRequest(item.requestId!, 'game')}>Game</button> : null}
                        <button type="button" onClick={() => updateRequest(item.requestId!, 'done')}>Done</button>
                      </div>
                    ) : null}
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <p className="empty-note">No updates yet — break the ice with the first hello.</p>
          )}
        </View>
      )}

      {tab === 'wrap' && features.wrap && (
        <View title={copy.wrap} kicker={wrapUp.published ? copy.readyToShare : copy.wrapDraft} onBack={goBack} backLabel={copy.backToTrip}>
          <article className="wrap-card finale">
            <p className="eyebrow">{state.eventName}</p>
            <h3>{wrapUp.title}</h3>
            <p>{wrapUp.note}</p>
            <div className="mini-grid">
              <Metric label="Memories" value={String(state.memories.length)} />
              <Metric label="Crew" value={String(state.players.length)} />
              {features.soundtrack && state.soundtracks?.length ? <Metric label="Sets" value={String(state.soundtracks.length)} /> : null}
              {features.scores && wrapUp.includeGames ? <Metric label="Game pts" value={String(totalScore(state.players))} /> : null}
              {features.polls && wrapUp.includePolls ? <Metric label="Votes" value={String(state.polls.length)} /> : null}
            </div>
          </article>
          <section className="wrap-share-card">
            <div>
              <p className="eyebrow">Share card</p>
              <h3>{wrapHighlights.title}</h3>
              <p>{wrapHighlights.detail}</p>
            </div>
            <div className="wrap-share-actions">
              <button
                type="button"
                onClick={async () => {
                  const blob = await generateWrapCard({
                    state,
                    palette,
                    awards: wrapAwards,
                    memories: state.memories,
                    coverUrl,
                    includeScores: features.scores,
                  });
                  if (!blob) {
                    setBackupNotice('Could not build the share image. Try again on a connected device.');
                    return;
                  }
                  const result = await shareWrapCard(blob, state);
                  setBackupNotice(result === 'shared'
                    ? 'Shared.'
                    : result === 'downloaded'
                      ? 'Wrap image saved to downloads.'
                      : 'Could not share or save the image.');
                }}
              >
                Share image
              </button>
              <button
                type="button"
                className="ghost"
                onClick={() => void navigator.clipboard?.writeText(`${wrapHighlights.title}\n${wrapHighlights.detail}\n${shareUrl}`)}
              >
                Copy recap
              </button>
            </div>
          </section>
          {wrapHighlights.items.length ? (
            <section className="wrap-highlights">
              {wrapHighlights.items.slice(0, 4).map((highlight) => <span key={highlight}>{highlight}</span>)}
            </section>
          ) : null}
          <section className="wrap-section">
            <div className="list-head">
              <h3>{copy.crewAwards}</h3>
              <span>{state.players.length} {copy.crew}</span>
            </div>
            <div className="award-grid">
              {wrapAwards.map((award) => (
                <article key={award.playerId} className={`award-card effect-${award.effect}`}>
                  <span className="award-avatar" style={{ background: award.color }}>{award.name.slice(0, 1).toUpperCase()}</span>
                  <div>
                    <strong>{award.name}</strong>
                    <small>{award.groupName}</small>
                    <h4>{award.title}</h4>
                    <p>{award.detail}</p>
                  </div>
                  <span className="award-trophy" aria-label={`${award.title} trophy`}>{award.trophy}</span>
                  {features.scores ? <b>{award.score}</b> : null}
                </article>
              ))}
            </div>
          </section>
          {wrapUp.includeTimeline ? (
            <div className="timeline compact">
              {state.stops.slice(0, 5).map((stop) => (
                <article key={stop.id} className={`stop ${stop.status}`}>
                  <span>{days.find((day) => day.id === stop.dayId)?.label ?? stop.time}</span>
                  <div>
                    <h3>{stop.title}</h3>
                    <p>{stop.place}</p>
                  </div>
                </article>
              ))}
            </div>
          ) : null}
          <section className="wrap-section">
            <div className="list-head">
              <h3>{copy.memoryReel}</h3>
              <span>{wrapMemories.length}</span>
            </div>
            <div className="memory-reel">
              {wrapMemories.map((memory) => (
                <MemoryCard key={memory.id} memory={memory} group={groups.find((group) => group.id === memory.groupId)} />
              ))}
            </div>
          </section>
        </View>
      )}

      {tab === 'host' && role === 'host' && (
        <View title={copy.settings} kicker={copy.settingsKicker} onBack={goBack} backLabel="Back">
          <SegmentedControl
            value={hostSection}
            options={visibleHostSections.map((section) => ({ value: section, label: section === 'fun' ? 'drops' : section }))}
            onChange={setHostSection}
            ariaLabel="Host section"
          />
          <div className="host-grid wide">
            {hostSection === 'manage' ? (
              <>
                <ControlPanel title="Broadcast" tone="primary">
                  <input name="host-broadcast" value={draftBroadcast} onChange={(event) => setDraftBroadcast(event.target.value)} placeholder="Pinned host note for the crew" />
                  <button onClick={addBroadcast}>Send</button>
                </ControlPanel>
                {features.requests ? (
                  <ControlPanel title="Crew requests" tone="primary">
                    {state.requests.length ? state.requests.map((request) => (
                      <div key={request.id} className={`host-request ${request.status}`}>
                        <p>{request.text}</p>
                        <span>{request.authorName} / {request.status}</span>
                        <div>
                          <button onClick={() => updateRequest(request.id, 'shared')}>Share back</button>
                          {features.plan ? <button onClick={() => transformRequest(request.id, 'plan')}>Make plan</button> : null}
                          {features.polls ? <button onClick={() => transformRequest(request.id, 'poll')}>Make vote</button> : null}
                          {features.games ? <button onClick={() => transformRequest(request.id, 'game')}>Make game</button> : null}
                          <button className="ghost" onClick={() => updateRequest(request.id, 'done')}>Done</button>
                        </div>
                      </div>
                    )) : <p className="empty-note">No requests yet — share the join link to get crew talking.</p>}
                  </ControlPanel>
                ) : null}
                {features.plan ? (
                  <HostDisclosure title={editingStopId ? 'Edit plan item' : 'Plan item'} hint={editingStopId ? 'Changes sync to crew' : 'Pick or add a date'}>
                    {renderPlanDateControls('host-stop')}
                    <input name="host-stop-time" value={draftStop.time} onChange={(event) => setDraftStop((current) => ({ ...current, time: event.target.value }))} placeholder="Time (e.g. 14:00 or TBC)" />
                    <input name="host-stop-title" value={draftStop.title} onChange={(event) => setDraftStop((current) => ({ ...current, title: event.target.value }))} placeholder="Plan title" />
                    <input name="host-stop-place" value={draftStop.place} onChange={(event) => setDraftStop((current) => ({ ...current, place: event.target.value }))} placeholder="Place or note" />
                    {editingStopId ? (
                      <select name="host-stop-status" value={draftStop.status} onChange={(event) => setDraftStop((current) => ({ ...current, status: event.target.value as StopStatus }))}>
                        <option value="now">Now</option>
                        <option value="next">Next</option>
                        <option value="later">Later</option>
                      </select>
                    ) : null}
                    <button onClick={submitStopDraft}>{editingStopId ? 'Save changes' : 'Add plan'}</button>
                    {editingStopId ? <button className="ghost" onClick={() => resetDraftStop()}>Cancel edit</button> : null}
                    <button className="ghost" onClick={advancePlan}>Advance now</button>
                  </HostDisclosure>
                ) : null}
                {features.plan ? (
                  <ControlPanel title="Posted plan" tone="recessed">
                    {state.stops.length ? (
                      <div className="plan-edit-list">
                        {state.stops.map((stop) => {
                          const day = days.find((item) => item.id === stop.dayId) ?? days[0]!;
                          const group = stop.groupId ? groups.find((item) => item.id === stop.groupId) : null;
                          return (
                            <article key={stop.id} className={editingStopId === stop.id ? 'active' : ''}>
                              <span>
                                <strong>{stop.title}</strong>
                                <small>{day.label} / {formatTripDayDate(day.date)} / {stop.time} / {stop.status}{group ? ` / ${group.name}` : ''}</small>
                              </span>
                              <button type="button" className="ghost" onClick={() => startEditingStop(stop)}>{editingStopId === stop.id ? 'Editing' : 'Edit'}</button>
                            </article>
                          );
                        })}
                      </div>
                    ) : <p className="empty-note">No plan items yet.</p>}
                  </ControlPanel>
                ) : null}
                {features.polls ? (
                  <HostDisclosure title="Vote status" hint="Open or close existing votes">
                    {state.polls.length ? state.polls.map((poll) => (
                      <button
                        key={poll.id}
                        className={poll.open ? '' : 'ghost'}
                        onClick={() => update((current) => ({
                          ...current,
                          polls: current.polls.map((item) => item.id === poll.id ? { ...item, open: !item.open } : item),
                        }))}
                      >
                        {poll.open ? 'Close' : 'Open'} / {poll.question}
                      </button>
                    )) : <p className="empty-note">No votes yet.</p>}
                  </HostDisclosure>
                ) : null}
              </>
            ) : null}

            {hostSection === 'fun' ? (
              <>
                {(features.soundtrack || features.games) && days.length > 1 ? (
                  <HostDisclosure title="Drop date" hint={`${activeDay.label} / ${formatTripDayDate(activeDay.date)}`}>
                    <DayToggle days={days} selectedDayId={activeDayId} onSelect={setSelectedDayId} />
                  </HostDisclosure>
                ) : null}
                {features.polls ? (
                  <ControlPanel title="Vote drop" tone="primary">
                    <input name="host-poll-question" value={draftPoll.question} onChange={(event) => setDraftPoll((current) => ({ ...current, question: event.target.value }))} placeholder="Question, e.g. Pick the next stop" />
                    <input name="host-poll-options" value={draftPoll.options} onChange={(event) => setDraftPoll((current) => ({ ...current, options: event.target.value }))} placeholder="Options separated by commas" />
                    <input name="host-poll-closes" value={draftPoll.closes} onChange={(event) => setDraftPoll((current) => ({ ...current, closes: event.target.value }))} placeholder="Closes (e.g. Open, 21:00)" />
                    <button onClick={addPoll}>Open vote</button>
                  </ControlPanel>
                ) : null}
                {features.soundtrack ? (
                  <ControlPanel title="Soundtrack drop" tone="primary">
                    <input name="host-soundtrack-title" value={draftSoundtrack.title} onChange={(event) => setDraftSoundtrack((current) => ({ ...current, title: event.target.value }))} placeholder="Set or playlist title" />
                    <input name="host-soundtrack-dj" value={draftSoundtrack.dj} onChange={(event) => setDraftSoundtrack((current) => ({ ...current, dj: event.target.value }))} placeholder="DJ, curator, or host" />
                    <input name="host-soundtrack-time" value={draftSoundtrack.time} onChange={(event) => setDraftSoundtrack((current) => ({ ...current, time: event.target.value }))} placeholder="Time (e.g. 21:00)" />
                    <input name="host-soundtrack-link" value={draftSoundtrack.link} onChange={(event) => setDraftSoundtrack((current) => ({ ...current, link: event.target.value }))} placeholder="Spotify, SoundCloud, or playlist link" />
                    <input name="host-soundtrack-note" value={draftSoundtrack.note} onChange={(event) => setDraftSoundtrack((current) => ({ ...current, note: event.target.value }))} placeholder="Note, requests, or vibe" />
                    <button onClick={addSoundtrack}>Add soundtrack</button>
                  </ControlPanel>
                ) : null}
                {features.games ? (
                  <ControlPanel title="Game drop" tone="primary">
                    <div className="template-row compact">
                      {(Object.keys(gamePresets) as GameKind[]).map((kind) => (
                        <button key={kind} onClick={() => addGamePreset(kind)}>{gamePresets[kind].label}</button>
                      ))}
                    </div>
                    <details className="advanced-game">
                      <summary>{copy.customGame}</summary>
                      <select name="host-challenge-kind" value={draftChallenge.kind} onChange={(event) => setDraftChallenge((current) => ({ ...current, kind: event.target.value as GameKind }))}>
                        {(Object.keys(gamePresets) as GameKind[]).map((kind) => <option key={kind} value={kind}>{gamePresets[kind].label}</option>)}
                      </select>
                      <select name="host-challenge-group" value={draftChallenge.groupId} onChange={(event) => setDraftChallenge((current) => ({ ...current, groupId: event.target.value }))}>
                        {groups.map((group) => <option key={group.id} value={group.id}>{group.name}</option>)}
                      </select>
                      <input name="host-challenge-title" value={draftChallenge.title} onChange={(event) => setDraftChallenge((current) => ({ ...current, title: event.target.value }))} placeholder="Title" />
                      <input name="host-challenge-deadline" value={draftChallenge.deadline} onChange={(event) => setDraftChallenge((current) => ({ ...current, deadline: event.target.value }))} placeholder="Deadline (e.g. 19:00, TBC)" />
                      {features.scores ? (
                        <input name="host-challenge-points" type="number" min="1" value={draftChallenge.points} onChange={(event) => setDraftChallenge((current) => ({ ...current, points: event.target.value }))} placeholder="Points (whole number)" />
                      ) : null}
                      <button onClick={addChallenge}>Add game</button>
                    </details>
                  </ControlPanel>
                ) : null}
                {features.surprises ? (
                  <HostDisclosure title="Surprise drop" hint="Schedule unlock-on-X reveals">
                    <input name="host-surprise-title" value={draftSurprise.title} onChange={(event) => setDraftSurprise((current) => ({ ...current, title: event.target.value }))} placeholder="Title (e.g. After-dinner mission)" />
                    <textarea name="host-surprise-message" value={draftSurprise.message} onChange={(event) => setDraftSurprise((current) => ({ ...current, message: event.target.value }))} placeholder="Hidden note, secret mission, or award prompt" />
                    <select name="host-surprise-unlock-type" value={draftSurprise.unlockType} onChange={(event) => setDraftSurprise((current) => ({ ...current, unlockType: event.target.value as SurpriseUnlock }))}>
                      <option value="time">Open at time</option>
                      <option value="submissions">Unlock after submissions</option>
                      <option value="first-photo">Unlock after first photo</option>
                      <option value="manual">Host reveals manually</option>
                    </select>
                    <input name="host-surprise-unlock-value" value={draftSurprise.unlockValue} onChange={(event) => setDraftSurprise((current) => ({ ...current, unlockValue: event.target.value }))} placeholder={draftSurprise.unlockType === 'time' ? '21:00' : draftSurprise.unlockType === 'submissions' ? '5' : 'note'} />
                    <button onClick={addSurpriseDrop}>Schedule drop</button>
                    <div className="surprise-list">
                      {state.surprises.map((drop) => {
                        const unlocked = isSurpriseUnlocked(drop, state);
                        return (
                          <article key={drop.id} className={unlocked ? 'surprise-row unlocked' : 'surprise-row'}>
                            <strong>{drop.title}</strong>
                            <small>{unlocked ? 'unlocked' : unlockLabel(drop)}</small>
                            {drop.unlockType === 'manual' && !drop.revealedAt ? <button type="button" onClick={() => revealSurprise(drop.id)}>Reveal</button> : null}
                          </article>
                        );
                      })}
                    </div>
                  </HostDisclosure>
                ) : null}
                {!features.polls && !features.soundtrack && !features.games && !features.surprises ? (
                  <p className="empty-note">Turn on a drop feature in Trip mode.</p>
                ) : null}
              </>
            ) : null}

            {hostSection === 'setup' ? (
              <>
                <ControlPanel title="Trip branding" tone="primary">
                  <div className="branding-preview">
                    {coverUrl ? (
                      <img src={coverUrl} alt="" />
                    ) : (
                      <span className="branding-mark">{(state.eventName || 'Crewtrip').slice(0, 2).toUpperCase()}</span>
                    )}
                    <div>
                      <strong>{state.eventName || 'Crewtrip'}</strong>
                      <small>{state.location || 'Shared with everyone on the trip'}</small>
                    </div>
                  </div>
                  <label className="field-stack">
                    <span>Trip name</span>
                    <input name="trip-event-name" value={state.eventName} onChange={(event) => update((current) => ({ ...current, eventName: event.target.value }))} placeholder="Event title" />
                  </label>
                  <label className="field-stack">
                    <span>Location or host label</span>
                    <input name="trip-location" value={state.location} onChange={(event) => update((current) => ({ ...current, location: event.target.value }))} placeholder="Location or group label" />
                  </label>
                  <label className="field-stack">
                    <span>Trip note</span>
                    <textarea name="trip-description" value={state.description} onChange={(event) => update((current) => ({ ...current, description: event.target.value }))} placeholder="Event description" />
                  </label>
                  <label className="file-button">
                    {state.coverImageName ? 'Change cover' : 'Add cover image'}
                    <input name="trip-cover-image" type="file" accept="image/*" onChange={addCoverImage} />
                  </label>
                  <p className="sync-note">This name, cover, and trip feeling are shared with host and crew views.</p>
                </ControlPanel>
                <ControlPanel title={copy.share} tone="primary">
                  <div className="handoff-grid">
                    {qrMarkup ? <div className="qr-frame" dangerouslySetInnerHTML={{ __html: qrMarkup }} /> : <code>{shareUrl}</code>}
                    <div className="handoff-copy">
                      <h3>Crew invite</h3>
                      <p>{syncLabel(sync, language)} Crew can vote, request, chat, and add moments. Host controls stay private.</p>
                      <button onClick={copyShareLink}>{shareCopied ? copy.copied : copy.copyJoinLink}</button>
                    </div>
                  </div>
                </ControlPanel>
                <ControlPanel title="Host handoff" tone="recessed">
                  <div className="handoff-grid">
                    {hostHandoffQrMarkup ? <div className="qr-frame private-qr" dangerouslySetInnerHTML={{ __html: hostHandoffQrMarkup }} /> : <code>{hostReturnUrl}</code>}
                    <div className="handoff-copy">
                      <h3>Move host controls to your phone</h3>
                      <p>Scan this yourself only. Keep this host view open while the other device opens the handoff link.</p>
                      <button type="button" onClick={() => void copyHostReturnLink()}>{handoffCopied === 'host' ? 'Copied' : 'Copy host handoff link'}</button>
                    </div>
                  </div>
                  <p className="sync-note">This is different from the crew invite. Anyone with this private link can reopen host controls.</p>
                </ControlPanel>
                <HostDisclosure title="Trip feeling" hint={`${palette.name} palette`}>
                  <div className="theme-grid">
                    {themePalettes.map((paletteOption) => (
                      <button
                        key={paletteOption.key}
                        type="button"
                        className={theme === paletteOption.key ? 'theme-tile active' : 'theme-tile'}
                        onClick={() => update((current) => ({ ...current, theme: paletteOption.key }))}
                      >
                        <span>
                          <i style={{ background: String(paletteOption.vars['--sun']) }} />
                          <i style={{ background: String(paletteOption.vars['--coral']) }} />
                          <i style={{ background: String(paletteOption.vars['--sea']) }} />
                        </span>
                        <strong>{paletteOption.name}</strong>
                        <small>{paletteOption.note}</small>
                      </button>
                    ))}
                  </div>
                </HostDisclosure>
                <HostDisclosure title="Dates" hint={`${days.length} trip dates`}>
                  <DayToggle days={days} selectedDayId={activeDayId} onSelect={setSelectedDayId} />
                  <div className="composer three">
                    <input name="trip-day-date" type="date" value={draftDay.date} onChange={(event) => setDraftDay((current) => ({ ...current, date: event.target.value }))} />
                    <input name="trip-day-label" value={draftDay.label} onChange={(event) => setDraftDay((current) => ({ ...current, label: event.target.value }))} placeholder={`Label (${nextTripDayLabel(days)})`} />
                    <button onClick={addDay}>Add date</button>
                  </div>
                </HostDisclosure>
                <HostDisclosure title="Teams" hint={`${groups.length} teams`}>
                  <div className="composer">
                    <input name="trip-team-name" value={draftGroup} onChange={(event) => setDraftGroup(event.target.value)} placeholder="Team name (e.g. Beach crew)" />
                    <button onClick={addGroup}>Add team</button>
                  </div>
                  <div className="team-editor-list">
                    {groups.map((group) => (
                      <details key={group.id} className="team-editor">
                        <summary>
                          <GroupMark group={group} />
                          <span>
                            <strong>{group.name}</strong>
                            <small>{state.players.filter((player) => (player.groupId ?? 'all') === group.id).length} crew</small>
                          </span>
                        </summary>
                        <div className="team-editor-controls">
                          <label>
                            <span>{copy.teamEmoji}</span>
                            <input
                              className="emoji-input mini"
                              name={`group-emoji-${group.id}`}
                              value={group.emoji ?? ''}
                              maxLength={2}
                              onChange={(event) => updateGroup(group.id, { emoji: event.target.value })}
                              aria-label={`${group.name} emoji`}
                              placeholder="★"
                            />
                          </label>
                          <label>
                            <span>{copy.teamColour}</span>
                            <div className="color-swatches">
                              {palette.crewColors.map((color) => (
                                <button
                                  key={color}
                                  type="button"
                                  aria-label={`Use ${color}`}
                                  className={group.color.toLowerCase() === color.toLowerCase() ? 'swatch active' : 'swatch'}
                                  style={{ background: color }}
                                  onClick={() => updateGroup(group.id, { color })}
                                />
                              ))}
                            </div>
                          </label>
                          <label className="file-button mini">
                            {group.imageName ? copy.changeImage : copy.teamImage}
                            <input name={`group-image-${group.id}`} type="file" accept="image/*" onChange={(event) => addGroupImage(event, group.id)} />
                          </label>
                        </div>
                      </details>
                    ))}
                  </div>
                </HostDisclosure>
                <HostDisclosure title="Move crew" hint={`${state.players.length} people`}>
                  <div className="move-crew-list">
                    {state.players.map((player) => (
                      <article key={player.id} className="assign-row player-row">
                        <PlayerAvatar player={player} />
                        <div>
                          <strong>{player.name}</strong>
                          <small>{groups.find((group) => group.id === (player.groupId ?? 'all'))?.name ?? player.team}</small>
                        </div>
                        <select
                          name={`player-group-${player.id}`}
                          value={player.groupId ?? 'all'}
                          aria-label={`Assign ${player.name} group`}
                          onChange={(event) => assignPlayerGroup(player.id, event.target.value)}
                        >
                          {groups.map((group) => <option key={group.id} value={group.id}>{group.name}</option>)}
                        </select>
                      </article>
                    ))}
                  </div>
                </HostDisclosure>
                <HostDisclosure title={copy.language} hint="Trip-wide language">
                  <select name="trip-language" value={language} onChange={(event) => update((current) => ({ ...current, language: event.target.value as Language }))}>
                    <option value="en">English</option>
                    <option value="fr">Français</option>
                  </select>
                </HostDisclosure>
                <HostDisclosure title="Templates" hint="Start from a trip shape">
                  {eventTemplates.map((template) => (
                    <button key={template.id} onClick={() => applyTemplate(template)}>{template.name}</button>
                  ))}
                </HostDisclosure>
                <HostDisclosure title="Trip mode" hint="Pick a simpler feature set">
                  <div className="template-row compact">
                    {featurePresets.map((preset) => (
                      <button key={preset.key} type="button" onClick={() => applyFeaturePreset(preset.features)}>
                        <strong>{preset.label}</strong>
                        <small>{preset.hint}</small>
                      </button>
                    ))}
                  </div>
                  <details className="advanced-game" open>
                    <summary>Section controls</summary>
                    <p className="sync-note">Changes sync live for the crew.</p>
                    <div className="feature-list">
                      {tabFeatureOptions.map((feature) => (
                        <label key={feature.key} className="feature-toggle">
                          <span>
                            <strong>{feature.label}</strong>
                            <small>{feature.hint}</small>
                          </span>
                          <input
                            name={`tab-feature-${feature.key}`}
                            type="checkbox"
                            checked={features[feature.key]}
                            onChange={() => toggleFeature(feature.key)}
                          />
                        </label>
                      ))}
                    </div>
                  </details>
                  <details className="advanced-game" open>
                    <summary>Feature controls</summary>
                    <div className="feature-list">
                      {detailFeatureOptions.map((feature) => (
                        <label key={feature.key} className="feature-toggle">
                          <span>
                            <strong>{feature.label}</strong>
                            <small>{feature.hint}</small>
                          </span>
                          <input
                            name={`detail-feature-${feature.key}`}
                            type="checkbox"
                            checked={features[feature.key]}
                            onChange={() => toggleFeature(feature.key)}
                          />
                        </label>
                      ))}
                    </div>
                  </details>
                </HostDisclosure>
                {/*
                  Recovery stays in setup so More remains a user-facing overflow.
                */}
                <ControlPanel title="Trip safety" tone="recessed">
                  <div className="recovery-status">
                    <span>
                      <strong>{localBackups.length ? 'Local snapshots on' : 'No snapshot yet'}</strong>
                      <small>{localBackups[0] ? `Last saved ${formatBackupTime(localBackups[0].at)} · ${formatBytes(localBackups[0].bytes)}` : 'Save a copy before inviting the crew.'}</small>
                    </span>
                    <b>{localBackups.length}</b>
                  </div>
                  <p className="recovery-note">Save a copy somewhere safe — or restore from another crew device if one still has the trip.</p>
                  <div className="backup-actions">
                    <button type="button" onClick={downloadRecoveryPack}>Download recovery pack</button>
                    <button type="button" className="ghost" onClick={() => void copyRecoveryPack()}>Copy pack</button>
                    {localBackups[0] ? <button type="button" className="ghost" onClick={() => restoreLocalBackup(localBackups[0]!)}>Restore latest local snapshot</button> : null}
                    <label className="file-button">
                      Restore pack
                      <input name="recovery-pack" type="file" accept="application/json,.json" onChange={(event) => void importRecoveryPack(event)} />
                    </label>
                  </div>
                  {backupNotice ? <p className="sync-note">{backupNotice}</p> : null}
                  {localBackups.length ? (
                    <div className="backup-list" aria-label="Local snapshot history">
                      {localBackups.slice(0, 3).map((backup) => (
                        <span key={backup.id}>
                          <strong>{formatBackupTime(backup.at)}</strong>
                          <small>{backup.reason} · {formatBytes(backup.bytes)}</small>
                        </span>
                      ))}
                    </div>
                  ) : null}
                  <div className="danger-zone">
                    <button type="button" className="ghost" onClick={() => resetTrip('same-event')}>Clear this trip</button>
                    <button type="button" className="ghost" onClick={() => resetTrip('new-event')}>Start new trip</button>
                  </div>
                </ControlPanel>
              </>
            ) : null}

            {hostSection === 'wrap' && features.wrap ? (
              <ControlPanel title="Trip wrap" tone="primary">
                <input name="wrap-title" value={wrapUp.title} onChange={(event) => updateWrap((current) => ({ ...current, title: event.target.value }))} placeholder="Wrap title (e.g. Trip wrapped)" />
                <textarea name="wrap-note" value={wrapUp.note} onChange={(event) => updateWrap((current) => ({ ...current, note: event.target.value }))} placeholder="Wrap note (one line for the crew)" />
                <div className="award-assignment">
                  <div className="award-assignment-head">
                    <strong>Assign crew awards</strong>
                    <small>Host picks the title; auto awards fill the rest.</small>
                  </div>
                  <div className="award-assignment-form">
                    <select
                      name="wrap-award-player"
                      value={draftAward.playerId || (state.players[0]?.id ?? '')}
                      onChange={(event) => setDraftAward((current) => ({ ...current, playerId: event.target.value }))}
                    >
                      {state.players.map((player) => <option key={player.id} value={player.id}>{player.name}</option>)}
                    </select>
                    <div className="award-effect-picker" aria-label="Award effect">
                      {awardEffectOptions.map((option) => (
                        <button
                          key={option.effect}
                          type="button"
                          className={draftAward.effect === option.effect ? `active effect-${option.effect}` : `effect-${option.effect}`}
                          onClick={() => setDraftAward((current) => ({ ...current, effect: option.effect, trophy: option.trophy }))}
                          title={option.label}
                        >
                          <span>{option.trophy}</span>
                          <small>{option.label}</small>
                        </button>
                      ))}
                    </div>
                    <input
                      name="wrap-award-title"
                      value={draftAward.title}
                      onChange={(event) => setDraftAward((current) => ({ ...current, title: event.target.value }))}
                      placeholder="Award title"
                    />
                    <input
                      name="wrap-award-detail"
                      value={draftAward.detail}
                      onChange={(event) => setDraftAward((current) => ({ ...current, detail: event.target.value }))}
                      placeholder="Short reason"
                    />
                    <button type="button" onClick={assignWrapAward}>Assign</button>
                  </div>
                  {wrapUp.assignedAwards?.length ? (
                    <div className="assigned-award-list">
                      {wrapUp.assignedAwards.map((award) => {
                        const player = state.players.find((item) => item.id === award.playerId);
                        return (
                          <article key={award.id}>
                            <span style={{ background: player?.color ?? palette.crewColors[0] }}>{(player?.name ?? '?').slice(0, 1).toUpperCase()}</span>
                            <div>
                              <strong>{player?.name ?? 'Crew member'}</strong>
                              <small>{award.trophy} {award.title}</small>
                            </div>
                            <button type="button" className="ghost" onClick={() => removeWrapAward(award.playerId)}>Remove</button>
                          </article>
                        );
                      })}
                    </div>
                  ) : null}
                </div>
                <label className="feature-toggle">
                  <span><strong>Include timeline</strong><small>Plan highlights in the wrap</small></span>
                  <input name="wrap-include-timeline" type="checkbox" checked={wrapUp.includeTimeline} onChange={() => updateWrap((current) => ({ ...current, includeTimeline: !current.includeTimeline }))} />
                </label>
                {features.games ? (
                  <label className="feature-toggle">
                    <span><strong>Include games</strong><small>{features.scores ? 'Scores and winners' : 'Game winners'}</small></span>
                    <input name="wrap-include-games" type="checkbox" checked={wrapUp.includeGames} onChange={() => updateWrap((current) => ({ ...current, includeGames: !current.includeGames }))} />
                  </label>
                ) : null}
                <label className="feature-toggle">
                  <span><strong>Publish wrap</strong><small>Make the Wrap tab feel final</small></span>
                  <input name="wrap-published" type="checkbox" checked={wrapUp.published} onChange={() => updateWrap((current) => ({ ...current, published: !current.published }))} />
                </label>
              </ControlPanel>
            ) : null}
          </div>
        </View>
      )}

      {tab === 'more' && (
        <View title="More" kicker="Everything else, kept out of the way" onBack={goBack} backLabel={copy.backToTrip}>
          <div className="more-list">
            {features.crew ? <MoreButton icon={<Icon name="crew" size={16} />} label={copy.crew} meta={activeGroup?.name ?? activePlayer.team} onClick={() => goToTab('crew')} /> : null}
            {features.polls ? <MoreButton icon={<Icon name="vote" size={16} />} label={copy.polls} meta={`${openPolls.length} open`} onClick={() => goToTab('vote')} /> : null}
            {features.requests ? <MoreButton icon={<Icon name="requests" size={16} />} label={role === 'host' ? copy.inbox : copy.requests} meta={`${pendingRequests.length} new`} onClick={() => goToTab('requests')} /> : null}
            {features.soundtrack && activeSoundtrack ? <MoreButton icon={<Icon name="soundtrack" size={16} />} label={copy.soundtrack} meta={activeSoundtrack.title} onClick={() => goToTab('now')} /> : null}
            {features.chat && (groups.length > 1 || role === 'host') ? <MoreButton icon={<Icon name="chat" size={16} />} label={copy.chat} meta={activeGroup?.name ?? copy.allCrew} onClick={() => goToTab('chat')} /> : null}
            {features.wrap ? <MoreButton icon={<Icon name="wrap" size={16} />} label={copy.wrap} meta={wrapUp.published ? 'published' : 'draft'} onClick={() => goToTab('wrap')} /> : null}
            {role === 'host' ? <MoreButton icon={<Icon name="host" size={16} />} label={copy.settings} meta={features.wrap ? 'manage, drops, setup, wrap' : 'manage, drops, setup'} onClick={() => goToTab('host')} /> : null}
            <MoreButton icon={<Icon name="switch" size={16} />} label={copy.switch} meta="leave this session" onClick={leaveSession} />
          </div>
        </View>
      )}

      <Dialog open={inboxOpen} onClose={() => setInboxOpen(false)} label="Crew inbox" className="crew-inbox-sheet">
        <div className="sheet-handle" />
        <div className="sheet-head inbox-sheet-head">
          <div>
            <p className="eyebrow">Crew inbox</p>
            <h2>Updates and chat</h2>
          </div>
          <button type="button" onClick={() => setInboxOpen(false)} aria-label="Close"><Icon name="close" size={16} /></button>
        </div>
        <div className="crew-inbox">
          <div className="inbox-feed message-timeline" aria-live="polite">
            {inboxItems.length ? inboxItems.map((item) => {
              const requestId = item.requestId;
              return (
                <article key={item.id} className={`message-timeline-item ${item.kind}${item.status ? ` ${item.status}` : ''}`}>
                  <time>{item.meta}</time>
                  <div>
                    <strong>{item.title}</strong>
                    <p>{item.text}</p>
                    {item.kind === 'notification' && features.tournaments ? (
                      <div className="inbox-actions">
                        <button type="button" onClick={() => { setInboxOpen(false); goToTab('games'); }}>Open games</button>
                      </div>
                    ) : null}
                    {item.kind === 'request' && requestId && role === 'host' ? (
                      <div className="inbox-actions">
                        <button type="button" onClick={() => updateRequest(requestId, 'shared')} disabled={item.status === 'shared'}>Share</button>
                        <button type="button" onClick={() => transformRequest(requestId, 'plan')}>Plan</button>
                        <button type="button" onClick={() => transformRequest(requestId, 'poll')}>Vote</button>
                        {features.games ? <button type="button" onClick={() => transformRequest(requestId, 'game')}>Game</button> : null}
                        <button type="button" onClick={() => updateRequest(requestId, 'done')}>Done</button>
                      </div>
                    ) : null}
                  </div>
                </article>
              );
            }) : (
              <p className="empty-note">Nothing in here yet. Tournament updates, host notes, requests, and crew chat will land here.</p>
            )}
          </div>

          {inboxEnabled ? (
            <div className="inbox-composer">
              <div className="composer">
                <input
                  name="crew-inbox-message"
                  value={draftMessage}
                  onChange={(event) => setDraftMessage(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') addMessage();
                  }}
                  placeholder="Message the crew"
                />
                <button onClick={() => addMessage()}>{copy.send}</button>
              </div>
              {features.requests && role !== 'host' ? (
                <button type="button" className="inbox-secondary-action" onClick={() => { setInboxOpen(false); goToTab('requests'); }}>
                  Ask the host instead
                </button>
              ) : null}
            </div>
          ) : features.requests && role !== 'host' ? (
            <div className="inbox-composer">
              <div className="composer">
                <input
                  name="crew-inbox-request"
                  value={draftRequest}
                  onChange={(event) => setDraftRequest(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') addRequest();
                  }}
                  placeholder="Ask the host for something"
                />
                <button onClick={addRequest}>{copy.request}</button>
              </div>
            </div>
          ) : null}
        </div>
      </Dialog>

      <Dialog open={actionSheetOpen} onClose={() => setActionSheetOpen(false)} label="Crewtrip quick actions">
        <div className="sheet-handle" />
        <div className="sheet-head">
          <h2>{role === 'host' ? 'Quick add' : 'Contribute'}</h2>
          <button type="button" onClick={() => setActionSheetOpen(false)} aria-label="Close"><Icon name="close" size={16} /></button>
        </div>
        {features.memories ? (
          <ControlPanel title="Memory / photo">
            <input name="quick-memory-text" value={draftMemory} onChange={(event) => setDraftMemory(event.target.value)} placeholder="Quote, caption, or moment" />
            <div className="quick-memory-actions">
              <button onClick={() => { addMemory('text'); setActionSheetOpen(false); }}>Add memory</button>
              <label className="file-button">
                Add photo/video
                <input name="quick-memory-upload" type="file" accept="image/*,video/*" capture="environment" onChange={(event) => { void addMediaMemory(event); setActionSheetOpen(false); }} />
              </label>
            </div>
          </ControlPanel>
        ) : null}
        {role === 'host' ? (
          <div className="sheet-stack">
            <ControlPanel title="Broadcast">
              <input name="quick-host-broadcast" value={draftBroadcast} onChange={(event) => setDraftBroadcast(event.target.value)} placeholder="Pinned note for the crew" />
              <button onClick={() => { addBroadcast(); setActionSheetOpen(false); }}>Send</button>
            </ControlPanel>
            {features.plan ? (
              <HostDisclosure title="Plan item" hint="Pick or add a date">
                {renderPlanDateControls('quick-stop')}
                <input name="quick-stop-time" value={draftStop.time} onChange={(event) => setDraftStop((current) => ({ ...current, time: event.target.value }))} placeholder="Time (e.g. 14:00)" />
                <input name="quick-stop-title" value={draftStop.title} onChange={(event) => setDraftStop((current) => ({ ...current, title: event.target.value }))} placeholder="Plan title" />
                <input name="quick-stop-place" value={draftStop.place} onChange={(event) => setDraftStop((current) => ({ ...current, place: event.target.value }))} placeholder="Place or note" />
                <button onClick={() => { submitStopDraft(); setActionSheetOpen(false); }}>{editingStopId ? 'Save changes' : 'Add plan'}</button>
              </HostDisclosure>
            ) : null}
            {features.polls ? (
              <HostDisclosure title="Vote" hint="Ask the crew">
                <input name="quick-poll-question" value={draftPoll.question} onChange={(event) => setDraftPoll((current) => ({ ...current, question: event.target.value }))} placeholder="Question" />
                <input name="quick-poll-options" value={draftPoll.options} onChange={(event) => setDraftPoll((current) => ({ ...current, options: event.target.value }))} placeholder="Options separated by commas" />
                <button onClick={() => { addPoll(); setActionSheetOpen(false); }}>Open vote</button>
              </HostDisclosure>
            ) : null}
            {features.soundtrack ? (
              <HostDisclosure title="Soundtrack" hint="Add a DJ set or playlist">
                <input name="quick-soundtrack-title" value={draftSoundtrack.title} onChange={(event) => setDraftSoundtrack((current) => ({ ...current, title: event.target.value }))} placeholder="Set or playlist title" />
                <input name="quick-soundtrack-dj" value={draftSoundtrack.dj} onChange={(event) => setDraftSoundtrack((current) => ({ ...current, dj: event.target.value }))} placeholder="DJ or curator" />
                <input name="quick-soundtrack-link" value={draftSoundtrack.link} onChange={(event) => setDraftSoundtrack((current) => ({ ...current, link: event.target.value }))} placeholder="Playlist link" />
                <button onClick={() => { addSoundtrack(); setActionSheetOpen(false); }}>Add soundtrack</button>
              </HostDisclosure>
            ) : null}
            {features.games ? (
              <HostDisclosure title="Game" hint="Create a light game">
                <div className="preset-strip">
                  {(Object.keys(gamePresets) as GameKind[]).map((kind) => (
                    <button
                      key={kind}
                      type="button"
                      onClick={() => {
                        addGamePreset(kind);
                        setActionSheetOpen(false);
                      }}
                    >
                      <strong>{gamePresets[kind].label}</strong>
                      {features.scores ? <small>{gamePresets[kind].points} pts</small> : null}
                    </button>
                  ))}
                </div>
              </HostDisclosure>
            ) : null}
          </div>
        ) : (
          <div className="sheet-stack">
            {features.requests ? (
              <ControlPanel title="Request">
                <input name="quick-request-text" value={draftRequest} onChange={(event) => setDraftRequest(event.target.value)} placeholder="Ask the host for something" />
                <button onClick={() => { addRequest(); setActionSheetOpen(false); }}>Send request</button>
              </ControlPanel>
            ) : null}
            <div className="quick-jump">
              {features.crew ? <button onClick={() => { goToTab('crew'); setActionSheetOpen(false); }}>Add my name</button> : null}
              {features.chat ? <button onClick={() => { goToTab('chat'); setActionSheetOpen(false); }}>Message crew</button> : null}
            </div>
          </div>
        )}
      </Dialog>

      <Dialog open={Boolean(selectedChallenge)} onClose={() => setSelectedChallengeId(null)} label="Game detail" className="game-detail-sheet">
        {selectedChallenge ? (
          <>
            <div className="sheet-handle" />
            <div className="sheet-head">
              <div>
                <p className="eyebrow">{selectedChallenge.kind ?? copy.game} / {selectedChallenge.deadline ?? 'TBC'}</p>
                <h2>{selectedChallenge.title}</h2>
              </div>
              <button type="button" onClick={() => setSelectedChallengeId(null)} aria-label="Close"><Icon name="close" size={16} /></button>
            </div>
            <div className="game-detail-meta">
              {features.scores ? <Metric label={copy.points} value={String(selectedChallenge.points)} /> : null}
              <Metric label={copy.done} value={String(selectedChallenge.doneBy.length)} />
            </div>
            <div className="game-visibility">
              <span>{copy.visibleTo}</span>
              <strong>
                {selectedChallenge.groupId
                  ? groups.find((group) => group.id === selectedChallenge.groupId)?.name ?? copy.groupOnly
                  : copy.wholeCrew}
              </strong>
            </div>
            {selectedChallenge.status === 'closed' ? <p className="empty-note">{copy.closedForEntries}</p> : (
              <div className="game-entry-composer">
                <input
                  name="challenge-entry"
                  value={draftGameEntry}
                  onChange={(event) => setDraftGameEntry(event.target.value)}
                  placeholder={copy.gameEntryPlaceholder}
                />
                <button onClick={() => submitGameEntry(selectedChallenge.id)}>{copy.submitEntry}</button>
                <label className="file-button">
                  {copy.addProof}
                  <input name={`challenge-proof-${selectedChallenge.id}`} type="file" accept="image/*,video/*" onChange={(event) => void addGameMediaEntry(event, selectedChallenge.id)} />
                </label>
              </div>
            )}
            <GameSubmissions
              challenge={selectedChallenge}
              groups={groups}
              activePlayerId={activePlayer.id}
              copy={copy}
              onCheer={(submissionId) => cheerSubmission(selectedChallenge.id, submissionId)}
            />
            {role === 'host' ? (
              <details className="advanced-game host-game-controls">
                <summary>{copy.hostControls}</summary>
                {features.scores ? (
                  <input
                    name="host-challenge-detail-points"
                    type="number"
                    min="1"
                    value={selectedChallenge.points}
                    onChange={(event) => updateChallenge(selectedChallenge.id, { points: Math.max(1, Number(event.target.value) || 1) })}
                    placeholder={copy.points}
                  />
                ) : null}
                <input
                  name="host-challenge-detail-deadline"
                  value={selectedChallenge.deadline ?? 'TBC'}
                  onChange={(event) => updateChallenge(selectedChallenge.id, { deadline: event.target.value })}
                  placeholder="Deadline (e.g. 19:00, TBC)"
                />
                <select
                  name="host-challenge-detail-group"
                  value={selectedChallenge.groupId ?? 'all'}
                  onChange={(event) => updateChallenge(selectedChallenge.id, { groupId: event.target.value === 'all' ? undefined : event.target.value })}
                >
                  {groups.map((group) => <option key={group.id} value={group.id}>{group.name}</option>)}
                </select>
                <button onClick={() => updateChallenge(selectedChallenge.id, { status: selectedChallenge.status === 'closed' ? 'open' : 'closed' })}>
                  {selectedChallenge.status === 'closed' ? copy.reopenGame : copy.closeGame}
                </button>
              </details>
            ) : null}
          </>
        ) : null}
      </Dialog>

      <Confirm request={confirmRequest} onClose={() => setConfirmRequest(null)} />

      <nav className="tabbar" aria-label="Crewtrip sections">
        {dockTabs.map((item, index) => (
          <Fragment key={item}>
            {hasQuickActions && index === Math.ceil(dockTabs.length / 2) ? (
              <button type="button" className="tabbar-add" aria-label="Open quick actions" onClick={() => setActionSheetOpen(true)}>
                <span><Icon name="plus" size={18} /></span>
                <small>{role === 'host' ? 'Add' : 'Contribute'}</small>
              </button>
            ) : null}
            <button type="button" className={tab === item ? 'active' : ''} onClick={() => goToTab(item)}>
              <span><Icon name={tabIcon(item)} size={18} /></span>
              <small>{tabLabel(item, role, copy)}</small>
            </button>
          </Fragment>
        ))}
      </nav>
    </main>
  );
}

function defaultGroupEmojiInline(name: string): string {
  const lower = name.toLowerCase();
  if (lower.includes('beach') || lower.includes('sea') || lower.includes('pool')) return '☀';
  if (lower.includes('food') || lower.includes('dinner') || lower.includes('brunch')) return '◆';
  if (lower.includes('party') || lower.includes('dance')) return '✦';
  return '👥';
}
