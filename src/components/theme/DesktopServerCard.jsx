import React, { useEffect, useState } from 'react';
import { ThemePanelCard } from './ThemeControls.jsx';
import { changeDesktopServer, getDesktopServer } from '../../lib/desktopServer.js';

/** Only in the installed desktop app: which computer's censaiOS is open. */
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
    <ThemePanelCard style={{ padding: 14, display: 'grid', gap: 11 }}>
      <div>
        <div style={{ fontSize: 'var(--text-md)', fontWeight: 750, color: 'var(--ink)' }}>Desktop app</div>
        <div style={{ marginTop: 3, fontSize: 'var(--text-xs)', color: 'var(--ink-faint)' }}>
          {server.mode === 'remote' ? `Opens censaiOS on ${server.url}` : 'Opens censaiOS on this computer'}
        </div>
      </div>
      <button onClick={change} style={{ all: 'unset', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '10px 12px', borderRadius: 'var(--radius-lg)', fontSize: 'var(--text-sm)', fontWeight: 700, background: 'var(--surface)', color: 'var(--ink-soft)', border: '1px solid var(--hairline)' }}>
        Change computer
      </button>
      {error && <div role="alert" style={{ color: 'var(--ps-red)', fontSize: 'var(--text-xs)' }}>{error}</div>}
    </ThemePanelCard>
  );
}
