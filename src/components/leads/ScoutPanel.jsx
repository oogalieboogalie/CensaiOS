// Scout pass panel for the lead queue: area + ideal-customer inputs,
// bounded Tavily run, result message. Extracted from LeadsWindow.jsx so
// that file stays within its size budget. Pure UI + one fetch callback.

import React from 'react';

export function ScoutPanel({ workspaceId, onScouted }) {
  const [area, setArea] = React.useState('');
  const [icp, setIcp] = React.useState('');
  const [topK, setTopK] = React.useState(3);
  const [scouting, setScouting] = React.useState(false);
  const [msg, setMsg] = React.useState('');

  const runScout = React.useCallback(async () => {
    if (!workspaceId || !area.trim() || scouting) return;
    setScouting(true);
    setMsg('');
    try {
      const res = await fetch(`/api/scout/run?workspaceId=${encodeURIComponent(workspaceId)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ area: area.trim(), icp: icp.trim(), topK }),
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
  }, [workspaceId, area, icp, topK, scouting, onScouted]);

  return (
    <div style={{ borderBottom: '1px solid var(--hairline)', padding: '8px 10px', display: 'flex', flexDirection: 'column', gap: 6, background: 'var(--surface)' }}>
      <input
        value={area}
        onChange={(e) => setArea(e.target.value)}
        placeholder="Area — e.g. Waverly, IA"
        style={{ all: 'unset', border: '1px solid var(--hairline)', borderRadius: 7, padding: '5px 9px', fontSize: 12, color: 'var(--ink)', background: 'var(--surface-2)' }}
      />
      <input
        value={icp}
        onChange={(e) => setIcp(e.target.value)}
        placeholder="Ideal customer — e.g. 3–10 person teams doing open houses"
        style={{ all: 'unset', border: '1px solid var(--hairline)', borderRadius: 7, padding: '5px 9px', fontSize: 12, color: 'var(--ink)', background: 'var(--surface-2)' }}
      />
      <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
        <label style={{ fontSize: 11, color: 'var(--ink-faint)' }}>Top</label>
        <select
          value={topK}
          onChange={(e) => setTopK(Number(e.target.value))}
          style={{ border: '1px solid var(--hairline)', borderRadius: 7, padding: '3px 6px', fontSize: 12, color: 'var(--ink)', background: 'var(--surface-2)' }}
        >
          {[1, 2, 3, 4, 5].map((k) => <option key={k} value={k}>{k}</option>)}
        </select>
        <button
          onClick={runScout}
          disabled={scouting || !area.trim()}
          style={{ all: 'unset', cursor: scouting || !area.trim() ? 'not-allowed' : 'pointer', fontSize: 12, fontWeight: 700, color: 'white', background: 'var(--accent)', borderRadius: 7, padding: '4px 14px', opacity: scouting || !area.trim() ? 0.5 : 1, marginLeft: 'auto' }}
        >
          {scouting ? 'Scouting…' : 'Run'}
        </button>
      </div>
      {msg && <div style={{ fontSize: 11, color: 'var(--ink-soft)' }}>{msg}</div>}
    </div>
  );
}
