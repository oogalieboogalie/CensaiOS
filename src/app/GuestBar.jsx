// The bar across the top of a guest's board: board name and role, the
// follow-the-host chip, reactions, the people here, comments and Leave.
// `extras` lets a class (spec 12) add its lesson controls.

import React from 'react';
import { GuestReactionButtons, Wordmark, chipButton } from './GuestJoin.jsx';

export function GuestBar({
  session, live, chip, right, following, onFollow, reactions, onReact, handRaised, onToggleHand,
  participants, extras, canComment, commentsOpen, onToggleComments, onLeave,
}) {
  return (
    <header
      data-testid="guest-bar"
      style={{
        position: 'fixed', top: 12, left: 12, right, zIndex: 350,
        display: 'flex', alignItems: 'center', gap: 10, pointerEvents: 'none',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 8px 6px 12px', background: 'var(--surface)', border: '1px solid var(--hairline)', borderRadius: 'var(--radius-full)', boxShadow: 'var(--elevation-1)', pointerEvents: 'auto', fontSize: 'var(--text-sm)' }}>
        <Wordmark />
        <span style={{ width: 1, height: 16, background: 'var(--hairline)' }} />
        <span style={{ color: 'var(--ink)', fontWeight: 600 }}>{session.workspaceName || 'Shared board'}</span>
        <span data-testid="guest-role-chip" style={{ padding: '2px 8px', borderRadius: 'var(--radius-full)', background: 'var(--accent-soft)', color: 'var(--accent-ink)', fontSize: 'var(--text-xs)', fontWeight: 600 }}>
          {live && <span aria-hidden="true" style={{ display: 'inline-block', width: 6, height: 6, marginRight: 5, borderRadius: 'var(--radius-full)', background: 'var(--danger)' }} />}
          {chip}
        </span>
      </div>
      <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 6, pointerEvents: 'auto' }}>
        {live && !following && (
          <button type="button" data-testid="guest-follow" onClick={onFollow} style={chipButton(true)}>Back to host</button>
        )}
        {live && following && <span style={{ ...chipButton(), cursor: 'default' }}>Following host</span>}
        {reactions && <GuestReactionButtons onReact={onReact} handRaised={handRaised} onToggleHand={onToggleHand} />}
        {participants.slice(0, 5).map((participant) => (
          <span key={participant.clientId} title={participant.actor?.label} style={{ width: 24, height: 24, display: 'grid', placeItems: 'center', borderRadius: 'var(--radius-full)', background: participant.actor?.color || 'var(--accent-soft)', color: participant.actor?.color ? 'var(--on-fill)' : 'var(--accent-ink)', fontSize: 'var(--text-xs)', fontWeight: 700, border: '2px solid var(--surface)' }}>
            {(participant.actor?.label || '?').slice(0, 2).toUpperCase()}
          </span>
        ))}
        {extras}
        {canComment && (
          <button type="button" data-testid="guest-comments" aria-pressed={commentsOpen} onClick={onToggleComments} style={chipButton(commentsOpen)}>Comments</button>
        )}
        {onLeave && <button type="button" data-testid="guest-leave" onClick={onLeave} style={chipButton()}>Leave</button>}
      </div>
    </header>
  );
}
