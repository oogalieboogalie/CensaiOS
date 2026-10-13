import React from 'react';
import { useEscapeDismiss } from '../../lib/useEscapeDismiss.js';
import { QuickSharePanel } from '../guest/QuickSharePanel.jsx';

// Top bar: "Share" opens the quick share panel (make a look or edit link,
// switch links off). It sits next to Present.
export function ShareButton({ workspaceId, onMoreOptions }) {
  const [open, setOpen] = React.useState(false);
  useEscapeDismiss(open, () => setOpen(false));
  if (!workspaceId) return null;
  return (
    <>
      <button
        type="button" className="hb-share-top" aria-pressed={open} aria-haspopup="dialog"
        onClick={() => setOpen(!open)} title="Share this board with a link" data-testid="share-button"
      >
        <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M8 10V2.5M5 5.5l3-3 3 3M3 9v3.5A1.5 1.5 0 0 0 4.5 14h7a1.5 1.5 0 0 0 1.5-1.5V9" />
        </svg>
        Share
      </button>
      {open && (
        <QuickSharePanel
          workspaceId={workspaceId}
          onClose={() => setOpen(false)}
          onMoreOptions={() => { setOpen(false); onMoreOptions?.(); }}
        />
      )}
    </>
  );
}
