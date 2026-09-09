/**
 * Brief C2 — three-tab icon picker (built-in / upload / generate).
 * Passes `onChange(svgRef)` with a registry id or inline SVG string.
 */

import React from 'react';
import { AGENT_ICONS, STOCK_ICONS, listAgentIcons, listStockIcons } from '../../lib/agentIcons/registry.js';
import { validateSvgFile } from '../../lib/agentIcons/upload.js';
import { generateAgentIcon, isGenerateEnabled } from '../../lib/agentIcons/generate.js';

const TABS = [
  { id: 'built-in', label: 'Built-in' },
  { id: 'upload', label: 'Upload' },
  { id: 'generate', label: 'Generate' },
];

export function AgentIconPicker({ value, onChange }) {
  const [activeTab, setActiveTab] = React.useState('built-in');
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState('');
  const [generatePrompt, setGeneratePrompt] = React.useState('');

  const familyIcons = React.useMemo(() => listAgentIcons(), []);
  const stockIcons = React.useMemo(() => listStockIcons(), []);

  // Render the SVG string of the current value if it's inline SVG.
  const previewSvg = React.useMemo(() => {
    if (!value) return null;
    if (value.startsWith('<svg')) return value;
    // Otherwise it's a ref id — resolve via the registry.
    const resolved = AGENT_ICONS[value] || STOCK_ICONS[value];
    return resolved ? resolved.svg : null;
  }, [value]);

  const handleUpload = async (event) => {
    const file = event.target.files && event.target.files[0];
    if (!file) return;
    setBusy(true);
    setError('');
    try {
      const result = await validateSvgFile(file);
      if (result.ok) {
        onChange(result.sanitizedSvg);
      } else {
        setError(result.reason);
      }
    } catch (err) {
      setError(`Upload failed: ${err.message}`);
    } finally {
      setBusy(false);
    }
  };

  const handleGenerate = async () => {
    setBusy(true);
    setError('');
    try {
      const result = await generateAgentIcon(generatePrompt, 'agent');
      if (result.ok) {
        onChange(result.svg);
      } else {
        setError(result.reason);
      }
    } catch (err) {
      setError(`Generate failed: ${err.message}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div data-testid="agent-icon-picker" style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <div style={{ width: 48, height: 48, borderRadius: 10, background: 'var(--surface-2)', border: '1px solid var(--hairline)', display: 'grid', placeItems: 'center', overflow: 'hidden' }}>
          {previewSvg ? (
            <div aria-hidden="true" style={{ width: 32, height: 32, display: 'grid', placeItems: 'center' }} dangerouslySetInnerHTML={{ __html: previewSvg }} />
          ) : (
            <span style={{ fontSize: 11, color: 'var(--ink-faint)' }}>none</span>
          )}
        </div>
        <div style={{ flex: 1, fontSize: 11, color: 'var(--ink-soft)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {value ? (value.startsWith('<svg') ? '<inline SVG>' : value) : 'No icon selected'}
        </div>
      </div>

      <div style={{ display: 'flex', gap: 4 }}>
        {TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => { setActiveTab(tab.id); setError(''); }}
            data-testid={`icon-picker-tab-${tab.id}`}
            style={{
              all: 'unset',
              cursor: 'pointer',
              padding: '4px 8px',
              borderRadius: 6,
              background: activeTab === tab.id ? 'var(--surface-2)' : 'transparent',
              color: activeTab === tab.id ? 'var(--ink)' : 'var(--ink-soft)',
              fontWeight: activeTab === tab.id ? 600 : 400,
              fontSize: 11,
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === 'built-in' && (
        <div data-testid="icon-picker-built-in" style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <div style={{ fontSize: 10, color: 'var(--ink-faint)', letterSpacing: '0.06em', textTransform: 'uppercase' }}>Built-in team</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 4 }}>
            {familyIcons.map((icon) => (
              <button
                key={icon.id}
                type="button"
                onClick={() => onChange(icon.id)}
                title={icon.label || icon.id}
                data-testid={`icon-picker-family-${icon.id}`}
                style={{
                  all: 'unset',
                  cursor: 'pointer',
                  width: 32, height: 32,
                  borderRadius: 6,
                  background: value === icon.id ? 'var(--accent-soft, #eef2ff)' : 'var(--surface-2)',
                  border: `1px solid ${value === icon.id ? 'var(--accent, #6c8cff)' : 'var(--hairline)'}`,
                  display: 'grid',
                  placeItems: 'center',
                  color: 'var(--ink)',
                }}
                dangerouslySetInnerHTML={{ __html: icon.svg }}
              />
            ))}
          </div>
          <div style={{ fontSize: 10, color: 'var(--ink-faint)', letterSpacing: '0.06em', textTransform: 'uppercase', marginTop: 4 }}>Stock</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 4 }}>
            {stockIcons.map((icon) => (
              <button
                key={icon.id}
                type="button"
                onClick={() => onChange(icon.id)}
                title={icon.label || icon.id}
                data-testid={`icon-picker-stock-${icon.id}`}
                style={{
                  all: 'unset',
                  cursor: 'pointer',
                  width: 32, height: 32,
                  borderRadius: 6,
                  background: value === icon.id ? 'var(--accent-soft, #eef2ff)' : 'var(--surface-2)',
                  border: `1px solid ${value === icon.id ? 'var(--accent, #6c8cff)' : 'var(--hairline)'}`,
                  display: 'grid',
                  placeItems: 'center',
                  color: 'var(--ink)',
                }}
                dangerouslySetInnerHTML={{ __html: icon.svg }}
              />
            ))}
          </div>
        </div>
      )}

      {activeTab === 'upload' && (
        <div data-testid="icon-picker-upload" style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <label
            htmlFor="agent-icon-upload"
            style={{
              all: 'unset',
              cursor: busy ? 'not-allowed' : 'pointer',
              display: 'inline-block',
              padding: '8px 12px',
              borderRadius: 6,
              background: 'var(--surface-2)',
              border: '1px solid var(--hairline)',
              color: 'var(--ink-soft)',
              fontSize: 11,
              textAlign: 'center',
            }}
          >
            {busy ? 'Validating…' : 'Choose .svg file'}
          </label>
          <input
            id="agent-icon-upload"
            data-testid="icon-picker-upload-input"
            type="file"
            accept=".svg,image/svg+xml"
            onChange={handleUpload}
            disabled={busy}
            style={{ display: 'none' }}
          />
          <div style={{ fontSize: 10, color: 'var(--ink-faint)' }}>Max 50 KB. SVGs are validated + sanitized (no scripts, no event handlers).</div>
        </div>
      )}

      {activeTab === 'generate' && (
        <div data-testid="icon-picker-generate" style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {!isGenerateEnabled() ? (
            <div style={{ fontSize: 11, color: 'var(--ink-faint)' }}>
              Generator is disabled. Set <code>CENSAAI_AGENT_ICON_GENERATOR=1</code> to enable.
            </div>
          ) : (
            <>
              <input
                value={generatePrompt}
                onChange={(e) => setGeneratePrompt(e.target.value)}
                placeholder="Describe the icon (e.g. 'compass rose for the architect')"
                data-testid="icon-picker-generate-prompt"
                style={{ width: '100%', padding: '6px 10px', borderRadius: 6, border: '1px solid var(--hairline)', background: 'var(--surface-2)', color: 'var(--ink)', fontSize: 12, outline: 'none' }}
              />
              <button
                type="button"
                onClick={handleGenerate}
                disabled={busy || !generatePrompt.trim()}
                data-testid="icon-picker-generate-btn"
                style={{
                  all: 'unset',
                  cursor: busy || !generatePrompt.trim() ? 'not-allowed' : 'pointer',
                  padding: '6px 10px',
                  borderRadius: 6,
                  background: busy || !generatePrompt.trim() ? 'var(--surface-2)' : 'var(--accent, #6c8cff)',
                  color: busy || !generatePrompt.trim() ? 'var(--ink-faint)' : 'var(--accent-ink, white)',
                  fontSize: 11,
                  textAlign: 'center',
                }}
              >
                {busy ? 'Generating…' : 'Generate'}
              </button>
              <div style={{ fontSize: 10, color: 'var(--ink-faint)' }}>Raster fallbacks (base64 PNG inside SVG) are rejected.</div>
            </>
          )}
        </div>
      )}

      {error && (
        <div data-testid="icon-picker-error" style={{ fontSize: 11, color: '#dc2626', background: 'var(--surface-2)', border: '1px solid #dc2626', borderRadius: 6, padding: '6px 8px' }}>
          {error}
        </div>
      )}
    </div>
  );
}

export default AgentIconPicker;
