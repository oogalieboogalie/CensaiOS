import React from 'react';
import { Icon } from './Icons.jsx';
import { WindowTitle } from './Windows.jsx';
import { api } from '../lib/api.js';



export function SovereignTestWindow({ win, onUpdate }) {
  const [formValue, setFormValue] = React.useState('');
  const [submitting, setSubmitting] = React.useState(false);
  const [records, setRecords] = React.useState([]);
  const [loading, setLoading] = React.useState(false);

  
  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!formValue.trim()) return;
    setSubmitting(true);
    try {
      const res = await fetch('/api/sovereignTest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: formValue.trim() })
      });
      if (!res.ok) throw new Error('Submission failed');
      const data = await res.json();
      setFormValue('');
      if (typeof fetchRecords === 'function') {
        fetchRecords();
      }
    } catch (err) {
      console.error('Error submitting form:', err);
    } finally {
      setSubmitting(false);
    }
  };
    

  const fetchRecords = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/sovereignTest');
      if (!res.ok) throw new Error('Failed to fetch');
      const data = await res.json();
      setRecords(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error('Error fetching records:', err);
    } finally {
      setLoading(false);
    }
  };

  React.useEffect(() => {
    fetchRecords();
  }, []);
    

  return (
    <>
      <WindowTitle
        accent="var(--accent)"
        icon={<Icon.Plug size={14}/>}
        label={win.title || 'SovereignTest Window'}
        subtitle={win.subtitle || 'Sovereign Scaffolder'}
        attachedAgentIds={win.attachedAgents}
        onDetach={(id) => onUpdate({ attachedAgents: (win.attachedAgents || []).filter(a => a !== id) })}
      />
      <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: 12, display: 'flex', flexDirection: 'column', gap: 12, background: 'var(--surface)' }}>
        
        {/* Sparkline / Line Chart Feature */}
        <div style={{ background: 'var(--surface-2)', border: '1px solid var(--hairline)', borderRadius: 12, padding: 12, display: 'flex', flexDirection: 'column', gap: 6 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--ink-soft)', textTransform: 'uppercase' }}>Performance Sparkline</span>
            <span style={{ fontSize: 12, fontWeight: 'bold', color: 'var(--accent)' }}>+14.8%</span>
          </div>
          <div style={{ height: 60, display: 'flex', alignItems: 'flex-end', gap: 2, padding: '4px 0' }}>
            <svg viewBox="0 0 100 30" style={{ width: '100%', height: '100%', overflow: 'visible' }}>
              <path
                d="M 0,25 Q 20,5 40,20 T 80,10 T 100,5"
                fill="none"
                stroke="var(--accent)"
                strokeWidth="2"
                strokeLinecap="round"
              />
              <path
                d="M 0,25 Q 20,5 40,20 T 80,10 T 100,5 L 100,30 L 0,30 Z"
                fill="url(#sparkline-grad-sovereignTest)"
                opacity="0.1"
              />
              <defs>
                <linearGradient id="sparkline-grad-sovereignTest" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="var(--accent)" />
                  <stop offset="100%" stopColor="transparent" />
                </linearGradient>
              </defs>
            </svg>
          </div>
        </div>
    

        {/* Submission Form Feature */}
        <form onSubmit={handleSubmit} style={{ background: 'var(--surface-2)', border: '1px solid var(--hairline)', borderRadius: 12, padding: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--ink-soft)', textTransform: 'uppercase' }}>Add Record</div>
          <div style={{ display: 'flex', gap: 6 }}>
            <input
              type="text"
              placeholder="Enter name..."
              value={formValue}
              onChange={(e) => setFormValue(e.target.value)}
              style={{ flex: 1, padding: '6px 10px', borderRadius: 8, border: '1px solid var(--hairline)', background: 'var(--surface)', color: 'var(--ink)', fontSize: 12, outline: 'none' }}
            />
            <button
              type="submit"
              disabled={submitting}
              style={{ padding: '6px 12px', borderRadius: 8, background: 'var(--accent)', color: 'white', border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 500, display: 'flex', alignItems: 'center', gap: 4 }}
            >
              {submitting ? '...' : <Icon.Plus size={12} />}
              Submit
            </button>
          </div>
        </form>
    

        {/* Data Table Feature */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, flex: 1, minHeight: 0 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--ink-soft)', textTransform: 'uppercase' }}>Records List</span>
            <button onClick={fetchRecords} style={{ all: 'unset', cursor: 'pointer', color: 'var(--accent)', fontSize: 11, display: 'flex', alignItems: 'center', gap: 2 }}>
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ display: 'inline-block', verticalAlign: 'middle' }}>
                <path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67"/>
              </svg> Refresh
            </button>
          </div>
          <div style={{ flex: 1, overflowY: 'auto', border: '1px solid var(--hairline)', borderRadius: 8, background: 'var(--surface)' }}>
            {loading ? (
              <div style={{ padding: 20, textAlign: 'center', fontSize: 12, color: 'var(--ink-faint)' }}>Loading records...</div>
            ) : records.length === 0 ? (
              <div style={{ padding: 20, textAlign: 'center', fontSize: 12, color: 'var(--ink-faint)' }}>No records found</div>
            ) : (
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--hairline)', background: 'var(--surface-2)', textAlign: 'left' }}>
                    <th style={{ padding: '6px 8px', fontWeight: 600, color: 'var(--ink-soft)' }}>ID</th>
                    <th style={{ padding: '6px 8px', fontWeight: 600, color: 'var(--ink-soft)' }}>Data</th>
                  </tr>
                </thead>
                <tbody>
                  {records.map((r, i) => (
                    <tr key={r.id || i} style={{ borderBottom: '1px solid var(--hairline)' }}>
                      <td style={{ padding: '6px 8px', fontFamily: 'var(--font-mono)', color: 'var(--ink-faint)' }}>{r.id}</td>
                      <td style={{ padding: '6px 8px', color: 'var(--ink)' }}>{JSON.stringify(r.name || r.role || r.content || r)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
    
      </div>
    </>
  );
}
