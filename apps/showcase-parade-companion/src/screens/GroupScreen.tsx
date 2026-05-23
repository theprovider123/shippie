import { QrShareSheet } from '@shippie/showcase-kit-v2';
import { useEffect, useMemo, useState } from 'react';
import { GroupChatCard } from '../components/GroupChatCard';
import { GroupIdentityCard } from '../components/GroupIdentityCard';
import { GroupMembersCard } from '../components/GroupMembersCard';
import { SideTingsCard } from '../components/SideTingsCard';
import type { RoutePack } from '../data/parade-2026';
import type { ParadeAnalyticsEvent } from '../lib/analytics';
import { CHAT_PRESET_LABEL, type ChatPreset } from '../lib/chat-presets';
import {
  addGroupEvent,
  getOrCreateSourceId,
  listGroupEvents,
  type GroupEvent,
} from '../lib/group-events';
import {
  createDefaultGroupPlan,
  encodePlan,
  ensurePlanRoom,
  pointFromLandmark,
  type GroupPlan,
  type PlanPoint,
} from '../lib/group-plan';
import { hapticConfirm } from '../lib/haptic';
import { showToast } from '../lib/toast';

interface GroupScreenProps {
  pack: RoutePack;
  plan: GroupPlan | null;
  onSave: (plan: GroupPlan) => Promise<void>;
  onTrack: (event: ParadeAnalyticsEvent, props?: Record<string, string | number | boolean | null>) => void;
  sideTingsRefresh?: number;
  onSideTingsRefresh: () => void;
}

/**
 * Group Hub — one scrollable view with everything for the group: identity +
 * share, plan (progressive disclosure), members (scaffold for live), chat
 * (preset signals + activity feed), and side tings.
 */
export function GroupScreen({
  pack,
  plan,
  onSave,
  onTrack,
  sideTingsRefresh,
  onSideTingsRefresh,
}: GroupScreenProps) {
  const [draft, setDraft] = useState<GroupPlan>(() => plan ?? createDefaultGroupPlan(pack));
  const [membersText, setMembersText] = useState(() => (plan?.members ?? []).join(', '));
  const [draftHydrated, setDraftHydrated] = useState(plan !== null);
  const [shareUrl, setShareUrl] = useState('');
  const [sheetOpen, setSheetOpen] = useState(false);
  const [showMore, setShowMore] = useState(false);
  const [events, setEvents] = useState<GroupEvent[]>(() => listGroupEvents());
  const landmarks = pack.meetingLandmarks;

  // Hydrate the draft once when the plan loads asynchronously (it starts null
  // and arrives from shippie-db on mount). Only fires before the user has
  // edited anything, to avoid clobbering in-progress edits.
  useEffect(() => {
    if (!draftHydrated && plan) {
      setDraft(plan);
      setMembersText(plan.members.join(', '));
      setDraftHydrated(true);
    }
  }, [plan, draftHydrated]);

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

  const cleanMembers = () =>
    membersText.split(',').map((m) => m.trim()).filter(Boolean).slice(0, 12);

  const save = async () => {
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
    setShareUrl(`${window.location.origin}/run/parade-companion/#${fragment}`);
    setSheetOpen(true);
    onTrack('parade_plan_share_opened', {
      members_count: next.members.length,
      has_leave_plan: Boolean(next.leavePlan?.trim()),
    });
    hapticConfirm();
  };

  const shareMyDot = async () => {
    const solo = ensurePlanRoom({
      ...createDefaultGroupPlan(pack),
      name: 'Just me',
      members: ['Me'],
      roleHint: 'watch',
      updatedAt: new Date().toISOString(),
    });
    await onSave(solo);
    setDraft(solo);
    setMembersText('Me');
    setDraftHydrated(true);
    const fragment = await encodePlan(solo);
    setShareUrl(`${window.location.origin}/run/parade-companion/#${fragment}`);
    setSheetOpen(true);
    onTrack('parade_plan_share_opened', {
      members_count: 1,
      has_leave_plan: Boolean(solo.leavePlan?.trim()),
    });
    hapticConfirm();
    showToast('Share my dot QR ready.', 'success');
  };

  const onSignal = (preset: ChatPreset) => {
    const displayName = plan?.members[0] ?? membersText.split(',')[0]?.trim() ?? 'Me';
    addGroupEvent({
      kind: 'group_signal',
      source_id: getOrCreateSourceId(),
      display_name: displayName || 'Me',
      preset,
    });
    setEvents(listGroupEvents());
    onTrack('parade_group_signal', { preset });
    hapticConfirm();
    showToast(`Signal: ${CHAT_PRESET_LABEL[preset]}`, 'success');
  };

  // Solo state — no plan yet. Identity card collapses to the "Just you" mode
  // with Share my dot. Side tings still visible so a solo user can watch others.
  if (!plan) {
    return (
      <section className="screen group-hub">
        <GroupIdentityCard
          name="Just you"
          memberCount={0}
          solo
          onShowInvite={() => void shareMyDot()}
          onShareMyDot={() => void shareMyDot()}
        />
        <SideTingsCard
          refreshKey={sideTingsRefresh}
          onChange={onSideTingsRefresh}
          onAdd={() => {
            showToast("Open a friend's parade QR link, then choose Watch on map.", 'default');
            onSideTingsRefresh();
          }}
        />
        <QrShareSheet
          open={sheetOpen}
          url={shareUrl}
          title="Share your dot"
          body="Friends scan this. They can watch on their map, or join you."
          onClose={() => setSheetOpen(false)}
        />
      </section>
    );
  }

  return (
    <section className="screen group-hub">
      <GroupIdentityCard
        name={plan.name}
        memberCount={plan.members.length}
        updatedAtIso={plan.updatedAt}
        onShowInvite={() => void share()}
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
          <button type="button" className="primary-action" onClick={() => void save()}>
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

      <GroupMembersCard members={plan.members} />

      <GroupChatCard events={events} onSignal={onSignal} />

      <SideTingsCard
        refreshKey={sideTingsRefresh}
        onChange={onSideTingsRefresh}
        onAdd={() => {
          showToast("Open a friend's parade QR link, then choose Watch on map.", 'default');
          onSideTingsRefresh();
        }}
      />

      <QrShareSheet
        open={sheetOpen}
        url={shareUrl}
        title="Share your parade plan"
        body="Scan before you go. This works offline after it's saved."
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
