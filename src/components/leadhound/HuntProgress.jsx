import React from 'react';
import { HUNT_STEPS } from './useLeadHound.js';

export function HuntProgress({ stepIndex = 0 }) {
  return (
    <div role="status" aria-live="polite" style={{ maxWidth: 420, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 10, paddingTop: 24 }}>
      {HUNT_STEPS.map((step, i) => {
        const state = i < stepIndex ? 'done' : i === stepIndex ? 'active' : 'todo';
        return (
          <div key={step.id} style={{ display: 'flex', alignItems: 'center', gap: 10, opacity: state === 'todo' ? 0.45 : 1 }}>
            <span
              aria-hidden="true"
              style={{
                width: 9, height: 9, borderRadius: 'var(--radius-full)', flexShrink: 0,
                background: state === 'todo' ? 'var(--hairline)' : 'var(--accent)',
                boxShadow: state === 'active' ? '0 0 0 4px var(--accent-soft)' : 'none',
              }}
            />
            <span style={{ fontSize: 'var(--text-sm)', color: state === 'active' ? 'var(--ink)' : 'var(--ink-soft)', fontWeight: state === 'active' ? 600 : 400 }}>
              {step.label}{state === 'active' ? '…' : ''}
            </span>
          </div>
        );
      })}
    </div>
  );
}

export function TavilyKeyPrompt({ onSave }) {
  const [value, setValue] = React.useState('');
  const [busy, setBusy] = React.useState(false);
  const [msg, setMsg] = React.useState('');

  const save = async (event) => {
    event.preventDefault();
    if (!value.trim() || busy) return;
    setBusy(true);
    setMsg('');
    try {
      await onSave(value.trim());
      setValue('');
    } catch (err) {
      setMsg(err.message || 'Could not save the key');
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={save} style={{ maxWidth: 560, margin: '0 auto', width: '100%', display: 'flex', flexDirection: 'column', gap: 6, padding: '10px 14px', border: '1px dashed var(--hairline-strong, var(--hairline))', borderRadius: 'var(--radius-xl)', background: 'var(--surface-2)' }}>
      <div style={{ fontSize: 'var(--text-sm)', color: 'var(--ink-soft)' }}>
        LeadHound searches with your own Tavily key. It is stored encrypted in your key vault.
      </div>
      <div style={{ display: 'flex', gap: 8 }}>
        <input
          type="password"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="tvly-…"
          aria-label="Tavily API key"
          style={{ all: 'unset', flex: 1, border: '1px solid var(--hairline)', borderRadius: 'var(--radius-full)', padding: '5px 12px', fontSize: 'var(--text-sm)', color: 'var(--ink)', background: 'var(--surface)' }}
        />
        <button type="submit" disabled={!value.trim() || busy} style={{ all: 'unset', cursor: 'pointer', fontSize: 'var(--text-sm)', fontWeight: 600, padding: '5px 14px', borderRadius: 'var(--radius-full)', border: '1px solid var(--hairline)', color: 'var(--ink)', background: 'var(--surface)', opacity: !value.trim() || busy ? 0.5 : 1 }}>
          {busy ? 'Saving…' : 'Save key'}
        </button>
      </div>
      {msg && <div style={{ fontSize: 'var(--text-xs)', color: 'var(--ps-red)' }}>{msg}</div>}
    </form>
  );
}
