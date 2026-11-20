/* eslint-disable no-unused-vars -- JSX references are not detected by the legacy lint config. */
import React from 'react';
import { elapsedText } from '../lib/appUpdate/trayFlow.js';

/**
 * The row of steps in the tray's Update panel (TrayUpdatePanel.jsx): which
 * step the update is on, in the updater's own words, and how long it has been
 * going. Steps before `at` are done, `at` is the one being worked on, the rest
 * are still to come. `at` past the last step draws them all done and still.
 */

// Motion for the panel and its steps. Someone who asked their computer for
// less motion gets the same row, standing still.
export const UPDATE_MOTION = `
@keyframes update-panel-in { from { opacity: 0; transform: translate(-50%, -8px); } to { opacity: 1; transform: translate(-50%, 0); } }
@keyframes update-step-now { 0%, 100% { box-shadow: 0 0 0 0 color-mix(in oklab, var(--accent) 50%, transparent); } 60% { box-shadow: 0 0 0 6px transparent; } }
@keyframes update-step-done { from { transform: scale(0.4); } to { transform: scale(1); } }
@keyframes update-rail { from { transform: translateX(-110%); } to { transform: translateX(360%); } }
@media (prefers-reduced-motion: reduce) { [data-update-motion] { animation: none !important; } }
`;

const SHOW_CLOCK_AFTER_MS = 10_000;
const DOT = 10;

const row = { listStyle: 'none', margin: 0, padding: 0, display: 'flex', alignItems: 'center', gap: 6 };
const item = { display: 'flex', alignItems: 'center', gap: 6, fontSize: 'var(--text-xs)', whiteSpace: 'nowrap' };
const line = { flex: 1, minWidth: 8, height: 1, transition: 'background var(--dur-slow) var(--ease-standard)' };
const rail = { height: 2, overflow: 'hidden', borderRadius: 'var(--radius-full)', background: 'var(--hairline)' };
const runner = { width: '28%', height: '100%', borderRadius: 'var(--radius-full)', background: 'var(--accent)', animation: 'update-rail 1.6s var(--ease-standard) infinite' };

function dot(state) {
  const base = { width: DOT, height: DOT, flex: 'none', boxSizing: 'border-box', borderRadius: 'var(--radius-full)' };
  if (state === 'done') return { ...base, background: 'var(--accent)', animation: 'update-step-done var(--dur-slow) var(--ease-emphasized)' };
  if (state === 'now') return { ...base, border: '2px solid var(--accent)', animation: 'update-step-now 1.8s ease-out infinite' };
  return { ...base, border: '1px solid var(--hairline)' };
}

/** Ticks once a second while a step is being worked on. */
function useClock(since, running) {
  const [now, setNow] = React.useState(() => Date.now());
  React.useEffect(() => {
    if (!running || !since) return undefined;
    setNow(Date.now());
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [since, running]);
  return since ? now - since : 0;
}

export function UpdateSteps({ steps, at, since = 0, text }) {
  const working = at < steps.length;
  const spent = useClock(since, working);
  const words = text ?? steps[at]?.text ?? '';
  return (
    <div style={{ display: 'grid', gap: 8 }} data-testid="update-steps" data-step={working ? steps[at].id : 'done'}>
      <ol style={row}>
        {steps.map((step, i) => {
          const state = i < at ? 'done' : i === at ? 'now' : 'next';
          return (
            <React.Fragment key={step.id}>
              {i > 0 && <li aria-hidden="true" style={{ ...line, background: i <= at ? 'var(--accent)' : 'var(--hairline)' }} />}
              <li style={{ ...item, color: state === 'next' ? 'var(--ink-faint)' : 'var(--ink)', fontWeight: state === 'now' ? 650 : 400 }} data-state={state} aria-current={state === 'now' ? 'step' : undefined}>
                <span aria-hidden="true" data-update-motion style={dot(state)} />
                {step.label}
              </li>
            </React.Fragment>
          );
        })}
      </ol>
      {working && <div style={rail} aria-hidden="true"><div data-update-motion style={runner} /></div>}
      {working && words && (
        <span style={{ color: 'var(--ink-soft)' }} aria-live="polite">
          {words}
          {spent >= SHOW_CLOCK_AFTER_MS && <span style={{ color: 'var(--ink-faint)' }} data-testid="update-steps-clock"> {elapsedText(spent)} so far.</span>}
        </span>
      )}
    </div>
  );
}
