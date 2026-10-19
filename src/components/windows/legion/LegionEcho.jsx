/* eslint-disable no-unused-vars -- JSX references are not detected by the legacy lint config. */
import React from 'react';
import { GAMEPLAN_LABELS, legionApi, roleName } from '../../../lib/legion/legionState.js';
import { LegionChecks, LegionSpec } from './LegionQueue.jsx';

function Shot({ runId, shot }) {
  if (!shot) return <p className="hb-legion-hint">The browser has not looked yet.</p>;
  if (!shot.shot) return <p className="hb-legion-hint">{shot.reason}</p>;
  return (
    <figure className="hb-legion-shot">
      <img src={legionApi.shotUrl(runId, shot.shot)} alt={`What Echo saw in round ${shot.round + 1}`} />
      <figcaption>
        Round {shot.round + 1}: {shot.page}
        {shot.errors?.length ? <span className="hb-legion-shot-errors"> · {shot.errors.length} script error{shot.errors.length === 1 ? '' : 's'}</span> : null}
      </figcaption>
    </figure>
  );
}

function Gameplan({ plan }) {
  const rows = Object.entries(GAMEPLAN_LABELS).filter(([key]) => plan?.gameplan?.[key]);
  if (!rows.length) return null;
  return (
    <details className="hb-legion-card" open>
      <summary>Gameplan</summary>
      <dl className="hb-legion-plan">
        {rows.map(([key, label]) => <React.Fragment key={key}><dt>{label}</dt><dd>{plan.gameplan[key]}</dd></React.Fragment>)}
      </dl>
    </details>
  );
}

function Reflection({ reflection }) {
  if (!reflection) return null;
  return (
    <details className="hb-legion-card" open>
      <summary>Post-project reflection</summary>
      {reflection.learned && <p className="hb-legion-text"><strong>Learned:</strong> {reflection.learned}</p>}
      <ul className="hb-legion-reflect">
        {reflection.agents.map((a, i) => (
          <li key={i}>
            <strong>{roleName(a.role.toLowerCase())}</strong>
            {a.positives.map((p, j) => <span key={j} className="hb-legion-plus">+ {p}</span>)}
            {a.negative && <span className="hb-legion-minus">− {a.negative}</span>}
          </li>
        ))}
      </ul>
    </details>
  );
}

/** Echo's eyes: the latest screenshot, the outcome, the gameplan, the reflection. */
export function LegionEcho({ runId, state, run }) {
  const shot = state.shots[state.shots.length - 1];
  const page = shot?.page;
  return (
    <aside className="hb-legion-side" aria-label="What Echo sees">
      <span className="hb-legion-label">What the Validation Engine sees</span>
      <Shot runId={runId} shot={shot} />
      {state.end && (
        <div className="hb-legion-outcome" data-status={state.end.status}>
          {state.end.status === 'done' && <>Echo said OK{state.commit?.committed ? `. Committed ${state.commit.sha}.` : state.commit?.error ? `. Not committed: ${state.commit.error}.` : '.'}</>}
          {state.end.status === 'unfinished' && <>Echo still said NOK after the last fix round, so nothing was committed.</>}
          {state.end.status === 'stopped' && <>Stopped.</>}
          {state.end.status === 'error' && <>Stopped on an error: {state.end.error}</>}
          {page && run?.viewToken && <a className="hb-legion-open" href={legionApi.viewUrl(runId, run.viewToken, page)} target="_blank" rel="noreferrer">Open what it built</a>}
        </div>
      )}
      {!state.end && run?.status === 'running' && <p className="hb-legion-hint">Working. You can close this window; the Legion keeps going.</p>}
      <LegionChecks checks={state.checks} />
      <LegionSpec spec={state.spec} />
      <Gameplan plan={state.plan} />
      <Reflection reflection={state.reflection} />
    </aside>
  );
}
