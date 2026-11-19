import React from 'react';
import { appUpdateApi } from '../../lib/appUpdate/api.js';
import { TRAY_UPDATE_EVENT } from '../../lib/appUpdate/trayFlow.js';
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
          label={`This computer runs version ${status.running.slice(0, 7)}.`}
          hint="Looks for a newer censaiOS. A new one downloads and builds while you keep working, and goes in when you say so. The board is away for a few seconds and comes back by itself."
        >
          <SettingsButton data-testid="check-for-update" onClick={() => window.dispatchEvent(new Event(TRAY_UPDATE_EVENT))}>
            Check for an update
          </SettingsButton>
        </SettingsRow>
      )}
    </SettingsSection>
  );
}
