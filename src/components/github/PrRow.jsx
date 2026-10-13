import React from 'react';

const CHECK_TONE = { passed: 'ok', none: 'quiet', running: 'wait', failed: 'bad' };

function Status({ tone, children, title }) {
  return <span className="hb-gh-status" data-tone={tone} title={title}><i aria-hidden="true" />{children}</span>;
}

/** What the one button on a row does right now. */
export function rowAction(pr, act) {
  if (act?.state === 'merging') return { kind: 'busy', label: 'Merging…' };
  if (act?.state === 'fixing') return { kind: 'busy', label: 'Fixing…' };
  if (act?.state === 'merged') return { kind: 'done', label: 'Merged' };
  if (pr.conflicts) return { kind: 'fix', label: 'Fix conflicts' };
  if (!pr.mergeKnown) return { kind: 'wait', label: 'Checking…' };
  if (pr.checks.state === 'running') return { kind: 'wait', label: 'Waiting for checks' };
  if (pr.checks.state === 'failed') return { kind: 'merge-anyway', label: 'Merge anyway' };
  return { kind: 'merge', label: 'Merge' };
}

function Activity({ number, act, onApprove, onDismiss }) {
  if (!act || act.state === 'merging') return null;
  const tone = act.state === 'error' ? 'bad' : act.state === 'merged' || act.state === 'fixed' ? 'ok' : 'wait';
  return (
    <div className="hb-gh-activity" data-tone={tone}>
      <span className="hb-gh-activity-text">
        {act.by ? <strong>{act.by}</strong> : null}{act.by ? ' · ' : ''}{act.text}
        {act.agentSummary ? <span className="hb-gh-activity-sub">{act.agentSummary}</span> : null}
      </span>
      {(act.approvals || []).map((a) => (
        <span key={a.id} className="hb-gh-approval">
          <span className="hb-gh-approval-what" title={a.detail}>{a.title}{a.detail ? `: ${a.detail}` : ''}</span>
          <button type="button" className="hb-btn" data-primary="true" onClick={() => onApprove(number, a.id, true)}>Allow</button>
          <button type="button" className="hb-btn" onClick={() => onApprove(number, a.id, false)}>Deny</button>
        </span>
      ))}
      {act.state === 'error' || act.state === 'fixed' ? (
        <button type="button" className="hb-gh-link" onClick={() => onDismiss(number)}>Dismiss</button>
      ) : null}
    </div>
  );
}

export function PrRow({ pr, act, onMerge, onFix, onApprove, onDismiss }) {
  const action = rowAction(pr, act);
  const checkTitle = pr.checks.failing?.length ? `Failing: ${pr.checks.failing.join(', ')}` : undefined;
  return (
    <li className="hb-gh-row" data-pr={pr.number} data-green={pr.green ? 'true' : 'false'}>
      <div className="hb-gh-row-main">
        <div className="hb-gh-row-title">
          <a href={pr.url} target="_blank" rel="noreferrer">{pr.title}</a>
          <span className="hb-gh-num">#{pr.number}</span>
        </div>
        {pr.summary ? <p className="hb-gh-summary">{pr.summary}</p> : null}
        <div className="hb-gh-facts">
          <Status tone={CHECK_TONE[pr.checks.state]} title={checkTitle}>{pr.checks.text}</Status>
          <Status tone={pr.conflicts ? 'bad' : pr.mergeKnown ? 'ok' : 'quiet'}>{pr.conflicts ? 'Conflicts' : pr.mergeKnown ? 'No conflicts' : 'Checking conflicts'}</Status>
          <Status tone="quiet">{pr.draft ? 'Draft' : 'Ready'}</Status>
          <span className="hb-gh-by">by {pr.author}</span>
        </div>
        <Activity number={pr.number} act={act} onApprove={onApprove} onDismiss={onDismiss} />
      </div>
      <div className="hb-gh-row-action">
        {action.kind === 'merge' || action.kind === 'merge-anyway' ? (
          <button type="button" className="hb-btn" data-primary={action.kind === 'merge' ? 'true' : undefined}
            title={action.kind === 'merge-anyway' ? 'Checks failed. GitHub may still allow it if they are not required.' : pr.draft ? 'Marks it ready, then merges' : undefined}
            onClick={() => onMerge(pr.number)}>{action.label}</button>
        ) : action.kind === 'fix' ? (
          <button type="button" className="hb-btn" data-tone="warn" onClick={() => onFix(pr.number)}>{action.label}</button>
        ) : (
          <button type="button" className="hb-btn" disabled>{action.label}</button>
        )}
      </div>
    </li>
  );
}
