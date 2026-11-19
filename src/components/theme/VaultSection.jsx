import React from 'react';
import { Icon } from '../Icons.jsx';
import { api } from '../../lib/api.js';
import { BYOK_PROVIDERS } from '../../lib/byokProviders.js';
import { BrandIcon } from '../brand/BrandIcon.jsx';
import { PROVIDER_BRAND, brandFor } from '../../lib/brands/index.js';
import { logToApp } from '../../lib/appLog/browserLog.js';
import { NEEDS_OWN_CENSAI, onTryItBoard } from '../../lib/demo/needsOwnCensai.js';
import { KEY_LIST_UNREADABLE, readKeyList } from './readKeyList.js';
import { SettingsButton, SettingsNote, SettingsSection } from './settingsKit.jsx';

function KeyForm({ provider, onSave, onCancel }) {
  const [key, setKey] = React.useState('');
  const [model, setModel] = React.useState('');
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState('');
  const save = async (event) => {
    event.preventDefault();
    if (!key) return;
    setSaving(true);
    setError('');
    try {
      await onSave(key, model || null);
    } catch (err) {
      setError(err.message || 'The key was not saved. Try again.');
      setSaving(false);
    }
  };
  return (
    <form className="hb-set-group hb-set-key-form" onSubmit={save}>
      <label className="hb-set-group">
        <span className="hb-set-label">Key</span>
        <input type="password" autoFocus autoComplete="off" className="hb-set-input hb-set-input--mono" value={key}
          onChange={(e) => setKey(e.target.value)} placeholder={provider.placeholder} />
      </label>
      {provider.id === 'openrouter' && (
        <label className="hb-set-group">
          <span className="hb-set-label">Model to use first (optional)</span>
          <input className="hb-set-input hb-set-input--mono" value={model} onChange={(e) => setModel(e.target.value)} placeholder="anthropic/claude-3.5-sonnet" />
        </label>
      )}
      <div className="hb-set-actions">
        <SettingsButton type="submit" variant="primary" disabled={saving || !key}>{saving ? 'Saving...' : 'Save key'}</SettingsButton>
        <SettingsButton onClick={onCancel}>Cancel</SettingsButton>
      </div>
      <SettingsNote tone="error">{error}</SettingsNote>
    </form>
  );
}

function ProviderRow({ provider, userKey, editing, onEdit, onRemove, onSave }) {
  // A local install's owner: the key is in the server's .env file.
  const fromEnv = userKey?.source === 'env';
  const status = !userKey ? 'Not added' : fromEnv ? "From this computer's .env file" : 'Added';
  return (
    <li className="hb-set-item hb-set-item--stack" data-provider={provider.id}>
      <div className="hb-set-inline">
        <span className={userKey ? 'hb-set-provider hb-set-provider--on' : 'hb-set-provider'} aria-hidden="true">
          {brandFor(PROVIDER_BRAND[provider.id]) ? <BrandIcon brand={PROVIDER_BRAND[provider.id]} size={16} title="" /> : <Icon.Tools size={16} />}
        </span>
        <span className="hb-set-item-main">
          <span className="hb-set-label">{provider.name}</span>
          <span className={userKey ? 'hb-set-note' : 'hb-set-hint'}>{userKey ? <Icon.Check size={11} /> : null}{status}</span>
        </span>
        {!editing && userKey && !fromEnv && <SettingsButton small onClick={onRemove} aria-label={`Remove the ${provider.name} key`}>Remove</SettingsButton>}
        {!editing && (
          <SettingsButton small onClick={() => onEdit()}>{fromEnv ? 'Use another key' : userKey ? 'Change' : 'Add key'}</SettingsButton>
        )}
      </div>
      {editing && <KeyForm provider={provider} onSave={onSave} onCancel={() => onEdit(null)} />}
    </li>
  );
}

/** Settings > AI keys: one row per provider; a key is added, changed or removed in its row. */
export function VaultSection() {
  const [keys, setKeys] = React.useState([]);
  const [loading, setLoading] = React.useState(true);
  const [loadFailed, setLoadFailed] = React.useState(false);
  const [editing, setEditing] = React.useState(null);
  const [note, setNote] = React.useState(null);

  const fetchKeys = async () => {
    try {
      setLoading(true);
      setKeys(readKeyList(await api.getUserKeys()));
      setLoadFailed(false);
    } catch {
      logToApp('warn', KEY_LIST_UNREADABLE, { where: 'vault' });
      setKeys([]);
      setLoadFailed(true);
    } finally {
      setLoading(false);
    }
  };

  React.useEffect(() => {
    fetchKeys();
  }, []);

  const save = (provider) => async (key, model) => {
    await api.setUserKey(provider.id, key, null, model);
    await fetchKeys();
    setEditing(null);
    setNote({ tone: 'ok', text: `${provider.name} key saved.` });
  };

  const remove = async (provider) => {
    if (!confirm(`Remove your ${provider.name} key?`)) return;
    try {
      await api.deleteUserKey(provider.id);
      await fetchKeys();
      setNote({ tone: 'ok', text: `${provider.name} key removed.` });
    } catch (err) {
      setNote({ tone: 'error', text: err.message || `The ${provider.name} key was not removed. Try again.` });
    }
  };

  const tryIt = onTryItBoard();
  return (
    <SettingsSection
      title="AI provider keys"
      hint={`Paste a key from a provider to use your own account with it. Keys are locked (encrypted) and kept in your account only.${keys.some((k) => k.source === 'env') ? ' A key marked as from the .env file comes from that file on this computer, is used only for you, and is not copied.' : ''}`}
      data-testid="vault-section"
    >
      {tryIt ? <SettingsNote data-testid="needs-own-censai">{NEEDS_OWN_CENSAI}</SettingsNote> : null}
      {loading ? <SettingsNote>Loading AI provider keys...</SettingsNote> : (
        <>
          {loadFailed && !tryIt ? <SettingsNote tone="warn">Your saved keys could not be read just now, so some may show as not added. Open AI keys again to retry.</SettingsNote> : null}
          <ul className="hb-set-list">
            {BYOK_PROVIDERS.map((provider) => (
              <ProviderRow
                key={provider.id}
                provider={provider}
                userKey={keys.find((k) => k.provider === provider.id)}
                editing={editing === provider.id}
                onEdit={(id = provider.id) => { setEditing(id); setNote(null); }}
                onRemove={() => remove(provider)}
                onSave={save(provider)}
              />
            ))}
          </ul>
        </>
      )}
      <SettingsNote note={note} />
    </SettingsSection>
  );
}
