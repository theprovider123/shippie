import type { CrewtripState, Role } from '../types';
import { Icon } from './Icon';

/**
 * Shown on the Trip tab while the trip is fresh (host has not yet
 * invited the crew, added a stop, or seen a memory drop). Three checkable
 * steps that disappear when complete. Designed to land before the host
 * has done any setup so the value of the app reads in 5 seconds.
 */
interface OnboardingCardProps {
  state: CrewtripState;
  role: Role;
  features: CrewtripState['features'];
  syncPeers: number;
  onShare: () => void;
  onAddStop: () => void;
  onAddMemory: () => void;
}

interface Step {
  id: string;
  done: boolean;
  label: string;
  detail: string;
  cta: string;
  onClick: () => void;
}

export function OnboardingCard(props: OnboardingCardProps) {
  const crewJoined = props.state.players.length > 1 || props.syncPeers > 0;
  const hasStop = props.state.stops.length > 0;
  const hasMemory = props.state.memories.length > 0;
  const hasCrewRequest = props.state.requests.length > 0;

  const steps: Step[] = props.role === 'host'
    ? [
        {
          id: 'invite',
          done: crewJoined,
          label: 'Invite the crew',
          detail: 'Share the join code so everyone lands in the same trip.',
          cta: 'Share',
          onClick: props.onShare,
        },
        props.features.plan ? {
          id: 'plan',
          done: hasStop,
          label: 'Add the first plan',
          detail: 'A meet point, a meal, a sunset spot — anything to anchor the day.',
          cta: 'Add',
          onClick: props.onAddStop,
        } : null,
        props.features.memories ? {
          id: 'memory',
          done: hasMemory,
          label: 'Drop the first memory',
          detail: 'A quote, a photo, a tiny moment worth keeping.',
          cta: 'Save',
          onClick: props.onAddMemory,
        } : null,
      ].filter(Boolean) as Step[]
    : [
        props.features.requests ? {
          id: 'request',
          done: hasCrewRequest,
          label: 'Ask the host',
          detail: 'Request a plan, vote, song, game, or useful change.',
          cta: 'Ask',
          onClick: props.onAddStop,
        } : null,
        props.features.memories ? {
          id: 'memory',
          done: hasMemory,
          label: 'Add a memory',
          detail: 'Save a quote, photo, or tiny moment from your side of the trip.',
          cta: 'Save',
          onClick: props.onAddMemory,
        } : null,
      ].filter(Boolean) as Step[];

  const allDone = steps.every((step) => step.done);
  if (allDone) return null;

  return (
    <article className="onboarding-card">
      <header>
        <p className="eyebrow">{props.role === 'host' ? 'Get the trip moving' : 'Crew mode'}</p>
        <h3>{props.role === 'host' ? 'The first 60 seconds.' : 'Your first 60 seconds.'}</h3>
      </header>
      <ol>
        {steps.map((step) => (
          <li key={step.id} className={step.done ? 'done' : ''}>
            <span className="onboarding-check" aria-hidden="true">
              {step.done ? <Icon name="check" size={14} /> : null}
            </span>
            <div>
              <strong>{step.label}</strong>
              <small>{step.detail}</small>
            </div>
            {step.done ? null : (
              <button type="button" onClick={step.onClick}>{step.cta}</button>
            )}
          </li>
        ))}
      </ol>
    </article>
  );
}
