import { useEffect, useMemo, useState } from 'react';
import type { CSSProperties, ChangeEvent } from 'react';
import { createShippieIframeSdk } from '@shippie/iframe-sdk';
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
  WrapUpSettings,
  Challenge,
  SurpriseUnlock,
  Language,
  ThemeKey,
} from './types';
import { translations } from './data/translations';
import { themePalettes, paletteFor } from './data/themes';
import { gamePresets, pulseActions, featureOptions } from './data/games';
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
  legacyVoteIds,
  markLocalUpdate,
  normalizeCrewtripState,
  parseRecoveryPack,
  readJoinedEventCode,
  readLocalBackups,
  recoveryPackFileName,
  stringifyRecoveryPack,
  syncLabel,
  syncLabelShort,
  totalScore,
  unlockLabel,
  writeLocalBackup,
  crewColorAt,
} from './utils/state';
import { useCrewtripSync } from './utils/sync';

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
import { ChallengeGrid, GameHighlights, GameResultBoard, GameSubmissions, Leaderboard } from './components/Games';
import { EntryScreen } from './components/EntryScreen';
import { Dialog } from './components/Dialog';
import { Confirm, type ConfirmRequest } from './components/Confirm';
import { OnboardingCard } from './components/OnboardingCard';
import { generateWrapCard, shareWrapCard } from './utils/wrap-card';

import './styles.css';

export type { CrewtripState } from './types';
export { mergeCrewtripState } from './utils/state';

function usePersistentState() {
  const [state, setState] = useState<CrewtripState>(() => {
    try {
      const joinedEventCode = readJoinedEventCode();
      const raw = localStorage.getItem(STORAGE_KEY);
      // No persisted state and no join code → empty trip (no seeded demo
      // players/polls/memories). Hosts get the EntryScreen; eventees with
      // a join code get a synced room they can populate together.
      const parsed = raw
        ? normalizeCrewtripState({ ...initialState, ...JSON.parse(raw) })
        : createFreshCrewtripState();
      return joinedEventCode && parsed.eventCode !== joinedEventCode
        ? createFreshCrewtripState({ eventCode: joinedEventCode, language: parsed.language, theme: parsed.theme })
        : parsed;
    } catch {
      return createFreshCrewtripState();
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

function tabsForRole(role: Role | null): Tab[] {
  if (role === 'host') {
    return ['now', 'crew', 'games', 'memories', 'more'];
  }
  return ['now', 'crew', 'games', 'memories', 'more'];
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

export function App() {
  const sdk = useMemo(() => createShippieIframeSdk({ appId: 'crewtrip' }), []);
  const [state, setState] = usePersistentState();
  const deviceId = useMemo(getDeviceId, []);
  const [role, setRole] = useState<Role | null>(() => initialRole());
  const sync = useCrewtripSync(state, setState, deviceId, Boolean(role));
  const reduceMotion = usePrefersReducedMotion();

  const [tab, setTab] = useState<Tab>('now');
  const [draftMemory, setDraftMemory] = useState('');
  const [draftRequest, setDraftRequest] = useState('');
  const [draftBroadcast, setDraftBroadcast] = useState('');
  const [draftCrewName, setDraftCrewName] = useState('');
  const [draftCrewTeam, setDraftCrewTeam] = useState('all');
  const [selectedDayId, setSelectedDayId] = useState('day-1');
  const [selectedChatScope, setSelectedChatScope] = useState<MessageScope>('all');
  const [hostSection, setHostSection] = useState<HostSection>('manage');
  const [draftStop, setDraftStop] = useState({ dayId: 'day-1', groupId: 'all', time: '', title: '', place: '' });
  const [draftDay, setDraftDay] = useState({ label: '', date: '' });
  const [draftGroup, setDraftGroup] = useState('');
  const [draftMessage, setDraftMessage] = useState('');
  const [draftPoll, setDraftPoll] = useState({ question: '', options: 'Yes, No, Maybe', closes: 'Open' });
  const [draftChallenge, setDraftChallenge] = useState({ title: '', points: '8', kind: 'challenge' as GameKind, groupId: 'all', deadline: 'TBC' });
  const [draftSurprise, setDraftSurprise] = useState({ title: '', message: '', unlockType: 'time' as SurpriseUnlock, unlockValue: '21:00' });
  const [draftGameEntry, setDraftGameEntry] = useState('');
  const [memoryFilter, setMemoryFilter] = useState<MemoryFilter>('all');
  const [selectedPoll, setSelectedPoll] = useState<Record<string, string>>({});
  const [leaderboardMode, setLeaderboardMode] = useState<'people' | 'teams'>('people');
  const [selectedChallengeId, setSelectedChallengeId] = useState<string | null>(null);
  const [shareCopied, setShareCopied] = useState(false);
  const [backupNotice, setBackupNotice] = useState<string | null>(null);
  const [backupRevision, setBackupRevision] = useState(0);
  const [qrMarkup, setQrMarkup] = useState<string | null>(null);
  const [coverUrl, setCoverUrl] = useState<string | null>(null);
  const [actionSheetOpen, setActionSheetOpen] = useState(false);
  const [confirmRequest, setConfirmRequest] = useState<ConfirmRequest | null>(null);
  const [minuteTick, setMinuteTick] = useState(0);

  const shareUrl = useMemo(() => buildShareUrl(state.eventCode, 'crew'), [state.eventCode]);
  const hostShareUrl = useMemo(() => buildShareUrl(state.eventCode, 'join-host'), [state.eventCode]);
  const activePlayer = state.players.find((player) => player.id === state.activePlayerId) ?? state.players[0]!;
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
  const palette = paletteFor(theme);
  const themeVars = useMemo(() => themeStyle(theme), [theme]);
  const copy = getCopy(language);
  const localBackups = useMemo(() => readLocalBackups()
    .filter((backup) => backup.eventCode === state.eventCode)
    .sort((a, b) => b.at - a.at), [backupRevision, minuteTick, state.eventCode, state.updatedAt]);
  const activeDayId = days.some((day) => day.id === selectedDayId) ? selectedDayId : days[0]!.id;
  const activeGroup = activePlayer.groupId ? groups.find((group) => group.id === activePlayer.groupId) : null;
  const activeEditableGroup = groups.find((group) => group.id === (activePlayer.groupId ?? 'all')) ?? groups[0] ?? null;
  const dayStops = state.stops.filter((stop) => (stop.dayId ?? days[0]!.id) === activeDayId);
  const currentStop = dayStops.find((stop) => stop.status === 'now') ?? dayStops[0] ?? state.stops[0]!;
  const nextStop = dayStops.find((stop) => stop.status === 'next');
  const filteredMemories = state.memories.filter((memory) => (memory.dayId ?? days[0]!.id) === activeDayId);
  const visibleMemories = filterMemories(filteredMemories, memoryFilter, activePlayer.name);
  const dayChallenges = state.challenges.filter((challenge) => (challenge.dayId ?? activeDayId) === activeDayId && canSeeChallenge(challenge, role, activePlayer));
  const selectedChallenge = selectedChallengeId ? state.challenges.find((challenge) => challenge.id === selectedChallengeId) : null;
  const latestMemory = filteredMemories[0] ?? state.memories[0];
  const latestBroadcast = state.broadcasts[0] ?? null;
  const unlockedSurprises = useMemo(() => state.surprises.filter((drop) => isSurpriseUnlocked(drop, state)), [minuteTick, state]);
  const lockedSurpriseCount = Math.max(0, state.surprises.length - unlockedSurprises.length);
  const liveActivities = useMemo(() => buildLiveActivities(state, sync, groups), [groups, state, sync]);
  const pulseStats = useMemo(() => buildPulseStats(state.pulses, groups), [groups, state.pulses]);
  const tripPhase = useMemo(() => buildTripPhase(state, role, sync, currentStop, nextStop, wrapUp, unlockedSurprises.length), [currentStop, nextStop, role, state, sync, unlockedSurprises.length, wrapUp]);
  const hostPrompts = useMemo(() => buildHostPrompts(state, sync, wrapUp), [state, sync, wrapUp]);
  const personalTrip = useMemo(() => buildPersonalTrip(activePlayer, state, groups), [activePlayer, groups, state]);
  const gameHighlights = useMemo(() => buildGameHighlights(state.challenges, state.players, groups), [groups, state.challenges, state.players]);
  const wrapAwards = useMemo(() => buildCrewAwards(state.players, state.memories, state.challenges, groups), [groups, state.challenges, state.memories, state.players]);
  const wrapHighlights = useMemo(() => buildWrapHighlights(state, wrapAwards, gameHighlights), [gameHighlights, state, wrapAwards]);
  const tripTimelineItems = useMemo(
    () => buildTripTimelineItems(state, activeDayId, days, groups, role, activePlayer),
    [activeDayId, days, groups, role, activePlayer, state],
  );
  const visibleMessages = messages.filter((message) => selectedChatScope === 'all'
    ? message.scope === 'all'
    : message.scope === 'group' && message.groupId === activePlayer.groupId);
  const wrapMemories = state.memories.slice(0, 10);
  const memoryStats = useMemo(() => ({
    total: filteredMemories.length,
    media: filteredMemories.filter((memory) => memory.kind === 'image' || memory.kind === 'video').length,
    awards: filteredMemories.filter((memory) => memory.kind === 'award').length,
  }), [filteredMemories]);
  const visibleTabs = useMemo(() => tabsForRole(role), [role]);

  // Sync browser theme-color with the active palette.
  useEffect(() => {
    if (typeof document === 'undefined') return;
    const meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', palette.themeColor);
  }, [palette.themeColor]);

  // Flip data-mode on the document so light/dark CSS branches work, and
  // make sure the page background matches the palette outside our shell.
  useEffect(() => {
    if (typeof document === 'undefined') return;
    const mode = palette.vars['--mode'] ?? 'light';
    document.documentElement.setAttribute('data-mode', mode);
    document.documentElement.style.colorScheme = mode === 'dark' ? 'dark' : 'light';
  }, [palette.vars]);

  useEffect(() => {
    if (!visibleTabs.includes(tab) && tab !== 'vote' && tab !== 'requests' && tab !== 'memories' && tab !== 'chat' && tab !== 'wrap' && tab !== 'host') {
      setTab(visibleTabs[0] ?? 'now');
    }
  }, [tab, visibleTabs]);

  useEffect(() => {
    const interval = window.setInterval(() => setMinuteTick((tick) => tick + 1), 30_000);
    return () => window.clearInterval(interval);
  }, []);

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

  function vote(pollId: string, optionId: string) {
    update((current) => ({
      ...current,
      polls: current.polls.map((poll) =>
        poll.id === pollId
          ? {
              ...poll,
              options: poll.options.map((option) =>
                option.id === optionId
                  ? {
                      ...option,
                      votes: option.votes + 1,
                      voterIds: Array.from(new Set([...(option.voterIds ?? legacyVoteIds(option)), activePlayer.id])),
                    }
                  : option,
              ),
            }
          : poll,
      ),
      broadcasts: [{ id: newId('b'), text: `${activePlayer.name} voted.`, at: timeNow() }, ...current.broadcasts].slice(0, 18),
    }));
    setSelectedPoll((current) => ({ ...current, [pollId]: optionId }));
    sdk.feel.texture('confirm');
  }

  function changeVote(pollId: string) {
    const previous = selectedPoll[pollId];
    if (!previous) return;
    update((current) => ({
      ...current,
      polls: current.polls.map((poll) =>
        poll.id === pollId
          ? {
              ...poll,
              options: poll.options.map((option) =>
                option.id === previous
                  ? {
                      ...option,
                      votes: Math.max(0, option.votes - 1),
                      voterIds: (option.voterIds ?? legacyVoteIds(option)).filter((id) => id !== activePlayer.id),
                    }
                  : option,
              ),
            }
          : poll,
      ),
    }));
    setSelectedPoll((current) => {
      const next = { ...current };
      delete next[pollId];
      return next;
    });
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
      activePlayerId: id,
      players: [...current.players, nextPlayer],
      broadcasts: [{ id: newId('b'), text: `${name} joined the crew.`, at: timeNow() }, ...current.broadcasts],
    }));
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
      players: alreadyScored
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

  function addDay() {
    const label = draftDay.label.trim();
    if (!label) return;
    const day = { id: newId('day'), label, date: draftDay.date.trim() || label };
    update((current) => ({ ...current, days: [...(current.days ?? initialState.days), day] }));
    setSelectedDayId(day.id);
    setDraftDay({ label: '', date: '' });
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
    const groupId = selectedChatScope === 'group' ? activePlayer.groupId : undefined;
    if (selectedChatScope === 'group' && !groupId) return;
    update((current) => ({
      ...current,
      messages: [
        {
          id: newId('msg'),
          authorId: activePlayer.id,
          authorName: activePlayer.name,
          groupId,
          scope: selectedChatScope,
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
          broadcasts: [{ id: newId('b'), text: `Crew request is now a poll: ${request.text}`, at: timeNow() }, ...current.broadcasts],
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
    update((current) => ({
      ...current,
      stops: [
        ...current.stops,
        {
          id: newId('s'),
          dayId: draftStop.dayId,
          groupId: draftStop.groupId === 'all' ? undefined : draftStop.groupId,
          time: draftStop.time.trim() || 'TBC',
          title,
          place: draftStop.place.trim() || 'Host drop',
          status: 'later' as const,
        },
      ],
    }));
    setDraftStop({ dayId: activeDayId, groupId: 'all', time: '', title: '', place: '' });
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

  function updateWrap(updater: (current: WrapUpSettings) => WrapUpSettings) {
    update((current) => ({ ...current, wrapUp: updater(current.wrapUp ?? initialState.wrapUp) }));
  }

  function leaveSession() {
    setConfirmRequest({
      title: 'Leave this trip?',
      body: 'You will return to the entry screen and can rejoin with the same link any time.',
      confirmLabel: 'Leave',
      onConfirm: () => {
        setRole(null);
        setTab('now');
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
        ? 'Removes plans, polls, games, memories, requests, messages, crew, and media from this device and live peers. The join link stays the same.'
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
        setRole('host');
        setTab('now');
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
      setRole('host');
      setTab('now');
      setSelectedDayId(restored.days[0]?.id ?? 'day-1');
      setSelectedChallengeId(null);
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
    setRole('host');
    setTab('now');
    setSelectedDayId(restored.days[0]?.id ?? 'day-1');
    setSelectedChallengeId(null);
    writeLocalBackup(restored, 'restore', true);
    setBackupRevision((revision) => revision + 1);
    setBackupNotice(`Restored local snapshot from ${formatBackupTime(backup.at)}.`);
    sdk.feel.texture('confirm');
  }

  function onTimelineSelect(item: TripTimelineItem) {
    if (item.challengeId) setSelectedChallengeId(item.challengeId);
    if (item.tab) setTab(item.tab);
  }

  if (!role) {
    // A trip counts as "existing" if there's at least one named player
    // beyond the lone Host seed and we haven't already cleared it.
    const hasExistingTrip = state.players.length > 1
      || state.memories.length > 0
      || state.stops.some((stop) => stop.title !== 'Start planning');
    return (
      <EntryScreen
        themeStyle={themeVars}
        hasExistingTrip={hasExistingTrip}
        existingTripName={state.eventName !== 'Crewtrip' ? state.eventName : undefined}
        onContinue={() => {
          setRole('host');
          setTab('now');
        }}
        onStartNew={(name) => {
          const next = createFreshCrewtripState({
            eventCode: newEventCode(),
            language,
            theme,
          });
          if (name) next.eventName = name;
          setState(markLocalUpdate(next, deviceId));
          setRole('host');
          setTab('now');
          setSelectedDayId(next.days[0]?.id ?? 'day-1');
        }}
        onJoinCode={(code) => {
          if (typeof window === 'undefined') return;
          const url = new URL(window.location.href);
          url.searchParams.set('event', code);
          url.searchParams.set('role', 'crew');
          window.location.assign(url.toString());
        }}
        onTryDemo={() => {
          // The original seeded state lives in `initialState`. Opt-in path
          // for browsing the showcase rather than a real first run.
          setState(markLocalUpdate(initialState, deviceId));
          setRole('host');
          setTab('now');
        }}
      />
    );
  }

  return (
    <main className="app-shell" style={themeVars}>
      <header className="app-header">
        <div className="header-copy">
          <h1>{state.eventName || 'Crewtrip'}</h1>
          <p className="trip-meta">
            <span className="trip-code">{state.eventCode}</span>
            <span className={`sync-pill ${sync.status}`} title={syncLabel(sync, language)}>{syncLabelShort(sync, language)}</span>
          </p>
        </div>
        <button type="button" className="share-button" onClick={copyShareLink}>
          <Icon name="share" size={14} />
          <span>{shareCopied ? copy.copied : copy.share}</span>
        </button>
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
          surprises={unlockedSurprises}
          lockedSurpriseCount={lockedSurpriseCount}
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
              syncPeers={sync.peers}
              onShare={copyShareLink}
              onAddStop={() => {
                if (role === 'host') {
                  setHostSection('manage');
                  setTab('host');
                } else {
                  setActionSheetOpen(true);
                }
              }}
              onAddMemory={() => setTab('memories')}
            />
          }
          onPulse={sendPulse}
          onGo={(nextTab) => setTab(nextTab)}
          onSecondary={() => {
            if (role === 'host') {
              setHostSection('manage');
              setTab('host');
              return;
            }
            setTab('memories');
          }}
          onReveal={revealSurprise}
          onSelectTimelineItem={onTimelineSelect}
        />
      )}

      {tab === 'crew' && features.crew && (
        <View title={copy.crew} kicker={copy.crewKicker}>
          <section className="crew-summary">
            <article className="you-card">
              <div>
                <PlayerAvatar player={activePlayer} size="large" />
                <div>
                  <small>{copy.activeAs}</small>
                  <strong>{activePlayer.name}</strong>
                </div>
              </div>
              <b>{activePlayer.score} pts</b>
              <p>{activeGroup ? activeGroup.name : activePlayer.team}</p>
              <label className="file-button profile-file">
                {activePlayer.avatarName ? copy.changePhoto : copy.addPhoto}
                <input type="file" accept="image/*" onChange={(event) => addPlayerImage(event, activePlayer.id)} />
              </label>
            </article>
            <details className="simple-drawer">
              <summary>
                <span>Change team</span>
                <small>{activeGroup?.name ?? activePlayer.team}</small>
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
            {activeEditableGroup ? (
              <details className="team-identity simple-drawer">
                <summary>
                  <span>Team look</span>
                  <small>{copy.teamEmoji}, {copy.teamColour}, {copy.teamImage}</small>
                </summary>
                <div className="team-identity-head">
                  <GroupMark group={activeEditableGroup} size="large" />
                  <div>
                    <small>{copy.teamIdentity}</small>
                    <strong>{activeEditableGroup.name}</strong>
                  </div>
                </div>
                <div className="team-identity-controls" aria-label={copy.teamIdentity}>
                  <label>
                    <span>{copy.teamEmoji}</span>
                    <input
                      className="emoji-input"
                      value={activeEditableGroup.emoji ?? ''}
                      maxLength={2}
                      onChange={(event) => updateGroup(activeEditableGroup.id, { emoji: event.target.value })}
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
                          className={activeEditableGroup.color.toLowerCase() === color.toLowerCase() ? 'swatch active' : 'swatch'}
                          style={{ background: color }}
                          onClick={() => updateGroup(activeEditableGroup.id, { color })}
                        />
                      ))}
                    </div>
                  </label>
                  <label className="file-button team-file">
                    {activeEditableGroup.imageName ? copy.changeImage : copy.teamImage}
                    <input type="file" accept="image/*" onChange={(event) => addGroupImage(event, activeEditableGroup.id)} />
                  </label>
                </div>
              </details>
            ) : null}
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
            <select value={state.activePlayerId} onChange={(event) => update((current) => ({ ...current, activePlayerId: event.target.value }))}>
              {state.players.map((player) => (
                <option key={player.id} value={player.id}>{player.name}</option>
              ))}
            </select>
            <div className="composer three">
              <input value={draftCrewName} onChange={(event) => setDraftCrewName(event.target.value)} placeholder="Your name" />
              <select value={draftCrewTeam} onChange={(event) => setDraftCrewTeam(event.target.value)}>
                {groups.map((group) => <option key={group.id} value={group.id}>{group.name}</option>)}
              </select>
              <button onClick={addCrewMember}>{copy.addMe}</button>
            </div>
          </details>

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
                  <small>Team {player.team}</small>
                </div>
                <b>{player.score}</b>
              </article>
            )) : <p className="empty-note">No crew yet — add the first name above.</p>}
          </div>
        </View>
      )}

      {tab === 'vote' && features.polls && (
        <View title={copy.polls} kicker={copy.pollsKicker}>
          {state.polls.length ? (
            <div className="poll-stack">
              {state.polls.map((poll) => (
                <PollCard
                  key={poll.id}
                  poll={poll}
                  selected={selectedPoll[poll.id]}
                  onVote={(optionId) => vote(poll.id, optionId)}
                  onChange={() => changeVote(poll.id)}
                />
              ))}
            </div>
          ) : (
            <p className="empty-note">No polls yet — host can add one from the + menu.</p>
          )}
        </View>
      )}

      {tab === 'games' && features.games && (
        <View title={copy.games} kicker={`${activePlayer.score} ${copy.pointsFor} ${activePlayer.name}`}>
          <DayToggle days={days} selectedDayId={activeDayId} onSelect={setSelectedDayId} />
          <SegmentedControl
            value={leaderboardMode}
            options={[
              { value: 'people', label: copy.people },
              { value: 'teams', label: copy.teams },
            ]}
            onChange={setLeaderboardMode}
            ariaLabel="Leaderboard scope"
          />
          <Leaderboard players={sortedPlayers} groups={groups} title={copy.leaderboard} mode={leaderboardMode} />
          <GameHighlights highlights={gameHighlights} onSelect={setSelectedChallengeId} />
          <ChallengeGrid
            copy={copy}
            challenges={dayChallenges}
            groups={groups}
            activePlayerId={activePlayer.id}
            onSelect={setSelectedChallengeId}
            onScore={completeChallenge}
            onUploadProof={(event, challengeId) => void addGameMediaEntry(event, challengeId)}
          />
        </View>
      )}

      {tab === 'requests' && features.requests && (
        <View title={role === 'host' ? copy.inbox : copy.requests} kicker={copy.requestsKicker}>
          <div className="composer">
            <input
              value={draftRequest}
              onChange={(event) => setDraftRequest(event.target.value)}
              placeholder="Ask the host for a plan, poll, game, or change"
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
        <View title={copy.memories} kicker={copy.memoriesKicker} onBack={() => setTab('now')} backLabel={copy.backToTrip}>
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
                value={draftMemory}
                onChange={(event) => setDraftMemory(event.target.value)}
                placeholder={copy.memoryPlaceholder}
              />
              <div className="memory-actions">
                <button onClick={() => addMemory('text')}>{copy.saveMoment}</button>
                <button className="ghost" onClick={() => addMemory('award')}>{copy.giveAward}</button>
                <label className="file-button">
                  {copy.media}
                  <input type="file" accept="image/*,video/*" onChange={addMediaMemory} />
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
        <View title={copy.chat} kicker={selectedChatScope === 'group' && activeGroup ? activeGroup.name : copy.allCrew}>
          <SegmentedControl
            value={selectedChatScope}
            options={[
              { value: 'all', label: copy.allCrew },
              { value: 'group', label: copy.myGroup },
            ]}
            onChange={(value) => setSelectedChatScope(value)}
            ariaLabel="Chat scope"
          />
          <div className="composer">
            <input
              value={draftMessage}
              onChange={(event) => setDraftMessage(event.target.value)}
              placeholder={selectedChatScope === 'group' ? 'Message your group' : 'Message everyone'}
            />
            <button onClick={addMessage}>{copy.send}</button>
          </div>
          {visibleMessages.length ? (
            <div className="message-list">
              {visibleMessages.map((message) => (
                <article key={message.id} className="message">
                  <span>{message.at} / {message.authorName}</span>
                  <p>{message.text}</p>
                </article>
              ))}
            </div>
          ) : (
            <p className="empty-note">No messages yet — break the ice with the first hello.</p>
          )}
        </View>
      )}

      {tab === 'wrap' && features.wrap && (
        <View title={copy.wrap} kicker={wrapUp.published ? copy.readyToShare : copy.wrapDraft} onBack={() => setTab('now')} backLabel={copy.backToTrip}>
          <article className="wrap-card finale">
            <p className="eyebrow">{state.eventName}</p>
            <h3>{wrapUp.title}</h3>
            <p>{wrapUp.note}</p>
            <div className="mini-grid">
              <Metric label="Memories" value={String(state.memories.length)} />
              <Metric label="Crew" value={String(state.players.length)} />
              {wrapUp.includeGames ? <Metric label="Game points" value={String(totalScore(state.players))} /> : null}
              {wrapUp.includePolls ? <Metric label="Polls" value={String(state.polls.length)} /> : null}
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
                <article key={award.playerId} className="award-card">
                  <span style={{ background: award.color }}>{award.name.slice(0, 1).toUpperCase()}</span>
                  <div>
                    <strong>{award.name}</strong>
                    <small>{award.groupName}</small>
                    <h4>{award.title}</h4>
                    <p>{award.detail}</p>
                  </div>
                  <b>{award.score}</b>
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
        <View title={copy.settings} kicker={copy.settingsKicker}>
          <SegmentedControl
            value={hostSection}
            options={(['manage', 'fun', 'setup', 'wrap'] as HostSection[]).map((section) => ({ value: section, label: section }))}
            onChange={setHostSection}
            ariaLabel="Host section"
          />
          <div className="host-grid wide">
            {hostSection === 'manage' ? (
              <>
                <ControlPanel title="Broadcast" tone="primary">
                  <input value={draftBroadcast} onChange={(event) => setDraftBroadcast(event.target.value)} placeholder="Pinned host note for the crew" />
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
                          {features.polls ? <button onClick={() => transformRequest(request.id, 'poll')}>Make poll</button> : null}
                          {features.games ? <button onClick={() => transformRequest(request.id, 'game')}>Make game</button> : null}
                          <button className="ghost" onClick={() => updateRequest(request.id, 'done')}>Done</button>
                        </div>
                      </div>
                    )) : <p className="empty-note">No requests yet — share the join link to get crew talking.</p>}
                  </ControlPanel>
                ) : null}
                {features.plan ? (
                  <HostDisclosure title="Plan item" hint="Add a stop to the day">
                    <select value={draftStop.dayId} onChange={(event) => setDraftStop((current) => ({ ...current, dayId: event.target.value }))}>
                      {days.map((day) => <option key={day.id} value={day.id}>{day.label}</option>)}
                    </select>
                    <select value={draftStop.groupId} onChange={(event) => setDraftStop((current) => ({ ...current, groupId: event.target.value }))}>
                      {groups.map((group) => <option key={group.id} value={group.id}>{group.name}</option>)}
                    </select>
                    <input value={draftStop.time} onChange={(event) => setDraftStop((current) => ({ ...current, time: event.target.value }))} placeholder="Time (e.g. 14:00 or TBC)" />
                    <input value={draftStop.title} onChange={(event) => setDraftStop((current) => ({ ...current, title: event.target.value }))} placeholder="Plan title" />
                    <input value={draftStop.place} onChange={(event) => setDraftStop((current) => ({ ...current, place: event.target.value }))} placeholder="Place or note" />
                    <button onClick={addStop}>Add plan</button>
                    <button className="ghost" onClick={advancePlan}>Advance now</button>
                  </HostDisclosure>
                ) : null}
                {features.polls ? (
                  <HostDisclosure title="Poll status" hint="Open or close existing polls">
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
                    )) : <p className="empty-note">No polls yet.</p>}
                  </HostDisclosure>
                ) : null}
              </>
            ) : null}

            {hostSection === 'fun' ? (
              <>
                {features.polls ? (
                  <ControlPanel title="Poll builder" tone="primary">
                    <input value={draftPoll.question} onChange={(event) => setDraftPoll((current) => ({ ...current, question: event.target.value }))} placeholder="Question, e.g. Pick the next stop" />
                    <input value={draftPoll.options} onChange={(event) => setDraftPoll((current) => ({ ...current, options: event.target.value }))} placeholder="Options separated by commas" />
                    <input value={draftPoll.closes} onChange={(event) => setDraftPoll((current) => ({ ...current, closes: event.target.value }))} placeholder="Closes (e.g. Open, 21:00)" />
                    <button onClick={addPoll}>Open poll</button>
                  </ControlPanel>
                ) : null}
                {features.games ? (
                  <ControlPanel title="Game builder" tone="primary">
                    <div className="template-row compact">
                      {(Object.keys(gamePresets) as GameKind[]).map((kind) => (
                        <button key={kind} onClick={() => addGamePreset(kind)}>{gamePresets[kind].label}</button>
                      ))}
                    </div>
                    <details className="advanced-game">
                      <summary>{copy.customGame}</summary>
                      <select value={draftChallenge.kind} onChange={(event) => setDraftChallenge((current) => ({ ...current, kind: event.target.value as GameKind }))}>
                        {(Object.keys(gamePresets) as GameKind[]).map((kind) => <option key={kind} value={kind}>{gamePresets[kind].label}</option>)}
                      </select>
                      <select value={draftChallenge.groupId} onChange={(event) => setDraftChallenge((current) => ({ ...current, groupId: event.target.value }))}>
                        {groups.map((group) => <option key={group.id} value={group.id}>{group.name}</option>)}
                      </select>
                      <input value={draftChallenge.title} onChange={(event) => setDraftChallenge((current) => ({ ...current, title: event.target.value }))} placeholder="Title" />
                      <input value={draftChallenge.deadline} onChange={(event) => setDraftChallenge((current) => ({ ...current, deadline: event.target.value }))} placeholder="Deadline (e.g. 19:00, TBC)" />
                      <input type="number" min="1" value={draftChallenge.points} onChange={(event) => setDraftChallenge((current) => ({ ...current, points: event.target.value }))} placeholder="Points (whole number)" />
                      <button onClick={addChallenge}>Add game</button>
                    </details>
                  </ControlPanel>
                ) : null}
                <HostDisclosure title="Surprise drops" hint="Schedule unlock-on-X reveals">
                  <input value={draftSurprise.title} onChange={(event) => setDraftSurprise((current) => ({ ...current, title: event.target.value }))} placeholder="Title (e.g. After-dinner mission)" />
                  <textarea value={draftSurprise.message} onChange={(event) => setDraftSurprise((current) => ({ ...current, message: event.target.value }))} placeholder="Hidden note, secret mission, or award prompt" />
                  <select value={draftSurprise.unlockType} onChange={(event) => setDraftSurprise((current) => ({ ...current, unlockType: event.target.value as SurpriseUnlock }))}>
                    <option value="time">Open at time</option>
                    <option value="submissions">Unlock after submissions</option>
                    <option value="first-photo">Unlock after first photo</option>
                    <option value="manual">Host reveals manually</option>
                  </select>
                  <input value={draftSurprise.unlockValue} onChange={(event) => setDraftSurprise((current) => ({ ...current, unlockValue: event.target.value }))} placeholder={draftSurprise.unlockType === 'time' ? '21:00' : draftSurprise.unlockType === 'submissions' ? '5' : 'note'} />
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
                {features.scores ? (
                  <HostDisclosure title="Energy" hint="Set the room vibe">
                    <input
                      type="range"
                      min="0"
                      max="100"
                      value={state.energy}
                      onChange={(event) => update((current) => ({ ...current, energy: Number(event.target.value) }))}
                    />
                    <button onClick={() => update((current) => ({ ...current, energy: Math.min(100, current.energy + 8) }))}>Lift</button>
                  </HostDisclosure>
                ) : null}
              </>
            ) : null}

            {hostSection === 'setup' ? (
              <>
                <ControlPanel title={copy.share} tone="primary">
                  {qrMarkup ? <div className="qr-frame" dangerouslySetInnerHTML={{ __html: qrMarkup }} /> : <code>{shareUrl}</code>}
                  <code className="host-code">Join-host: {hostShareUrl}</code>
                  <p className="sync-note">{syncLabel(sync, language)}</p>
                  <button onClick={copyShareLink}>{shareCopied ? copy.copied : copy.copyJoinLink}</button>
                </ControlPanel>
                <HostDisclosure title="Trip details" hint="Title, description, cover image">
                  <input value={state.eventName} onChange={(event) => update((current) => ({ ...current, eventName: event.target.value }))} placeholder="Event title" />
                  <input value={state.location} onChange={(event) => update((current) => ({ ...current, location: event.target.value }))} placeholder="Location or group label" />
                  <textarea value={state.description} onChange={(event) => update((current) => ({ ...current, description: event.target.value }))} placeholder="Event description" />
                  <label className="file-button">
                    {state.coverImageName ? 'Change cover' : 'Add cover image'}
                    <input type="file" accept="image/*" onChange={addCoverImage} />
                  </label>
                </HostDisclosure>
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
                <HostDisclosure title="Days" hint={`${days.length} days in the trip`}>
                  <DayToggle days={days} selectedDayId={activeDayId} onSelect={setSelectedDayId} />
                  <div className="composer three">
                    <input value={draftDay.label} onChange={(event) => setDraftDay((current) => ({ ...current, label: event.target.value }))} placeholder="Day label (e.g. Day 2)" />
                    <input value={draftDay.date} onChange={(event) => setDraftDay((current) => ({ ...current, date: event.target.value }))} placeholder="Short date (e.g. Sat)" />
                    <button onClick={addDay}>Add day</button>
                  </div>
                </HostDisclosure>
                <HostDisclosure title="Teams" hint={`${groups.length} teams`}>
                  <div className="composer">
                    <input value={draftGroup} onChange={(event) => setDraftGroup(event.target.value)} placeholder="Team name (e.g. Beach crew)" />
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
                            <input type="file" accept="image/*" onChange={(event) => addGroupImage(event, group.id)} />
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
                  <select value={language} onChange={(event) => update((current) => ({ ...current, language: event.target.value as Language }))}>
                    <option value="en">English</option>
                    <option value="fr">Français</option>
                  </select>
                </HostDisclosure>
                <HostDisclosure title="Templates" hint="Start from a trip shape">
                  {eventTemplates.map((template) => (
                    <button key={template.id} onClick={() => applyTemplate(template)}>{template.name}</button>
                  ))}
                </HostDisclosure>
                <HostDisclosure title="Features" hint="Turn modules on or off">
                  <div className="feature-list">
                    {featureOptions.map((feature) => (
                      <label key={feature.key} className="feature-toggle">
                        <span>
                          <strong>{feature.label}</strong>
                          <small>{feature.hint}</small>
                        </span>
                        <input
                          type="checkbox"
                          checked={features[feature.key]}
                          onChange={() => toggleFeature(feature.key)}
                        />
                      </label>
                    ))}
                  </div>
                </HostDisclosure>
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
                      <input type="file" accept="application/json,.json" onChange={(event) => void importRecoveryPack(event)} />
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
                <input value={wrapUp.title} onChange={(event) => updateWrap((current) => ({ ...current, title: event.target.value }))} placeholder="Wrap title (e.g. Trip wrapped)" />
                <textarea value={wrapUp.note} onChange={(event) => updateWrap((current) => ({ ...current, note: event.target.value }))} placeholder="Wrap note (one line for the crew)" />
                <label className="feature-toggle">
                  <span><strong>Include timeline</strong><small>Plan highlights in the wrap</small></span>
                  <input type="checkbox" checked={wrapUp.includeTimeline} onChange={() => updateWrap((current) => ({ ...current, includeTimeline: !current.includeTimeline }))} />
                </label>
                <label className="feature-toggle">
                  <span><strong>Include games</strong><small>Scores and winners</small></span>
                  <input type="checkbox" checked={wrapUp.includeGames} onChange={() => updateWrap((current) => ({ ...current, includeGames: !current.includeGames }))} />
                </label>
                <label className="feature-toggle">
                  <span><strong>Publish wrap</strong><small>Make the Wrap tab feel final</small></span>
                  <input type="checkbox" checked={wrapUp.published} onChange={() => updateWrap((current) => ({ ...current, published: !current.published }))} />
                </label>
              </ControlPanel>
            ) : null}
          </div>
        </View>
      )}

      {tab === 'more' && (
        <View title="More" kicker="Everything else, kept out of the way">
          <div className="more-list">
            {features.polls ? <MoreButton icon={<Icon name="vote" size={16} />} label={copy.polls} meta={`${openPolls.length} open`} onClick={() => setTab('vote')} /> : null}
            {features.requests ? <MoreButton icon={<Icon name="requests" size={16} />} label={role === 'host' ? copy.inbox : copy.requests} meta={`${pendingRequests.length} new`} onClick={() => setTab('requests')} /> : null}
            {features.chat ? <MoreButton icon={<Icon name="chat" size={16} />} label={copy.chat} meta={activeGroup?.name ?? copy.allCrew} onClick={() => setTab('chat')} /> : null}
            {features.wrap ? <MoreButton icon={<Icon name="wrap" size={16} />} label={copy.wrap} meta={wrapUp.published ? 'published' : 'draft'} onClick={() => setTab('wrap')} /> : null}
            {role === 'host' ? <MoreButton icon={<Icon name="host" size={16} />} label={copy.settings} meta="setup, manage, fun, wrap" onClick={() => setTab('host')} /> : null}
            <MoreButton icon={<Icon name="check" size={16} />} label="Recovery pack" meta="save a copy" onClick={downloadRecoveryPack} />
            <MoreButton icon={<Icon name="switch" size={16} />} label={copy.switch} meta="leave this session" onClick={leaveSession} />
          </div>
        </View>
      )}

      <div className="fab-row">
        <label className="fab fab-camera" aria-label="Snap a memory">
          <Icon name="memories" size={22} />
          <input
            type="file"
            accept="image/*,video/*"
            capture="environment"
            onChange={(event) => void addMediaMemory(event)}
          />
        </label>
        <button type="button" className="fab" aria-label="Open quick actions" onClick={() => setActionSheetOpen(true)}>
          <Icon name="plus" size={22} />
        </button>
      </div>

      <Dialog open={actionSheetOpen} onClose={() => setActionSheetOpen(false)} label="Crewtrip quick actions">
        <div className="sheet-handle" />
        <div className="sheet-head">
          <h2>{role === 'host' ? 'Host actions' : 'Add something'}</h2>
          <button type="button" onClick={() => setActionSheetOpen(false)} aria-label="Close"><Icon name="close" size={16} /></button>
        </div>
        {role === 'host' ? (
          <div className="sheet-stack">
            <ControlPanel title="Broadcast">
              <input value={draftBroadcast} onChange={(event) => setDraftBroadcast(event.target.value)} placeholder="Pinned note for the crew" />
              <button onClick={() => { addBroadcast(); setActionSheetOpen(false); }}>Send</button>
            </ControlPanel>
            {features.plan ? (
              <HostDisclosure title="Plan item" hint="Add to the current day">
                <input value={draftStop.time} onChange={(event) => setDraftStop((current) => ({ ...current, time: event.target.value }))} placeholder="Time (e.g. 14:00)" />
                <input value={draftStop.title} onChange={(event) => setDraftStop((current) => ({ ...current, title: event.target.value, dayId: activeDayId }))} placeholder="Plan title" />
                <input value={draftStop.place} onChange={(event) => setDraftStop((current) => ({ ...current, place: event.target.value }))} placeholder="Place or note" />
                <button onClick={() => { addStop(); setActionSheetOpen(false); }}>Add plan</button>
              </HostDisclosure>
            ) : null}
            {features.polls ? (
              <HostDisclosure title="Poll" hint="Ask the crew">
                <input value={draftPoll.question} onChange={(event) => setDraftPoll((current) => ({ ...current, question: event.target.value }))} placeholder="Question" />
                <input value={draftPoll.options} onChange={(event) => setDraftPoll((current) => ({ ...current, options: event.target.value }))} placeholder="Options separated by commas" />
                <button onClick={() => { addPoll(); setActionSheetOpen(false); }}>Open poll</button>
              </HostDisclosure>
            ) : null}
            {features.games ? (
              <HostDisclosure title="Game" hint="Create a light challenge">
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
                      <small>{gamePresets[kind].points} pts</small>
                    </button>
                  ))}
                </div>
              </HostDisclosure>
            ) : null}
          </div>
        ) : (
          <div className="sheet-stack">
            {features.memories ? (
              <ControlPanel title="Memory">
                <input value={draftMemory} onChange={(event) => setDraftMemory(event.target.value)} placeholder="Quote, caption, or moment" />
                <button onClick={() => { addMemory('text'); setActionSheetOpen(false); }}>Add memory</button>
                <label className="file-button">
                  Add photo/video
                  <input type="file" accept="image/*,video/*" onChange={(event) => { void addMediaMemory(event); setActionSheetOpen(false); }} />
                </label>
              </ControlPanel>
            ) : null}
            {features.requests ? (
              <ControlPanel title="Request">
                <input value={draftRequest} onChange={(event) => setDraftRequest(event.target.value)} placeholder="Ask the host for something" />
                <button onClick={() => { addRequest(); setActionSheetOpen(false); }}>Send request</button>
              </ControlPanel>
            ) : null}
            <div className="quick-jump">
              <button onClick={() => { setTab('crew'); setActionSheetOpen(false); }}>Add my name</button>
              {features.chat ? <button onClick={() => { setTab('chat'); setActionSheetOpen(false); }}>Message crew</button> : null}
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
              <Metric label={copy.points} value={String(selectedChallenge.points)} />
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
                  value={draftGameEntry}
                  onChange={(event) => setDraftGameEntry(event.target.value)}
                  placeholder={copy.gameEntryPlaceholder}
                />
                <button onClick={() => submitGameEntry(selectedChallenge.id)}>{copy.submitEntry}</button>
                <label className="file-button">
                  {copy.addProof}
                  <input type="file" accept="image/*,video/*" onChange={(event) => void addGameMediaEntry(event, selectedChallenge.id)} />
                </label>
              </div>
            )}
            <SegmentedControl
              value={leaderboardMode}
              options={[
                { value: 'people', label: copy.people },
                { value: 'teams', label: copy.teams },
              ]}
              onChange={setLeaderboardMode}
              ariaLabel="Result scope"
            />
            <GameResultBoard challenge={selectedChallenge} players={state.players} groups={groups} mode={leaderboardMode} />
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
                <input
                  type="number"
                  min="1"
                  value={selectedChallenge.points}
                  onChange={(event) => updateChallenge(selectedChallenge.id, { points: Math.max(1, Number(event.target.value) || 1) })}
                  placeholder={copy.points}
                />
                <input
                  value={selectedChallenge.deadline ?? 'TBC'}
                  onChange={(event) => updateChallenge(selectedChallenge.id, { deadline: event.target.value })}
                  placeholder="Deadline (e.g. 19:00, TBC)"
                />
                <select
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
        {visibleTabs.map((item) => (
          <button key={item} className={tab === item ? 'active' : ''} onClick={() => setTab(item)}>
            <span><Icon name={tabIcon(item)} size={18} /></span>
            <small>{tabLabel(item, role, copy)}</small>
          </button>
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
  return '★';
}
