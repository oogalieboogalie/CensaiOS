// Results view: the ranked shortlist on the left (fit meter and a why-this-one
// line), the chosen lead's sequence and ice breaker on the right, and the
// rest of what the search found tucked under "Also found".

import React from 'react';
import { LeadDetail } from './LeadDetail.jsx';
import { downloadLeadsCsv } from './leadsCsv.js';

function Fit({ value }) {
  const pct = Math.max(0, Math.min(100, Number(value) || 0));
  return (
    <span className="hb-lh-fit" aria-label={`Fit ${pct} of 100`}>
      <span className="hb-lh-meter"><span style={{ width: `${pct}%` }} /></span>
      <span className="hb-lh-mono">{pct}</span>
    </span>
  );
}

export function LeadResults({ result, onBank, onReset, onEditLead, onOpenDoc }) {
  const leads = result?.leads || [];
  const [selected, setSelected] = React.useState(0);
  const index = leads[selected] ? selected : 0;
  const lead = leads[index];
  const runnersUp = (result?.candidates || []).slice(leads.length);
  const usage = result?.usage || {};

  return (
    <div className="hb-lh-results">
      <div className="hb-lh-results-head">
        <span className="hb-lh-profile">
          {result?.idealProfile ? <><b>Ideal buyer.</b> {result.idealProfile}</> : `Leads for ${result?.brief?.market || 'your market'}`}
        </span>
        <span className="hb-lh-mono">
          {usage.searches || 0} searches · {usage.extracts || 0} page reads · {usage.llmCalls || 0} AI steps
        </span>
        {leads.length > 0 && (
          <button type="button" className="hb-lh-pill" onClick={() => downloadLeadsCsv(leads, result?.brief)} title="Save every lead as a spreadsheet file">
            Download CSV
          </button>
        )}
        <button type="button" className="hb-lh-pill" onClick={onReset}>New hunt</button>
      </div>
      {(result?.warnings || []).length > 0 && <div className="hb-lh-note">{result.warnings.join(' · ')}</div>}
      {leads.length === 0 ? (
        <div className="hb-lh-empty">No buyer-shaped sites came back. Try a narrower target market or add a region.</div>
      ) : (
        <div className="hb-lh-split">
          <div className="hb-lh-list">
            <span className="hb-lh-label">Strongest {leads.length === 1 ? 'lead' : `${leads.length} leads`}</span>
            {leads.map((item, i) => (
              <button
                key={item.url}
                type="button"
                className="hb-lh-lead"
                onClick={() => setSelected(i)}
                aria-pressed={i === index}
              >
                <span className="hb-lh-rank">{String(i + 1).padStart(2, '0')}</span>
                <span className="hb-lh-lead-main">
                  <span className="hb-lh-lead-name"><span>{item.company}</span></span>
                  <span className="hb-lh-host">{item.host}</span>
                  <Fit value={item.fitScore} />
                  {(item.why_fit || item.angle) && <span className="hb-lh-why">{item.why_fit || item.angle}</span>}
                </span>
              </button>
            ))}
            {runnersUp.length > 0 && (
              <details className="hb-lh-also">
                <summary>Also found ({runnersUp.length})</summary>
                <ul>
                  {runnersUp.map((c) => (
                    <li key={c.url}>
                      <a href={c.url} target="_blank" rel="noreferrer">{c.company}</a> <span className="hb-lh-mono">{c.fitScore}</span>
                    </li>
                  ))}
                </ul>
              </details>
            )}
          </div>
          <LeadDetail
            lead={lead}
            brief={result?.brief}
            onBank={onBank}
            onEdit={(patch) => onEditLead?.(index, patch)}
            onOpenDoc={onOpenDoc}
          />
        </div>
      )}
    </div>
  );
}
