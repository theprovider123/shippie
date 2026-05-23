import { QrShareSheet } from '@shippie/showcase-kit-v2';
import { useMemo, useState } from 'react';
import { ShareMyDotEmptyState } from '../components/ShareMyDotEmptyState';
import { SideTingsCard } from '../components/SideTingsCard';
import type { RoutePack } from '../data/parade-2026';
import {
  createDefaultGroupPlan,
  encodePlan,
  ensurePlanRoom,
  pointFromLandmark,
  type GroupPlan,
  type PlanPoint,
} from '../lib/group-plan';
import type { ParadeAnalyticsEvent } from '../lib/analytics';
import { hapticConfirm } from '../lib/haptic';
import { showToast } from '../lib/toast';

interface PlanScreenProps {
  pack: RoutePack;
  plan: GroupPlan | null;
  onSave: (plan: GroupPlan) => Promise<void>;
  onTrack: (event: ParadeAnalyticsEvent, props?: Record<string, string | number | boolean | null>) => void;
  sideTingsRefresh?: number;
  onSideTingsRefresh: () => void;
}

export function PlanScreen({ pack, plan, onSave, onTrack, sideTingsRefresh, onSideTingsRefresh }: PlanScreenProps) {
  const [draft, setDraft] = useState<GroupPlan>(() => plan ?? createDefaultGroupPlan(pack));
  const [membersText, setMembersText] = useState(() => (plan?.members ?? []).join(', '));
  const [shareUrl, setShareUrl] = useState('');
  const [sheetOpen, setSheetOpen] = useState(false);
  const [status, setStatus] = useState('');
  const landmarks = pack.meetingLandmarks;

  const primaryId = useMemo(() => closestLandmarkId(landmarks, draft.primary), [landmarks, draft.primary]);
  const fallbackId = useMemo(() => closestLandmarkId(landmarks, draft.fallback), [landmarks, draft.fallback]);

  const updateDraft = (patch: Partial<GroupPlan>) => {
    setDraft((current) => ({ ...current, ...patch, updatedAt: new Date().toISOString() }));
  };

  const updatePoint = (key: 'primary' | 'fallback', id: string) => {
    const landmark = landmarks.find((item) => item.id === id);
    if (!landmark) return;
    updateDraft({ [key]: { ...pointFromLandmark(landmark, draft[key].label), time: draft[key].time } } as Partial<GroupPlan>);
  };

  const save = async () => {
    const next = {
      ...draft,
      members: membersText
        .split(',')
        .map((member) => member.trim())
        .filter(Boolean)
        .slice(0, 12),
      updatedAt: new Date().toISOString(),
    };
    await onSave(next);
    setDraft(next);
    setStatus('Saved to this device.');
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
      members: membersText
        .split(',')
        .map((member) => member.trim())
        .filter(Boolean)
        .slice(0, 12),
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
    showToast('Share QR ready.', 'success');
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
    const fragment = await encodePlan(solo);
    setShareUrl(`${window.location.origin}/run/parade-companion/#${fragment}`);
    setSheetOpen(true);
    setStatus('Solo dot saved to this device.');
    onTrack('parade_plan_share_opened', {
      members_count: 1,
      has_leave_plan: Boolean(solo.leavePlan?.trim()),
    });
    hapticConfirm();
    showToast('Share my dot QR ready.', 'success');
  };

  return (
    <section className="screen plan-screen">
      <div className="screen-heading">
        <p className="eyebrow">Snapshot plan</p>
        <h1>Plan</h1>
        <p>Make the plan while you still have signal. The shared link stores the plan in the URL fragment, not on a server.</p>
      </div>

      {!plan ? <ShareMyDotEmptyState onShare={() => void shareMyDot()} /> : null}

      <form className="form-stack" onSubmit={(event) => event.preventDefault()}>
        <label>
          Group name
          <input
            value={draft.name}
            onChange={(event) => updateDraft({ name: event.currentTarget.value })}
            maxLength={64}
          />
        </label>
        <label>
          People
          <input
            value={membersText}
            onChange={(event) => setMembersText(event.currentTarget.value)}
            placeholder="Names, separated by commas"
          />
        </label>
        <label>
          Primary point
          <select value={primaryId} onChange={(event) => updatePoint('primary', event.currentTarget.value)}>
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
            onChange={(event) => updateDraft({ primary: { ...draft.primary, time: event.currentTarget.value } })}
            placeholder="13:00"
          />
        </label>
        <label>
          Fallback point
          <select value={fallbackId} onChange={(event) => updatePoint('fallback', event.currentTarget.value)}>
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
      </form>

      <div className="action-row">
        <button type="button" className="primary-action" onClick={() => void save()}>
          Save plan
        </button>
        <button type="button" className="secondary-action" onClick={() => void share()}>
          Share QR
        </button>
      </div>
      {status ? <p className="inline-status">{status}</p> : null}

      <div className="panel">
        <h2>Remember</h2>
        <p>This is a snapshot. If you change the plan, share a fresh QR or link with everyone.</p>
      </div>

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
        body="Scan before you go. This works offline after it is saved."
        onClose={() => setSheetOpen(false)}
      />
    </section>
  );
}

function closestLandmarkId(landmarks: RoutePack['meetingLandmarks'], point: PlanPoint): string {
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
