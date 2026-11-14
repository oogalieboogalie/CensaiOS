import React from 'react';
import { CodeBox, Hint } from './CodeBox.jsx';
import { copyText } from '../../../lib/friends/index.js';

const muted = { fontSize: 'var(--text-xs)', color: 'var(--ink-faint)', margin: 0, lineHeight: 1.5 };
const button = { border: '1px solid var(--hairline)', borderRadius: 'var(--radius-md)', padding: '6px 10px', background: 'var(--surface-2)', color: 'var(--ink)', fontSize: 'var(--text-sm)', fontWeight: 700, cursor: 'pointer' };
const quiet = { ...button, background: 'transparent', color: 'var(--ink-soft)', fontWeight: 600 };
const ROLES = [['member', 'Can edit'], ['viewer', 'Can look']];

function FriendRow({ friend, busy, boardId, onShare, onStop, onRemove }) {
  const [role, setRole] = React.useState(friend.party?.role || 'member');
  const party = friend.party;
  return (
    <div role="listitem" data-testid="friend-row" data-sharing={party ? 'true' : 'false'}
      style={{ display: 'grid', gap: 8, padding: '9px 10px', borderRadius: 'var(--radius-md)', background: 'var(--surface)', border: '1px solid var(--hairline)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <div style={{ minWidth: 0, flex: 1 }}>
          <span style={{ fontSize: 'var(--text-sm)', fontWeight: 650, color: 'var(--ink)', overflowWrap: 'anywhere' }}>{friend.name}</span>
          {' '}
          <span style={{ ...muted, fontFamily: 'var(--font-mono, monospace)' }} title="The first characters of this friend's identity">{friend.mark}</span>
        </div>
        {party ? (
          <button type="button" style={button} disabled={busy} onClick={() => onStop(party)}>Stop sharing</button>
        ) : (
          <>
            <select aria-label={`What ${friend.name} can do on this board`} value={role} disabled={busy} onChange={(event) => setRole(event.target.value)}
              style={{ ...quiet, padding: '6px 8px' }}>
              {ROLES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
            <button type="button" style={button} disabled={busy} onClick={() => onShare(friend, role)}>Share this board</button>
          </>
        )}
        <button type="button" style={quiet} disabled={busy} aria-label={`Remove ${friend.name}`} onClick={() => onRemove(friend)}>Remove</button>
      </div>
      {party ? (
        <div style={{ display: 'grid', gap: 6 }}>
          <Hint tone={party.joined ? 'good' : undefined}>
            {party.joined
              ? `${friend.name} is on "${party.boardName}" now (${party.role === 'viewer' ? 'can look' : 'can edit'}).`
              : `Sharing "${party.boardName}" with ${friend.name} (${party.role === 'viewer' ? 'can look' : 'can edit'}). Send this party code to them and nobody else. It only works on ${friend.name}'s computer, and stops when you stop sharing.`}
          </Hint>
          <CodeBox code={party.code} label={`Party code for ${friend.name}`} testId="party-code" />
          {boardId && party.boardId !== boardId ? <Hint>That is a different board from the one you have open.</Hint> : null}
        </div>
      ) : null}
    </div>
  );
}

/** The friends list: share the open board with one, stop, or remove. */
export function FriendRows({ friends, busy, boardId, onShare, onStop, onRemove }) {
  if (!friends.length) {
    return <p style={muted} data-testid="no-friends">Nobody yet. Ask a friend for their friend code and paste it above.</p>;
  }
  return (
    <div role="list" aria-label="Your friends" style={{ display: 'grid', gap: 6 }}>
      {friends.map((friend) => (
        <FriendRow key={friend.id} friend={friend} busy={busy} boardId={boardId} onShare={onShare} onStop={onStop} onRemove={onRemove} />
      ))}
    </div>
  );
}

/** Boards of friends that are open on this computer right now. */
export function JoinedBoards({ joins, busy, safari = false, onOpen, onLeave }) {
  const [copied, setCopied] = React.useState('');
  if (!joins.length) return null;
  return (
    <div style={{ display: 'grid', gap: 6 }} data-testid="joined-boards">
      <div style={{ fontWeight: 650, color: 'var(--ink)', fontSize: 'var(--text-sm)' }}>Friends' boards you have open</div>
      {joins.map((join) => (
        <div key={join.id} style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', padding: '9px 10px', borderRadius: 'var(--radius-md)', background: 'var(--surface)', border: '1px solid var(--hairline)' }}>
          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={{ fontSize: 'var(--text-sm)', fontWeight: 650, color: 'var(--ink)', overflowWrap: 'anywhere' }}>{join.boardName}</div>
            <p style={muted}>{join.hostName}'s board. You are there as yourself.</p>
          </div>
          <button type="button" style={button} onClick={() => onOpen(join)}>Open</button>
          {safari ? (
            <button type="button" style={quiet} onClick={async () => setCopied((await copyText(join.url)) ? join.id : '')}>
              {copied === join.id ? 'Copied' : 'Copy address'}
            </button>
          ) : null}
          <button type="button" style={quiet} disabled={busy} onClick={() => onLeave(join)}>Leave</button>
        </div>
      ))}
      {safari ? (
        <p style={muted} data-testid="friends-safari-hint">
          Safari can't open a friend's board. If the new tab can't find the page, press Copy address and paste it into
          Chrome, Edge or Firefox. The address is for you only: it lets you in.
        </p>
      ) : null}
    </div>
  );
}
