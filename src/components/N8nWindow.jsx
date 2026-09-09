import React, { useState } from 'react';
import { WindowTitle } from './windows/WindowTitle.jsx';
import { Icon } from './Icons.jsx';

export function N8nWindow({ win, onUpdate }) {
  const configuredUrl = win.url || win.state?.url || '';
  const [draftUrl, setDraftUrl] = useState(configuredUrl || 'http://localhost:5678');

  const handleSubmit = (e) => {
    e.preventDefault();
    if (draftUrl.trim()) {
      onUpdate?.({ url: draftUrl.trim() });
    }
  };

  const clearUrl = () => {
    onUpdate?.({ url: null });
  };

  return (
    <>
      <WindowTitle
        icon={<Icon.NewWorkflow size={14} />}
        label="n8n"
        subtitle={configuredUrl || 'Not configured'}
      >
        {configuredUrl && (
          <button
            onClick={(e) => { e.stopPropagation(); clearUrl(); }}
            style={{
              all: 'unset',
              cursor: 'pointer',
              padding: '2px 6px',
              borderRadius: 4,
              fontSize: 10,
              background: 'var(--surface-2)',
              color: 'var(--ink-faint)',
              border: '1px solid var(--hairline)',
              marginLeft: 'auto'
            }}
            title="Change URL"
          >
            Change URL
          </button>
        )}
      </WindowTitle>

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0, background: 'var(--surface)' }}>
        {configuredUrl ? (
          <iframe
            src={configuredUrl}
            title="n8n"
            style={{ flex: 1, width: '100%', height: '100%', border: 'none' }}
          />
        ) : (
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 24, textAlign: 'center' }}>
            <div style={{
              width: 48, height: 48, borderRadius: 12, background: 'var(--surface-2)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: 'var(--ink-faint)', marginBottom: 16, border: '1px solid var(--hairline)'
            }}>
              <Icon.NewWorkflow size={24} />
            </div>

            <h3 style={{ margin: '0 0 8px', fontSize: 14, color: 'var(--ink)' }}>Connect to n8n</h3>
            <p style={{ margin: '0 0 24px', fontSize: 13, color: 'var(--ink-faint)', maxWidth: 280, lineHeight: 1.5 }}>
              Enter the URL of your self-hosted n8n instance to embed it in this window.
            </p>

            <form onSubmit={handleSubmit} style={{ display: 'flex', gap: 8, width: '100%', maxWidth: 320 }}>
              <input
                type="text"
                value={draftUrl}
                onChange={(e) => setDraftUrl(e.target.value)}
                placeholder="http://localhost:5678"
                style={{
                  flex: 1, minWidth: 0, padding: '8px 12px',
                  background: 'var(--surface-2)', border: '1px solid var(--hairline)',
                  borderRadius: 6, color: 'var(--ink)', fontSize: 13, outline: 'none'
                }}
              />
              <button
                type="submit"
                disabled={!draftUrl.trim()}
                style={{
                  padding: '8px 16px', background: 'var(--ink)', color: 'var(--surface)',
                  border: 'none', borderRadius: 6, fontSize: 13, fontWeight: 500,
                  cursor: draftUrl.trim() ? 'pointer' : 'not-allowed',
                  opacity: draftUrl.trim() ? 1 : 0.5
                }}
              >
                Load
              </button>
            </form>
          </div>
        )}
      </div>
    </>
  );
}
