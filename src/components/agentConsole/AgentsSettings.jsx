/* eslint-disable no-unused-vars -- JSX references are not detected by the legacy lint config. */
import React from 'react';
import { Icon } from '../Icons.jsx';
import { CliMark, CliStatusChip } from './CliMark.jsx';
import { cliAgentsApi, VAULT_PROVIDER } from './cliAgentsApi.js';
import { refreshCliRoster } from './useCliRoster.js';

// The console's settings page (what the old Toolchains window did, minus
// the image rebuild): per CLI install with progress, key source, and a
// place to add a key to the vault. Keys are write-only from here.

function KeyField({ cli }) {
  const [value, setValue] = React.useState('');
  const [state, setState] = React.useState(null);
  const save = async () => {
    if (!value.trim()) return;
    setState('saving');
    try {
      await cliAgentsApi.saveKey(VAULT_PROVIDER[cli.id], value.trim());
      setValue('');
      setState('saved');
      refreshCliRoster(true);
    } catch (err) {
      setState(err.message);
    }
  };
  return (
    <div className="ac-key">
      <input type="password" className="ac-input" autoComplete="off" placeholder={`${cli.keyEnv} (stored encrypted in your key vault)`}
        value={value} onChange={(e) => setValue(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && save()} aria-label={`${cli.label} API key`} />
      <button type="button" className="ac-btn" onClick={save} disabled={!value.trim() || state === 'saving'}>Save key</button>
      {state && state !== 'saving' && <span className={state === 'saved' ? 'ac-muted' : 'ac-error-text'}>{state === 'saved' ? 'Saved' : state}</span>}
    </div>
  );
}

export function AgentsSettings({ roster, onOpenToolchains }) {
  const [error, setError] = React.useState(null);
  const install = async (id) => {
    setError(null);
    try {
      await cliAgentsApi.install(id);
      refreshCliRoster(true);
    } catch (err) {
      setError(err.message);
    }
  };
  return (
    <div className="ac-settings" data-testid="agent-settings">
      <p className="ac-muted">Bring your own keys or CLI logins. Keys stay in the encrypted vault and go only into that CLI&apos;s environment; the transcript never shows them.</p>
      {error && <div className="ac-error" role="alert"><Icon.Alert size={13} />{error}</div>}
      {roster.map((cli) => (
        <section key={cli.id} className="ac-setting-row">
          <div className="ac-setting-head">
            <CliMark cli={cli.id} />
            <div className="ac-setting-name">
              <span className="ac-cli-name">{cli.label}</span>
              <span className="ac-muted">{cli.vendor} · {cli.gateNote}</span>
            </div>
            <CliStatusChip cli={cli} />
          </div>
          {cli.install?.status === 'installing' && (
            <div className="ac-progress" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round((cli.install.progress || 0) * 100)}>
              <div className="ac-progress-track"><div className="ac-progress-fill" style={{ width: `${Math.round((cli.install.progress || 0) * 100)}%` }} /></div>
              <span className="ac-muted">{cli.install.phase}</span>
            </div>
          )}
          {cli.install?.status === 'error' && <div className="ac-error-text">{cli.install.error}</div>}
          <div className="ac-setting-actions">
            {!cli.installed && cli.install?.status !== 'installing' && (
              <button type="button" className="ac-btn" onClick={() => install(cli.id)}><Icon.Download size={12} />Install</button>
            )}
            {cli.installed && <span className="ac-muted">{cli.source === 'managed' ? 'Installed by Homebase' : cli.source === 'override' ? 'Custom binary' : 'Found on PATH'}</span>}
            <a className="ac-link" href={cli.homepage} target="_blank" rel="noreferrer">Docs</a>
          </div>
          <KeyField cli={cli} />
        </section>
      ))}
      {onOpenToolchains && (
        <button type="button" className="ac-link" onClick={onOpenToolchains}>Docker sandbox image (advanced)</button>
      )}
    </div>
  );
}
