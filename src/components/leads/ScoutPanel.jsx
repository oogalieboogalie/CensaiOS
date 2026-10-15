// Scout pass panel for the lead queue: what you sell + who you sell to (saved
// on the window as the queue's settings) + area, bounded Tavily run, result
// message. Extracted from LeadsWindow.jsx so
// that file stays within its size budget. Pure UI + one fetch callback.

import React from 'react';

const INPUT_STYLE = { all: 'unset', border: '1px solid var(--hairline)', borderRadius: 'var(--radius-md)', padding: '5px 9px', fontSize: 'var(--text-sm)', color: 'var(--ink)', background: 'var(--surface-2)' };

export function ScoutPanel({ workspaceId, onScouted, settings = {}, onSettings }) {
  const [area, setArea] = React.useState('');
  const business = settings.business || '';
  const target = settings.target || '';
  const setField = (field) => (e) => onSettings?.({ ...settings, [field]: e.target.value });
  const ready = Boolean(area.trim() && target.trim());
  const [topK, setTopK] = React.useState(3);
  const [scouting, setScouting] = React.useState(false);
  const [msg, setMsg] = React.useState('');

  const runScout = React.useCallback(async () => {
    if (!workspaceId || !ready || scouting) return;
    setScouting(true);
    setMsg('');
    try {
      const res = await fetch(`/api/scout/run?workspaceId=${encodeURIComponent(workspaceId)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ area: area.trim(), target: target.trim(), business: business.trim(), topK }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || 'Scout run failed');
      const found = (data.leads || []).length;
      setMsg(`Scouted ${data.area}: ${found} lead${found === 1 ? '' : 's'} banked · ${data.actionsUsed || '?'} Tavily actions.`);
      setArea('');
      onScouted?.();
    } catch (err) {
      setMsg(err.message || 'Scout run failed');
    } finally {
      setScouting(false);
    }
  }, [workspaceId, ready, area, target, business, topK, scouting, onScouted]);

  return (
    <div style={{ borderBottom: '1px solid var(--hairline)', padding: '8px 10px', display: 'flex', flexDirection: 'column', gap: 6, background: 'var(--surface)' }}>
      <input value={business} onChange={setField('business')} placeholder="What you sell, e.g. bookkeeping for small shops" aria-label="What you sell" style={INPUT_STYLE} />
      <input value={target} onChange={setField('target')} placeholder="Who you sell to, e.g. dental offices" aria-label="Who you sell to" style={INPUT_STYLE} />
      <input value={area} onChange={(e) => setArea(e.target.value)} placeholder="Area, e.g. Waverly, IA" aria-label="Area" style={INPUT_STYLE} />
      <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
        <label style={{ fontSize: 'var(--text-xs)', color: 'var(--ink-faint)' }}>Top</label>
        <select
          value={topK}
          onChange={(e) => setTopK(Number(e.target.value))}
          style={{ border: '1px solid var(--hairline)', borderRadius: 'var(--radius-md)', padding: '3px 6px', fontSize: 'var(--text-sm)', color: 'var(--ink)', background: 'var(--surface-2)' }}
        >
          {[1, 2, 3, 4, 5].map((k) => <option key={k} value={k}>{k}</option>)}
        </select>
        <button
          onClick={runScout}
          disabled={scouting || !ready}
          style={{ all: 'unset', cursor: scouting || !ready ? 'not-allowed' : 'pointer', fontSize: 'var(--text-sm)', fontWeight: 700, color: 'var(--accent-contrast)', background: 'var(--accent)', borderRadius: 'var(--radius-md)', padding: '4px 14px', opacity: scouting || !ready ? 0.5 : 1, marginLeft: 'auto' }}
        >
          {scouting ? 'Scouting…' : 'Run'}
        </button>
      </div>
      {msg && <div style={{ fontSize: 'var(--text-xs)', color: 'var(--ink-soft)' }}>{msg}</div>}
    </div>
  );
}
