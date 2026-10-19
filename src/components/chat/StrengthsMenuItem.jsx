/* eslint-disable no-unused-vars -- JSX references are not detected by the legacy lint config. */
import React from 'react';
import { FAMILIES, STRENGTHS } from '../../lib/modelStrengths/strengths.js';

/** The Auto-pick switch at the top of the model menu, with Alex's strengths list under it. */
export function StrengthsMenuItem({ on, onToggle }) {
  return (
    <div className="hb-autopick-menu">
      <button type="button" role="menuitemcheckbox" aria-checked={on} className="hb-model-item hb-autopick-toggle"
        data-testid="autopick-toggle" onClick={() => onToggle(!on)}>
        <span>Auto-pick by strengths</span>
        <span className="hb-autopick-state">{on ? 'On' : 'Off'}</span>
      </button>
      <div className="hb-autopick-sub">Each message goes to the AI best at that kind of task, from this list and your Benchmarks. Only AIs you have a key for.</div>
      <ul className="hb-autopick-list">
        {FAMILIES.map((f) => (
          <li key={f.id} data-family={f.id}>
            <strong>{f.name}</strong>
            <span>{f.strengths.map((s) => STRENGTHS[s].label).join(' · ')}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
