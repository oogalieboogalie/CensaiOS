/* eslint-disable no-unused-vars -- JSX references are not detected by the legacy lint config. */
import React from 'react';
import { WindowTitle } from '../WindowTitle.jsx';
import { Icon } from '../../Icons.jsx';
import { windowMeta } from './meta.js';
import { TRY_STEPS, clearWelcomeWindows } from './actions.js';

export { windowMeta };

// The "Try this" list from the board's first wake-up: a few one-click steps
// that each show something real, ticked off as they are tried, and one button
// that clears every welcome window at once.
export function TryThisWindow({ win = {}, onUpdate }) {
  const tried = win.tried || {};
  const done = TRY_STEPS.filter((step) => tried[step.id]).length;
  const run = (step) => {
    step.run();
    if (!tried[step.id]) onUpdate?.({ tried: { ...tried, [step.id]: true } });
  };

  return (
    <>
      <WindowTitle icon={<Icon.List size={13} />} label={win.title || windowMeta.label} subtitle={`${done} of ${TRY_STEPS.length} tried`} />
      <div className="hb-try" data-testid="try-this">
        <ol className="hb-try-list">
          {TRY_STEPS.map((step, i) => (
            <li key={step.id}>
              <button type="button" className="hb-try-step" data-done={tried[step.id] ? 'true' : 'false'} onClick={() => run(step)}>
                <span className="hb-try-mark" aria-hidden="true">{tried[step.id] ? <Icon.Check size={12} /> : i + 1}</span>
                <span className="hb-try-text">
                  <span className="hb-try-title">{step.title}</span>
                  <span className="hb-try-detail">{step.detail}</span>
                </span>
                <Icon.ArrowRight size={13} />
              </button>
            </li>
          ))}
        </ol>
        <div className="hb-try-foot">
          <button type="button" className="hb-try-clear" onClick={clearWelcomeWindows}>Clear the welcome windows</button>
          <span>Removes this list, the greeting and the sample hunt.</span>
        </div>
      </div>
    </>
  );
}

export default TryThisWindow;
