import React from 'react';
import { PrRow } from './PrRow.jsx';

// Icon buttons for the bar (asked for on 2026-11-17): Refresh is a round arrow, Merge all green two arrows joining
// into one. The words stay as the button's name and tooltip.
function RefreshIcon({ spinning }) {
  return (
    <svg className={spinning ? 'hb-gh-icon hb-gh-spin' : 'hb-gh-icon'} viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"
      fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20 12a8 8 0 1 1-2.34-5.66" />
      <path d="M20 4v5h-5" />
    </svg>
  );
}

function MergeIcon() {
  return (
    <svg className="hb-gh-icon" viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"
      fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M6 21v-4c0-3 6-5 6-8" />
      <path d="M18 21v-4c0-3-6-5-6-8" />
      <path d="M12 9V3" />
      <path d="M8.5 6.5 12 3l3.5 3.5" />
    </svg>
  );
}

export function timeAgo(iso, now = Date.now()) {
  const t = Date.parse(iso || '');
  if (!Number.isFinite(t)) return '';
  const s = Math.max(0, Math.round((now - t) / 1000));
  if (s < 45) return 'just now';
  if (s < 3600) return `${Math.round(s / 60)}m ago`;
  if (s < 86400) return `${Math.round(s / 3600)}h ago`;
  return `${Math.round(s / 86400)}d ago`;
}

export function ConnectGithub({ onSave }) {
  const [token, setToken] = React.useState('');
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState('');
  const submit = async (e) => {
    e.preventDefault();
    if (!token.trim()) return;
    setBusy(true);
    setError('');
    try {
      await onSave(token.trim());
      setToken('');
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <form className="hb-gh-connect" onSubmit={submit}>
      <h3>Connect GitHub</h3>
      <p>
        Paste a GitHub token once and this window can list and merge pull requests.{' '}
        <a href="https://github.com/settings/tokens/new?scopes=repo&description=censaiOS" target="_blank" rel="noreferrer">Make a token</a>
        {' '}(tick the <strong>repo</strong> box, then Generate). It is stored encrypted for your account only.
      </p>
      <div className="hb-gh-connect-row">
        <input type="password" autoComplete="off" spellCheck={false} placeholder="ghp_…" value={token}
          onChange={(e) => setToken(e.target.value)} aria-label="GitHub token" />
        <button type="submit" className="hb-btn" data-primary="true" disabled={busy || !token.trim()}>{busy ? 'Saving…' : 'Connect'}</button>
      </div>
      {error ? <p className="hb-gh-error">{error}</p> : null}
    </form>
  );
}

export function MergeDesk({ desk: model, team }) {
  const { desk, activity, whole = {}, loading, error, bulk, refresh, merge, mergeAllGreen, fixConflicts, answerApproval, dismiss } = model;
  const prs = desk?.prs || [];
  const green = prs.filter((p) => p.green && !['merging', 'fixing'].includes(activity[p.number]?.state));
  const recent = desk?.recent || [];

  return (
    <div className="hb-gh-desk">
      <div className="hb-gh-bar">
        <span className="hb-gh-bar-count">
          {desk ? <><strong>{prs.length}</strong> open · <strong>{green.length}</strong> ready to merge</> : loading ? 'Loading pull requests…' : 'No data yet'}
        </span>
        <span className="hb-gh-bar-age">{loading ? 'Refreshing…' : desk ? `Updated ${timeAgo(desk.fetchedAt)}` : ''}</span>
        <button type="button" className="hb-btn hb-gh-icon-btn" onClick={refresh} disabled={loading}
          aria-label="Refresh" title="Refresh">
          <RefreshIcon spinning={loading} />
        </button>
        <button type="button" className="hb-btn hb-gh-icon-btn" data-primary="true" disabled={!green.length || Boolean(bulk)} onClick={mergeAllGreen}
          aria-label={bulk ? `Merging ${bulk.done} of ${bulk.total}` : `Merge all green${green.length ? ` (${green.length})` : ''}`}
          title="Merge all green: every PR with passing checks and no conflicts, one after another">
          <MergeIcon />
          {bulk ? <span className="hb-gh-icon-count">{bulk.done}/{bulk.total}</span>
            : green.length ? <span className="hb-gh-icon-count">{green.length}</span> : null}
        </button>
      </div>
      {error ? <p className="hb-gh-error hb-gh-pad">{error}</p> : null}

      <div className="hb-gh-scroll">
        {desk && !prs.length ? <p className="hb-gh-empty">No open pull requests. Nothing to merge.</p> : null}
        <ul className="hb-gh-list">
          {prs.map((pr) => (
            <PrRow key={pr.number} pr={pr} act={activity[pr.number]} whole={whole[activity[pr.number]?.jobId]}
              onMerge={merge} onFix={fixConflicts} onApprove={answerApproval} onDismiss={dismiss} team={team} />
          ))}
        </ul>

        {recent.length ? (
          <section className="hb-gh-recent">
            <h4>Recently merged</h4>
            <ul>
              {recent.map((r) => (
                <li key={r.number}>
                  <span className="hb-gh-num">#{r.number}</span>
                  <a href={r.url} target="_blank" rel="noreferrer">{r.title}</a>
                  <span className="hb-gh-recent-when">{r.mergedBy ? `${r.mergedBy} · ` : ''}{timeAgo(r.mergedAt)}</span>
                </li>
              ))}
            </ul>
          </section>
        ) : null}
      </div>
    </div>
  );
}
