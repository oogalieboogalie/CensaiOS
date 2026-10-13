import React from 'react';
import { GlobeIcon } from './BrowserWindow.jsx';

/** New-tab page shown in a Browser window before any URL is loaded. */
export function BrowserStartPage({ win, onUpdate, go }) {
  return (
    <div style={{ position: 'absolute', inset: 0, overflowY: 'auto', padding: '24px 20px', display: 'flex', flexDirection: 'column', gap: 16, background: 'var(--surface)' }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <div style={{ fontSize: 'var(--text-xs)', fontFamily: 'var(--font-label)', textTransform: 'var(--label-case)', letterSpacing: 'var(--label-tracking)', color: 'var(--ink-faint)', display: 'flex', justifyContent: 'space-between' }}>
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
                go(p.url);
              }}
              style={{ all: 'unset', cursor: 'pointer', padding: '10px 14px', background: 'var(--surface-2)', border: '1px solid var(--hairline)', borderRadius: 'var(--radius-lg)', fontSize: 'var(--text-md)', color: 'var(--ink)', transition: 'background 0.15s, transform 0.1s' }}
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
                  go(win.customShortcutUrl);
                }}
                style={{ all: 'unset', flex: 1, cursor: 'pointer', padding: '10px 14px', background: 'var(--surface-2)', border: '1px solid var(--hairline)', borderRadius: 'var(--radius-lg)', fontSize: 'var(--text-md)', color: 'var(--ink)', transition: 'background 0.15s, transform 0.1s' }}
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
                style={{ all: 'unset', cursor: 'pointer', position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', width: 20, height: 20, display: 'grid', placeItems: 'center', color: 'var(--ink-faint)', borderRadius: 'var(--radius-sm)' }}
                onMouseEnter={e => { e.currentTarget.style.color = 'var(--ps-red)'; e.currentTarget.style.background = 'var(--surface)'; }}
                onMouseLeave={e => { e.currentTarget.style.color = 'var(--ink-faint)'; e.currentTarget.style.background = 'transparent'; }}
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6L6 18M6 6l12 12"/></svg>
              </button>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4, padding: '8px 10px', background: 'var(--surface-2)', border: '1px dashed var(--hairline)', borderRadius: 'var(--radius-lg)' }}>
              <div style={{ fontSize: 'var(--text-xs)', fontFamily: 'var(--font-mono)', color: 'var(--ink-soft)' }}>ADD CUSTOM SHORTCUT</div>
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
                style={{ background: 'var(--surface)', border: '1px solid var(--hairline)', borderRadius: 'var(--radius-sm)', padding: '4px 6px', fontSize: 'var(--text-xs)', color: 'var(--ink)', outline: 'none' }}
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
                style={{ background: 'var(--surface)', border: '1px solid var(--hairline)', borderRadius: 'var(--radius-sm)', padding: '4px 6px', fontSize: 'var(--text-xs)', color: 'var(--ink)', outline: 'none' }}
              />
            </div>
          )}
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 8 }}>
        <div style={{ flex: 1, height: 1, background: 'var(--hairline)' }} />
        <div style={{ fontSize: 'var(--text-xs)', fontFamily: 'var(--font-label)', textTransform: 'var(--label-case)', letterSpacing: 'var(--label-tracking)', color: 'var(--ink-faint)' }}>OR SEARCH THE WEB</div>
        <div style={{ flex: 1, height: 1, background: 'var(--hairline)' }} />
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <p style={{ margin: 0, fontSize: 'var(--text-sm)', color: 'var(--ink-soft)' }}>Use the address bar above to enter any website URL.</p>
      </div>
    </div>
  );
}
