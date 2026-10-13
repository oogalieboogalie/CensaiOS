import React from 'react';
import { setUserKey } from '../../lib/api/keys.js';
import { openKeySettings } from '../../lib/chat/openKeySettings.js';
import { keyChoicesFor, keyProviderInfo } from '../../lib/chat/keyNeeded.js';

/**
 * Shown in place of an error when a chat has no key for its model: says
 * which key is missing, takes it right here, then sends the message again.
 */
export function KeyNeededCard({ keyProvider = null, agentName = 'Censai', message = '', onSaved }) {
  const choices = keyChoicesFor(keyProvider);
  const [provider, setProvider] = React.useState(choices[0].id);
  const [key, setKey] = React.useState('');
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState('');
  const info = keyProviderInfo(provider);

  const save = async (event) => {
    event.preventDefault();
    const trimmed = key.trim();
    if (!trimmed || saving) return;
    setSaving(true);
    setError('');
    try {
      await setUserKey(provider, trimmed);
      setKey('');
      onSaved?.(provider);
    } catch (err) {
      setError(err?.message ? `The key was not saved: ${err.message}` : 'The key was not saved. Try once more.');
    }
    setSaving(false);
  };

  return (
    <form className="hb-key-card" data-testid="chat-key-needed" onSubmit={save}>
      <div className="hb-key-card-title">Add a key to talk to {agentName}</div>
      <p className="hb-key-card-text">{message}</p>
      {choices.length > 1 && (
        <div className="hb-key-card-choices" role="radiogroup" aria-label="Which AI to use">
          {choices.map(choice => (
            <button
              key={choice.id}
              type="button"
              role="radio"
              aria-checked={provider === choice.id}
              className="hb-key-card-choice"
              data-on={provider === choice.id ? 'true' : undefined}
              onClick={() => { setProvider(choice.id); setError(''); }}
            >
              {choice.short}
            </button>
          ))}
        </div>
      )}
      <div className="hb-key-card-row">
        <input
          type="password"
          autoComplete="off"
          spellCheck={false}
          aria-label={`${info.name} key`}
          placeholder={`Paste your ${info.name} key (${info.placeholder})`}
          value={key}
          onChange={event => setKey(event.target.value)}
          disabled={saving}
        />
        <button type="submit" className="hb-key-card-save" disabled={!key.trim() || saving}>
          {saving ? 'Saving…' : 'Save and send'}
        </button>
      </div>
      {error && <div className="hb-key-card-error" role="alert">{error}</div>}
      <div className="hb-key-card-foot">
        {info.getKeyUrl && (
          <a href={info.getKeyUrl} target="_blank" rel="noreferrer noopener">Where to get a {info.short} key</a>
        )}
        <button type="button" className="hb-key-card-link" onClick={() => openKeySettings()}>
          All AI keys
        </button>
        <span>Your key is locked away and only used for your messages.</span>
      </div>
    </form>
  );
}
