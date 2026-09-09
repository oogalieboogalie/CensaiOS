import React from 'react';
import { WindowTitle } from './Windows.jsx';

export function GlobeIcon({ size = 14 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
      <path d="M2 12h20" />
    </svg>
  );
}

function parseUrl(url) {
  if (!url) return '';
  let finalUrl = url.trim();
  
  // Convert standard youtube links to embed links
  const ytMatch = finalUrl.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([^&]+)/);
  if (ytMatch && ytMatch[1]) {
    return `https://www.youtube.com/embed/${ytMatch[1]}`;
  }
  
  // If it contains spaces or has no dot, treat it as a web search query
  if (/\s/.test(finalUrl) || !finalUrl.includes('.')) {
    return `https://html.duckduckgo.com/html/?q=${encodeURIComponent(finalUrl)}`;
  }
  
  // Ensure protocol exists
  if (!/^https?:\/\//i.test(finalUrl)) {
    finalUrl = 'https://' + finalUrl;
  }
  
  return finalUrl;
}

export function BrowserWindow({ win, onUpdate }) {
  const [draftUrl, setDraftUrl] = React.useState(win.url || '');
  const [activeUrl, setActiveUrl] = React.useState(win.url || '');

  const onSubmit = (e) => {
    e.preventDefault();
    const parsed = parseUrl(draftUrl);
    setActiveUrl(parsed);
    setDraftUrl(parsed);
    onUpdate({ url: parsed });
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
        console.error('Failed to open external Tauri window', err);
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
      />
      
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0, overflow: 'hidden' }}>
        {/* Address Bar */}
        <form onSubmit={onSubmit} style={{ display: 'flex', gap: 8, padding: '6px 12px', borderBottom: '1px solid var(--hairline)', background: 'var(--surface-2)', alignItems: 'center' }}>
          <input 
            value={draftUrl}
            onChange={e => setDraftUrl(e.target.value)}
            onPointerDown={e => e.stopPropagation()} // Prevent drag when clicking input
            placeholder="Enter URL (e.g. youtube.com/watch?v=...)"
            style={{ flex: 1, border: '1px solid var(--hairline)', borderRadius: 8, padding: '4px 10px', fontSize: 12, fontFamily: 'var(--font-mono)', outline: 'none', background: 'var(--surface)', color: 'var(--ink)' }}
          />
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
                borderRadius: 6,
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

        {/* Iframe Container */}
        <div style={{ flex: 1, position: 'relative', background: 'white' }}>
          {activeUrl ? (
            <iframe 
              src={activeUrl}
              title="Browser"
              sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-presentation"
              allowFullScreen
              style={{ width: '100%', height: '100%', border: 'none', display: 'block' }}
            />
          ) : (
            <div style={{ position: 'absolute', inset: 0, overflowY: 'auto', padding: '24px 20px', display: 'flex', flexDirection: 'column', gap: 16, background: 'var(--surface)' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <div style={{ fontSize: 11, fontFamily: 'var(--font-mono)', textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--ink-faint)', display: 'flex', justifyContent: 'space-between' }}>
                  <span>Digital Library Shortcuts</span>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: 8 }}>
                  {[
                    { name: 'Wikipedia', url: 'https://en.wikipedia.org' },
                    { name: 'DevDocs', url: 'https://devdocs.io' },
                  ].map((p, i) => (
                    <button 
                      key={i} 
                      onClick={() => {
                        const parsed = parseUrl(p.url);
                        setActiveUrl(parsed);
                        setDraftUrl(parsed);
                        onUpdate({ url: parsed });
                      }}
                      style={{ all: 'unset', cursor: 'pointer', padding: '10px 14px', background: 'var(--surface-2)', border: '1px solid var(--hairline)', borderRadius: 8, fontSize: 13, color: 'var(--ink)', transition: 'background 0.15s, transform 0.1s' }}
                      onMouseEnter={e => e.currentTarget.style.background = 'oklch(var(--accent-l) calc(var(--accent-c) * 0.1) var(--accent-h) / 0.15)'}
                      onMouseLeave={e => e.currentTarget.style.background = 'var(--surface-2)'}
                      onPointerDown={e => e.currentTarget.style.transform = 'scale(0.98)'}
                      onPointerUp={e => e.currentTarget.style.transform = 'scale(1)'}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <GlobeIcon size={14} style={{ color: 'var(--accent-ink)' }} />
                        <span style={{ fontWeight: 500 }}>{p.name}</span>
                      </div>
                    </button>
                  ))}
                  
                  {/* Custom Shortcut Slot */}
                  {win.customShortcutUrl ? (
                    <div style={{ position: 'relative', display: 'flex' }}>
                      <button 
                        onClick={() => {
                          const parsed = parseUrl(win.customShortcutUrl);
                          setActiveUrl(parsed);
                          setDraftUrl(parsed);
                          onUpdate({ url: parsed });
                        }}
                        style={{ all: 'unset', flex: 1, cursor: 'pointer', padding: '10px 14px', background: 'var(--surface-2)', border: '1px solid var(--hairline)', borderRadius: 8, fontSize: 13, color: 'var(--ink)', transition: 'background 0.15s, transform 0.1s' }}
                        onMouseEnter={e => e.currentTarget.style.background = 'oklch(var(--accent-l) calc(var(--accent-c) * 0.1) var(--accent-h) / 0.15)'}
                        onMouseLeave={e => e.currentTarget.style.background = 'var(--surface-2)'}
                        onPointerDown={e => e.currentTarget.style.transform = 'scale(0.98)'}
                        onPointerUp={e => e.currentTarget.style.transform = 'scale(1)'}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <GlobeIcon size={14} style={{ color: 'var(--accent-ink)' }} />
                          <span style={{ fontWeight: 500 }}>{win.customShortcutName || 'Custom'}</span>
                        </div>
                      </button>
                      <button 
                        onClick={() => onUpdate({ customShortcutUrl: '', customShortcutName: '' })}
                        title="Remove custom shortcut"
                        style={{ all: 'unset', cursor: 'pointer', position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', width: 20, height: 20, display: 'grid', placeItems: 'center', color: 'var(--ink-faint)', borderRadius: 4 }}
                        onMouseEnter={e => { e.currentTarget.style.color = 'var(--ps-red)'; e.currentTarget.style.background = 'var(--surface)'; }}
                        onMouseLeave={e => { e.currentTarget.style.color = 'var(--ink-faint)'; e.currentTarget.style.background = 'transparent'; }}
                      >
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6L6 18M6 6l12 12"/></svg>
                      </button>
                    </div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4, padding: '8px 10px', background: 'var(--surface-2)', border: '1px dashed var(--hairline)', borderRadius: 8 }}>
                      <div style={{ fontSize: 10, fontFamily: 'var(--font-mono)', color: 'var(--ink-soft)' }}>ADD CUSTOM SHORTCUT</div>
                      <input 
                        placeholder="Name (e.g. My Book)" 
                        onKeyDown={e => {
                          if (e.key === 'Enter') {
                            const name = e.currentTarget.value;
                            const urlInput = e.currentTarget.nextElementSibling;
                            if (name && urlInput.value) {
                              onUpdate({ customShortcutName: name, customShortcutUrl: urlInput.value });
                            }
                          }
                        }}
                        style={{ background: 'var(--surface)', border: '1px solid var(--hairline)', borderRadius: 4, padding: '4px 6px', fontSize: 11, color: 'var(--ink)', outline: 'none' }}
                      />
                      <input 
                        placeholder="URL (e.g. localhost:8000/book.pdf)" 
                        onKeyDown={e => {
                          if (e.key === 'Enter') {
                            const url = e.currentTarget.value;
                            const nameInput = e.currentTarget.previousElementSibling;
                            if (url && nameInput.value) {
                              onUpdate({ customShortcutName: nameInput.value, customShortcutUrl: url });
                            }
                          }
                        }}
                        style={{ background: 'var(--surface)', border: '1px solid var(--hairline)', borderRadius: 4, padding: '4px 6px', fontSize: 11, color: 'var(--ink)', outline: 'none' }}
                      />
                    </div>
                  )}
                </div>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 8 }}>
                <div style={{ flex: 1, height: 1, background: 'var(--hairline)' }} />
                <div style={{ fontSize: 10, fontFamily: 'var(--font-mono)', textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--ink-faint)' }}>OR SEARCH THE WEB</div>
                <div style={{ flex: 1, height: 1, background: 'var(--hairline)' }} />
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <p style={{ margin: 0, fontSize: 12, color: 'var(--ink-soft)' }}>Use the address bar above to enter any website URL.</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
