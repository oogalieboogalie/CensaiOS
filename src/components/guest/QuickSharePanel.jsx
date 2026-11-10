import React from 'react';
import { api } from '../../lib/api.js';
import { useBoardEvent } from '../../lib/collaboration/boardEvents.js';
import { NEEDS_OWN_CENSAI, onTryItBoard } from '../../lib/demo/needsOwnCensai.js';
import { PUBLIC_LINK_RETRY, publishedJoinUrl, rememberPublishedOrigin } from '../../lib/workspace/publishedLink.js';
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

function shareError(error, owner) {
  if (onTryItBoard()) return '';
  if (owner && error.status === 403) return 'Only the board owner can share it.';
  return error.message;
}

function linkLine(link) {
  const joined = link.joinCount || 0;
  const here = link.connected || 0;
  // `connected` counts sockets (an edit guest holds two), so say only whether someone is on.
  const people = joined === 0 ? 'nobody joined yet' : `${joined} joined${here ? ', on the board now' : ''}`;
  return `${ROLE_NAMES[link.role] || link.role} · ${link.scopeKind === 'board' ? 'whole board' : `one ${link.scopeKind}`} · ${people}`;
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
      setMessage(shareError(error, true));
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
      if (!rememberPublishedOrigin(result.url)) throw new Error(PUBLIC_LINK_RETRY);
      const url = publishedJoinUrl(result.token);
      const copied = await copyText(url);
      setMade({ id: result.link.id, url, copied });
      if (result.addressChanged) setMessage('The public address changed. Copy this link again. The old one no longer opens.');
      await load();
    } catch (error) {
      setMessage(shareError(error, false));
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
      setMessage(shareError(error, false));
    }
  }

  return (
    <div className="hb-qs" role="dialog" aria-label="Share this board" data-testid="quick-share">
      <header className="hb-qs-head">
        <b>Share this board</b>
        <button type="button" className="hb-qs-x" aria-label="Close" onClick={onClose}>×</button>
      </header>
      <p className="hb-qs-note">Anyone with the link opens it in a browser, types a name, and gets this board only. No account. They never see your keys, vault, memory or other boards.</p>
      {onTryItBoard() && <p className="hb-qs-note" data-testid="needs-own-censai">{NEEDS_OWN_CENSAI}</p>}
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
      {links.length > 0 && (
        <div className="hb-qs-list" data-testid="quick-share-links">
          <div className="hb-qs-sub">Links that work now</div>
          {links.map((link) => (
            <div className="hb-qs-row" key={link.id} data-testid="quick-share-link-row">
              <span className="hb-qs-row-text">{linkLine(link)}</span>
              {tokens[link.id] && <button type="button" className="hb-qs-btn" onClick={() => { const url = publishedJoinUrl(tokens[link.id]); if (!url) { setMessage(PUBLIC_LINK_RETRY); return; } copyText(url).then((ok) => setMessage(ok ? 'Link copied.' : 'Copy failed.')); }}>Copy</button>}
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
