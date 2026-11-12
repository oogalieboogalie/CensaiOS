import React from 'react';
import { useVisibilityAwareInterval } from '../lib/usePolling.js';
import { dismissCopy, dismissedCopies, getNearbyCopies, openCopy } from '../lib/tailnet/index.js';
import { logToApp } from '../lib/appLog/browserLog.js';

const POLL_MS = 2 * 60 * 1000;
const shown = new Set();

/**
 * "censaiOS is open on officepc" pop-ups, top center: another copy of
 * censaiOS on the owner's tailnet where this computer is switched on, with
 * one button that opens its board here. Each shows once per page load.
 * "Not now" keeps it quiet for good; Settings still lists the copy.
 */
export function TailnetToasts() {
  const [toasts, setToasts] = React.useState([]);
  // False once the server says nothing can show here (the switch is off, a
  // teammate, a hosted copy): the board then stops asking.
  const [watching, setWatching] = React.useState(true);

  const poll = React.useCallback(async () => {
    try {
      const { copies = [], watching: stillWatching } = await getNearbyCopies();
      if (stillWatching === false) setWatching(false);
      const quiet = dismissedCopies();
      const fresh = copies.filter((copy) => copy.ready && !shown.has(copy.id) && !quiet.includes(copy.id));
      fresh.forEach((copy) => shown.add(copy.id));
      if (fresh.length) setToasts((current) => [...current, ...fresh].slice(-2));
    } catch (error) {
      // Signed out or offline: pop-ups must never break the board. A copy
      // of censaiOS without this feature answers 404: stop asking it.
      if (error?.status === 404) setWatching(false);
    }
  }, []);

  React.useEffect(() => { poll(); }, [poll]);
  useVisibilityAwareInterval(poll, watching ? POLL_MS : null);

  const hide = (id) => setToasts((current) => current.filter((toast) => toast.id !== id));
  const later = (copy) => { dismissCopy(copy.id); hide(copy.id); };
  const open = async (copy) => {
    hide(copy.id);
    const how = await openCopy(copy);
    logToApp('info', 'tailnet: opened another copy from the pop-up', { where: 'tailnet', how });
  };

  if (toasts.length === 0) return null;
  return (
    // Below the presence (top 14) and invite (top 64) pop-ups.
    <div data-pane-cover data-testid="tailnet-toasts" style={{
      position: 'fixed', top: 114, left: '50%', transform: 'translateX(-50%)',
      zIndex: 1300, display: 'flex', flexDirection: 'column', gap: 8, alignItems: 'center', pointerEvents: 'none',
    }}>
      {toasts.map((copy) => (
        <div key={copy.id} role="status" style={{
          display: 'flex', alignItems: 'center', gap: 10, background: 'var(--surface)',
          border: '1px solid var(--hairline)', borderRadius: 'var(--radius-full)', boxShadow: 'var(--shadow-pop)',
          padding: '6px 6px 6px 14px', fontFamily: 'var(--font-sans)', fontSize: 'var(--text-sm)',
          color: 'var(--ink)', pointerEvents: 'auto', maxWidth: 'min(560px, 90vw)',
        }}>
          <span style={{ width: 8, height: 8, borderRadius: '50%', flexShrink: 0, background: 'var(--accent)' }} />
          <span>censaiOS is open on <strong>{copy.name}</strong></span>
          <button type="button" onClick={() => open(copy)} style={{
            border: 0, borderRadius: 'var(--radius-full)', padding: '6px 12px', background: 'var(--accent-line)',
            color: 'var(--surface)', fontWeight: 700, cursor: 'pointer', font: 'inherit',
          }}>
            Open it here
          </button>
          <button type="button" onClick={() => later(copy)} title="Not now" aria-label="Not now"
            style={{ all: 'unset', cursor: 'pointer', color: 'var(--ink-faint)', padding: '0 6px' }}>
            ✕
          </button>
        </div>
      ))}
    </div>
  );
}
