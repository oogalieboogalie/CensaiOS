import React from 'react';

const PlusIcon = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
    <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
  </svg>
);

// "Add event" for this person's own calendar, and Google Calendar as an
// option: a Connect link when Google sign-in is set up on this server, and a
// plain answer instead of a broken Google page when it is not.
export function CalendarFooter({ googleStatus, ownProblem, onAdd, onRetry }) {
  const [why, setWhy] = React.useState(false);
  return (
    <div className="hb-cal-foot">
      {ownProblem && (
        <p className="hb-cal-problem" role="alert">
          {ownProblem} <button type="button" className="hb-cal-link" onClick={onRetry}>Try again</button>
        </p>
      )}
      <div className="hb-cal-foot-row">
        <button type="button" className="hb-cal-add" onClick={onAdd}><PlusIcon /> Add event</button>
        {googleStatus === 'not-connected' && <a className="hb-cal-link" href="/api/auth/google">Connect Google Calendar</a>}
        {googleStatus === 'not-set-up' && (
          <button type="button" className="hb-cal-link" aria-expanded={why} onClick={() => setWhy((v) => !v)}>Connect Google Calendar</button>
        )}
        {googleStatus === 'connected' && <span className="hb-cal-muted">Google Calendar connected</span>}
        {googleStatus === 'failed' && (
          <span className="hb-cal-muted">
            Google Calendar could not be read just now. <button type="button" className="hb-cal-link" onClick={onRetry}>Try again</button>
          </span>
        )}
      </div>
      {why && googleStatus === 'not-set-up' && (
        <p className="hb-cal-muted">
          Google sign-in is not set up on this censaiOS, so Google Calendar cannot connect yet. Your own calendar works without it.
        </p>
      )}
    </div>
  );
}
