import React from 'react';
import { logToApp } from '../../lib/appLog/browserLog.js';

// A Shared Preview with no page used to be a blank white box. This says
// what the window shows and how to fill it.
export function EmptyPreviewNote() {
  return (
    <div
      role="note"
      data-testid="empty-preview-note"
      style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24, background: 'var(--surface)', color: 'var(--ink)' }}
    >
      <div style={{ maxWidth: 420, lineHeight: 1.55 }}>
        <div style={{ fontSize: 'var(--text-lg)', fontWeight: 600, marginBottom: 8 }}>Nothing to show yet</div>
        <div style={{ fontSize: 'var(--text-sm)', color: 'var(--ink-soft)', marginBottom: 10 }}>
          A Shared Preview shows a web page, live, to everyone on the board. It can show:
        </div>
        <ul style={{ margin: 0, paddingLeft: 18, fontSize: 'var(--text-sm)', color: 'var(--ink-soft)', display: 'grid', gap: 6 }}>
          <li>An HTML file: open it from <b style={{ color: 'var(--ink)' }}>Files</b>, then press <b style={{ color: 'var(--ink)' }}>Preview</b> at the top of its code window.</li>
          <li>A code window: press <b style={{ color: 'var(--ink)' }}>Preview</b> on it, and this follows every change you type.</li>
          <li>A chat: ask an agent to build a page, and its preview opens here as it works.</li>
        </ul>
      </div>
    </div>
  );
}

// One app-log warning per problem, not one per render. Never the file's name
// or path: the app log is a file on disk, and what someone opened is theirs.
export function usePreviewWarnings({ error, missing }) {
  React.useEffect(() => {
    if (error) logToApp('warn', `shared preview: could not load its file: ${error}`, { where: 'htmlPreview' });
  }, [error]);
  React.useEffect(() => {
    if (missing) logToApp('warn', 'shared preview: the linked code window is gone, showing the last saved copy', { where: 'htmlPreview' });
  }, [missing]);
}
