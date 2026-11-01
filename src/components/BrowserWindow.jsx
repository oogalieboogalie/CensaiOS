import React from 'react';
import { WindowTitle } from './Windows.jsx';
import { hasNativeBrowserPane, useNativeBrowserPane } from '../lib/nativeBrowserPane.js';
import { hiddenMessage } from '../lib/paneCover.js';
import { BrowserStartPage } from './BrowserStartPage.jsx';
import { BrowserSignInPanel } from './BrowserSignInPanel.jsx';
import { BrowserEquipButton, BrowserEquipMenu } from './BrowserEquipMenu.jsx';
import { parseUrl as parseAddress } from '../lib/browserUrl.js';
import { webOnlyFrameSrc } from '../lib/frameSrc.js';
import { logFailure } from '../lib/appLog/browserLog.js';

export function GlobeIcon({ size = 14 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
      <path d="M2 12h20" />
    </svg>
  );
}

export function parseUrl(url) {
  return parseAddress(url, { embedYoutube: !hasNativeBrowserPane() });
}

export function BrowserWindow({ win, onUpdate }) {
  const [draftUrl, setDraftUrl] = React.useState(win.url || '');
  const [activeUrl, setActiveUrl] = React.useState(win.url || '');
  const areaRef = React.useRef(null);
  const inputFocusedRef = React.useRef(false);
  const [signInOpen, setSignInOpen] = React.useState(false);
  const [equipOpen, setEquipOpen] = React.useState(false);

  const pane = useNativeBrowserPane({
    winId: win.id,
    areaRef,
    url: activeUrl,
    coverWhenSmall: Boolean(win.iconCoverZoomedOut),
    onNavigated: (url, loading) => {
      if (!inputFocusedRef.current) setDraftUrl(url);
      if (!loading) {
        setActiveUrl(url);
        onUpdate({ url });
      }
    },
  });

  // An equipped agent (or a teammate) changed the address on the live board.
  React.useEffect(() => {
    if (!win.url || win.url === activeUrl) return;
    setActiveUrl(win.url);
    if (!inputFocusedRef.current) setDraftUrl(win.url);
    pane.navigate(win.url);
  }, [win.url]);

  const go = (raw) => {
    const parsed = parseUrl(raw);
    if (!parsed) return;
    setActiveUrl(parsed);
    setDraftUrl(parsed);
    onUpdate({ url: parsed });
    pane.navigate(parsed);
  };

  const onSubmit = (e) => {
    e.preventDefault();
    go(draftUrl);
  };

  const getSubtitle = () => {
    if (!activeUrl) return 'new tab';
    try {
      return new URL(activeUrl).hostname;
    } catch {
      return activeUrl;
    }
  };

  const handleOpenExternal = () => {
    const invoke = window.__TAURI__?.core?.invoke || window.__TAURI_INTERNALS__?.invoke;
    if (activeUrl && invoke) {
      invoke('open_external_window', {
        url: activeUrl,
        title: getSubtitle() || 'External Browser',
      }).catch(err => {
        logFailure('browser: could not open an outside window', err, 'browser', 'error');
      });
    }
  };

  return (
    <>
      <WindowTitle 
        accent="var(--ps-blue)"
        icon={<GlobeIcon size={14}/>} 
        label="Browser" 
        subtitle={getSubtitle()} 
        attachedAgentIds={win.attachedAgents} 
        onDetach={(id) => onUpdate({ attachedAgents: (win.attachedAgents || []).filter(a => a !== id) })} 
        menu={pane.enabled ? [{
          id: 'icon-cover',
          label: win.iconCoverZoomedOut ? 'Show the page when zoomed far out' : 'Show only the icon when zoomed far out',
          title: 'When the board is zoomed far out, cover this page with its icon',
          onSelect: () => onUpdate({ iconCoverZoomedOut: !win.iconCoverZoomedOut }),
        }] : undefined}
      />
      
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0, overflow: 'hidden' }}>
        {/* Address Bar */}
        <form onSubmit={onSubmit} style={{ display: 'flex', gap: 8, padding: '6px 12px', borderBottom: '1px solid var(--hairline)', background: 'var(--surface-2)', alignItems: 'center' }}>
          {pane.enabled && (
            <div style={{ display: 'flex', gap: 2, flexShrink: 0 }}>
              <NavButton title="Back" disabled={!activeUrl} onClick={pane.back}><path d="M15 18l-6-6 6-6" /></NavButton>
              <NavButton title="Forward" disabled={!activeUrl} onClick={pane.forward}><path d="M9 18l6-6-6-6" /></NavButton>
              <NavButton title={pane.loading ? 'Loading' : 'Reload'} disabled={!activeUrl} onClick={pane.reload}>
                <path d="M21 12a9 9 0 1 1-2.64-6.36" /><polyline points="21 3 21 9 15 9" />
              </NavButton>
            </div>
          )}
          <input 
            value={draftUrl}
            onFocus={() => { inputFocusedRef.current = true; }}
            onBlur={() => { inputFocusedRef.current = false; }}
            onChange={e => setDraftUrl(e.target.value)}
            onPointerDown={e => e.stopPropagation()} // Prevent drag when clicking input
            placeholder="Enter URL (e.g. youtube.com/watch?v=...)"
            style={{ flex: 1, border: '1px solid var(--hairline)', borderRadius: 'var(--radius-lg)', padding: '4px 10px', fontSize: 'var(--text-sm)', fontFamily: 'var(--font-mono)', outline: 'none', background: 'var(--surface)', color: 'var(--ink)' }}
          />
          <BrowserEquipButton equippedAgentId={win.equippedAgentId} open={equipOpen} onToggle={() => setEquipOpen((o) => !o)} />
          {pane.blocked > 0 && (
            <span data-testid="ads-blocked" title="Ads and trackers blocked on this page. Switch off in Settings, Canvas tab." style={{ flexShrink: 0, fontSize: 'var(--text-xs)', color: 'var(--ink-faint)', whiteSpace: 'nowrap' }}>{pane.blocked} blocked</span>
          )}
          {pane.enabled && activeUrl && (
            <NavButton title="Sign-in help: passkeys, import sign-ins, open in your browser" onClick={() => setSignInOpen(o => !o)} active={signInOpen}>
              <circle cx="7.5" cy="15.5" r="4.5" /><path d="M10.7 12.3 21 2" /><path d="m16 7 3 3" /><path d="m19 4 2 2" />
            </NavButton>
          )}
          {((window.__TAURI__ && window.__TAURI__.core?.invoke) || window.__TAURI_INTERNALS__?.invoke) && activeUrl && (
            <button
              type="button"
              onClick={handleOpenExternal}
              title="Open in native standalone window"
              style={{
                all: 'unset',
                cursor: 'pointer',
                width: 26,
                height: 26,
                borderRadius: 'var(--radius-md)',
                display: 'grid',
                placeItems: 'center',
                color: 'var(--ink-soft)',
                background: 'var(--surface)',
                border: '1px solid var(--hairline)',
                flexShrink: 0,
                transition: 'background 0.15s, color 0.15s'
              }}
              onMouseEnter={e => e.currentTarget.style.background = 'var(--surface-3)'}
              onMouseLeave={e => e.currentTarget.style.background = 'var(--surface)'}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                <polyline points="15 3 21 3 21 9" />
                <line x1="10" y1="14" x2="21" y2="3" />
              </svg>
            </button>
          )}
        </form>
        {equipOpen && (
          <BrowserEquipMenu equippedAgentId={win.equippedAgentId} onEquip={(id) => onUpdate({ equippedAgentId: id })} onClose={() => setEquipOpen(false)} />
        )}
        {signInOpen && pane.enabled && activeUrl && (
          <BrowserSignInPanel winId={win.id} url={activeUrl} onClose={() => setSignInOpen(false)} />
        )}

        {/* Page area: a native webview sits on top of this in the desktop build */}
        <div ref={areaRef} data-browser-area style={{ flex: 1, position: 'relative', background: pane.enabled ? 'var(--surface)' : 'white' }}>
          {activeUrl && pane.enabled && pane.covered ? (
            <BrowserIconCover host={getSubtitle()} />
          ) : activeUrl && pane.enabled ? (
            <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', padding: 20, textAlign: 'center', fontSize: 'var(--text-sm)', color: 'var(--ink-faint)' }}>
              {pane.visible ? 'Loading page' : hiddenMessage(pane.hiddenBy)}
            </div>
          ) : activeUrl ? (
            <iframe 
              src={webOnlyFrameSrc(activeUrl) || undefined}
              title="Browser"
              sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-presentation"
              allowFullScreen
              style={{ width: '100%', height: '100%', border: 'none', display: 'block' }}
            />
          ) : (
            <BrowserStartPage win={win} onUpdate={onUpdate} go={go} />
          )}
        </div>
      </div>
    </>
  );
}

function NavButton({ title, disabled, onClick, active, children }) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      disabled={disabled}
      onClick={onClick}
      onPointerDown={e => e.stopPropagation()}
      style={{ all: 'unset', cursor: disabled ? 'default' : 'pointer', width: 24, height: 24, borderRadius: 'var(--radius-md)', display: 'grid', placeItems: 'center', color: active ? 'var(--ink)' : 'var(--ink-soft)', background: active ? 'var(--surface-3)' : 'transparent', opacity: disabled ? 0.4 : 1 }}
    >
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">{children}</svg>
    </button>
  );
}

// Shown instead of the page when the board is zoomed far out and the window's
// "Show only the icon when zoomed far out" setting is on.
function BrowserIconCover({ host }) {
  return (
    <div data-testid="browser-icon-cover" style={{ position: 'absolute', inset: 0, display: 'grid', placeContent: 'center', justifyItems: 'center', gap: 16, padding: 20, textAlign: 'center', color: 'var(--ps-blue)', background: 'var(--surface-2)' }}>
      <GlobeIcon size={120} />
      <span style={{ fontSize: 'var(--text-xl)', fontWeight: 600, color: 'var(--ink)', overflowWrap: 'anywhere' }}>{host}</span>
    </div>
  );
}
