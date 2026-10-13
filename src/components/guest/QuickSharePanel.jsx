import React from 'react';
import { api } from '../../lib/api.js';
import { useBoardEvent } from '../../lib/collaboration/boardEvents.js';
import { isThisComputerOnly, readShareBase, shareLinkFor, writeShareBase } from '../../lib/workspace/shareBase.js';
import { copyText, readTokens, rememberToken } from './GuestLinkParts.jsx';

// The board's Share button panel: pick "Can look" or "Can edit", make a link
// (it is copied right away), see the links that work now with how many
// people joined, and switch any of them off. Comment-only links, one window
// or group, expiry, passcodes and Go live stay under "More options"
// (Settings, Sharing).

const CHOICES = [
  { role: 'view', label: 'Can look', hint: 'Sees the board move live. Can\'t change anything.' },
  { role: 'edit', label: 'Can edit', hint: 'Moves, adds and types on the board with you.' },
];
const ROLE_NAMES = { view: 'Can look', comment: 'Can comment', edit: 'Can edit' };

function linkLine(link) {
  const joined = link.joinCount || 0;
  const here = link.connected || 0;
  // `connected` counts sockets (an edit guest holds two), so say only whether someone is on.
  const people = joined === 0 ? 'nobody joined yet' : `${joined} joined${here ? ', on the board now' : ''}`;
  return `${ROLE_NAMES[link.role] || link.role} · ${link.scopeKind === 'board' ? 'whole board' : `one ${link.scopeKind}`} · ${people}`;
}

function AddressNote() {
  const [editing, setEditing] = React.useState(false);
  const [value, setValue] = React.useState(() => readShareBase());
  const saved = readShareBase();
  if (!isThisComputerOnly() && !saved && !editing) return null;
  if (!editing) {
    return (
      <p className="hb-qs-note" data-testid="quick-share-address-note">
        {saved ? <>Links start with <b>{saved}</b>. </> : <>This address only opens on this computer. </>}
        <button type="button" className="hb-qs-link" onClick={() => setEditing(true)}>{saved ? 'Change' : 'Set the address people reach you at'}</button>
      </p>
    );
  }
  return (
    <form className="hb-qs-address" onSubmit={(event) => { event.preventDefault(); setValue(writeShareBase(value)); setEditing(false); }}>
      <input aria-label="Address people reach this censaiOS at" placeholder="https://board.example.com" value={value} onChange={(event) => setValue(event.target.value)} />
      <button type="submit" className="hb-qs-btn">Save</button>
    </form>
  );
}

export function QuickSharePanel({ workspaceId, onMoreOptions, onClose }) {
  const [role, setRole] = React.useState('view');
  const [links, setLinks] = React.useState([]);
  const [made, setMade] = React.useState(null);
  const [message, setMessage] = React.useState('');
  const [busy, setBusy] = React.useState(false);
  const tokens = React.useMemo(() => readTokens(), [links]);

  const load = React.useCallback(async () => {
    if (!workspaceId) return;
    try {
      const result = await api.listShareLinks(workspaceId);
      setLinks((result.links || []).filter((link) => link.active && link.mode !== 'live' && !link.classId));
    } catch (error) {
      setMessage(error.status === 403 ? 'Only the board owner can share it.' : error.message);
    }
  }, [workspaceId]);
  React.useEffect(() => { load(); }, [load]);
  useBoardEvent('share.links.changed', load);

  async function makeLink() {
    setBusy(true);
    setMessage('');
    try {
      const result = await api.createShareLink(workspaceId, { role, scopeKind: 'board', scopeId: null, agentBudgetTokens: 0 });
      rememberToken(result.link.id, result.token);
      const url = shareLinkFor(result.token);
      const copied = await copyText(url);
      setMade({ id: result.link.id, url, copied });
      await load();
    } catch (error) {
      setMessage(error.message);
    } finally {
      setBusy(false);
    }
  }

  async function switchOff(link) {
    try {
      const result = await api.revokeShareLink(workspaceId, link.id);
      setMessage(result.disconnected ? 'Link switched off. Anyone using it was taken off the board.' : 'Link switched off.');
      if (made?.id === link.id) setMade(null);
      await load();
    } catch (error) {
      setMessage(error.message);
    }
  }

  return (
    <div className="hb-qs" role="dialog" aria-label="Share this board" data-testid="quick-share">
      <header className="hb-qs-head">
        <b>Share this board</b>
        <button type="button" className="hb-qs-x" aria-label="Close" onClick={onClose}>×</button>
      </header>
      <p className="hb-qs-note">Anyone with the link joins under a name they pick. No account needed. They never see your keys, vault, memory or other boards.</p>
      <div className="hb-qs-choices" role="radiogroup" aria-label="What people with the link can do">
        {CHOICES.map((choice) => (
          <button
            key={choice.role} type="button" role="radio" aria-checked={role === choice.role}
            data-testid={`quick-share-${choice.role}`} className="hb-qs-choice" onClick={() => setRole(choice.role)}
          >
            <span className="hb-qs-choice-label">{choice.label}</span>
            <span className="hb-qs-choice-hint">{choice.hint}</span>
          </button>
        ))}
      </div>
      <button type="button" className="hb-qs-btn" data-primary disabled={busy} onClick={makeLink} data-testid="quick-share-make">
        {busy ? 'Making link' : 'Make link and copy'}
      </button>
      {made && (
        <div className="hb-qs-made">
          <input aria-label="Share link" readOnly value={made.url} onFocus={(event) => event.target.select()} data-testid="quick-share-url" />
          <span className="hb-qs-note">{made.copied ? 'Copied. Paste it to anyone.' : 'Select the link and copy it.'}</span>
        </div>
      )}
      <AddressNote />
      {links.length > 0 && (
        <div className="hb-qs-list" data-testid="quick-share-links">
          <div className="hb-qs-sub">Links that work now</div>
          {links.map((link) => (
            <div className="hb-qs-row" key={link.id} data-testid="quick-share-link-row">
              <span className="hb-qs-row-text">{linkLine(link)}</span>
              {tokens[link.id] && <button type="button" className="hb-qs-btn" onClick={() => copyText(shareLinkFor(tokens[link.id])).then((ok) => setMessage(ok ? 'Link copied.' : 'Copy failed.'))}>Copy</button>}
              <button type="button" className="hb-qs-btn" data-danger onClick={() => switchOff(link)} data-testid="quick-share-off">Switch off</button>
            </div>
          ))}
        </div>
      )}
      {message && <p className="hb-qs-note" role="status" data-testid="quick-share-message">{message}</p>}
      <footer className="hb-qs-foot">
        <button type="button" className="hb-qs-link" onClick={onMoreOptions}>More options: comment only, one window, expiry, passcode, Go live</button>
      </footer>
    </div>
  );
}
