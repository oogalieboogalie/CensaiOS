import React from 'react';
import { addressForOthers, inviteLink, inviteToBoard } from '../../lib/invites/index.js';
import { logToApp } from '../../lib/appLog/browserLog.js';

const field = { minWidth: 0, flex: 1, padding: '9px 10px', borderRadius: 'var(--radius-md)', border: '1px solid var(--hairline)', background: 'var(--surface-2)', color: 'var(--ink)', font: 'inherit' };
const primary = { border: 0, borderRadius: 'var(--radius-md)', padding: '9px 12px', background: 'var(--accent-line)', color: 'var(--surface)', fontWeight: 750, cursor: 'pointer' };

/**
 * "Invite to this board". An email of someone with an account here adds
 * them and puts the invite in their Inbox. No email (or no account yet)
 * makes a one-time join link: they type their name and land on this board.
 */
export function InviteToBoard({ workspaceId, onMember }) {
  const [email, setEmail] = React.useState('');
  const [link, setLink] = React.useState(null);
  const [state, setState] = React.useState({ status: 'idle', message: '' });

  async function invite(event) {
    event.preventDefault();
    setState({ status: 'saving', message: '' });
    setLink(null);
    try {
      const result = await inviteToBoard(workspaceId, email);
      if (result.kind === 'account') {
        onMember?.(result.member);
        const who = result.member.name || result.member.email;
        setState({ status: 'done', message: result.notified ? `${who} can open this board now. The invite is in their Inbox.` : `${who} already has this board.` });
      } else {
        const { address, doorClosed } = await addressForOthers();
        setLink({ url: inviteLink(address, result.code), doorClosed });
        setState({ status: 'done', message: email.trim() ? `${email.trim()} has no account here yet, so here is a link for them.` : '' });
      }
      setEmail('');
    } catch (error) {
      logToApp('warn', `invite to this board failed: ${error.message}`, { where: 'invites' });
      setState({ status: 'error', message: error.message });
    }
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(link.url);
      setState({ status: 'done', message: 'Link copied.' });
    } catch {
      setState({ status: 'done', message: 'Select the link and copy it.' });
    }
  }

  return (
    <div style={{ display: 'grid', gap: 8 }} data-testid="invite-to-board">
      <div style={{ fontSize: 'var(--text-sm)', fontWeight: 700, color: 'var(--ink)' }}>Invite to this board</div>
      <form onSubmit={invite} style={{ display: 'flex', gap: 8 }} aria-label="Invite to this board">
        <input aria-label="Their email, if they have an account here" type="email" value={email} onChange={(e) => setEmail(e.target.value)}
          placeholder="Their email, or leave empty for a link" disabled={state.status === 'saving'} style={field} />
        <button type="submit" disabled={state.status === 'saving'} style={{ ...primary, opacity: state.status === 'saving' ? 0.5 : 1 }}>
          {state.status === 'saving' ? 'Inviting…' : email.trim() ? 'Invite' : 'Make a link'}
        </button>
      </form>
      {link ? (
        <div style={{ display: 'grid', gap: 6 }}>
          <div style={{ display: 'flex', gap: 8 }}>
            <input readOnly value={link.url} aria-label="Join link" onFocus={(e) => e.target.select()} style={field} />
            <button type="button" onClick={copy} style={primary}>Copy</button>
          </div>
          <div style={{ fontSize: 'var(--text-xs)', color: 'var(--ink-faint)' }}>
            Send it to them. It works once, for 7 days. They type their name and get their own account on this board.
            {link.doorClosed ? ' Turn on Settings, Open anywhere first, or it will not open on their device.' : ''}
          </div>
        </div>
      ) : null}
      {state.message ? (
        <div role="status" style={{ fontSize: 'var(--text-xs)', color: state.status === 'error' ? 'var(--ps-red)' : 'var(--accent-ink)' }}>{state.message}</div>
      ) : null}
    </div>
  );
}
