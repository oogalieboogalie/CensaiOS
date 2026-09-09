import React from 'react';

export function SetupGuide() {
  return (
    <div style={{ flex: 1, overflowY: 'auto', padding: 24, display: 'flex', flexDirection: 'column', gap: 16, maxWidth: 640, margin: '0 auto', lineHeight: 1.5 }}>
      <div style={{ padding: 16, background: 'oklch(0.97 0.02 260)', border: '1px solid oklch(0.85 0.05 260)', borderRadius: 12, color: 'oklch(0.3 0.08 260)' }}>
        <h3 style={{ margin: '0 0 8px', fontSize: 15 }}>Welcome to the Censai Mailcow Integration!</h3>
        <p style={{ margin: 0, fontSize: 13 }}>
          This panel enables you and your agents to manage email domains, create mailboxes, redirect aliases, and flush the mail queues right from the infinite canvas.
        </p>
      </div>
      
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <h4 style={{ margin: '8px 0 4px', fontSize: 13, textTransform: 'uppercase', fontFamily: 'var(--font-mono)', color: 'var(--ink-soft)' }}>Configuration Steps:</h4>
        <ol style={{ margin: 0, paddingLeft: 20, fontSize: 13, display: 'flex', flexDirection: 'column', gap: 6 }}>
          <li>Setup your mailcow-dockerized server (see our <a href="https://docs.mailcow.email/" target="_blank" rel="noreferrer" style={{ color: 'var(--accent)', fontWeight: 600 }}>official mailcow docs</a>).</li>
          <li>Go to the mailcow Admin Panel → Configuration → Access → API keys.</li>
          <li>Generate a new API key, whitelisting your server IP.</li>
          <li>Add the variables below to your Censai <code>.env</code> file:</li>
        </ol>
      </div>

      <pre style={{ margin: 0, background: 'var(--surface-2)', border: '1px solid var(--hairline)', borderRadius: 8, padding: 12, fontSize: 12, fontFamily: 'var(--font-mono)', overflowX: 'auto', color: 'var(--ink)' }}>
        {`MAILCOW_URL=https://mail.censai.app\nMAILCOW_API_KEY=your_generated_api_key_here`}
      </pre>

      <p style={{ fontSize: 12, color: 'var(--ink-faint)', fontStyle: 'italic', margin: 0 }}>
        After adding the keys, restart the Censai server with <code>docker compose restart homebase</code> (or the local development process) to enable the panel.
      </p>
    </div>
  );
}
