// Iframe mount view for CodeEditorWindow — used when win.codeServerUrl is set.
// Renders a sandboxed iframe pointing at the user-supplied code-server URL.
// Extracted from CodeEditorWindow.jsx to keep that file within the size budget.

import React from 'react';

export function CodeServerIframeView({ url, theme, winOpacity }) {
  return (
    <div
      style={{
        flex: 1,
        minHeight: 0,
        display: 'flex',
        background: winOpacity !== undefined ? 'transparent' : theme.background,
        padding: 0,
      }}
    >
      <iframe
        data-code-server-iframe
        src={url}
        title={`code-server: ${url}`}
        style={{ flex: 1, width: '100%', height: '100%', border: 'none', borderRadius: 12, background: 'var(--surface)' }}
        allow="clipboard-read; clipboard-write"
        sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-downloads"
      />
    </div>
  );
}
