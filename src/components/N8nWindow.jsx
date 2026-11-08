import React, { useState } from 'react';
import { WindowTitle } from './windows/WindowTitle.jsx';
import { Icon } from './Icons.jsx';
import { webOnlyFrameSrc } from '../lib/frameSrc.js';

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
            type="button"
            className="hb-n8n-change"
            onClick={(e) => { e.stopPropagation(); clearUrl(); }}
            title="Change URL"
          >
            Change URL
          </button>
        )}
      </WindowTitle>

      <div className="hb-n8n">
        {configuredUrl ? (
          <iframe
            src={webOnlyFrameSrc(configuredUrl) || undefined}
            title="n8n"
            className="hb-n8n-frame"
          />
        ) : (
          <div className="hb-n8n-connect">
            <div className="hb-panel hb-empty hb-n8n-card">
              <div className="hb-empty-icon">
                <Icon.NewWorkflow size={24} />
              </div>
              <h3 className="hb-empty-title">Connect to n8n</h3>
              <p className="hb-empty-text">
                Enter the URL of your self-hosted n8n instance to embed it in this window.
              </p>
              <form onSubmit={handleSubmit} className="hb-n8n-form">
                <input
                  type="text"
                  className="hb-n8n-input"
                  aria-label="n8n address"
                  value={draftUrl}
                  onChange={(e) => setDraftUrl(e.target.value)}
                  placeholder="http://localhost:5678"
                />
                <button type="submit" className="hb-n8n-btn" disabled={!draftUrl.trim()}>
                  Load
                </button>
              </form>
              <p className="hb-n8n-hint">
                Start n8n first, then press Load. On this computer it usually
                lives at <code className="hb-code">localhost:5678</code>.
              </p>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
