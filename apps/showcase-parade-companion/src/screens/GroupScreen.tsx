import { QrShareSheet } from '@shippie/showcase-kit-v2';
import { useEffect, useMemo, useState } from 'react';
import { GroupChatCard } from '../components/GroupChatCard';
import { GroupIdentityCard } from '../components/GroupIdentityCard';
import { GroupMembersCard } from '../components/GroupMembersCard';
import { SideTingsCard } from '../components/SideTingsCard';
import type { RoutePack } from '../data/parade-2026';
import type { ParadeAnalyticsEvent } from '../lib/analytics';
import { CHAT_PRESET_LABEL, type ChatPreset } from '../lib/chat-presets';
import { formatSupporterHandle } from '../lib/display-name';
import {
  addGroupEvent,
  getOrCreateSourceId,
  listGroupEvents,
  type GroupEvent,
} from '../lib/group-events';
import {
  createDefaultGroupPlan,
  decodePlan,
  encodePlan,
  ensurePlanRoom,
  pointFromLandmark,
  type GroupPlan,
  type PlanPoint,
} from '../lib/group-plan';
import type { GroupLiveMember, GroupLiveStatus } from '../lib/group-live';
import { hapticConfirm } from '../lib/haptic';
import { buildShareRunUrl } from '../lib/share-url';
import { showToast } from '../lib/toast';

interface GroupScreenProps {
  pack: RoutePack;
  plan: GroupPlan | null;
  displayName: string;
  supporterTag: string;
  groupLiveMembers: GroupLiveMember[];
  groupLiveStatus: GroupLiveStatus;
  onSave: (plan: GroupPlan) => Promise<void>;
  onTrack: (event: ParadeAnalyticsEvent, props?: Record<string, string | number | boolean | null>) => void;
  sideTingsRefresh?: number;
  onSideTingsRefresh: () => void;
  onAddSideTing: () => void;
  onEditName: () => void;
}

/**
 * Group Hub — one scrollable view with everything for the group: identity +
 * share, plan (progressive disclosure), members (scaffold for live), chat
 * (preset signals + activity feed), and side tings.
 */
export function GroupScreen({
  pack,
  plan,
  displayName,
  supporterTag,
  groupLiveMembers,
  groupLiveStatus,
  onSave,
  onTrack,
  sideTingsRefresh,
  onSideTingsRefresh,
  onAddSideTing,
  onEditName,
}: GroupScreenProps) {
  const localMemberName = formatSupporterHandle(displayName || 'Me', supporterTag);
  const localSourceId = useMemo(() => getOrCreateSourceId(), []);
  const visiblePlan = useMemo(
    () => (plan ? normalizePlanForLocalDevice(plan, localMemberName, supporterTag) : null),
    [plan, localMemberName, supporterTag],
  );
  const [draft, setDraft] = useState<GroupPlan>(() =>
    normalizePlanForLocalDevice(plan ?? createDefaultGroupPlan(pack), localMemberName, supporterTag),
  );
  const [membersText, setMembersText] = useState(() =>
    normalizeMembersForLocalDevice(plan?.members ?? [], localMemberName, supporterTag).join(', '),
  );
  const [draftHydrated, setDraftHydrated] = useState(plan !== null);
  const [shareUrl, setShareUrl] = useState('');
  const [sheetOpen, setSheetOpen] = useState(false);
  const [shareMode, setShareMode] = useState<'group' | 'dot' | 'app'>('group');
  const [joinSheetOpen, setJoinSheetOpen] = useState(false);
  const [joinDraft, setJoinDraft] = useState('');
  const [showMore, setShowMore] = useState(false);
  const [events, setEvents] = useState<GroupEvent[]>(() => listGroupEvents());
  const landmarks = pack.meetingLandmarks;

  // Hydrate the draft once when the plan loads asynchronously (it starts null
  // and arrives from shippie-db on mount). Only fires before the user has
  // edited anything, to avoid clobbering in-progress edits.
  useEffect(() => {
    if (!draftHydrated && visiblePlan) {
      setDraft(visiblePlan);
      setMembersText(visiblePlan.members.join(', '));
      setDraftHydrated(true);
    }
  }, [visiblePlan, draftHydrated]);

  useEffect(() => {
    setDraft((current) => normalizePlanForLocalDevice(current, localMemberName, supporterTag));
    setMembersText((current) =>
      normalizeMembersForLocalDevice(parseMembers(current), localMemberName, supporterTag).join(', '),
    );
  }, [localMemberName, supporterTag]);

  useEffect(() => {
    if (!joinSheetOpen) return undefined;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setJoinSheetOpen(false);
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [joinSheetOpen]);

  useEffect(() => {
    if (!plan || !visiblePlan) return;
    if (planSignature(plan) === planSignature(visiblePlan)) return;
    void onSave(visiblePlan);
  }, [plan, visiblePlan, onSave]);

  const primaryId = useMemo(() => closestLandmarkId(landmarks, draft.primary), [landmarks, draft.primary]);
  const fallbackId = useMemo(() => closestLandmarkId(landmarks, draft.fallback), [landmarks, draft.fallback]);

  const updateDraft = (patch: Partial<GroupPlan>) => {
    setDraft((current) => ({ ...current, ...patch, updatedAt: new Date().toISOString() }));
  };

  const updatePoint = (key: 'primary' | 'fallback', id: string) => {
    const landmark = landmarks.find((item) => item.id === id);
    if (!landmark) return;
    updateDraft({
      [key]: { ...pointFromLandmark(landmark, draft[key].label), time: draft[key].time },
    } as Partial<GroupPlan>);
  };

  const cleanMembers = () => normalizeMembersForLocalDevice(parseMembers(membersText), localMemberName, supporterTag);

  const draftSignature = useMemo(
    () => planSignature({ ...draft, members: cleanMembers() }),
    [draft, membersText],
  );
  const savedSignature = useMemo(() => (visiblePlan ? planSignature(visiblePlan) : ''), [visiblePlan]);
  const planDirty = draftSignature !== savedSignature;

  const save = async () => {
    if (!planDirty) {
      showToast('Plan already saved on this phone.');
      return;
    }
    const next = {
      ...draft,
      members: cleanMembers(),
      updatedAt: new Date().toISOString(),
    };
    await onSave(next);
    setDraft(next);
    onTrack('parade_plan_saved', {
      members_count: next.members.length,
      has_leave_plan: Boolean(next.leavePlan?.trim()),
    });
    hapticConfirm();
    showToast('Saved to this device.', 'success');
  };

  const share = async () => {
    const next = ensurePlanRoom({
      ...draft,
      members: cleanMembers(),
      roleHint: 'join',
      updatedAt: new Date().toISOString(),
    });
    await onSave(next);
    setDraft(next);
    const fragment = await encodePlan(next);
    setShareUrl(buildShareRunUrl({ fragment }));
    setShareMode('group');
    setSheetOpen(true);
    onTrack('parade_plan_share_opened', {
      members_count: next.members.length,
      has_leave_plan: Boolean(next.leavePlan?.trim()),
    });
    hapticConfirm();
  };

  const startGroup = async () => {
    const base = createDefaultGroupPlan(pack);
    const next = ensurePlanRoom({
      ...base,
      name: displayName && displayName !== 'Me' ? `${displayName}'s parade group` : base.name,
      members: [localMemberName],
      roleHint: 'join',
      updatedAt: new Date().toISOString(),
    });
    await onSave(next);
    setDraft(next);
    setMembersText(localMemberName);
    setDraftHydrated(true);
    setShowMore(false);
    onTrack('parade_plan_saved', {
      members_count: 1,
      has_leave_plan: Boolean(next.leavePlan?.trim()),
      started_from_empty: true,
    });
    hapticConfirm();
    showToast('Group started. Set the meeting point, then invite friends.', 'success');
  };

  const joinFromDraft = async () => {
    const fragment = extractShareFragment(joinDraft);
    const decoded = await decodePlan(fragment);
    if (!decoded) {
      showToast('Paste a Parade Companion group invite link.', 'warn');
      return;
    }
    const next = addLocalMemberToPlan(
      normalizePlanForLocalDevice(decoded, localMemberName, supporterTag),
      localMemberName,
    );
    await onSave(next);
    setDraft(next);
    setMembersText(next.members.join(', '));
    setDraftHydrated(true);
    setJoinDraft('');
    setJoinSheetOpen(false);
    setShowMore(false);
    onTrack('parade_plan_import_saved', {
      members_count: next.members.length,
      has_leave_plan: Boolean(next.leavePlan?.trim()),
      pasted: true,
    });
    hapticConfirm();
    showToast('Joined group. Plan saved to this phone.', 'success');
  };

  const shareMyDot = async () => {
    const solo = ensurePlanRoom({
      ...createDefaultGroupPlan(pack),
      name: 'Just me',
      members: [localMemberName],
      roleHint: 'watch',
      updatedAt: new Date().toISOString(),
    });
    await onSave(solo);
    setDraft(solo);
    setMembersText(localMemberName);
    setDraftHydrated(true);
    const fragment = await encodePlan(solo);
    setShareUrl(buildShareRunUrl({ fragment }));
    setShareMode('dot');
    setSheetOpen(true);
    onTrack('parade_plan_share_opened', {
      members_count: 1,
      has_leave_plan: Boolean(solo.leavePlan?.trim()),
    });
    hapticConfirm();
    showToast('Share my dot QR ready.', 'success');
  };

  const shareApp = () => {
    setShareUrl(buildShareRunUrl());
    setShareMode('app');
    setSheetOpen(true);
    onTrack('parade_plan_share_opened', {
      members_count: 0,
      has_leave_plan: false,
      share_kind: 'app',
    });
    hapticConfirm();
  };

  const onSignal = (preset: ChatPreset) => {
    addGroupEvent({
      kind: 'group_signal',
      source_id: localSourceId,
      display_name: displayName || 'Me',
      supporter_tag: supporterTag,
      preset,
    });
    setEvents(listGroupEvents());
    onTrack('parade_group_signal', { preset });
    hapticConfirm();
    showToast(`Signal: ${CHAT_PRESET_LABEL[preset]}`, 'success');
  };

  // Solo state — no plan yet. Identity card collapses to the "Just you" mode
  // with Share my dot. Side tings still visible so a solo user can watch others.
  if (!visiblePlan) {
    return (
      <section className="screen group-hub">
        <GroupIdentityCard
          name="Just you"
          memberCount={0}
          solo
          onShowInvite={() => void shareMyDot()}
          onStartGroup={() => void startGroup()}
          onJoinInvite={() => setJoinSheetOpen(true)}
          onShareApp={shareApp}
          displayName={displayName}
          supporterTag={supporterTag}
          onEditName={onEditName}
        />
        <SideTingsCard
          refreshKey={sideTingsRefresh}
          onChange={onSideTingsRefresh}
          onAdd={onAddSideTing}
        />
        {joinSheetOpen ? (
          <div className="side-ting-sheet" role="dialog" aria-modal="true" aria-labelledby="join-group-title" onClick={() => setJoinSheetOpen(false)}>
            <div className="side-ting-sheet__surface" onClick={(event) => event.stopPropagation()}>
              <h2 id="join-group-title">Join a group</h2>
              <p className="side-ting-sheet__copy">
                Paste a group invite link. It saves the meeting plan to this phone and adds your name locally.
              </p>
              <label className="name-field">
                Invite link
                <textarea
                  rows={4}
                  value={joinDraft}
                  onChange={(event) => setJoinDraft(event.currentTarget.value)}
                  placeholder="https://shippie.app/run/parade-companion/#..."
                />
              </label>
              <div className="side-ting-sheet__actions">
                <button type="button" className="secondary-action" onClick={() => setJoinSheetOpen(false)}>
                  Cancel
                </button>
                <button type="button" className="primary-action" onClick={() => void joinFromDraft()}>
                  Join group
                </button>
              </div>
            </div>
          </div>
        ) : null}
        <QrShareSheet
          open={sheetOpen}
          url={shareUrl}
          title={shareMode === 'app' ? 'Share the app' : 'Share your dot'}
          body={shareMode === 'app'
            ? 'This opens the parade app only. It does not add anyone to your group.'
            : 'This is your dot invite. Friends tap Join to save it and see your live dot when signal appears.'}
          size={260}
          onClose={() => setSheetOpen(false)}
        />
      </section>
    );
  }

  return (
    <section className="screen group-hub">
      <GroupIdentityCard
        name={visiblePlan.name}
        memberCount={visiblePlan.members.length}
        updatedAtIso={visiblePlan.updatedAt}
        onShowInvite={() => void share()}
        onShareApp={shareApp}
      />

      <div className="panel plan-card">
        <h2>Plan</h2>
        <form className="plan-card__form" onSubmit={(event) => event.preventDefault()}>
          <label>
            Group name
            <input
              value={draft.name}
              onChange={(event) => updateDraft({ name: event.currentTarget.value })}
              maxLength={64}
            />
          </label>
          <label>
            Primary point
            <select
              value={primaryId}
              onChange={(event) => updatePoint('primary', event.currentTarget.value)}
            >
              {landmarks.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.label}
                </option>
              ))}
            </select>
          </label>
          <label>
            Primary time
            <input
              value={draft.primary.time ?? ''}
              onChange={(event) =>
                updateDraft({ primary: { ...draft.primary, time: event.currentTarget.value } })
              }
              placeholder="13:00"
            />
          </label>
          {showMore ? (
            <>
              <label>
                People
                <input
                  value={membersText}
                  onChange={(event) => setMembersText(event.currentTarget.value)}
                  placeholder="Names, separated by commas"
                />
              </label>
              <label>
                Fallback point
                <select
                  value={fallbackId}
                  onChange={(event) => updatePoint('fallback', event.currentTarget.value)}
                >
                  {landmarks.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.label}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                If separated
                <textarea
                  value={draft.ifSeparated}
                  onChange={(event) => updateDraft({ ifSeparated: event.currentTarget.value })}
                  rows={3}
                />
              </label>
              <label>
                Leave plan
                <textarea
                  value={draft.leavePlan ?? ''}
                  onChange={(event) => updateDraft({ leavePlan: event.currentTarget.value })}
                  rows={2}
                />
              </label>
            </>
          ) : null}
        </form>
        <div className="plan-card__actions">
          <button
            type="button"
            className="primary-action"
            onClick={() => void save()}
            disabled={!planDirty}
          >
            Save
          </button>
          <button
            type="button"
            className="plan-card__more"
            aria-expanded={showMore}
            onClick={() => setShowMore((current) => !current)}
          >
            {showMore ? 'Less' : 'More'}
          </button>
        </div>
      </div>

      <GroupMembersCard members={visiblePlan.members} liveMembers={groupLiveMembers} liveStatus={groupLiveStatus} />

      <GroupChatCard
        events={events}
        onSignal={onSignal}
        localSourceId={localSourceId}
        displayName={displayName || 'Me'}
        supporterTag={supporterTag}
      />

      <SideTingsCard
        refreshKey={sideTingsRefresh}
        onChange={onSideTingsRefresh}
        onAdd={onAddSideTing}
      />

      <QrShareSheet
        open={sheetOpen}
        url={shareUrl}
        title={shareMode === 'app' ? 'Share the app' : 'Invite to your group'}
        body={shareMode === 'app'
          ? 'This opens the parade app only. It will not add anyone to your group.'
          : 'Group invite. Friends tap Join to save the plan and show their live dot when Location is on.'}
        size={260}
        onClose={() => setSheetOpen(false)}
      />
    </section>
  );
}

function closestLandmarkId(
  landmarks: RoutePack['meetingLandmarks'],
  point: PlanPoint,
): string {
  let best = landmarks[0]?.id ?? '';
  let bestScore = Number.POSITIVE_INFINITY;
  for (const landmark of landmarks) {
    const score = Math.abs(landmark.lng - point.lng) + Math.abs(landmark.lat - point.lat);
    if (score < bestScore) {
      best = landmark.id;
      bestScore = score;
    }
  }
  return best;
}

function parseMembers(value: string): string[] {
  return value.split(',').map((m) => m.trim()).filter(Boolean).slice(0, 12);
}

function normalizePlanForLocalDevice(
  plan: GroupPlan,
  localMemberName: string,
  supporterTag: string,
): GroupPlan {
  const members = normalizeMembersForLocalDevice(plan.members, localMemberName, supporterTag);
  if (sameStringList(plan.members, members)) return plan;
  return { ...plan, members };
}

function normalizeMembersForLocalDevice(
  members: string[],
  localMemberName: string,
  supporterTag: string,
): string[] {
  const tag = supporterTag.trim().toUpperCase();
  const tagPattern = tag ? new RegExp(`#?${escapeRegExp(tag)}\\b`, 'i') : null;
  const cleaned = members
    .map((member) => member.trim())
    .filter(Boolean)
    .map((member) => {
      const lower = member.toLowerCase();
      if (lower === 'me' || lower.startsWith('me #')) return localMemberName;
      if (tagPattern?.test(member)) return localMemberName;
      return member;
    });

  if (cleaned.length === 0) cleaned.push(localMemberName);

  const deduped: string[] = [];
  const seen = new Set<string>();
  for (const member of cleaned) {
    const key = member.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(member);
  }
  return deduped.slice(0, 12);
}

function addLocalMemberToPlan(plan: GroupPlan, localMemberName: string): GroupPlan {
  const key = localMemberName.toLowerCase();
  if (plan.members.some((member) => member.toLowerCase() === key)) return plan;
  return { ...plan, members: [...plan.members, localMemberName].slice(0, 12) };
}

function sameStringList(left: string[], right: string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function planSignature(plan: GroupPlan): string {
  return JSON.stringify({
    name: plan.name.trim(),
    members: plan.members.map((member) => member.trim()).filter(Boolean),
    primary: normalizePoint(plan.primary),
    fallback: normalizePoint(plan.fallback),
    ifSeparated: plan.ifSeparated.trim(),
    leavePlan: (plan.leavePlan ?? '').trim(),
  });
}

function extractShareFragment(input: string): string {
  const trimmed = input.trim();
  const hashIndex = trimmed.indexOf('#');
  return hashIndex === -1 ? trimmed.replace(/^#/, '') : trimmed.slice(hashIndex + 1);
}

function normalizePoint(point: PlanPoint) {
  return {
    label: point.label.trim(),
    time: (point.time ?? '').trim(),
    lng: Number(point.lng.toFixed(6)),
    lat: Number(point.lat.toFixed(6)),
  };
}
