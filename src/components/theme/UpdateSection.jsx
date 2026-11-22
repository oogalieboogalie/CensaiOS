import React from 'react';
import { appUpdateApi } from '../../lib/appUpdate/api.js';
import { TRAY_UPDATE_EVENT } from '../../lib/appUpdate/trayFlow.js';
import { updateSummary, versionLabel } from '../../lib/appUpdate/version.js';
import { SettingsButton, SettingsNote, SettingsRow, SettingsSection } from './settingsKit.jsx';

/**
 * Settings > Canvas: the same "Update censaiOS" the desktop tray has, for a
 * censaiOS opened in a browser (a laptop reaching the computer that runs it).
 * Shown only to the owner of a copy that updates itself.
 */
export function UpdateSection() {
  const [status, setStatus] = React.useState(null);
  const [error, setError] = React.useState('');
  React.useEffect(() => {
    let alive = true;
    appUpdateApi.status().then((s) => { if (alive) setStatus(s); }).catch((err) => {
      // 403 and 404 are the normal "not yours to update" answers: no row.
      if (alive && ![403, 404].includes(err?.status)) setError('Could not ask this computer about updates. Try again in a moment.');
    });
    return () => { alive = false; };
  }, []);
  if (!error && !status?.running) return null;
  return (
    <SettingsSection title="Update censaiOS" data-testid="update-section">
      {error ? <SettingsNote tone="error">{error}</SettingsNote> : (
        <SettingsRow
          label={status.version ? `This computer runs ${versionLabel(status.version)}.` : `This computer runs version ${status.running.slice(0, 7)}.`}
          hint="Looks for a newer censaiOS. A new one downloads and builds while you keep working, and goes in when you say so. The board is away for a few seconds and comes back by itself."
        >
          <SettingsButton data-testid="check-for-update" onClick={() => window.dispatchEvent(new Event(TRAY_UPDATE_EVENT))}>
            Check for an update
          </SettingsButton>
        </SettingsRow>
      )}
      {!error && status.updated && (
        <div data-testid="update-notes" style={{ display: 'grid', gap: 4, fontSize: 'var(--text-xs)', color: 'var(--ink-soft)' }}>
          <strong style={{ color: 'var(--ink)' }}>What changed in {status.updated.version}</strong>
          <span>{updateSummary(status.updated)}{status.updated.at ? ` ${new Date(status.updated.at).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}.` : ''}</span>
          {status.updated.changes.length > 0 && <ul style={{ margin: 0, paddingLeft: 18 }}>{status.updated.changes.map((c, i) => <li key={i}>{c}</li>)}</ul>}
        </div>
      )}
    </SettingsSection>
  );
}
