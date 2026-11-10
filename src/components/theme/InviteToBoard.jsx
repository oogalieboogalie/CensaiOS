import React from 'react';
import { api } from '../../lib/api.js';
import { inviteToBoard } from '../../lib/invites/index.js';
import { logToApp } from '../../lib/appLog/browserLog.js';
import { PUBLIC_LINK_RETRY, publishedJoinUrl, rememberPublishedOrigin } from '../../lib/workspace/publishedLink.js';

const field = { minWidth: 0, flex: 1, padding: '9px 10px', borderRadius: 'var(--radius-md)', border: '1px solid var(--hairline)', background: 'var(--surface-2)', color: 'var(--ink)', font: 'inherit' };
const primary = { border: 0, borderRadius: 'var(--radius-md)', padding: '9px 12px', background: 'var(--accent-line)', color: 'var(--surface)', fontWeight: 750, cursor: 'pointer' };

/**
 * "Invite to this board". An email of someone with an account here adds
 * them and puts the invite in their Inbox. No email makes a look-only
 * link that works once and runs out after 7 days.
 */
export function InviteToBoard({ workspaceId, onMember }) {
  const [email, setEmail] = React.useState('');
  const [link, setLink] = React.useState(null);
  const [state, setState] = React.useState({ status: 'idle', message: '' });

  async function publishLink(message) {
    const result = await api.createShareLink(workspaceId, {
      oneTime: true,
      role: 'view',
      scopeKind: 'board',
      scopeId: null,
      agentBudgetTokens: 0,
      expiresInHours: 7 * 24,
    });
    if (!rememberPublishedOrigin(result.url)) throw new Error(PUBLIC_LINK_RETRY);
    const url = publishedJoinUrl(result.token);
    setLink({ url });
    try { await navigator.clipboard.writeText(url); } catch { /* the field stays selectable */ }
    const changed = result.addressChanged ? ' The public address changed, so copy this link again. The old one no longer opens.' : '';
    setState({ status: 'done', message: `${message}${changed}` });
  }

  async function invite(event) {
    event.preventDefault();
    setState({ status: 'saving', message: '' });
    setLink(null);
    try {
      if (!email.trim()) {
        await publishLink('They open this link, type a name, and can look at this board.');
      } else {
        const result = await inviteToBoard(workspaceId, email);
        if (result.kind === 'account') {
          onMember?.(result.member);
          const who = result.member.name || result.member.email;
          const message = result.alreadyMember || !result.notified
            ? `${who} already has this board.`
            : `${who} can open this board now. The invite is in their Inbox.`;
          setState({ status: 'done', message });
        } else {
          await publishLink(`${email.trim()} has no account here yet. They open this link, type a name, and can look at this board.`);
        }
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
          {state.status === 'saving' ? 'Inviting…' : email.trim() ? 'Invite' : 'Make link and copy'}
        </button>
      </form>
      {link?.url ? (
        <div style={{ display: 'grid', gap: 6 }}>
          <div style={{ display: 'flex', gap: 8 }}>
            <input readOnly value={link.url} aria-label="Join link" onFocus={(e) => e.target.select()} style={field} />
            <button type="button" onClick={copy} style={primary}>Copy</button>
          </div>
          <div style={{ fontSize: 'var(--text-xs)', color: 'var(--ink-faint)' }}>
            It works once, for 7 days. They can look, not change the board. Not your keys, vault, or other boards.
          </div>
        </div>
      ) : null}
      {state.message ? (
        <div role="status" style={{ fontSize: 'var(--text-xs)', color: state.status === 'error' ? 'var(--ps-red)' : 'var(--accent-ink)' }}>{state.message}</div>
      ) : null}
    </div>
  );
}
