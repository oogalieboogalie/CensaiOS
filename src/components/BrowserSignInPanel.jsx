import React from 'react';
import { paneId, tauriInvoke } from '../lib/nativeBrowserPane.js';
import { cookiesForPage, parseCookieFile, siteOf } from '../lib/cookieImport.js';
import { logFailure } from '../lib/appLog/browserLog.js';

// Sign-in help for a Browser window in the desktop build: what passkeys do
// here, importing sign-ins from a file the user exported themselves, and
// handing the page to their normal browser. See src-tauri/src/browser_signin.rs.

const row = { display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' };
const button = {
  all: 'unset',
  cursor: 'pointer',
  padding: '4px 10px',
  borderRadius: 'var(--radius-md)',
  border: '1px solid var(--hairline)',
  background: 'var(--surface)',
  color: 'var(--ink)',
  fontSize: 'var(--text-sm)',
};

export function openInSystemBrowser(url) {
  const invoke = tauriInvoke();
  if (invoke && url) {
    return invoke('open_in_system_browser', { url }).catch((err) => logFailure('browser: could not open the system browser', err, 'browser', 'error'));
  }
  if (url) window.open(url, '_blank', 'noopener');
  return Promise.resolve();
}

export function BrowserSignInPanel({ winId, url, onClose }) {
  const fileRef = React.useRef(null);
  const [note, setNote] = React.useState('');
  let host = '';
  try { host = new URL(url).hostname; } catch { /* no page yet */ }
  const site = siteOf(host) || 'this site';

  const onFile = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    const cookies = cookiesForPage(parseCookieFile(await file.text()), url);
    if (!cookies.length) {
      setNote(`That file has no sign-in for ${site}. Export it while you are signed in to ${site} in your normal browser.`);
      return;
    }
    try {
      const result = await tauriInvoke()('browser_pane_import_cookies', { id: paneId(winId), cookies });
      setNote(result.imported
        ? `Imported ${result.imported} sign-in cookie${result.imported === 1 ? '' : 's'} for ${site}. The page reloaded; if it still asks you to sign in, the site ties sign-ins to one browser, so use Open in your browser.`
        : `${site} did not accept those cookies. Use Open in your browser instead.`);
    } catch (err) {
      setNote(`Could not import: ${String(err)}`);
    }
  };

  return (
    <div style={{ display: 'grid', gap: 8, padding: '10px 12px', borderBottom: '1px solid var(--hairline)', background: 'var(--surface-2)', fontSize: 'var(--text-sm)', color: 'var(--ink-soft)' }}>
      <div style={{ ...row, justifyContent: 'space-between' }}>
        <strong style={{ color: 'var(--ink)' }}>Signing in to {site}</strong>
        <button type="button" style={{ ...button, border: 'none', background: 'transparent' }} onClick={onClose} aria-label="Close sign-in help">Close</button>
      </div>
      <div>
        Passkeys here use Windows: Windows Hello, a security key, or your phone. A passkey saved only in Chrome stays
        inside Chrome, so on the site pick another way to sign in (password, code, or phone). You only need to do it once;
        this window remembers you after a restart.
      </div>
      <div style={row}>
        <button type="button" style={button} onClick={() => fileRef.current?.click()} disabled={!host}>Import sign-ins from a file</button>
        <button type="button" style={button} onClick={() => openInSystemBrowser(url)} disabled={!host}>Open in your browser</button>
        <input ref={fileRef} type="file" accept=".txt,.json,text/plain,application/json" style={{ display: 'none' }} onChange={onFile} />
      </div>
      <div style={{ color: 'var(--ink-faint)' }}>
        To import: in your normal browser, while signed in to {site}, export its cookies as cookies.txt (for example with
        the Get cookies.txt LOCALLY extension), then pick that file here. Only cookies for {site} are used; they stay in
        this window and are never saved to a board or shown to agents.
      </div>
      {note && <div role="status" style={{ color: 'var(--ink)' }}>{note}</div>}
    </div>
  );
}
