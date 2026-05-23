import { QrShareSheet } from '@shippie/showcase-kit-v2';
import { useMemo, useState } from 'react';
import type { RoutePack } from '../data/parade-2026';
import {
  createDefaultGroupPlan,
  encodePlan,
  pointFromLandmark,
  type GroupPlan,
  type PlanPoint,
} from '../lib/group-plan';

interface PlanScreenProps {
  pack: RoutePack;
  plan: GroupPlan | null;
  pendingImport: GroupPlan | null;
  onSave: (plan: GroupPlan) => Promise<void>;
  onClearImport: () => void;
}

export function PlanScreen({ pack, plan, pendingImport, onSave, onClearImport }: PlanScreenProps) {
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
    if ('vibrate' in navigator) navigator.vibrate(25);
  };

  const share = async () => {
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
    const fragment = await encodePlan(next);
    setShareUrl(`${window.location.origin}/run/parade-companion/#${fragment}`);
    setSheetOpen(true);
  };

  const acceptImport = async () => {
    if (!pendingImport) return;
    await onSave(pendingImport);
    setDraft(pendingImport);
    setMembersText(pendingImport.members.join(', '));
    onClearImport();
    setStatus('Imported plan saved to this device.');
  };

  return (
    <section className="screen plan-screen">
      <div className="screen-heading">
        <p className="eyebrow">Snapshot plan</p>
        <h1>Plan</h1>
        <p>Make the plan while you still have signal. The shared link stores the plan in the URL fragment, not on a server.</p>
      </div>

      {pendingImport ? (
        <div className="import-banner">
          <div>
            <strong>Plan link found</strong>
            <span>{pendingImport.name}</span>
          </div>
          <button type="button" onClick={() => void acceptImport()}>
            Save
          </button>
          <button type="button" className="ghost" onClick={onClearImport}>
            Ignore
          </button>
        </div>
      ) : null}

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
