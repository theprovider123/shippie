import type { CSSProperties } from 'react';
import { GROUPS, TEAMS, teamByCode } from '../data/tournament.ts';

export function TournamentStructure() {
  return (
    <section className="tournament-structure">
      <div className="panel-head">
        <h2>Tournament structure</h2>
        <span>48 teams · 104 matches</span>
      </div>
      <div className="structure-steps" aria-label="Tournament route">
        <Step value="12" label="groups" />
        <Step value="72" label="group games" />
        <Step value="32" label="knockout teams" />
        <Step value="1" label="winner" />
      </div>
      <p className="muted">Top two in each group plus eight third-place teams enter the Round of 32.</p>
      <details className="structure-drawer">
        <summary>
          <span>All groups</span>
          <strong>See Groups A-L</strong>
        </summary>
        <div className="group-ladder" aria-label="Groups A to L">
          {Object.entries(GROUPS).map(([group, codes]) => {
            const firstTeam = teamByCode(codes[0] ?? 'MEX');
            const secondTeam = teamByCode(codes[1] ?? firstTeam.code);
            return (
              <article
                key={group}
                style={{
                  '--swatch-a': firstTeam.swatch[0],
                  '--swatch-b': secondTeam.swatch[0],
                } as CSSProperties}
              >
                <strong>Group {group}</strong>
                {codes.map((code) => {
                  const team = teamByCode(code);
                  return (
                    <span key={code} style={{ '--swatch-a': team.swatch[0], '--swatch-b': team.swatch[1] } as CSSProperties}>
                      <i />
                      <b>{team.code}</b>
                      <em>{team.name}</em>
                    </span>
                  );
                })}
              </article>
            );
          })}
        </div>
      </details>
      <p className="muted">{TEAMS.length} nations are mapped into group, wall-chart, sweepstake, trivia, and follow-team surfaces.</p>
    </section>
  );
}

function Step(props: { value: string; label: string }) {
  return (
    <div>
      <strong>{props.value}</strong>
      <span>{props.label}</span>
    </div>
  );
}
