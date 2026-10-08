/* eslint-disable no-unused-vars -- JSX references are not detected by the legacy lint config. */
import React from 'react';
import { Icon } from './Icons.jsx';
import { WindowTitle } from './Windows.jsx';

export const WHATSAPP_WEB_URL = 'https://web.whatsapp.com';

function normalizeUrl(raw) {
  const trimmed = String(raw || '').trim();
  if (!trimmed) return '';
  if (/^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(trimmed)) return trimmed;
  return `https://${trimmed}`;
}

// Generic webview shell (WhatsApp brief, matrix `webview` mode). Mounts a
// user URL in a dedicated frame marked data-embed-mode="webview" so the
// canvas can route it differently from pooled iframes (session-preserving
// desktop shell, cookie policy). The URL persists on the window record, so
// the session target survives canvas reloads; the browser profile itself
// keeps the login cookies. Re-authenticate remounts the frame so the app's
// login flow restarts. True third-party cookie clearing is impossible from
// page JS and stays the desktop shell's job.
export function WebviewShellWindow({ win, onUpdate, defaultUrl = '', title = 'Webview' }) {
  const [draftUrl, setDraftUrl] = React.useState(win.url || defaultUrl);
  const [activeUrl, setActiveUrl] = React.useState(win.url || defaultUrl);
  const [frameKey, setFrameKey] = React.useState(0);

  const submit = (e) => {
    e.preventDefault();
    const parsed = normalizeUrl(draftUrl);
    if (!parsed) return;
    setActiveUrl(parsed);
    setDraftUrl(parsed);
    onUpdate({ url: parsed });
  };

  const reauthenticate = () => {
    setFrameKey((k) => k + 1);
  };

  const subtitle = (() => {
    if (!activeUrl) return 'new webview';
    try {
      return new URL(activeUrl).hostname;
    } catch {
      return activeUrl;
    }
  })();

  return (
    <>
      <WindowTitle
        icon={<Icon.Monitor size={14} />}
        label={win?.title || title}
        subtitle={subtitle}
        attachedAgentIds={win?.attachedAgents}
        onDetach={(id) => onUpdate?.({ attachedAgents: (win?.attachedAgents || []).filter((a) => a !== id) })}
      />
      <div data-embed-mode="webview" style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', background: 'var(--surface)', color: 'var(--ink)', fontFamily: 'var(--font-sans)' }}>
        <form onSubmit={submit} style={{ display: 'flex', gap: 8, padding: '6px 12px', borderBottom: '1px solid var(--hairline)', background: 'var(--surface-2)', alignItems: 'center' }}>
          <input
            aria-label="Webview URL"
            value={draftUrl}
            onChange={(e) => setDraftUrl(e.target.value)}
            onPointerDown={(e) => e.stopPropagation()}
            placeholder="Enter URL (e.g. web.whatsapp.com)"
            style={{ flex: 1, border: '1px solid var(--hairline)', borderRadius: 'var(--radius-lg)', padding: '4px 10px', fontSize: 'var(--text-sm)', fontFamily: 'var(--font-mono)', outline: 'none', background: 'var(--surface)', color: 'var(--ink)' }}
          />
          <button type="submit" title="Load URL" style={{ all: 'unset', cursor: 'pointer', fontSize: 'var(--text-sm)', fontWeight: 600, color: 'var(--ink-soft)', border: '1px solid var(--hairline)', borderRadius: 'var(--radius-lg)', padding: '4px 10px' }}>Go</button>
          <button type="button" onClick={reauthenticate} title="Remount the frame to restart the app login flow" aria-label="Re-authenticate" disabled={!activeUrl} style={{ all: 'unset', cursor: activeUrl ? 'pointer' : 'not-allowed', fontSize: 'var(--text-sm)', fontWeight: 600, color: 'var(--ink-soft)', border: '1px solid var(--hairline)', borderRadius: 'var(--radius-lg)', padding: '4px 10px', opacity: activeUrl ? 1 : 0.5 }}>Re-authenticate</button>
        </form>
        <div style={{ flex: 1, position: 'relative', background: 'white' }}>
          {activeUrl ? (
            <iframe key={frameKey} title={win?.title || title} src={activeUrl} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', border: 0 }} sandbox="allow-scripts allow-same-origin allow-forms allow-popups" />
          ) : (
            <div style={{ padding: 16, fontSize: 'var(--text-sm)', color: 'var(--ink-faint)', fontStyle: 'italic' }}>Enter a URL above to open it in this webview.</div>
          )}
        </div>
      </div>
    </>
  );
}
