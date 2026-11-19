import React from 'react';
import { api } from '../../lib/api.js';
import { logToApp } from '../../lib/appLog/browserLog.js';
import { useComputerOwnerAnswer } from '../docker/useComputerOwner.js';
import { SettingsButton, SettingsNote, SettingsSection } from './settingsKit.jsx';

/** Only admins of this censaiOS see the card; everyone else gets nothing. */
export function SignInDomainsSection({ isAdmin }) {
  const answer = useComputerOwnerAnswer();
  const admin = isAdmin ?? answer;
  if (admin !== true) return null;
  return <SignInDomainsCard />;
}

/**
 * "Who can sign up": anyone with an email at one of these domains can make
 * an account on this censaiOS, like an organisation that only lets in its
 * own addresses. The people named in the server's settings file still can too.
 */
export function SignInDomainsCard() {
  const [data, setData] = React.useState(null);
  const [domain, setDomain] = React.useState('');
  const [state, setState] = React.useState({ status: 'loading', message: '' });

  const load = React.useCallback(async () => {
    try {
      setData(await api.getSignInDomains());
      setState({ status: 'ready', message: '' });
    } catch (error) {
      setState({ status: 'error', message: error.message });
    }
  }, []);

  React.useEffect(() => { load(); }, [load]);

  async function add(event) {
    event.preventDefault();
    setState({ status: 'saving', message: '' });
    try {
      const result = await api.addSignInDomain(domain);
      setData(result);
      setDomain('');
      setState({ status: 'ready', message: `Anyone with an @${result.domain} email can sign up now.` });
    } catch (error) {
      logToApp('warn', `adding a sign-up domain failed: ${error.message}`, { where: 'sign-in-domains' });
      setState({ status: 'error', message: error.message });
    }
  }

  async function remove(name) {
    setState({ status: 'saving', message: '' });
    try {
      setData(await api.removeSignInDomain(name));
      setState({ status: 'ready', message: `@${name} emails can no longer sign up. People named in the settings file still can.` });
    } catch (error) {
      setState({ status: 'error', message: error.message });
    }
  }

  const domains = data?.domains || [];
  const file = data?.settingsFile;
  const busy = state.status === 'saving';

  return (
    <SettingsSection
      title="Who can sign up"
      hint="Anyone with an email at these domains can make an account here and sign in. Everyone else needs to be named below or invited."
      data-testid="sign-in-domains"
    >
      {file?.openToEveryone ? (
        <p role="note" className="hb-set-note hb-set-note--warn">
          Right now anyone who can reach this censaiOS can make an account, so this list changes nothing yet.
        </p>
      ) : null}

      {domains.length ? (
        <ul aria-label="Domains that can sign up" className="hb-set-list">
          {domains.map((row) => (
            <li key={row.domain} className="hb-set-item">
              <span className="hb-set-item-main">@{row.domain}</span>
              <SettingsButton small disabled={busy} onClick={() => remove(row.domain)} aria-label={`Remove @${row.domain}`}>Remove</SettingsButton>
            </li>
          ))}
        </ul>
      ) : state.status !== 'loading' && state.status !== 'error' ? (
        <SettingsNote>No domains yet.</SettingsNote>
      ) : null}

      <form onSubmit={add} className="hb-set-inline" aria-label="Let a domain sign up">
        <input aria-label="Domain, for example censai.app" value={domain} onChange={(e) => setDomain(e.target.value)}
          placeholder="censai.app" disabled={busy} className="hb-set-input" />
        <SettingsButton type="submit" variant="primary" disabled={busy || !domain.trim()}>
          {busy ? 'Saving...' : 'Add domain'}
        </SettingsButton>
      </form>

      {file && (file.allowedUsers.length || file.adminEmails.length) ? (
        <p className="hb-set-hint">
          Also allowed by the server&apos;s settings file (change those in its <code className="hb-code">.env</code>):{' '}
          {[...new Set([...file.adminEmails, ...file.allowedUsers])].join(', ')}
        </p>
      ) : null}

      <SettingsNote note={state.message ? { tone: state.status === 'error' ? 'error' : 'ok', text: state.message } : null} />
    </SettingsSection>
  );
}
