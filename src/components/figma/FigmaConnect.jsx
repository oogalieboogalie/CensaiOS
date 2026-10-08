import React from 'react';
import { inputStyle, primaryButton } from './figmaStyles.js';

// BYOK: the user's own Figma personal access token, stored encrypted in the
// same vault as model keys. Read-only file access is all the import needs.
export function FigmaConnect({ connection }) {
  const [token, setToken] = React.useState('');
  const ready = token.trim().length > 8 && !connection.loading;

  return (
    <form
      onSubmit={(e) => { e.preventDefault(); if (ready) connection.connect(token.trim()).then(() => setToken('')); }}
      style={{ display: 'grid', gap: 12, padding: '22px 20px' }}
    >
      <div style={{ font: '600 15px var(--font-sans)', color: 'var(--ink)' }}>Connect your Figma</div>
      <div style={{ font: '13px/1.5 var(--font-sans)', color: 'var(--ink-soft)' }}>
        Paste a Figma personal access token to pull frames onto the canvas as live, editable code.
        In Figma open Settings, then Security, then Personal access tokens, and create one with
        read access to file content.
      </div>
      <input
        type="password"
        autoComplete="off"
        aria-label="Figma personal access token"
        placeholder="figd_..."
        value={token}
        onChange={(e) => setToken(e.target.value)}
        style={inputStyle}
      />
      {connection.invalid && (
        <div role="alert" style={{ font: '12px var(--font-sans)', color: 'var(--ps-red)' }}>
          Figma rejected the saved token. Paste a new one.
        </div>
      )}
      {connection.error && (
        <div role="alert" style={{ font: '12px var(--font-sans)', color: 'var(--ps-red)' }}>{connection.error}</div>
      )}
      <button type="submit" disabled={!ready} style={primaryButton(ready)}>
        {connection.loading ? 'Checking…' : 'Connect Figma'}
      </button>
      <div style={{ font: '11px var(--font-sans)', color: 'var(--ink-faint)' }}>
        The token is encrypted on the server and never sent back to the browser.
      </div>
    </form>
  );
}
