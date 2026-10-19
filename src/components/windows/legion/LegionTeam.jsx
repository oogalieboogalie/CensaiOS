/* eslint-disable no-unused-vars -- JSX references are not detected by the legacy lint config. */
import React from 'react';
import { LEGION_PHASES, LEGION_ROLES } from '../../../lib/legion/legionState.js';

const STATUS_WORDS = { working: 'Working', done: 'Done', skipped: 'Skipped', error: 'Stopped on an error' };

/** The phase rail: Spec, Work Queue, Synthesis, Validation, Fix, Commit, Reflect. */
export function LegionPhases({ phase, round, end }) {
  const at = LEGION_PHASES.findIndex((p) => p.id === phase);
  return (
    <ol className="hb-legion-phases" aria-label="Where the Legion is">
      {LEGION_PHASES.map((p, i) => {
        const state = end && i <= at ? 'done' : i < at ? 'done' : i === at ? 'now' : 'later';
        return (
          <li key={p.id} className="hb-legion-phase" data-state={state}>
            {p.label}{p.id === 'fix' && round > 0 && phase === 'fix' ? ` ${round}` : ''}
          </li>
        );
      })}
    </ol>
  );
}

/** The Legion's eight roles, each with what it is doing right now. */
export function LegionTeam({ roles, models = {} }) {
  return (
    <ul className="hb-legion-team" aria-label="The Legion">
      {LEGION_ROLES.map((r) => {
        const info = roles[r.id] || {};
        const model = info.model || models[r.id]?.model || '';
        return (
          <li key={r.id} className="hb-legion-member" data-role={r.id} data-status={info.status || 'idle'}
            title={info.note || STATUS_WORDS[info.status] || 'Waiting its turn'}>
            <span className="hb-legion-dot" aria-hidden="true" />
            <span className="hb-legion-member-text">
              <span className="hb-legion-member-name">{r.name}</span>
              <span className="hb-legion-member-job">{info.status === 'working' ? 'Working…' : r.job}</span>
              {model && <span className="hb-legion-member-model">{model}</span>}
            </span>
          </li>
        );
      })}
    </ul>
  );
}
