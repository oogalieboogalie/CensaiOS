// Scout pass panel for the lead queue: what you sell + who you sell to (saved
// on the window as the queue's settings) + area, bounded Tavily run, result
// message. Extracted from LeadsWindow.jsx so
// that file stays within its size budget. Pure UI + one fetch callback.

import React from 'react';

export function ScoutPanel({ workspaceId, onScouted, settings = {}, onSettings }) {
  const [area, setArea] = React.useState('');
  const business = settings.business || '';
  const target = settings.target || '';
  const setField = (field) => (e) => onSettings?.({ ...settings, [field]: e.target.value });
  const ready = Boolean(area.trim() && target.trim());
  const [topK, setTopK] = React.useState(3);
  const [scouting, setScouting] = React.useState(false);
  const [msg, setMsg] = React.useState('');
  const topId = React.useId();

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
    <div className="hb-bar hb-lq-scout-panel">
      <input className="hb-lq-input" value={business} onChange={setField('business')} placeholder="What you sell, e.g. bookkeeping for small shops" aria-label="What you sell" />
      <input className="hb-lq-input" value={target} onChange={setField('target')} placeholder="Who you sell to, e.g. dental offices" aria-label="Who you sell to" />
      <input className="hb-lq-input" value={area} onChange={(e) => setArea(e.target.value)} placeholder="Area, e.g. Waverly, IA" aria-label="Area" />
      <div className="hb-lq-scout-row">
        <label className="hb-lq-label" htmlFor={topId}>Top</label>
        <select id={topId} className="hb-lq-input" value={topK} onChange={(e) => setTopK(Number(e.target.value))}>
          {[1, 2, 3, 4, 5].map((k) => <option key={k} value={k}>{k}</option>)}
        </select>
        <button type="button" className="hb-lq-go" onClick={runScout} disabled={scouting || !ready}>
          {scouting ? 'Scouting…' : 'Run'}
        </button>
      </div>
      {msg && <div className="hb-lq-msg">{msg}</div>}
    </div>
  );
}
