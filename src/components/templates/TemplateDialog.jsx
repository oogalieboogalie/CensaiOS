/* eslint-disable no-unused-vars -- JSX references are not detected by the legacy lint config. */
import React from 'react';
import { useEscapeDismiss } from '../../lib/useEscapeDismiss.js';
import { fetchBoardTemplates } from '../../lib/templates/boardTemplates.js';
import { applyTemplateToBoard } from '../../lib/templates/applyTemplate.js';

// Spec 7: "New board from a template". Opened from the File menu or the
// empty canvas with the `censai:open-templates` event. The template is
// added next to whatever is on the board; nothing is replaced.

export const OPEN_TEMPLATES_EVENT = 'censai:open-templates';

const label = {
  fontFamily: 'var(--font-label)', fontSize: 'var(--text-xs)', color: 'var(--ink-faint)',
  letterSpacing: 'var(--label-tracking)', textTransform: 'var(--label-case)',
};

function Choice({ checked, onSelect, title, hint, children }) {
  return (
    <label style={{
      display: 'flex', gap: 'var(--space-2)', alignItems: 'flex-start', cursor: 'pointer',
      padding: 'var(--space-2) var(--space-3)', borderRadius: 'var(--radius-md)',
      border: `1px solid ${checked ? 'var(--accent)' : 'var(--hairline)'}`,
      background: checked ? 'var(--accent-soft)' : 'transparent', flex: 1, minWidth: 0,
    }}>
      <input type="radio" checked={checked} onChange={onSelect} style={{ marginTop: 3, accentColor: 'var(--accent)' }} />
      <span style={{ minWidth: 0, flex: 1 }}>
        <span style={{ display: 'block', fontSize: 'var(--text-sm)', color: 'var(--ink)', fontWeight: 500 }}>{title}</span>
        <span style={{ display: 'block', fontSize: 'var(--text-xs)', color: 'var(--ink-soft)', marginTop: 2 }}>{hint}</span>
        {children}
      </span>
    </label>
  );
}

export function TemplateDialog({ open, onClose, initialId = null, apply = applyTemplateToBoard, loadTemplates = fetchBoardTemplates }) {
  const [templates, setTemplates] = React.useState([]);
  const [selected, setSelected] = React.useState(null);
  const [models, setModels] = React.useState('default');
  const [ollamaModel, setOllamaModel] = React.useState('llama3.1');
  const [status, setStatus] = React.useState({ state: 'idle', error: '' });
  useEscapeDismiss(open, onClose);

  React.useEffect(() => {
    if (!open) return;
    setStatus({ state: 'idle', error: '' });
    loadTemplates()
      .then((list) => {
        setTemplates(list);
        setSelected(current => (list.some(t => t.id === initialId) ? initialId : current) || list[0]?.id || null);
      })
      .catch(err => setStatus({ state: 'error', error: err.message }));
  }, [open, loadTemplates, initialId]);

  if (!open) return null;
  const template = templates.find(t => t.id === selected) || null;
  const busy = status.state === 'working';

  const create = async () => {
    if (!template || busy) return;
    setStatus({ state: 'working', error: '' });
    try {
      await apply(template.id, { models, ollamaModel });
      onClose();
    } catch (err) {
      setStatus({ state: 'error', error: err.message || 'The template could not be set up.' });
    }
  };

  return (
    <>
      <div onClick={busy ? undefined : onClose} style={{ position: 'fixed', inset: 0, zIndex: 90, background: 'var(--scrim)' }} />
      <div role="dialog" aria-modal="true" aria-label="New board from a template" data-canvas-ui data-testid="template-dialog" style={{
        position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', zIndex: 91,
        width: 'min(620px, calc(100vw - 32px))', maxHeight: 'calc(100vh - 48px)', overflow: 'auto',
        background: 'var(--surface)', color: 'var(--ink)', border: '1px solid var(--hairline)',
        borderRadius: 'var(--radius-xl)', boxShadow: 'var(--elevation-3)', padding: 'var(--space-6)',
        display: 'flex', flexDirection: 'column', gap: 'var(--space-4)',
      }}>
        <div>
          <div style={label}>Templates</div>
          <h2 style={{ margin: 'var(--space-1) 0 0', fontSize: 'var(--text-xl)', fontWeight: 600, letterSpacing: '-0.01em' }}>Start a board from a template</h2>
          <p style={{ margin: 'var(--space-1) 0 0', color: 'var(--ink-soft)', fontSize: 'var(--text-sm)' }}>
            A ready-made board with groups, agents and modules. It is added next to what is already here.
          </p>
        </div>

        {templates.length > 1 && (
          <div style={{ display: 'flex', gap: 'var(--space-2)', flexWrap: 'wrap' }}>
            {templates.map(t => (
              <button key={t.id} type="button" data-testid={`template-tab-${t.id}`} aria-pressed={t.id === selected} onClick={() => setSelected(t.id)} style={{
                all: 'unset', cursor: 'pointer', padding: 'var(--space-1) var(--space-3)', borderRadius: 'var(--radius-full)',
                border: '1px solid var(--hairline)', fontSize: 'var(--text-sm)',
                background: t.id === selected ? 'var(--surface-2)' : 'transparent',
              }}>{t.name}</button>
            ))}
          </div>
        )}

        {template && (
          <div style={{ border: '1px solid var(--hairline)', borderRadius: 'var(--radius-lg)', overflow: 'hidden' }}>
            <div style={{ padding: 'var(--space-4)', borderBottom: '1px solid var(--hairline)' }}>
              <div style={{ fontSize: 'var(--text-lg)', fontWeight: 600 }}>{template.name}</div>
              <div style={{ color: 'var(--ink-soft)', fontSize: 'var(--text-sm)', marginTop: 2 }}>{template.description}</div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1, background: 'var(--hairline)' }}>
              {template.groups.map((group, index) => (
                <div key={group} style={{ background: 'var(--surface-2)', padding: 'var(--space-3)', display: 'flex', gap: 'var(--space-3)', alignItems: 'flex-start' }}>
                  <span style={{
                    fontFamily: 'var(--font-mono)', fontSize: 'var(--text-xs)', color: 'var(--ink-soft)',
                    border: '1px solid var(--hairline-strong)', borderRadius: 'var(--radius-xs)', padding: '1px 5px', lineHeight: 1.4,
                  }}>F{index + 1}</span>
                  <span style={{ minWidth: 0 }}>
                    <span style={{ display: 'block', fontSize: 'var(--text-sm)', fontWeight: 500 }}>{group}</span>
                    <span style={{ display: 'block', fontSize: 'var(--text-xs)', color: 'var(--ink-soft)' }}>{template.groupContents?.[group] || ''}</span>
                  </span>
                </div>
              ))}
            </div>
            <div style={{ padding: 'var(--space-3) var(--space-4)', display: 'grid', gridTemplateColumns: 'auto 1fr', gap: 'var(--space-1) var(--space-4)', fontSize: 'var(--text-sm)' }}>
              <span style={label}>Agents</span><span style={{ color: 'var(--ink-soft)' }}>{template.agents.join(', ')}</span>
              <span style={label}>Modules</span><span style={{ color: 'var(--ink-soft)' }}>{template.modules.join(', ')}</span>
            </div>
          </div>
        )}

        {template && (
          <div>
            <div style={{ ...label, marginBottom: 'var(--space-2)' }}>Agents answer with</div>
            <div style={{ display: 'flex', gap: 'var(--space-2)', flexWrap: 'wrap' }}>
              <Choice checked={models === 'default'} onSelect={() => setModels('default')} title="Your default model" hint="The model and key you already chat with." />
              <Choice checked={models === 'ollama'} onSelect={() => setModels('ollama')} title="Your own Ollama server" hint="Nothing you type leaves your hardware.">
                {models === 'ollama' && (
                  <input value={ollamaModel} onChange={e => setOllamaModel(e.target.value)} aria-label="Ollama model" placeholder="llama3.1" style={{
                    marginTop: 'var(--space-2)', width: '100%', boxSizing: 'border-box', font: 'inherit', fontSize: 'var(--text-sm)',
                    color: 'var(--ink)', background: 'var(--surface)', border: '1px solid var(--hairline)',
                    borderRadius: 'var(--radius-sm)', padding: 'var(--space-1) var(--space-2)',
                  }} />
                )}
              </Choice>
            </div>
          </div>
        )}

        {status.state === 'error' && (
          <div role="alert" style={{ color: 'var(--danger)', fontSize: 'var(--text-sm)' }}>{status.error}</div>
        )}

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 'var(--space-2)' }}>
          <button type="button" onClick={onClose} disabled={busy} style={{
            all: 'unset', cursor: 'pointer', padding: 'var(--space-2) var(--space-4)', borderRadius: 'var(--radius-md)',
            border: '1px solid var(--hairline)', fontSize: 'var(--text-sm)', color: 'var(--ink)',
          }}>Cancel</button>
          <button type="button" onClick={create} disabled={!template || busy} data-testid="template-create" style={{
            all: 'unset', cursor: template && !busy ? 'pointer' : 'default', padding: 'var(--space-2) var(--space-4)',
            borderRadius: 'var(--radius-md)', background: 'var(--accent)', color: 'var(--on-fill)',
            fontSize: 'var(--text-sm)', fontWeight: 600, opacity: template && !busy ? 1 : 0.6,
          }}>{busy ? 'Setting up…' : 'Create board'}</button>
        </div>
      </div>
    </>
  );
}

/** Listens for the open event; mounted once in the app chrome. */
export function TemplateDialogHost() {
  const [open, setOpen] = React.useState(false);
  const [initialId, setInitialId] = React.useState(null);
  React.useEffect(() => {
    const show = (event) => { setInitialId(event?.detail?.id || null); setOpen(true); };
    window.addEventListener(OPEN_TEMPLATES_EVENT, show);
    return () => window.removeEventListener(OPEN_TEMPLATES_EVENT, show);
  }, []);
  return <TemplateDialog open={open} initialId={initialId} onClose={() => setOpen(false)} />;
}
