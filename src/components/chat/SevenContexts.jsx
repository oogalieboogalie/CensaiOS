/* eslint-disable no-unused-vars -- JSX references are not detected by the legacy lint config. */
import React from 'react';

// Drawing 07: before answering, the agent looked the ask's keywords up in
// seven places. This shows what each place found, folded behind one line.

const STATUS_TEXT = {
  found: (n, added) => (added ? `found ${n}, added` : `found ${n}, already knew`),
  none: () => 'nothing matched',
  skipped: () => 'not on a board',
  unavailable: () => 'not set up yet',
};

export function SevenContexts({ report }) {
  const [open, setOpen] = React.useState(false);
  const contexts = Array.isArray(report?.contexts) ? report.contexts : [];
  if (contexts.length === 0) return null;
  const hits = contexts.filter((c) => c.status === 'found').length;
  return (
    <div className="hb-seven" data-testid="seven-contexts">
      <button type="button" className="hb-text-btn" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        7 contexts · {hits ? `${hits} found something` : 'nothing matched'}
      </button>
      {open && (
        <div className="hb-seven-panel">
          <ol className="hb-seven-list">
            {contexts.map((c) => (
              <li key={c.id} data-status={c.status}>
                <span className="hb-seven-n" aria-hidden="true">{c.id}</span>
                <div className="hb-seven-body">
                  <div className="hb-seven-head">
                    <span className="hb-seven-name">{c.name}</span>
                    <span className="hb-seven-status">{(STATUS_TEXT[c.status] || STATUS_TEXT.none)(c.found?.length || 0, c.addedChars > 0)}</span>
                  </div>
                  {c.found?.length > 0 && (
                    <ul className="hb-seven-found">
                      {c.found.map((text, i) => <li key={i}>{text}</li>)}
                    </ul>
                  )}
                </div>
              </li>
            ))}
          </ol>
          <div className="hb-seven-foot">
            Searched for: {(report.keywords || []).join(', ') || 'nothing'}
            {' · '}
            {report.addedChars ? `added ${report.addedChars} characters to the instructions` : 'added nothing to the instructions'}
          </div>
        </div>
      )}
    </div>
  );
}
