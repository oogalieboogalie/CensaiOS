import React from 'react';
import { api } from '../../lib/api.js';
import { logToApp } from '../../lib/appLog/browserLog.js';
import { useComputerOwnerAnswer } from '../docker/useComputerOwner.js';
import { ThemePanelCard } from './ThemeControls.jsx';

const field = { minWidth: 0, flex: 1, padding: '9px 10px', borderRadius: 'var(--radius-md)', border: '1px solid var(--hairline)', background: 'var(--surface-2)', color: 'var(--ink)', font: 'inherit' };
const primary = { border: 0, borderRadius: 'var(--radius-md)', padding: '9px 12px', background: 'var(--accent-line)', color: 'var(--surface)', fontWeight: 750, cursor: 'pointer' };
const quiet = { border: '1px solid var(--hairline)', borderRadius: 'var(--radius-md)', padding: '5px 10px', background: 'transparent', color: 'var(--ink)', cursor: 'pointer', font: 'inherit', fontSize: 'var(--text-xs)' };
const small = { fontSize: 'var(--text-xs)', color: 'var(--ink-faint)' };

/** Only admins of this censaiOS see the card; everyone else gets nothing. */
export function SignInDomainsSection({ isAdmin }) {
  const answer = useComputerOwnerAnswer();
  const admin = isAdmin ?? answer;
  if (admin !== true) return null;
  return (
    <>
      <div style={{ height: 12 }} />
      <SignInDomainsCard />
    </>
  );
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
    <ThemePanelCard style={{ padding: 14, display: 'grid', gap: 10 }} data-testid="sign-in-domains">
      <div>
        <div style={{ fontSize: 'var(--text-md)', fontWeight: 750, color: 'var(--ink)' }}>Who can sign up</div>
        <div style={{ ...small, marginTop: 3 }}>
          Anyone with an email at these domains can make an account here and sign in. Everyone else needs to be named below or invited.
        </div>
      </div>

      {file?.openToEveryone ? (
        <div role="note" style={{ ...small, color: 'var(--accent-ink)' }}>
          Right now anyone who can reach this censaiOS can make an account, so this list changes nothing yet.
        </div>
      ) : null}

      {domains.length ? (
        <ul aria-label="Domains that can sign up" style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 6 }}>
          {domains.map((row) => (
            <li key={row.domain} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ flex: 1, color: 'var(--ink)', fontWeight: 650 }}>@{row.domain}</span>
              <button type="button" style={quiet} disabled={busy} onClick={() => remove(row.domain)} aria-label={`Remove @${row.domain}`}>Remove</button>
            </li>
          ))}
        </ul>
      ) : state.status !== 'loading' && state.status !== 'error' ? (
        <div style={small}>No domains yet.</div>
      ) : null}

      <form onSubmit={add} style={{ display: 'flex', gap: 8 }} aria-label="Let a domain sign up">
        <input aria-label="Domain, for example censai.app" value={domain} onChange={(e) => setDomain(e.target.value)}
          placeholder="censai.app" disabled={busy} style={field} />
        <button type="submit" disabled={busy || !domain.trim()} style={{ ...primary, opacity: busy || !domain.trim() ? 0.5 : 1 }}>
          {busy ? 'Saving…' : 'Add domain'}
        </button>
      </form>

      {file && (file.allowedUsers.length || file.adminEmails.length) ? (
        <div style={small}>
          Also allowed by the server's settings file (change those in its <code>.env</code>):{' '}
          {[...new Set([...file.adminEmails, ...file.allowedUsers])].join(', ')}
        </div>
      ) : null}

      {state.message ? (
        <div role="status" style={{ fontSize: 'var(--text-xs)', color: state.status === 'error' ? 'var(--ps-red)' : 'var(--accent-ink)' }}>{state.message}</div>
      ) : null}
    </ThemePanelCard>
  );
}
