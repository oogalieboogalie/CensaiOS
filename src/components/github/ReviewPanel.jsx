import React from 'react';

const SEVERITY_LABEL = { high: 'High', medium: 'Medium', low: 'Low' };
const STEP_TEXT = { starting: 'Starting', reviewing: 'Reading', needs_approval: 'Wants your OK', done: 'Done', failed: 'Stopped' };

function Picker({ number, roster, state, team }) {
  const picked = state.picked || [];
  if (!roster.available) {
    return <p className="hb-gh-review-note">Reviewers run on the desktop app with your own Claude Code, Codex, Gemini or Grok sign-in. Open the board there to use them.</p>;
  }
  return (
    <>
      <p className="hb-gh-review-note">Each reviewer reads this PR on its own sign-in, so it uses your plan, not a pay-per-use key.</p>
      <div className="hb-gh-review-pick">
        {roster.reviewers.map((r) => (
          <label key={r.id} className="hb-gh-review-chip" data-ready={r.ready ? 'true' : 'false'}
            title={r.ready ? `${r.vendor}` : r.installed ? 'Not signed in yet: open it once in the Agent Console' : 'Not installed on this computer'}>
            <input type="checkbox" checked={picked.includes(r.id)} disabled={!r.ready} onChange={() => team.pick(number, r.id)} />
            {r.label}
          </label>
        ))}
      </div>
      <button type="button" className="hb-btn" data-primary="true" disabled={!picked.length || state.busy || picked.length > 4}
        onClick={() => team.start(number)}>
        {state.busy ? 'Starting…' : `Review with ${picked.length} reviewer${picked.length === 1 ? '' : 's'}`}
      </button>
    </>
  );
}

function Finding({ f }) {
  return (
    <li className="hb-gh-finding" data-severity={f.severity}>
      <div className="hb-gh-finding-head">
        <span className="hb-gh-finding-sev">{SEVERITY_LABEL[f.severity]}</span>
        <strong>{f.title}</strong>
        <span className="hb-gh-finding-where">{f.path}:{f.line}</span>
      </div>
      <p>{f.explanation}</p>
      {f.suggestion ? <p className="hb-gh-finding-fix">Fix: {f.suggestion}</p> : null}
      <span className="hb-gh-finding-who">
        {f.reviewers.length > 1 ? `${f.reviewers.length} reviewers agree: ` : 'Found by '}{f.reviewers.join(', ')}
      </span>
    </li>
  );
}

function Progress({ number, state, team }) {
  const { job, approvals = [] } = state;
  return (
    <>
      <p className="hb-gh-review-note"><strong>{job.text}</strong></p>
      <ul className="hb-gh-review-steps">
        {job.reviewers.map((r) => (
          <li key={r.cli} data-status={r.status}>
            <span>{r.label}</span><span>{STEP_TEXT[r.status] || r.status}</span>
            {r.error ? <span className="hb-gh-review-err">{r.error}</span> : null}
            {r.status === 'done' && r.summary ? <span className="hb-gh-review-sum">{r.summary}</span> : null}
          </li>
        ))}
      </ul>
      {approvals.map((a) => (
        <span key={a.id} className="hb-gh-approval">
          <span className="hb-gh-approval-what" title={a.detail}>{a.reviewer}: {a.title}{a.detail ? ` ${a.detail}` : ''}</span>
          <button type="button" className="hb-btn" data-primary="true" onClick={() => team.approve(number, a, true)}>Allow</button>
          <button type="button" className="hb-btn" onClick={() => team.approve(number, a, false)}>Deny</button>
        </span>
      ))}
      {job.findings?.length ? <ol className="hb-gh-findings">{job.findings.map((f) => <Finding key={`${f.path}:${f.line}:${f.title}`} f={f} />)}</ol> : null}
      {job.status === 'done' ? (
        job.posted ? (
          <p className="hb-gh-review-note">Posted to GitHub.{job.posted.url ? <> <a href={job.posted.url} target="_blank" rel="noreferrer">Open it</a></> : null}</p>
        ) : (
          <div className="hb-gh-review-actions">
            <button type="button" className="hb-btn" data-primary="true" disabled={state.busy} onClick={() => team.postToGithub(number)}>
              {state.busy ? 'Posting…' : 'Post to GitHub'}
            </button>
            <button type="button" className="hb-btn" onClick={() => team.start(number)}>Review again</button>
          </div>
        )
      ) : null}
    </>
  );
}

/** The review team for one PR row: pick reviewers, watch them, post the result. */
export function ReviewPanel({ number, roster, state = {}, team }) {
  if (!state.open) return null;
  return (
    <div className="hb-gh-review" data-review-pr={number}>
      {state.job ? <Progress number={number} state={state} team={team} /> : <Picker number={number} roster={roster} state={state} team={team} />}
      {state.error ? <p className="hb-gh-error">{state.error}</p> : null}
    </div>
  );
}
