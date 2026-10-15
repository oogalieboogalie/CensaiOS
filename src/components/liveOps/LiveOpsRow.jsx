import React from 'react';
import { money, when } from '../../lib/liveOps/feed.js';

/** One thing happening on the board: what it is, how it is going, and a way to open it. */
export function LiveOpsRow({ item, now, onOpen, openable }) {
  const [showRaw, setShowRaw] = React.useState(false);
  const time = when(item.at, now);
  return (
    <li className="hb-lo-row" data-state={item.state}>
      <span className="hb-lo-dot" data-state={item.state} aria-hidden="true" />
      <div className="hb-lo-main">
        <div className="hb-lo-line">
          <span className="hb-lo-title">{item.title}</span>
          <span className="hb-lo-source">{item.sourceLabel}</span>
        </div>
        <div className="hb-lo-detail">{item.detail}</div>
        {item.warn && <div className="hb-lo-detail hb-lo-warn">{item.warn}</div>}
        {item.raw && (
          <>
            <button type="button" className="hb-lo-link" onClick={() => setShowRaw((v) => !v)} aria-expanded={showRaw}>
              {showRaw ? 'Hide the exact error' : 'Show the exact error'}
            </button>
            {showRaw && <pre className="hb-lo-raw">{item.raw}</pre>}
          </>
        )}
      </div>
      <div className="hb-lo-side">
        {time && <span className="hb-lo-when">{time}</span>}
        {Number.isFinite(item.costUsd) && <span className="hb-lo-cost">{money(item.costUsd)}</span>}
        {openable && (
          <button type="button" className="hb-lo-open" onClick={() => onOpen(item)}>
            {item.state === 'needs_you' ? 'Go to it' : 'Open'}
          </button>
        )}
      </div>
    </li>
  );
}
