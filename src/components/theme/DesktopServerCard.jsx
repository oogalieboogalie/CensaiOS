import React, { useEffect, useState } from 'react';
import { changeDesktopServer, getDesktopServer } from '../../lib/desktopServer.js';
import { SettingsButton, SettingsNote, SettingsRow, SettingsSection } from './settingsKit.jsx';

/** Settings > Open anywhere, only in the installed desktop app: which computer's censaiOS it opens. */
export function DesktopServerCard() {
  const [server, setServer] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let live = true;
    getDesktopServer().then((info) => { if (live) setServer(info); });
    return () => { live = false; };
  }, []);

  if (!server) return null;

  const change = () => {
    setError('');
    changeDesktopServer().catch((err) => setError(String(err?.message || err)));
  };

  return (
    <SettingsSection title="Desktop app" data-testid="desktop-server">
      <SettingsRow label={server.mode === 'remote' ? `Opens censaiOS on ${server.url}` : 'Opens censaiOS on this computer'}
        hint="Point the desktop app at censaiOS on another computer, or back at this one.">
        <SettingsButton onClick={change}>Change computer</SettingsButton>
      </SettingsRow>
      <SettingsNote tone="error">{error}</SettingsNote>
    </SettingsSection>
  );
}
