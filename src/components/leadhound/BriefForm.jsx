// The LeadHound brief: a calm, search-first hero in the spirit of Tavily's
// own UI (big rounded field, quiet labels, one bright action) drawn only
// with theme tokens so it stays at home on the canvas.

import React from 'react';
import { Icon } from '../Icons.jsx';

const field = {
  all: 'unset', boxSizing: 'border-box', width: '100%', fontSize: 'var(--text-md)', lineHeight: 1.45,
  color: 'var(--ink)', fontFamily: 'var(--font-sans)',
};
const label = {
  fontSize: 'var(--text-xs)', fontFamily: 'var(--font-label)', letterSpacing: 'var(--label-tracking)',
  textTransform: 'var(--label-case)', color: 'var(--ink-faint)',
};

export function BriefForm({ initial, running, onSubmit }) {
  const [business, setBusiness] = React.useState(initial?.business || '');
  const [market, setMarket] = React.useState(initial?.market || '');
  const [region, setRegion] = React.useState(initial?.region || '');
  const [maxLeads, setMaxLeads] = React.useState(initial?.maxLeads || 3);
  const ready = business.trim() && market.trim() && !running;

  const submit = (event) => {
    event.preventDefault();
    if (!ready) return;
    onSubmit({ business: business.trim(), market: market.trim(), region: region.trim(), maxLeads });
  };

  return (
    <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 14, width: '100%', maxWidth: 560, margin: '0 auto' }}>
      <div style={{ textAlign: 'center', display: 'flex', flexDirection: 'column', gap: 6, paddingTop: 8 }}>
        <div style={{ fontSize: 'var(--text-xl)', fontWeight: 650, color: 'var(--ink)', letterSpacing: '-0.01em', fontFamily: 'var(--font-display, var(--font-sans))' }}>
          Who should you be talking to?
        </div>
        <div style={{ fontSize: 'var(--text-sm)', color: 'var(--ink-soft)' }}>
          Describe what you sell and who buys it. LeadHound searches the live web, ranks the best fits, and writes the first week of outreach.
        </div>
      </div>

      <div style={{ border: '1px solid var(--hairline)', borderRadius: 'var(--radius-xl)', background: 'var(--surface)', boxShadow: 'var(--shadow-card)', overflow: 'hidden' }}>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 4, padding: '12px 16px', borderBottom: '1px solid var(--hairline)' }}>
          <span style={label}>Your service or business</span>
          <textarea
            value={business}
            onChange={(e) => setBusiness(e.target.value)}
            rows={2}
            placeholder="e.g. We build custom AI receptionists for dental clinics"
            style={{ ...field, resize: 'none' }}
          />
        </label>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 4, padding: '12px 16px', borderBottom: '1px solid var(--hairline)' }}>
          <span style={label}>Target market</span>
          <input value={market} onChange={(e) => setMarket(e.target.value)} placeholder="e.g. Independent dental practices with 2–6 chairs" style={field} />
        </label>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 10px 10px 16px' }}>
          <Icon.Search size={14} style={{ color: 'var(--ink-faint)' }} />
          <input value={region} onChange={(e) => setRegion(e.target.value)} placeholder="Region (optional), e.g. Austin, TX" style={{ ...field, fontSize: 'var(--text-sm)', flex: 1 }} />
          <select
            aria-label="How many leads"
            value={maxLeads}
            onChange={(e) => setMaxLeads(Number(e.target.value))}
            style={{ border: '1px solid var(--hairline)', borderRadius: 'var(--radius-full)', padding: '4px 8px', fontSize: 'var(--text-xs)', color: 'var(--ink)', background: 'var(--surface-2)' }}
          >
            {[1, 2, 3, 4, 5].map((n) => <option key={n} value={n}>Top {n}</option>)}
          </select>
          <button
            type="submit"
            disabled={!ready}
            style={{
              all: 'unset', cursor: ready ? 'pointer' : 'not-allowed', opacity: ready ? 1 : 0.45,
              background: 'var(--accent)', color: 'var(--accent-contrast)', borderRadius: 'var(--radius-full)',
              padding: '7px 16px', fontSize: 'var(--text-sm)', fontWeight: 650,
            }}
          >
            {running ? 'Hunting…' : 'Find leads'}
          </button>
        </div>
      </div>
    </form>
  );
}
