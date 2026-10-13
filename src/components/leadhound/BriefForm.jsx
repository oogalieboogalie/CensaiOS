// The LeadHound brief: a calm, search-first hero in the spirit of Tavily's
// own site (big rounded field, quiet labels, one bright action), drawn only
// with theme tokens so it stays at home on the canvas.

import React from 'react';
import { Icon } from '../Icons.jsx';

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
    <form onSubmit={submit} className="hb-lh-brief">
      <div className="hb-lh-hero">
        <h2 className="hb-lh-hero-title">Who should you be talking to?</h2>
        <p className="hb-lh-hero-sub">
          Describe what you sell and who buys it. LeadHound searches the live web, ranks the best fits, and writes the first week of outreach.
        </p>
      </div>

      <div className="hb-lh-card">
        <label className="hb-lh-field">
          <span className="hb-lh-label">Your service or business</span>
          <textarea
            className="hb-lh-input"
            value={business}
            onChange={(e) => setBusiness(e.target.value)}
            rows={2}
            placeholder="e.g. We build AI receptionists for dental clinics"
          />
        </label>
        <label className="hb-lh-field">
          <span className="hb-lh-label">Target market</span>
          <input className="hb-lh-input" value={market} onChange={(e) => setMarket(e.target.value)} placeholder="e.g. Independent dental practices with 2 to 6 chairs" />
        </label>
        <div className="hb-lh-bar">
          <Icon.Search size={14} />
          <input className="hb-lh-input" value={region} onChange={(e) => setRegion(e.target.value)} placeholder="Region (optional), e.g. Austin, TX" aria-label="Region" />
          <select className="hb-lh-select" aria-label="How many leads" value={maxLeads} onChange={(e) => setMaxLeads(Number(e.target.value))}>
            {[1, 2, 3, 4, 5].map((n) => <option key={n} value={n}>Top {n}</option>)}
          </select>
          <button type="submit" className="hb-lh-pill" data-primary="true" disabled={!ready}>
            {running ? 'Hunting…' : 'Find leads'}
          </button>
        </div>
      </div>

      <div className="hb-lh-how hb-lh-mono">
        <span><b>01</b> Search the web</span>
        <span><b>02</b> Score buyer fit</span>
        <span><b>03</b> Draft 7 days of outreach</span>
      </div>
    </form>
  );
}
