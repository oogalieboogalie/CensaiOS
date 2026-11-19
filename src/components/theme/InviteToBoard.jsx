import React from 'react';
import { api } from '../../lib/api.js';
import { invitePerson, inviteToBoard, knownPeople } from '../../lib/invites/index.js';
import { logToApp } from '../../lib/appLog/browserLog.js';
import { PUBLIC_LINK_RETRY, publishedJoinUrl, rememberPublishedOrigin } from '../../lib/workspace/publishedLink.js';

import { SettingsButton, SettingsGroup, SettingsNote } from './settingsKit.jsx';

/**
 * "Invite to this board". An email of someone with an account here adds
 * them and puts the invite in their Inbox. No email makes a look-only
 * link that works once and runs out after 7 days.
 */
export function InviteToBoard({ workspaceId, onMember }) {
  const [email, setEmail] = React.useState('');
  const [link, setLink] = React.useState(null);
  const [state, setState] = React.useState({ status: 'idle', message: '' });
  const [people, setPeople] = React.useState([]);

  React.useEffect(() => {
    let live = true;
    knownPeople().then((list) => { if (live) setPeople(list); }, () => {});
    return () => { live = false; };
  }, []);

  async function tap(person) {
    setState({ status: 'saving', message: '' });
    setLink(null);
    try {
      const result = await invitePerson(workspaceId, person.id);
      onMember?.(result.member);
      setState({ status: 'done', message: result.notified ? `${person.name} got the invite. It pops up in their censaiOS.` : `${person.name} already has this board.` });
    } catch (error) {
      logToApp('warn', 'invite by tap failed', { where: 'invites' });
      setState({ status: 'error', message: error.message });
    }
  }

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

  const busy = state.status === 'saving';
  return (
    <SettingsGroup title="Invite people" hint="Type the email of someone with an account here, or leave it empty to make a look-only link." data-testid="invite-to-board">
      {people.length ? (
        <div className="hb-set-actions" aria-label="People you can invite">
          {people.map((person) => (
            <SettingsButton key={person.id} small onClick={() => tap(person)} disabled={busy}>Invite {person.name}</SettingsButton>
          ))}
        </div>
      ) : null}
      <form onSubmit={invite} className="hb-set-inline" aria-label="Invite to this board">
        <input aria-label="Their email, if they have an account here" type="email" value={email} onChange={(e) => setEmail(e.target.value)}
          placeholder="Their email, or leave empty for a link" disabled={busy} className="hb-set-input" />
        <SettingsButton type="submit" variant="primary" disabled={busy}>
          {busy ? 'Inviting...' : email.trim() ? 'Invite' : 'Make link and copy'}
        </SettingsButton>
      </form>
      {link?.url ? (
        <>
          <div className="hb-set-inline">
            <input readOnly value={link.url} aria-label="Join link" onFocus={(e) => e.target.select()} className="hb-set-input hb-set-input--mono" />
            <SettingsButton onClick={copy}>Copy</SettingsButton>
          </div>
          <p className="hb-set-hint">It works once, for 7 days. They can look, not change the board. Not your keys, vault, or other boards.</p>
        </>
      ) : null}
      <SettingsNote note={state.message ? { tone: state.status === 'error' ? 'error' : 'ok', text: state.message } : null} />
    </SettingsGroup>
  );
}
