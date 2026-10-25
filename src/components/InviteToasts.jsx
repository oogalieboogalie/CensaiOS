import React from 'react';
import { useWorkspaceStore } from '../lib/store.js';
import { useVisibilityAwareInterval } from '../lib/usePolling.js';
import { myInvites, openInvitedBoard } from '../lib/invites/index.js';

const POLL_MS = 30000;
const shown = new Set();

/**
 * "Alma invited you to Family board" toasts, top center, for invites made
 * with "Invite to this board". Each shows once per page load; it stays in
 * the Inbox until the board is opened. An invite to the board already open
 * here counts as opened.
 */
export function InviteToasts() {
  const workspaceId = useWorkspaceStore((state) => state.workspaceId);
  const [toasts, setToasts] = React.useState([]);

  const poll = React.useCallback(async () => {
    try {
      const { invites = [] } = await myInvites();
      const fresh = [];
      for (const invite of invites) {
        if (invite.workspaceId === workspaceId) {
          openInvitedBoard(invite, () => null);
        } else if (!shown.has(invite.id)) {
          shown.add(invite.id);
          fresh.push(invite);
        }
      }
      if (fresh.length) setToasts((current) => [...current, ...fresh].slice(-3));
    } catch {
      // Not signed in yet, or offline: toasts must never break the board.
    }
  }, [workspaceId]);

  React.useEffect(() => { poll(); }, [poll]);
  useVisibilityAwareInterval(poll, POLL_MS);

  const hide = (id) => setToasts((current) => current.filter((t) => t.id !== id));
  if (toasts.length === 0) return null;

  return (
    // Below the presence toasts (top 14) so the two never sit on each other.
    <div data-pane-cover data-testid="invite-toasts" style={{
      position: 'fixed', top: 64, left: '50%', transform: 'translateX(-50%)',
      zIndex: 1300, display: 'flex', flexDirection: 'column', gap: 8, alignItems: 'center', pointerEvents: 'none',
    }}>
      {toasts.map((invite) => (
        <div key={invite.id} role="status" style={{
          display: 'flex', alignItems: 'center', gap: 10, background: 'var(--surface)',
          border: '1px solid var(--hairline)', borderRadius: 'var(--radius-full)', boxShadow: 'var(--shadow-pop)',
          padding: '6px 6px 6px 14px', fontFamily: 'var(--font-sans)', fontSize: 'var(--text-sm)',
          color: 'var(--ink)', pointerEvents: 'auto', maxWidth: 'min(560px, 90vw)',
        }}>
          <span style={{ width: 8, height: 8, borderRadius: '50%', flexShrink: 0, background: 'var(--accent)' }} />
          <span><strong>{invite.byName}</strong> invited you to <strong>{invite.boardName}</strong></span>
          <button type="button" onClick={() => openInvitedBoard(invite)} style={{
            border: 0, borderRadius: 'var(--radius-full)', padding: '6px 12px', background: 'var(--accent-line)',
            color: 'var(--surface)', fontWeight: 700, cursor: 'pointer', font: 'inherit',
          }}>
            Open board
          </button>
          <button type="button" onClick={() => hide(invite.id)} title="Later" aria-label="Later"
            style={{ all: 'unset', cursor: 'pointer', color: 'var(--ink-faint)', padding: '0 6px' }}>
            ✕
          </button>
        </div>
      ))}
    </div>
  );
}
