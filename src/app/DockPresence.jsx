import React from 'react';
import { useCommentStore } from '../lib/comments/commentStore.js';
import { CliAgentPresence } from '../components/agentConsole/CliAgentPresence.jsx';
import { useHistoryPanelStore } from '../lib/collaboration/historyPanelStore.js';

const PRESENCE_LABELS = {
  connecting: 'Connecting',
  reconnecting: 'Reconnecting',
  live: 'Live',
  offline: 'Offline',
};

// Live presence row that lives inside the expanded multi-tool dock, under
// the tool nav: status dot, participant count + avatars (guests in their own
// color), coding agents at work (CliAgentPresence), Comments (opens the comment pins panel),
// History (opens Board history: who changed what, roll back) and Share (opens Settings
// on the Sharing tab: guest links, Go live, email invites).
export function DockPresence({ collaboration, onShare, expanded }) {
  const participants = collaboration.participants || [];
  const live = collaboration.status === 'live';
  const openComments = useCommentStore((state) => state.comments.filter((c) => !c.threadId && !c.resolvedAt).length);
  const commentsOpen = useCommentStore((state) => state.panelOpen);
  const setPanelOpen = useCommentStore((state) => state.setPanelOpen);
  const historyOpen = useHistoryPanelStore((state) => state.open);
  const setHistoryOpen = useHistoryPanelStore((state) => state.setOpen);
  return (
    <div
      data-testid="collaboration-presence"
      className="flex items-center hb-glass"
      style={{
        gap: 7, padding: '6px 9px',
        border: '1px solid var(--glass-line)',
        borderRadius: 'var(--radius-float)',
        color: 'var(--ink-soft)',
        fontFamily: 'var(--font-mono)',
        fontSize: 'var(--text-xs)',
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
            borderRadius: '50%', background: participant.actor?.color || 'var(--accent-soft)',
            color: participant.actor?.color ? 'var(--on-fill)' : 'var(--accent-ink)', fontWeight: 700,
          }}
        >
          {(participant.actor?.label || '?').replace('Member ', '').slice(0, 2)}
        </span>
      ))}
      <CliAgentPresence />
      <button
        type="button"
        data-testid="dock-comments"
        onClick={() => { setHistoryOpen(false); setPanelOpen(!commentsOpen); }}
        aria-pressed={commentsOpen}
        title="Comments on this board"
        tabIndex={expanded ? undefined : -1}
        style={{ border: 0, borderRadius: 'var(--radius-float-btn)', padding: '4px 7px', background: commentsOpen ? 'var(--accent-line)' : 'var(--accent-soft)', color: commentsOpen ? 'var(--on-fill)' : 'var(--accent-ink)', font: 'inherit', fontWeight: 700, cursor: 'pointer' }}
      >
        Comments{openComments > 0 ? ` ${openComments}` : ''}
      </button>
      <button
        type="button"
        data-testid="dock-history"
        onClick={() => { setPanelOpen(false); setHistoryOpen(!historyOpen); }}
        aria-pressed={historyOpen}
        title="Board history: who changed what, and roll back"
        tabIndex={expanded ? undefined : -1}
        style={{ border: 0, borderRadius: 'var(--radius-float-btn)', padding: '4px 7px', background: historyOpen ? 'var(--accent-line)' : 'var(--accent-soft)', color: historyOpen ? 'var(--on-fill)' : 'var(--accent-ink)', font: 'inherit', fontWeight: 700, cursor: 'pointer' }}
      >
        History
      </button>
      {onShare && (
        <button
          type="button"
          data-testid="dock-share"
          onClick={onShare}
          title="Share this board by link (opens Settings → Sharing)"
          tabIndex={expanded ? undefined : -1}
          style={{ border: 0, borderRadius: 'var(--radius-float-btn)', padding: '4px 7px', background: 'var(--accent-line)', color: 'var(--accent-contrast)', font: 'inherit', fontWeight: 700, cursor: 'pointer' }}
        >
          Share
        </button>
      )}
    </div>
  );
}
