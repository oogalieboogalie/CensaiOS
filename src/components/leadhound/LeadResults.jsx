// Results view: ranked shortlist on the left (score ring + why), the chosen
// lead's sequence and ice breaker on the right, runner-up candidates below.

import React from 'react';
import { LeadDetail } from './LeadDetail.jsx';

function Score({ value }) {
  const pct = Math.max(0, Math.min(100, Number(value) || 0));
  return (
    <span
      aria-label={`Fit ${pct} of 100`}
      style={{
        width: 34, height: 34, borderRadius: 'var(--radius-full)', flexShrink: 0, display: 'grid', placeItems: 'center',
        background: `conic-gradient(var(--accent) ${pct * 3.6}deg, var(--hairline) 0deg)`,
      }}
    >
      <span style={{ width: 26, height: 26, borderRadius: 'var(--radius-full)', background: 'var(--surface)', display: 'grid', placeItems: 'center', fontSize: 'var(--text-xs)', fontWeight: 700, color: 'var(--ink)' }}>{pct}</span>
    </span>
  );
}

export function LeadResults({ result, onBank, onReset }) {
  const leads = result?.leads || [];
  const [selected, setSelected] = React.useState(0);
  const lead = leads[selected] || leads[0];
  const runnersUp = (result?.candidates || []).slice(leads.length);
  const usage = result?.usage || {};

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12, minHeight: 0 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 'var(--text-sm)', color: 'var(--ink-soft)', flex: 1, minWidth: 0 }}>
          {result?.idealProfile || `Leads for ${result?.brief?.market || 'your market'}`}
        </span>
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--text-xs)', color: 'var(--ink-faint)' }}>
          {usage.searches || 0} searches · {usage.extracts || 0} page reads · {usage.llmCalls || 0} AI steps
        </span>
        <button type="button" onClick={onReset} style={{ all: 'unset', cursor: 'pointer', fontSize: 'var(--text-xs)', padding: '4px 12px', borderRadius: 'var(--radius-full)', border: '1px solid var(--hairline)', color: 'var(--ink)', background: 'var(--surface)' }}>New hunt</button>
      </div>
      {(result?.warnings || []).length > 0 && (
        <div style={{ fontSize: 'var(--text-xs)', color: 'var(--ink-soft)', background: 'var(--surface-2)', borderRadius: 'var(--radius-lg)', padding: '6px 10px' }}>
          {result.warnings.join(' · ')}
        </div>
      )}
      {leads.length === 0 ? (
        <div style={{ fontSize: 'var(--text-md)', color: 'var(--ink-soft)', textAlign: 'center', padding: 24 }}>
          No buyer-shaped sites came back. Try a narrower target market or add a region.
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(180px, 240px) 1fr', gap: 16, minHeight: 0 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {leads.map((item, i) => (
              <button
                key={item.url}
                type="button"
                onClick={() => setSelected(i)}
                aria-pressed={i === selected}
                style={{
                  all: 'unset', cursor: 'pointer', display: 'flex', gap: 10, alignItems: 'flex-start', padding: 10, borderRadius: 'var(--radius-xl)',
                  border: `1px solid ${i === selected ? 'var(--accent)' : 'var(--hairline)'}`,
                  background: i === selected ? 'var(--accent-soft)' : 'var(--surface)',
                }}
              >
                <Score value={item.fitScore} />
                <span style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
                  <span style={{ fontSize: 'var(--text-sm)', fontWeight: 650, color: 'var(--ink)' }}>{item.company}</span>
                  <span style={{ fontSize: 'var(--text-xs)', color: 'var(--ink-faint)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.host}</span>
                  {item.angle && <span style={{ fontSize: 'var(--text-xs)', color: 'var(--ink-soft)', lineHeight: 1.4 }}>{item.angle}</span>}
                </span>
              </button>
            ))}
            {runnersUp.length > 0 && (
              <details style={{ fontSize: 'var(--text-xs)', color: 'var(--ink-soft)' }}>
                <summary style={{ cursor: 'pointer', padding: '4px 2px' }}>Also found ({runnersUp.length})</summary>
                <ul style={{ margin: 0, padding: '4px 0 0 14px', display: 'flex', flexDirection: 'column', gap: 4 }}>
                  {runnersUp.map((c) => (
                    <li key={c.url}><a href={c.url} target="_blank" rel="noreferrer" style={{ color: 'var(--ink)' }}>{c.company}</a> <span style={{ color: 'var(--ink-faint)' }}>{c.fitScore}</span></li>
                  ))}
                </ul>
              </details>
            )}
          </div>
          <LeadDetail lead={lead} onBank={onBank} />
        </div>
      )}
    </div>
  );
}
