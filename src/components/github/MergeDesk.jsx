import React from 'react';
import { PrRow } from './PrRow.jsx';

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
  const { desk, activity, loading, error, bulk, refresh, merge, mergeAllGreen, fixConflicts, answerApproval, dismiss } = model;
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
        <button type="button" className="hb-btn" onClick={refresh} disabled={loading}>Refresh</button>
        <button type="button" className="hb-btn" data-primary="true" disabled={!green.length || Boolean(bulk)} onClick={mergeAllGreen}
          title="Merges every PR with passing checks and no conflicts, one after another">
          {bulk ? `Merging ${bulk.done}/${bulk.total}…` : `Merge all green${green.length ? ` (${green.length})` : ''}`}
        </button>
      </div>
      {error ? <p className="hb-gh-error hb-gh-pad">{error}</p> : null}

      <div className="hb-gh-scroll">
        {desk && !prs.length ? <p className="hb-gh-empty">No open pull requests. Nothing to merge.</p> : null}
        <ul className="hb-gh-list">
          {prs.map((pr) => (
            <PrRow key={pr.number} pr={pr} act={activity[pr.number]} onMerge={merge} onFix={fixConflicts} onApprove={answerApproval} onDismiss={dismiss} team={team} />
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
