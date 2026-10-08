/* eslint-disable no-unused-vars -- JSX references are not detected by the legacy lint config. */
import React from 'react';

const STEPS = [
  { id: 'plan', label: 'Reading the request', at: 0 },
  { id: 'manifest', label: 'Writing the manifest', at: 1 },
  { id: 'code', label: 'Writing the module', at: 2 },
  { id: 'check', label: 'Checking it runs in the sandbox', at: 3 },
];

function stageOf(text) {
  if (!text) return 0;
  if (/```html/i.test(text)) return /```html[\s\S]*```/i.test(text) ? 3 : 2;
  return 1;
}

function useElapsed(startedAt, running) {
  const start = React.useMemo(() => Date.parse(startedAt || '') || Date.now(), [startedAt]);
  const [now, setNow] = React.useState(() => Date.now());
  React.useEffect(() => {
    if (!running) return undefined;
    const timer = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(timer);
  }, [running]);
  return Math.max(0, Math.floor((now - start) / 1000));
}

function tail(text, lines = 18) {
  const all = String(text || '').split('\n');
  return all.slice(-lines).join('\n');
}

/**
 * A module while it is being written: the request, the build steps, and the
 * code as it streams in. Everyone on the board sees this, whoever started it.
 */
export function ModuleBuilding({ win, preview, stalled, onRetry, onCancel }) {
  const failed = win.status === 'error';
  const seconds = useElapsed(win.buildStartedAt, !failed);
  const stage = stageOf(preview);
  return (
    <div className="hb-module-build" data-module-state={failed ? 'error' : 'building'}>
      <div className="hb-module-build-head">
        <span className="hb-module-kicker">{failed ? 'Build failed' : 'Building module'}</span>
        {!failed && <span className="hb-module-elapsed">{seconds}s</span>}
      </div>
      <p className="hb-module-request">{win.request || 'New module'}</p>
      {!failed && <div className="hb-module-progress" role="progressbar" aria-label="Building" />}
      {failed ? (
        <>
          <p className="hb-module-error">{win.error || 'The build failed.'}</p>
          <div className="hb-module-row">
            <button type="button" className="hb-btn" data-primary="true" onClick={onRetry}>Try again</button>
          </div>
        </>
      ) : (
        <>
          <ul className="hb-module-steps">
            {STEPS.map(step => (
              <li key={step.id} data-state={step.at < stage ? 'done' : step.at === stage ? 'now' : 'next'}>
                {step.at < stage ? 'Done' : step.at === stage ? 'Now' : 'Next'} · {step.label}
              </li>
            ))}
          </ul>
          <pre className="hb-module-code" aria-label="Code so far">{tail(preview) || 'Waiting for the model…'}</pre>
          {(stalled || onCancel) && (
            <div className="hb-module-row">
              {stalled && <span className="hb-module-elapsed">This build stopped reporting.</span>}
              {stalled && <button type="button" className="hb-btn" onClick={onRetry}>Start again</button>}
              {onCancel && <button type="button" className="hb-btn" onClick={onCancel}>Stop</button>}
            </div>
          )}
        </>
      )}
    </div>
  );
}
