import React from 'react';
import { Icon } from './Icons.jsx';
import { WindowTitle } from './Windows.jsx';
import { api } from '../lib/api.js';
import { useVisibilityAwareInterval } from '../lib/usePolling.js';
import { JulesQueuePanel } from './jules/JulesQueuePanel.jsx';
import { JulesWavesPanel } from './jules/JulesWavesPanel.jsx';
import './jules/jules.css';

function fmtDate(value) {
  if (!value) return 'not checked';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'not checked';
  return date.toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

// Which colour a session's dot takes (the colours are in jules.css).
function statusTone(status) {
  if (/COMPLETE|DONE|SUCCESS/i.test(status)) return 'good';
  if (/FAIL|ERROR|CANCEL/i.test(status)) return 'bad';
  if (/AWAITING/i.test(status)) return 'warn';
  return 'run';
}

export function JulesTasksWindow({ win, isActive }) {
  const [sessions, setSessions] = React.useState([]);
  const [queue, setQueue] = React.useState(null);
  const [includeCompleted, setIncludeCompleted] = React.useState(false);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState('');
  const [lastLoadedAt, setLastLoadedAt] = React.useState(null);
  const [keyMissing, setKeyMissing] = React.useState(false);

  const load = React.useCallback(async ({ refresh = false, quiet = false } = {}) => {
    if (!quiet) setLoading(true);
    setError('');
    const [sessionResult, queueResult] = await Promise.allSettled([
      api.getJulesSessions({ refresh, includeCompleted }),
      api.getJulesQueue(),
    ]);
    if (sessionResult.status === 'fulfilled') {
      setSessions(sessionResult.value.sessions || []);
      setKeyMissing(sessionResult.value.canRefreshRemote === false);
    }
    if (queueResult.status === 'fulfilled') {
      setQueue(queueResult.value);
    }
    const errors = [
      sessionResult.status === 'rejected' ? sessionResult.reason?.message : null,
      queueResult.status === 'rejected' ? queueResult.reason?.message : null,
    ].filter(Boolean);
    if (sessionResult.status === 'fulfilled' || queueResult.status === 'fulfilled') {
      setLastLoadedAt(new Date());
    }
    setError(errors.join(' · '));
    setLoading(false);
  }, [includeCompleted]);

  React.useEffect(() => {
    load({ refresh: false });
  }, [load]);

  useVisibilityAwareInterval(() => {
    load({ quiet: true });
  }, 3000, { inactive: isActive === false });

  React.useEffect(() => {
    const handleTasksUpdated = () => {
      load({ refresh: true });
    };
    window.addEventListener('tasks-updated', handleTasksUpdated);
    return () => {
      window.removeEventListener('tasks-updated', handleTasksUpdated);
    };
  }, [load]);

  return (
    <>
      <WindowTitle
        icon={<Icon.Bot size={14} />}
        label={win.title || 'Jules Tasks'}
        subtitle="live repository queue"
      />
      <div className="jules">
        <div className="hb-bar jules-bar">
          <button
            type="button"
            className="hb-btn hb-press jules-refresh"
            onClick={() => load({ refresh: true })}
            disabled={loading}
          >
            <Icon.Refresh size={13} />
            {loading ? 'Refreshing' : 'Refresh'}
          </button>
          <label className="jules-check">
            <input className="jules-check-box" type="checkbox" checked={includeCompleted} onChange={(e) => setIncludeCompleted(e.target.checked)} />
            completed
          </label>
          <span className="jules-loaded">
            {lastLoadedAt ? `loaded ${fmtDate(lastLoadedAt)}` : 'not loaded'}
          </span>
        </div>

        {error && <div className="jules-error">{error}</div>}

        <div className="jules-body">
          {keyMissing && (
            <div role="status" className="hb-panel jules-notice">
              <strong className="jules-notice-title">Jules needs an API key.</strong>
              <span className="jules-notice-text">
                Get a key at jules.google.com (Settings, API keys), add a line JULES_API_KEY=your key to the .env file in your censaiOS folder, then restart censaiOS.
              </span>
            </div>
          )}
          <JulesWavesPanel queue={queue} />
          <JulesQueuePanel queue={queue} includeCompleted={includeCompleted} />
          {!loading && !keyMissing && sessions.length === 0 && !queue && (
            <div className="hb-empty">
              <div className="hb-empty-icon"><Icon.Bot size={24} /></div>
              <div className="hb-empty-title">No Jules queue or session data.</div>
            </div>
          )}
          {sessions.length > 0 && (
            <div className="hb-well jules-tray">
              {sessions.map(session => (
                <div key={session.id || session.session} className="hb-panel jules-item" data-tone={statusTone(session.status)}>
                  <div className="jules-item-head">
                    <span className="jules-dot" data-glow="true" />
                    <strong className="jules-session-title">{session.title}</strong>
                  </div>
                  <div className="jules-session-meta">
                    <span>{session.status}</span>
                    {session.projectName && <span>{session.projectName}</span>}
                    {session.branch && <span>{session.branch}</span>}
                    <span>checked {fmtDate(session.lastPolledAt)}</span>
                  </div>
                  {(session.prUrl || session.julesUrl) && (
                    <div className="jules-links">
                      {session.julesUrl && <a className="jules-link" href={session.julesUrl} target="_blank" rel="noreferrer">Jules</a>}
                      {session.prUrl && <a className="jules-link" href={session.prUrl} target="_blank" rel="noreferrer">PR #{session.prNumber || ''}</a>}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
