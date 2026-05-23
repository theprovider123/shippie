import { useEffect, useState, type CSSProperties } from 'react';
import { TEAMS, teamByCode, teamProfileByCode } from '../data/tournament.ts';
import { LOCALE_LABELS, type Locale } from '../i18n.ts';
import type { MatchRoomThemeMode, UserProfile } from '../shared/local-store.ts';
import { TimeZonePicker } from './TimeZonePicker.tsx';

const THEME_OPTIONS: Array<{ value: MatchRoomThemeMode; label: string; hint: string }> = [
  { value: 'team', label: 'My team', hint: 'Flag colours everywhere' },
  { value: 'city', label: 'Match city', hint: 'Host-city paper accents' },
  { value: 'paper', label: 'Classic', hint: 'Shippie paper and green' },
  { value: 'pitch', label: 'Dark pitch', hint: 'Night-match mode' },
];

export function ProfileSettings(props: {
  profile: UserProfile;
  locale: Locale;
  timeZone: string;
  onProfileChange: (profile: Partial<Omit<UserProfile, 'updatedAt'>>) => void;
  onLocaleChange: (locale: Locale) => void;
  onTimeZoneChange: (timeZone: string) => void;
  variant?: 'panel' | 'chip';
}) {
  const [open, setOpen] = useState(props.variant === 'panel');

  // a11y: close the settings sheet on Escape when it's open as an overlay.
  useEffect(() => {
    if (!open || props.variant === 'panel') return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, props.variant]);
  const [teamFilter, setTeamFilter] = useState('');
  const primaryTeam = teamByCode(props.profile.primaryTeam);
  const primaryProfile = teamProfileByCode(primaryTeam.code);
  const shownTeams = TEAMS.filter((team) => {
    const needle = teamFilter.trim().toLowerCase();
    if (!needle) return true;
    return `${team.name} ${team.code} ${team.group}`.toLowerCase().includes(needle);
  }).slice(0, teamFilter ? 48 : 12);

  const update = (next: Partial<Omit<UserProfile, 'updatedAt'>>) => props.onProfileChange(next);

  const selectPrimaryTeam = (code: string) => {
    const followedTeams = [code, ...props.profile.followedTeams.filter((teamCode) => teamCode !== code)].slice(0, 8);
    update({ primaryTeam: code, followedTeams });
  };

  const toggleFollowedTeam = (code: string) => {
    if (code === props.profile.primaryTeam) return;
    const exists = props.profile.followedTeams.includes(code);
    update({
      followedTeams: exists
        ? props.profile.followedTeams.filter((teamCode) => teamCode !== code)
        : [...props.profile.followedTeams, code].slice(0, 8),
    });
  };

  const settingsPanel = (
    <section className="profile-settings" aria-label="Match identity settings">
      {props.variant === 'panel' ? (
        <div className="passport-steps" aria-label="Tournament passport setup">
          <span>Name</span>
          <span>Team</span>
          <span>Region</span>
          <span>Theme</span>
        </div>
      ) : null}
      <div className="profile-hero" style={{ '--swatch-a': primaryTeam.swatch[0], '--swatch-b': primaryTeam.swatch[1] } as CSSProperties}>
        <span className="flag-cloth" />
        <div>
          <small>Match identity</small>
          <strong>{props.profile.displayName || 'Your match name'}</strong>
          <em>{primaryTeam.name} · Group {primaryTeam.group} · {primaryProfile.region}</em>
        </div>
      </div>

      <div className="profile-form-grid">
        <label>
          Username
          <input
            value={props.profile.displayName}
            placeholder="Your name in rooms"
            onChange={(event) => update({ displayName: event.currentTarget.value })}
          />
        </label>
        <label>
          Language
          <select value={props.locale} onChange={(event) => {
            const next = event.currentTarget.value as Locale;
            props.onLocaleChange(next);
            update({ locale: next });
          }}>
            {(Object.keys(LOCALE_LABELS) as Locale[]).map((item) => (
              <option key={item} value={item}>{LOCALE_LABELS[item]}</option>
            ))}
          </select>
        </label>
        <TimeZonePicker
          label="Local region"
          value={props.timeZone}
          onChange={(next) => {
            props.onTimeZoneChange(next);
            update({ timeZone: next });
          }}
        />
        <label>
          Primary team
          <select value={props.profile.primaryTeam} onChange={(event) => selectPrimaryTeam(event.currentTarget.value)}>
            {TEAMS.map((team) => (
              <option key={team.code} value={team.code}>{team.name}</option>
            ))}
          </select>
        </label>
      </div>

      <div className="theme-choice-grid" role="radiogroup" aria-label="App theme">
        {THEME_OPTIONS.map((option) => (
          <button
            key={option.value}
            type="button"
            className={props.profile.themeMode === option.value ? 'selected' : ''}
            aria-pressed={props.profile.themeMode === option.value}
            onClick={() => update({ themeMode: option.value })}
          >
            <strong>{option.label}</strong>
            <span>{option.hint}</span>
          </button>
        ))}
      </div>

      <div className="team-picker">
        <div className="panel-head">
          <h3>Teams to follow</h3>
          <span>{props.profile.followedTeams.length} selected</span>
        </div>
        <input value={teamFilter} placeholder="Search teams" onChange={(event) => setTeamFilter(event.currentTarget.value)} />
        <div className="team-pick-grid">
          {shownTeams.map((team) => {
            const selected = props.profile.followedTeams.includes(team.code);
            return (
              <button
                key={team.code}
                type="button"
                className={selected ? 'selected' : ''}
                title={team.name}
                aria-label={`${selected ? 'Make primary team' : 'Follow'} ${team.name}`}
                style={{ '--swatch-a': team.swatch[0], '--swatch-b': team.swatch[1] } as CSSProperties}
                onClick={() => selected ? selectPrimaryTeam(team.code) : toggleFollowedTeam(team.code)}
                onDoubleClick={() => selectPrimaryTeam(team.code)}
              >
                <span className="flag-cloth" />
                <strong>{team.code}</strong>
                <em>{team.name}</em>
              </button>
            );
          })}
        </div>
        <p className="muted">Tap once to follow a team. Tap a followed team to make it your primary identity.</p>
      </div>
    </section>
  );

  if (props.variant === 'panel') {
    return settingsPanel;
  }

  return (
    <>
      <button
        type="button"
        className="profile-chip"
        style={{ '--swatch-a': primaryTeam.swatch[0], '--swatch-b': primaryTeam.swatch[1] } as CSSProperties}
        onClick={() => setOpen(true)}
      >
        <span className="flag-cloth" aria-hidden="true" />
        <strong>{props.profile.displayName || 'Profile'}</strong>
        <em>{primaryTeam.code}</em>
      </button>
      {open ? (
        <div className="settings-backdrop" role="presentation" onMouseDown={(event) => {
          if (event.target === event.currentTarget) setOpen(false);
        }}>
          <div className="settings-sheet" role="dialog" aria-modal="true" aria-label="Match identity">
            <div className="panel-head">
              <h2>Settings</h2>
              <button type="button" aria-label="Close settings" onClick={() => setOpen(false)}>Done</button>
            </div>
            {settingsPanel}
          </div>
        </div>
      ) : null}
    </>
  );
}
