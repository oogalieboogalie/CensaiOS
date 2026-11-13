/* eslint-disable no-unused-vars -- JSX references are not detected by the legacy lint config. */
import React from 'react';
import { Icon } from '../../Icons.jsx';
import { armsByAgent, rankWord } from '../../../lib/kraken/words.js';

const EXAMPLE = `# Review of the shop project

## Failing now
- P0 - Checkout crashes when the cart is empty
  The total is read before the cart loads, in \`src/cart/total.js\`.
  Done when: an empty cart shows "Your cart is empty" and no error

## Will fail
- P1 - Orders table has no index on customer id
  Owner: Nexus

## Clean-up
- P2 - Two date libraries do the same job
`;

/** Step one: paste the report and say whether the family writes up or fixes. */
export function KrakenPaste({ kraken }) {
  const { report, mode, project, setDraft, look, busy, open } = kraken;
  return (
    <section className="hb-kraken-setup">
      <p className="hb-kraken-lede">
        Paste a report: a review, an audit, a list of things to fix. Each finding goes to the family member who fits,
        and Censai checks every answer before you hear about it.
      </p>
      <textarea
        className="hb-kraken-input" rows={12} value={report} aria-label="The report to hand out"
        placeholder={'Put each thing on its own line, starting with P0, P1 or P2.\n\n- P0 - What is broken now\n- P1 - What will break\n- P2 - What to clean up'}
        onChange={(event) => setDraft({ krakenReport: event.target.value })}
      />
      <div className="hb-kraken-row" role="radiogroup" aria-label="What the family does with each finding">
        <label className="hb-kraken-check">
          <input type="radio" name="kraken-mode" checked={mode === 'writeup'} onChange={() => setDraft({ krakenMode: 'writeup' })} />
          Write up what to change (nothing in the project changes)
        </label>
        <label className="hb-kraken-check">
          <input type="radio" name="kraken-mode" checked={mode === 'fix'} onChange={() => setDraft({ krakenMode: 'fix' })} />
          Fix it in the project
        </label>
      </div>
      {mode === 'fix' && (
        <label className="hb-kraken-field">
          <span className="hb-kraken-label">Project</span>
          <input
            className="hb-kraken-text" value={project} placeholder="The project the work is in, as Projects names it"
            onChange={(event) => setDraft({ krakenProject: event.target.value })}
          />
        </label>
      )}
      <div className="hb-kraken-row">
        <button type="button" className="hb-btn" onClick={() => setDraft({ krakenReport: EXAMPLE })} disabled={Boolean(report)}>
          Show me an example
        </button>
        <span className="hb-kraken-spacer" />
        <button type="button" className="hb-btn hb-kraken-go" onClick={look} disabled={!report.trim() || busy === 'preview' || Boolean(open)}>
          <Icon.Search size={12} /> {busy === 'preview' ? 'Reading…' : 'See who gets what'}
        </button>
      </div>
      {open && <p className="hb-kraken-hint">One Kraken Request is out already. Wait for it to come back, or stop it, before the next.</p>}
    </section>
  );
}

/** Step two: every finding with who would get it; untick any to leave out, then release. */
export function KrakenPreview({ kraken }) {
  const { preview, skipped, toggle, release, clearPreview, busy } = kraken;
  const kept = preview.arms.filter((arm) => !skipped.has(arm.n));
  return (
    <section className="hb-kraken-setup" data-testid="kraken-preview">
      <p className="hb-kraken-lede">
        {preview.arms.length} findings in "{preview.title}".
        {preview.dropped > 0 && ` ${preview.dropped} more were past the limit and are left out; hand those out next.`}
      </p>
      <p className="hb-kraken-who">
        {armsByAgent(kept).map((entry) => <span key={entry.agentId} className="hb-kraken-chip">{entry.agent} × {entry.count}</span>)}
      </p>
      <ul className="hb-kraken-arms">
        {preview.arms.map((arm) => (
          <li key={arm.n} className="hb-kraken-arm" data-rank={arm.severity} data-off={skipped.has(arm.n) || undefined}>
            <label className="hb-kraken-pick">
              <input type="checkbox" checked={!skipped.has(arm.n)} onChange={() => toggle(arm.n)} aria-label={`Hand out: ${arm.title}`} />
              <span className="hb-kraken-rank">{rankWord(arm.severity)}</span>
              <span className="hb-kraken-title">{arm.title}</span>
            </label>
            <span className="hb-kraken-to">{arm.agent} · {arm.kind === 'code' ? 'fixes it' : 'writes it up'}</span>
          </li>
        ))}
      </ul>
      <div className="hb-kraken-row">
        <button type="button" className="hb-btn" onClick={clearPreview}>Back</button>
        <span className="hb-kraken-spacer" />
        <button type="button" className="hb-btn hb-kraken-go" onClick={release} disabled={!kept.length || busy === 'release'}>
          <Icon.Send size={12} /> {busy === 'release' ? 'Handing out…' : `Release the Kraken (${kept.length})`}
        </button>
      </div>
    </section>
  );
}
