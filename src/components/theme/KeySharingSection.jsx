import React from 'react';
import { ThemePanelCard } from './ThemeControls.jsx';
import { getKeySharing, saveKeySharing } from '../../lib/keySharing.js';

const muted = { fontSize: 'var(--text-xs)', color: 'var(--ink-faint)', margin: 0, lineHeight: 1.5 };
const row = { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, padding: '7px 9px', borderRadius: 'var(--radius-md)', background: 'var(--surface-2)' };

function Account({ account, onChange }) {
  const label = account.name || account.email || 'An account';
  return (
    <label style={{ ...row, cursor: account.alwaysOn ? 'default' : 'pointer' }} data-testid="key-sharing-account">
      <span style={{ minWidth: 0 }}>
        <span style={{ fontWeight: 650, color: 'var(--ink)' }}>{label}</span>
        {account.name && account.email && <span style={{ ...muted, display: 'block' }}>{account.email}</span>}
        {account.alwaysOn && <span style={{ ...muted, display: 'block' }}>An owner of this computer: always uses its keys.</span>}
      </span>
      <input
        type="checkbox"
        role="switch"
        aria-label={`Share my AI keys with ${label}`}
        checked={account.shared}
        disabled={account.alwaysOn}
        onChange={(e) => onChange(account.id, e.target.checked)}
      />
    </label>
  );
}

/** Settings, AI keys: which accounts on this computer may use the owner's keys. */
export function KeySharingSection() {
  const [status, setStatus] = React.useState(null);
  const [error, setError] = React.useState('');

  React.useEffect(() => {
    getKeySharing().then(setStatus).catch((err) => setError(err.message));
  }, []);

  async function change(userId, shared) {
    setError('');
    try {
      setStatus(await saveKeySharing(userId, shared));
    } catch (err) {
      setError(err.message);
    }
  }

  if (!status?.available && !error) return null;

  return (
    <ThemePanelCard style={{ padding: 14, display: 'grid', gap: 10, marginTop: 12 }} data-testid="key-sharing">
      <div>
        <div style={{ fontSize: 'var(--text-md)', fontWeight: 750, color: 'var(--ink)' }}>Share my AI keys with</div>
        {status?.canManage ? (
          <p style={{ ...muted, marginTop: 3 }}>
            Other people who sign in to this computer use their own AI keys. Turn someone on to let them chat,
            run agents and make pictures on your keys instead. Off for everyone unless you turn it on.
          </p>
        ) : (
          <p style={{ ...muted, marginTop: 3 }} data-testid="key-sharing-member">
            {status?.sharedWithMe
              ? 'The owner of this computer shares their AI keys with you.'
              : 'You use your own AI keys here. Add them above.'}
          </p>
        )}
      </div>
      {error && <p role="alert" style={{ ...muted, color: 'var(--ps-red)' }}>{error}</p>}
      {status?.canManage && status.accounts.length === 0 && (
        <p style={muted}>Nobody else has signed in to this computer yet.</p>
      )}
      {status?.canManage && status.accounts.map((account) => (
        <Account key={account.id} account={account} onChange={change} />
      ))}
    </ThemePanelCard>
  );
}
