import React from 'react';
import { workspaceShareLink } from '../lib/workspace/shareLink.js';

const PRESENCE_LABELS = {
  connecting: 'Connecting',
  reconnecting: 'Reconnecting',
  live: 'Live',
  offline: 'Offline',
};

// Live presence row that lives inside the expanded multi-tool dock, under
// the tool nav. Replaces the old standalone bottom-right pill: status dot,
// participant count + avatars, Share (copies the workspace link), and Invite
// (opens Settings on the Sharing tab, which hosts the email-invite form).
export function DockPresence({ collaboration, onShare, workspaceId, expanded }) {
  const participants = collaboration.participants || [];
  const live = collaboration.status === 'live';
  const [copied, setCopied] = React.useState(false);
  const copyTimer = React.useRef(null);
  React.useEffect(() => () => clearTimeout(copyTimer.current), []);

  const copyShareLink = () => {
    const link = workspaceId ? workspaceShareLink(workspaceId) : '';
    if (!link) return;
    try {
      navigator.clipboard?.writeText(link)?.catch?.(() => {});
    } catch {
      /* clipboard unavailable — still show feedback, link is in Settings */
    }
    setCopied(true);
    clearTimeout(copyTimer.current);
    copyTimer.current = setTimeout(() => setCopied(false), 1500);
  };
  return (
    <div
      data-testid="collaboration-presence"
      className="flex items-center backdrop-blur-xl"
      style={{
        gap: 7, padding: '6px 9px',
        background: 'color-mix(in oklab, var(--surface) 88%, transparent)',
        border: '1px solid var(--hairline)',
        borderRadius: 'var(--radius-float)',
        boxShadow: 'var(--shadow-card)',
        color: 'var(--ink-soft)',
        fontFamily: 'var(--font-mono)',
        fontSize: 10,
      }}
    >
      <span
        aria-hidden="true"
        style={{
          width: 7, height: 7, borderRadius: '50%',
          background: live ? 'var(--ps-green)' : 'var(--ink-faint)',
          boxShadow: live ? '0 0 0 3px var(--accent-soft)' : 'none',
        }}
      />
      <span>{PRESENCE_LABELS[collaboration.status] || 'Offline'}</span>
      {live && <span style={{ color: 'var(--ink-faint)' }}>· {participants.length}</span>}
      {participants.slice(0, 3).map((participant) => (
        <span
          key={participant.clientId}
          title={participant.actor?.label}
          tabIndex={expanded ? undefined : -1}
          style={{
            width: 20, height: 20, display: 'grid', placeItems: 'center',
            borderRadius: '50%', background: 'var(--accent-soft)',
            color: 'var(--accent-ink)', fontWeight: 700,
          }}
        >
          {(participant.actor?.label || '?').replace('Member ', '').slice(0, 2)}
        </span>
      ))}
      {onShare && (
        <button
          type="button"
          onClick={copyShareLink}
          title="Copy workspace link"
          tabIndex={expanded ? undefined : -1}
          style={{ border: 0, borderRadius: 'var(--radius-float-btn)', padding: '4px 7px', background: copied ? 'var(--ps-green)' : 'var(--accent-soft)', color: copied ? 'white' : 'var(--accent-ink)', font: 'inherit', fontWeight: 700, cursor: 'pointer' }}
        >
          {copied ? 'Copied' : 'Share'}
        </button>
      )}
      {onShare && (
        <button
          type="button"
          onClick={onShare}
          title="Invite someone (opens Settings → Sharing)"
          tabIndex={expanded ? undefined : -1}
          style={{ border: 0, borderRadius: 'var(--radius-float-btn)', padding: '4px 7px', background: 'var(--accent)', color: 'white', font: 'inherit', fontWeight: 700, cursor: 'pointer' }}
        >
          Invite
        </button>
      )}
    </div>
  );
}
