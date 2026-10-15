import React from 'react';
import { DEMO_HOME } from '../../lib/demo/demoMode.js';

/** The try-it board's one line at the top: what this is, and where to get the real thing. */
export function DemoBanner() {
  const [open, setOpen] = React.useState(true);
  if (!open) return null;
  return (
    <div className="hb-demo-bar" role="note" aria-label="About this board">
      <span className="hb-demo-tag">Try it</span>
      <span className="hb-demo-text">
        This board runs only in your browser. Play with anything; nothing is saved, and reloading starts it over.
      </span>
      <a className="hb-demo-get" href={DEMO_HOME} target="_top">Get censaiOS</a>
      <button type="button" className="hb-demo-x" aria-label="Hide this note" onClick={() => setOpen(false)}>×</button>
    </div>
  );
}
