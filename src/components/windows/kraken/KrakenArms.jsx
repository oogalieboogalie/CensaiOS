/* eslint-disable no-unused-vars -- JSX references are not detected by the legacy lint config. */
import React from 'react';
import { Icon } from '../../Icons.jsx';
import { armWord, pinLine, progressLine, rankWord, requestIsOpen, requestWord } from '../../../lib/kraken/words.js';

// How a fix's pull request's checks on GitHub stand, in words.
const PR_CHECKS_WORDS = {
  passed: 'checks passed',
  failed: 'checks failed',
  running: 'checks running',
  unknown: 'checks could not be read',
  waiting: 'checks not looked at yet',
  none: 'no checks ran on this pull request',
};
// For these, the arm also says what is known and when (arms.js checksNow).
const PR_SAYS_MORE = new Set(['failed', 'unknown']);

/** One request: every arm, who has it, and how far it got. The live steps of each arm show in Censai's chat. */
export function KrakenRequestCard({ request, onStop, stopping = false }) {
  return (
    <section className="hb-kraken-request" data-status={request.status} data-testid="kraken-request" aria-label={`Kraken Request: ${request.title}`}>
      <header className="hb-kraken-head">
        <span className="hb-kraken-state">{requestWord(request.status)}</span>
        <span className="hb-kraken-count">{progressLine(request)}</span>
        <span className="hb-kraken-spacer" />
        {requestIsOpen(request) && (
          <button type="button" className="hb-btn" onClick={() => onStop(request.id)} disabled={stopping} aria-label={`Stop the Kraken Request: ${request.title}`}>
            <Icon.Stop size={12} /> {stopping ? 'Stopping…' : 'Stop'}
          </button>
        )}
      </header>
      <p className="hb-kraken-goal">{request.title}</p>
      {request.pin && <p className="hb-kraken-pin">{pinLine(request.pin)}</p>}
      <ul className="hb-kraken-arms">
        {request.arms.map((arm) => (
          <li key={arm.n} className="hb-kraken-arm" data-rank={arm.severity} data-status={arm.status}>
            <div className="hb-kraken-pick">
              <span className="hb-kraken-rank">{rankWord(arm.severity)}</span>
              <span className="hb-kraken-title">{arm.title}</span>
            </div>
            <span className="hb-kraken-to">
              {arm.agent} · {arm.status === 'blocked' ? `${arm.kind === 'code' ? 'Fix' : 'Write-up'} blocked` : armWord(arm.status)}
            </span>
            {arm.status === 'blocked' && (
              <p className="hb-kraken-blocked" role="status">
                <strong>Not handed out yet.</strong> {arm.why} {arm.fix}
              </p>
            )}
            {arm.note && <p className="hb-kraken-note">{arm.note}</p>}
            {arm.pr ? (
              <p className="hb-kraken-pr" data-checks={arm.pr.checks} data-testid="kraken-arm-pr">
                <a href={arm.pr.url} target="_blank" rel="noopener noreferrer">Pull request #{arm.pr.number}</a>
                {' · '}{PR_CHECKS_WORDS[arm.pr.checks] || PR_CHECKS_WORDS.waiting}
                {arm.pr.branch && <span className="hb-kraken-branch"> · from {arm.pr.branch}</span>}
                {PR_SAYS_MORE.has(arm.pr.checks) && arm.pr.line && <span className="hb-kraken-pr-line"> {arm.pr.line}</span>}
              </p>
            ) : arm.branch && (
              <p className="hb-kraken-pr" data-testid="kraken-arm-branch">Working on the branch {arm.branch}</p>
            )}
            {arm.result && <p className="hb-kraken-result">{arm.result}</p>}
          </li>
        ))}
      </ul>
    </section>
  );
}
