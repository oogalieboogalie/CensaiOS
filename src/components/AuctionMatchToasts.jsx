import React from 'react';
import { useWorkspaceStore } from '../lib/store.js';
import { logToApp } from '../lib/appLog/browserLog.js';
import { useVisibilityAwareInterval } from '../lib/usePolling.js';
import { dollars } from './auctionWatcher/format.js';

const POLL_MS = 60000;
const TOAST_TTL_MS = 15000;

/**
 * "New match" toasts for the Auction Watcher. Polls new matches the server's
 * checks found since the last look; the first poll only sets the baseline,
 * so opening the board never replays old matches.
 */
export function AuctionMatchToasts() {
  const [toasts, setToasts] = React.useState([]);
  const sinceRef = React.useRef(null);
  const seenRef = React.useRef(new Set());
  const offRef = React.useRef(false);

  const poll = React.useCallback(async () => {
    if (offRef.current) return;
    try {
      const qs = sinceRef.current ? `?since=${encodeURIComponent(sinceRef.current)}` : '';
      const res = await fetch(`/api/auction-watcher/fresh${qs}`);
      // Signed out or a server without the watcher: stop asking.
      if (res.status === 401 || res.status === 404) offRef.current = true;
      if (!res.ok) return;
      const data = await res.json();
      const baseline = !sinceRef.current;
      sinceRef.current = data.now || new Date().toISOString();
      const fresh = (data.matches || []).filter((m) => !seenRef.current.has(m.id));
      fresh.forEach((m) => seenRef.current.add(m.id));
      if (baseline || !fresh.length) return;
      logToApp('info', `auction-watcher: ${fresh.length} new match toast(s)`, { where: 'auction-watcher' });
      setToasts((list) => [...list, ...fresh].slice(-3));
      fresh.forEach((m) => setTimeout(() => setToasts((list) => list.filter((t) => t.id !== m.id)), TOAST_TTL_MS));
    } catch {
      // A toast feed must never break the canvas.
    }
  }, []);

  React.useEffect(() => { poll(); }, [poll]);
  useVisibilityAwareInterval(poll, POLL_MS);

  if (!toasts.length) return null;
  const open = (m) => {
    useWorkspaceStore.getState().spawnAt('browser', { url: m.url, title: m.title.slice(0, 60) });
    setToasts((list) => list.filter((t) => t.id !== m.id));
  };
  return (
    <div className="hb-aw-toasts" data-pane-cover>
      {toasts.map((m) => (
        <div key={m.id} className="hb-aw-toast" role="status">
          <span className="hb-aw-toast-dot" />
          <span className="hb-aw-toast-text">
            <strong>New match: {m.title}</strong>
            <span>{dollars(m.price, m.currency)} · "{m.query}"{m.redFlags?.length ? ` · red flag: ${m.redFlags.join(', ')}` : ''}</span>
          </span>
          <button type="button" className="hb-aw-btn" onClick={() => open(m)}>Open</button>
          <button type="button" className="hb-aw-toast-x" aria-label="Dismiss" onClick={() => setToasts((list) => list.filter((t) => t.id !== m.id))}>✕</button>
        </div>
      ))}
    </div>
  );
}
