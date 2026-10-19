/* eslint-disable no-unused-vars -- JSX references are not detected by the legacy lint config. */
import React from 'react';
import { familyName } from '../../lib/modelStrengths/strengths.js';

/**
 * The "why this model" note above the composer: which model Auto-pick chose
 * for the last message and why. Picking a model from the chip overrides it.
 */
export function AutoPickNote({ pick, onTurnOff }) {
  if (!pick) return null;
  return (
    <div className="hb-autopick-note" data-testid="autopick-note" role="status">
      <div className="hb-autopick-head">
        {pick.keep
          ? <span>Auto-pick kept <strong>{pick.model || 'the current model'}</strong></span>
          : <span>Auto-picked <strong>{familyName(pick.family)}</strong> ({pick.model}) for {pick.strength}</span>}
        <button type="button" className="hb-autopick-off" onClick={onTurnOff}>Turn off</button>
      </div>
      <div className="hb-autopick-why"><span className="hb-autopick-label">Why this model:</span> {pick.why}</div>
      <div className="hb-autopick-hint">Want a different one? Pick it from the model button below and Auto-pick turns off.</div>
    </div>
  );
}
