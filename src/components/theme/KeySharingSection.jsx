import React from 'react';
import { getKeySharing, saveKeySharing } from '../../lib/keySharing.js';
import { SettingsNote, SettingsRows, SettingsSection, SwitchRow, useSaveNote } from './settingsKit.jsx';

function Account({ account, onChange }) {
  const label = account.name || account.email || 'An account';
  const hint = [account.name && account.email ? account.email : '', account.alwaysOn ? 'An owner of this computer: always uses its keys.' : '']
    .filter(Boolean).join(' ');
  return (
    <SwitchRow
      label={label}
      hint={hint || undefined}
      switchLabel={`Share my AI keys with ${label}`}
      checked={account.shared}
      disabled={account.alwaysOn}
      onChange={(on) => onChange(account.id, on)}
      data-testid="key-sharing-account"
    />
  );
}

/** Settings, AI keys: which accounts on this computer may use the owner's keys. */
export function KeySharingSection() {
  const [status, setStatus] = React.useState(null);
  const [error, setError] = React.useState('');

  React.useEffect(() => {
    getKeySharing().then(setStatus).catch((err) => setError(err.message));
  }, []);

  const { note, run } = useSaveNote();
  const change = (userId, shared) => run(async () => setStatus(await saveKeySharing(userId, shared)));

  if (!status?.available && !error) return null;

  return (
    <SettingsSection
      title="Share my AI keys with"
      hint={status?.canManage
        ? 'Other people who sign in to this computer use their own AI keys. Turn someone on to let them chat, run agents and make pictures on your keys instead. Off for everyone unless you turn it on.'
        : undefined}
      data-testid="key-sharing"
    >
      {!status?.canManage && status ? (
        <SettingsNote data-testid="key-sharing-member">
          {status.sharedWithMe ? 'The owner of this computer shares their AI keys with you.' : 'You use your own AI keys here. Add them above.'}
        </SettingsNote>
      ) : null}
      <SettingsNote tone="error">{error}</SettingsNote>
      {status?.canManage && status.accounts.length === 0 && <SettingsNote>Nobody else has signed in to this computer yet.</SettingsNote>}
      {status?.canManage && status.accounts.length > 0 && (
        <SettingsRows>
          {status.accounts.map((account) => <Account key={account.id} account={account} onChange={change} />)}
        </SettingsRows>
      )}
      <SettingsNote note={note} />
    </SettingsSection>
  );
}
